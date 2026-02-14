import { Injectable } from "@nestjs/common";
import * as pty from "node-pty";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";

export interface RunRecord {
  runId: string;
  taskId: string;
  toolSessionId: string;
  provider: "codex" | "claude_code";
  status: "ACTIVE" | "ENDED";
  createdAt: string;
  endedAt?: string;
  command: string;
  args: string[];
}

export interface RunWriteRecord {
  runId: string;
  stdinText: string;
  writtenAt: string;
}

export interface RunOutputRecord {
  runId: string;
  data: string;
  receivedAt: string;
}

export interface NeedUserInputSignal {
  prompt: string;
  options?: string[];
  timeoutMinutes?: number;
}

interface StartRunInput {
  runId: string;
  taskId: string;
  toolSessionId: string;
  provider: "codex" | "claude_code";
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  onNeedUserInput?: (signal: NeedUserInputSignal) => void;
}

type ManagedProcess =
  | {
      kind: "pty";
      proc: pty.IPty;
    }
  | {
      kind: "pipe";
      proc: ChildProcessWithoutNullStreams;
    };

@Injectable()
export class PtyRunManager {
  private readonly runs = new Map<string, RunRecord>();
  private readonly writes: RunWriteRecord[] = [];
  private readonly outputs: RunOutputRecord[] = [];
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly lineBuffers = new Map<string, string>();

  startRun(input: StartRunInput): RunRecord {
    const mergedEnv = {
      ...process.env,
      ...(input.env ?? {})
    };
    const safeEnv = Object.fromEntries(
      Object.entries(mergedEnv).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );

    const managed = this.spawnManagedProcess(input.command, input.args, input.cwd ?? process.cwd(), safeEnv);

    const record: RunRecord = {
      runId: input.runId,
      taskId: input.taskId,
      toolSessionId: input.toolSessionId,
      provider: input.provider,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      command: input.command,
      args: input.args
    };

    this.runs.set(record.runId, record);
    this.processes.set(record.runId, managed);
    this.lineBuffers.set(record.runId, "");

    this.onData(managed, (chunk) => {
      this.outputs.push({
        runId: record.runId,
        data: chunk,
        receivedAt: new Date().toISOString()
      });

      this.processOutput(record.runId, chunk, input.onNeedUserInput);
    });

    this.onExit(managed, () => {
      const existing = this.runs.get(record.runId);
      if (existing) {
        existing.status = "ENDED";
        existing.endedAt = new Date().toISOString();
        this.runs.set(existing.runId, existing);
      }
      this.processes.delete(record.runId);
      this.lineBuffers.delete(record.runId);
    });

    return record;
  }

  registerRun(run: Omit<RunRecord, "createdAt" | "status" | "command" | "args">): RunRecord {
    const record: RunRecord = {
      ...run,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      command: "manual",
      args: []
    };
    this.runs.set(record.runId, record);
    return record;
  }

  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  endRun(runId: string): void {
    const proc = this.processes.get(runId);
    if (proc) {
      this.kill(proc);
    }

    const record = this.runs.get(runId);
    if (!record) {
      return;
    }

    record.status = "ENDED";
    record.endedAt = new Date().toISOString();
    this.runs.set(runId, record);
    this.processes.delete(runId);
    this.lineBuffers.delete(runId);
  }

  writeStdin(runId: string, stdinText: string): RunWriteRecord | undefined {
    const run = this.runs.get(runId);
    if (!run || run.status !== "ACTIVE") {
      return undefined;
    }

    const proc = this.processes.get(runId);
    if (!proc) {
      return undefined;
    }

    this.write(proc, stdinText);
    const write: RunWriteRecord = {
      runId,
      stdinText,
      writtenAt: new Date().toISOString()
    };
    this.writes.push(write);
    return write;
  }

  listWrites(runId: string): RunWriteRecord[] {
    return this.writes.filter((w) => w.runId === runId);
  }

  listOutput(runId: string, limit = 100): RunOutputRecord[] {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const rows = this.outputs.filter((o) => o.runId === runId);
    return rows.slice(Math.max(0, rows.length - safeLimit));
  }

  private processOutput(
    runId: string,
    chunk: string,
    onNeedUserInput?: (signal: NeedUserInputSignal) => void
  ): void {
    const existingBuffer = this.lineBuffers.get(runId) ?? "";
    const merged = `${existingBuffer}${chunk}`;
    const lines = merged.split(/\r?\n/);
    const rest = lines.pop() ?? "";
    this.lineBuffers.set(runId, rest);

    for (const line of lines) {
      const signal = this.parseNeedUserInputSignal(line);
      if (signal && onNeedUserInput) {
        onNeedUserInput(signal);
      }
    }
  }

  private parseNeedUserInputSignal(line: string): NeedUserInputSignal | undefined {
    const directMarker = "[[NEED_USER_INPUT]]";
    if (line.includes(directMarker)) {
      const json = line.split(directMarker)[1]?.trim();
      if (!json) {
        return undefined;
      }
      try {
        return this.normalizeNeedUserInput(JSON.parse(json));
      } catch {
        return undefined;
      }
    }

    if (line.startsWith("NEED_USER_INPUT")) {
      const json = line.replace(/^NEED_USER_INPUT\s*/, "");
      if (!json) {
        return undefined;
      }
      try {
        return this.normalizeNeedUserInput(JSON.parse(json));
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  private normalizeNeedUserInput(payload: unknown): NeedUserInputSignal | undefined {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const obj = payload as {
      prompt?: unknown;
      options?: unknown;
      timeout_minutes?: unknown;
      timeoutMinutes?: unknown;
    };

    if (typeof obj.prompt !== "string" || obj.prompt.trim().length === 0) {
      return undefined;
    }

    const options = Array.isArray(obj.options)
      ? obj.options.filter((v): v is string => typeof v === "string")
      : undefined;

    const timeoutRaw =
      typeof obj.timeout_minutes === "number"
        ? obj.timeout_minutes
        : typeof obj.timeoutMinutes === "number"
          ? obj.timeoutMinutes
          : undefined;

    return {
      prompt: obj.prompt,
      options,
      timeoutMinutes:
        typeof timeoutRaw === "number" && Number.isFinite(timeoutRaw) ? timeoutRaw : undefined
    };
  }

  private spawnManagedProcess(
    command: string,
    args: string[],
    cwd: string,
    env: Record<string, string>
  ): ManagedProcess {
    try {
      const proc = pty.spawn(command, args, {
        name: "xterm-color",
        cols: 160,
        rows: 48,
        cwd,
        env
      });
      return { kind: "pty", proc };
    } catch {
      const proc = spawn(command, args, {
        cwd,
        env,
        stdio: "pipe"
      });
      proc.stdout.setEncoding("utf8");
      proc.stderr.setEncoding("utf8");
      return { kind: "pipe", proc };
    }
  }

  private onData(managed: ManagedProcess, cb: (chunk: string) => void): void {
    if (managed.kind === "pty") {
      managed.proc.onData(cb);
      return;
    }

    managed.proc.stdout.on("data", (chunk: string) => cb(chunk));
    managed.proc.stderr.on("data", (chunk: string) => cb(chunk));
  }

  private onExit(managed: ManagedProcess, cb: () => void): void {
    if (managed.kind === "pty") {
      managed.proc.onExit(() => cb());
      return;
    }

    managed.proc.on("exit", () => cb());
  }

  private write(managed: ManagedProcess, data: string): void {
    if (managed.kind === "pty") {
      managed.proc.write(data);
      return;
    }

    managed.proc.stdin.write(data);
  }

  private kill(managed: ManagedProcess): void {
    if (managed.kind === "pty") {
      managed.proc.kill();
      return;
    }

    managed.proc.kill("SIGTERM");
  }
}
