import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CodexAdapter } from "../../infrastructure/tool-runners/codex.adapter";
import { ClaudeAdapter } from "../../infrastructure/tool-runners/claude.adapter";
import {
  PtyRunManager,
  RunOutputRecord,
  RunRecord
} from "../../infrastructure/tool-runners/pty-run-manager";
import { InteractionRequestService } from "./interaction-request.service";
import { ToolSessionLinkService } from "./tool-session-link.service";

interface StartToolRunInput {
  collabSessionId: string;
  taskId: string;
  toolSessionId: string;
  provider: "codex" | "claude_code";
  prompt: string;
  sessionId?: string;
  cwd?: string;
  runId?: string;
}

@Injectable()
export class ToolRunService {
  constructor(
    private readonly codexAdapter: CodexAdapter,
    private readonly claudeAdapter: ClaudeAdapter,
    private readonly runManager: PtyRunManager,
    private readonly interactionService: InteractionRequestService,
    private readonly toolSessionService: ToolSessionLinkService
  ) {}

  start(input: StartToolRunInput): RunRecord {
    const runId = input.runId ?? randomUUID();
    const resolved =
      input.provider === "codex"
        ? this.codexAdapter.buildCommand({
            prompt: input.prompt,
            sessionId: input.sessionId,
            cwd: input.cwd
          })
        : this.claudeAdapter.buildCommand({
            prompt: input.prompt,
            sessionId: input.sessionId
          });

    const record = this.runManager.startRun({
      runId,
      taskId: input.taskId,
      toolSessionId: input.toolSessionId,
      provider: input.provider,
      command: resolved.cmd,
      args: resolved.args,
      cwd: input.cwd,
      onNeedUserInput: (signal) => {
        const interaction = this.interactionService.create({
          collabSessionId: input.collabSessionId,
          toolSessionId: input.toolSessionId,
          runId,
          prompt: signal.prompt,
          options: signal.options,
          timeoutMinutes: signal.timeoutMinutes
        });

        this.toolSessionService.appendSummary(
          input.toolSessionId,
          `NEED_USER_INPUT created: ${interaction.interactionRequestId}`
        );
      }
    });

    this.toolSessionService.appendSummary(
      input.toolSessionId,
      `Run ${record.runId} started by ${input.provider}`
    );

    return record;
  }

  stop(runId: string): { run_id: string; status: "ENDED" } {
    this.runManager.endRun(runId);
    return {
      run_id: runId,
      status: "ENDED"
    };
  }

  output(runId: string, limit?: number): RunOutputRecord[] {
    return this.runManager.listOutput(runId, limit ?? 200);
  }

  writeStdin(runId: string, stdinText: string): {
    status: "ACCEPTED";
    run_id: string;
    written_bytes: number;
    written_at: string;
  } {
    const payload = stdinText.endsWith("\n") ? stdinText : `${stdinText}\n`;
    const write = this.runManager.writeStdin(runId, payload);
    if (!write) {
      throw new UnprocessableEntityException("Run not active");
    }

    return {
      status: "ACCEPTED",
      run_id: runId,
      written_bytes: Buffer.byteLength(payload, "utf8"),
      written_at: write.writtenAt
    };
  }
}
