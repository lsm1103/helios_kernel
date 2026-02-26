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
import { CollabFeedEventService } from "../session/collab-feed-event.service";
import { OrchestratorLlmService } from "../orchestrator/orchestrator-llm.service";

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
  private readonly progressBuffer = new Map<string, string>();
  private readonly progressTick = new Map<string, number>();

  constructor(
    private readonly codexAdapter: CodexAdapter,
    private readonly claudeAdapter: ClaudeAdapter,
    private readonly runManager: PtyRunManager,
    private readonly interactionService: InteractionRequestService,
    private readonly toolSessionService: ToolSessionLinkService,
    private readonly feedEventService: CollabFeedEventService,
    private readonly orchestratorService: OrchestratorLlmService
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
      onNeedUserInput: async (signal) => {
        const interaction = await this.interactionService.create({
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
      },
      onOutput: async (chunk) => {
        await this.handleProgressOutput({
          collabSessionId: input.collabSessionId,
          toolSessionId: input.toolSessionId,
          runId,
          chunk
        });
      },
      onRunTerminated: async (event) => {
        const isPaused = event.reason === "STOPPED";
        const isFailed = !isPaused && (event.exitCode ?? 0) !== 0;
        const eventType = isPaused ? "RUN_PAUSED" : isFailed ? "RUN_FAILED" : "RUN_DONE";
        const summary = isPaused
          ? `Run ${runId} paused`
          : isFailed
            ? `Run ${runId} failed with exit code ${event.exitCode ?? -1}`
            : `Run ${runId} completed`;
        this.feedEventService.appendStatusEvent({
          collabSessionId: input.collabSessionId,
          eventType,
          runId,
          toolSessionId: input.toolSessionId,
          provider: input.provider,
          summary,
          sourceEventKey: `status:${isPaused ? "run_paused" : isFailed ? "run_failed" : "run_done"}:${runId}`
        });
        await this.handleCompletionSummary({
          collabSessionId: input.collabSessionId,
          runId,
          status: eventType,
          summary
        });
        this.progressBuffer.delete(runId);
        this.progressTick.delete(runId);
      }
    });

    this.toolSessionService.appendSummary(
      input.toolSessionId,
      `Run ${record.runId} started by ${input.provider}`
    );
    this.feedEventService.upsertToolSessionCard({
      collabSessionId: input.collabSessionId,
      toolSessionId: input.toolSessionId,
      provider: input.provider,
      summary150: `Run ${record.runId} started by ${input.provider}`,
      runId: record.runId
    });
    this.feedEventService.appendStatusEvent({
      collabSessionId: input.collabSessionId,
      eventType: "RUN_STARTED",
      runId: record.runId,
      toolSessionId: input.toolSessionId,
      provider: input.provider,
      summary: `Run ${record.runId} started`,
      sourceEventKey: `status:run_started:${record.runId}`
    });

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

  private async handleProgressOutput(input: {
    collabSessionId: string;
    toolSessionId: string;
    runId: string;
    chunk: string;
  }): Promise<void> {
    const trimmed = input.chunk.trim();
    if (!trimmed) {
      return;
    }

    const previous = this.progressBuffer.get(input.runId) ?? "";
    const merged = `${previous}\n${trimmed}`.slice(-1200);
    this.progressBuffer.set(input.runId, merged);

    const now = Date.now();
    const last = this.progressTick.get(input.runId) ?? 0;
    if (now - last < 12000) {
      return;
    }
    this.progressTick.set(input.runId, now);

    const summary = await this.orchestratorService.summarizeProgress({
      runId: input.runId,
      chunk: merged
    });
    if (!summary.text.trim()) {
      return;
    }

    const content = `[orchestrator:${summary.provider ?? "degraded"}] ${summary.text.trim()}`;
    this.feedEventService.appendOrchestratorSummary({
      collabSessionId: input.collabSessionId,
      content
    });
    this.toolSessionService.appendSummary(input.toolSessionId, content);
  }

  private async handleCompletionSummary(input: {
    collabSessionId: string;
    runId: string;
    status: "RUN_DONE" | "RUN_FAILED" | "RUN_PAUSED";
    summary: string;
  }): Promise<void> {
    const completion = await this.orchestratorService.summarizeCompletion({
      runId: input.runId,
      status: input.status,
      detail: input.summary
    });
    if (!completion.text.trim()) {
      return;
    }

    const content = `[orchestrator:${completion.provider ?? "degraded"}] ${completion.text.trim()}`;
    this.feedEventService.appendOrchestratorSummary({
      collabSessionId: input.collabSessionId,
      content
    });
  }
}
