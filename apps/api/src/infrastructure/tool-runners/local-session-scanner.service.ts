import { Injectable, NotFoundException } from "@nestjs/common";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { ToolProvider } from "../persistence/sqlite/repositories/tool-session-link.repository";

interface ListLocalSessionsInput {
  provider?: ToolProvider;
  limit?: number;
}

export interface LocalToolSessionSummary {
  provider: ToolProvider;
  toolSessionId: string;
  summary150: string;
  cwd?: string;
  sourcePath: string;
  createdAt?: string;
  lastActiveAt: string;
}

export interface LocalTranscriptEntry {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: string;
}

type IndexCache = {
  builtAt: number;
  codex: Map<string, string>;
  claude: Map<string, string>;
};

@Injectable()
export class LocalSessionScannerService {
  private indexCache?: IndexCache;
  private summaryCache?: {
    key: string;
    at: number;
    data: LocalToolSessionSummary[];
  };

  listSessions(input?: ListLocalSessionsInput): LocalToolSessionSummary[] {
    const provider = input?.provider;
    const safeLimit = Math.max(1, Math.min(input?.limit ?? 200, 500));
    const summaries = this.collectSummaries(provider);
    return summaries
      .sort((a, b) => this.tsToMs(b.lastActiveAt) - this.tsToMs(a.lastActiveAt))
      .slice(0, safeLimit);
  }

  readTranscript(provider: ToolProvider, toolSessionId: string, limit = 200): LocalTranscriptEntry[] {
    this.ensureIndexFresh();
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const filePath =
      provider === "codex"
        ? this.indexCache?.codex.get(toolSessionId)
        : this.indexCache?.claude.get(toolSessionId);

    if (!filePath) {
      throw new NotFoundException("Local session file not found");
    }

    const parsed =
      provider === "codex"
        ? this.parseCodexTranscript(filePath)
        : this.parseClaudeTranscript(filePath);

    return parsed.slice(Math.max(0, parsed.length - safeLimit));
  }

  private collectSummaries(provider?: ToolProvider): LocalToolSessionSummary[] {
    const cacheKey = provider ?? "all";
    if (
      this.summaryCache &&
      this.summaryCache.key === cacheKey &&
      Date.now() - this.summaryCache.at < 15_000
    ) {
      return this.summaryCache.data;
    }

    this.ensureIndexFresh();
    const rows: LocalToolSessionSummary[] = [];
    if (!provider || provider === "codex") {
      for (const [sessionId, filePath] of this.indexCache?.codex ?? []) {
        const row = this.parseCodexSummary(sessionId, filePath);
        if (row) {
          rows.push(row);
        }
      }
    }
    if (!provider || provider === "claude_code") {
      for (const [sessionId, filePath] of this.indexCache?.claude ?? []) {
        const row = this.parseClaudeSummary(sessionId, filePath);
        if (row) {
          rows.push(row);
        }
      }
    }

    this.summaryCache = {
      key: cacheKey,
      at: Date.now(),
      data: rows
    };
    return rows;
  }

  private ensureIndexFresh(): void {
    if (this.indexCache && Date.now() - this.indexCache.builtAt < 15_000) {
      return;
    }

    const codexDir = resolve(
      process.env.HELIOS_CODEX_HOME ?? join(homedir(), ".codex"),
      "sessions"
    );
    const claudeDir = resolve(
      process.env.HELIOS_CLAUDE_HOME ?? join(homedir(), ".claude"),
      "projects"
    );

    const codex = new Map<string, string>();
    const claude = new Map<string, string>();

    for (const filePath of this.collectJsonlFiles(codexDir)) {
      const id = this.extractCodexSessionId(filePath);
      if (id) {
        const existing = codex.get(id);
        if (!existing || this.fileMtimeMs(filePath) >= this.fileMtimeMs(existing)) {
          codex.set(id, filePath);
        }
      }
    }

    for (const filePath of this.collectJsonlFiles(claudeDir)) {
      const id = basename(filePath, ".jsonl");
      const existing = claude.get(id);
      if (!existing || this.fileMtimeMs(filePath) >= this.fileMtimeMs(existing)) {
        claude.set(id, filePath);
      }
    }

    this.indexCache = {
      builtAt: Date.now(),
      codex,
      claude
    };
  }

  private collectJsonlFiles(root: string): string[] {
    if (!existsSync(root)) {
      return [];
    }

    const files: string[] = [];
    const stack = [root];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      let entries: string[] = [];
      try {
        entries = readdirSync(current);
      } catch {
        continue;
      }

      for (const name of entries) {
        const fullPath = join(current, name);
        let stats;
        try {
          stats = statSync(fullPath);
        } catch {
          continue;
        }

        if (stats.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (extname(name) === ".jsonl") {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  private extractCodexSessionId(filePath: string): string | undefined {
    const name = basename(filePath, ".jsonl");
    const matched = name.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    );
    return matched ? matched[1] : undefined;
  }

  private parseCodexSummary(sessionId: string, filePath: string): LocalToolSessionSummary | undefined {
    const lines = this.readJsonLines(filePath);
    let cwd = "";
    let createdAt = "";
    let lastActiveAt = "";
    let latestUser = "";

    for (const obj of lines) {
      if (!obj || typeof obj !== "object") {
        continue;
      }

      const timestamp = this.getTimestamp(obj);
      if (!createdAt && timestamp) {
        createdAt = timestamp;
      }
      if (timestamp && this.tsToMs(timestamp) >= this.tsToMs(lastActiveAt)) {
        lastActiveAt = timestamp;
      }

      const type = String((obj as { type?: unknown }).type ?? "");
      if (type === "session_meta") {
        const payload = (obj as { payload?: Record<string, unknown> }).payload ?? {};
        if (typeof payload.cwd === "string") {
          cwd = payload.cwd;
        }
        if (typeof payload.timestamp === "string" && !createdAt) {
          createdAt = payload.timestamp;
        }
      }

      if (type === "response_item") {
        const payload = (obj as { payload?: Record<string, unknown> }).payload ?? {};
        if (payload.type === "message" && payload.role === "user") {
          const text = this.extractText(payload.content);
          if (text) {
            latestUser = text;
          }
        }
      }
    }

    const summary150 = latestUser.slice(0, 150) || "Codex local session";
    return {
      provider: "codex",
      toolSessionId: sessionId,
      summary150,
      cwd: cwd || undefined,
      sourcePath: filePath,
      createdAt: createdAt || undefined,
      lastActiveAt: lastActiveAt || this.fileMtimeIso(filePath)
    };
  }

  private parseClaudeSummary(sessionId: string, filePath: string): LocalToolSessionSummary | undefined {
    const lines = this.readJsonLines(filePath);
    let cwd = "";
    let createdAt = "";
    let lastActiveAt = "";
    let latestUser = "";

    for (const obj of lines) {
      if (!obj || typeof obj !== "object") {
        continue;
      }

      const timestamp = this.getTimestamp(obj);
      if (!createdAt && timestamp) {
        createdAt = timestamp;
      }
      if (timestamp && this.tsToMs(timestamp) >= this.tsToMs(lastActiveAt)) {
        lastActiveAt = timestamp;
      }

      const maybeCwd = (obj as { cwd?: unknown }).cwd;
      if (!cwd && typeof maybeCwd === "string") {
        cwd = maybeCwd;
      }

      if ((obj as { type?: unknown }).type === "user") {
        const message = (obj as { message?: unknown }).message;
        const text = this.extractText(message);
        if (text) {
          latestUser = text;
        }
      }
    }

    const summary150 = latestUser.slice(0, 150) || "Claude local session";
    return {
      provider: "claude_code",
      toolSessionId: sessionId,
      summary150,
      cwd: cwd || undefined,
      sourcePath: filePath,
      createdAt: createdAt || undefined,
      lastActiveAt: lastActiveAt || this.fileMtimeIso(filePath)
    };
  }

  private parseCodexTranscript(filePath: string): LocalTranscriptEntry[] {
    const lines = this.readJsonLines(filePath);
    const rows: LocalTranscriptEntry[] = [];

    for (const obj of lines) {
      if (!obj || typeof obj !== "object") {
        continue;
      }
      const type = String((obj as { type?: unknown }).type ?? "");
      const timestamp = this.getTimestamp(obj);

      if (type === "response_item") {
        const payload = (obj as { payload?: Record<string, unknown> }).payload ?? {};
        if (payload.type !== "message") {
          continue;
        }
        const role =
          payload.role === "assistant"
            ? "assistant"
            : payload.role === "user"
              ? "user"
              : undefined;
        if (!role) {
          continue;
        }
        const text = this.extractText(payload.content);
        if (!text) {
          continue;
        }
        rows.push({ role, text: text.slice(0, 4000), timestamp });
        continue;
      }

      if (type === "event_msg") {
        const payload = (obj as { payload?: Record<string, unknown> }).payload ?? {};
        if (payload.type === "agent_message" && typeof payload.message === "string") {
          rows.push({
            role: "assistant",
            text: payload.message.slice(0, 4000),
            timestamp
          });
        }
      }
    }

    return rows;
  }

  private parseClaudeTranscript(filePath: string): LocalTranscriptEntry[] {
    const lines = this.readJsonLines(filePath);
    const rows: LocalTranscriptEntry[] = [];

    for (const obj of lines) {
      if (!obj || typeof obj !== "object") {
        continue;
      }

      const type = String((obj as { type?: unknown }).type ?? "");
      const timestamp = this.getTimestamp(obj);
      if (type === "user") {
        const text = this.extractText((obj as { message?: unknown }).message);
        if (text) {
          rows.push({ role: "user", text: text.slice(0, 4000), timestamp });
        }
        continue;
      }
      if (type === "assistant") {
        const text = this.extractText((obj as { message?: unknown }).message);
        if (text) {
          rows.push({ role: "assistant", text: text.slice(0, 4000), timestamp });
        }
        continue;
      }
      if (type === "system") {
        const text = this.extractText(obj);
        if (text) {
          rows.push({ role: "system", text: text.slice(0, 1200), timestamp });
        }
      }
    }

    return rows;
  }

  private readJsonLines(filePath: string): unknown[] {
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      return [];
    }

    const lines = content.split(/\r?\n/);
    const result: unknown[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        result.push(JSON.parse(trimmed));
      } catch {
        continue;
      }
    }

    return result;
  }

  private getTimestamp(obj: unknown): string {
    if (!obj || typeof obj !== "object") {
      return "";
    }

    const value = (obj as { timestamp?: unknown }).timestamp;
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return new Date(value).toISOString();
    }
    return "";
  }

  private extractText(value: unknown): string {
    if (value == null) {
      return "";
    }
    if (typeof value === "string") {
      return value.trim();
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => this.extractText(item))
        .filter(Boolean)
        .join("\n")
        .trim();
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const directKeys = ["text", "output_text", "input_text", "display", "content"];
      for (const key of directKeys) {
        const extracted = this.extractText(obj[key]);
        if (extracted) {
          return extracted;
        }
      }
      if ("message" in obj) {
        const extracted = this.extractText(obj.message);
        if (extracted) {
          return extracted;
        }
      }
    }
    return "";
  }

  private fileMtimeIso(filePath: string): string {
    try {
      return statSync(filePath).mtime.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  private fileMtimeMs(filePath: string): number {
    try {
      return statSync(filePath).mtimeMs;
    } catch {
      return 0;
    }
  }

  private tsToMs(ts: string): number {
    if (!ts) {
      return 0;
    }
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
