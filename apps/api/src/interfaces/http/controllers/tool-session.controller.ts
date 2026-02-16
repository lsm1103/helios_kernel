import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query
} from "@nestjs/common";
import { ToolSessionLinkService } from "../../../application/tooling/tool-session-link.service";
import { InteractionRequestService } from "../../../application/tooling/interaction-request.service";
import { PtyRunManager } from "../../../infrastructure/tool-runners/pty-run-manager";
import {
  ToolProvider,
  ToolSessionSource
} from "../../../infrastructure/persistence/sqlite/repositories/tool-session-link.repository";
import { ToolRunService } from "../../../application/tooling/tool-run.service";
import { LocalSessionScannerService } from "../../../infrastructure/tool-runners/local-session-scanner.service";

@Controller()
export class ToolSessionController {
  constructor(
    private readonly toolSessionService: ToolSessionLinkService,
    private readonly interactionService: InteractionRequestService,
    private readonly runManager: PtyRunManager,
    private readonly toolRunService: ToolRunService,
    private readonly localScanner: LocalSessionScannerService
  ) {}

  @Post("v1/tool-sessions")
  createToolSession(
    @Body()
    body: {
      collab_session_id: string;
      task_id: string;
      provider: ToolProvider;
      source?: ToolSessionSource;
      tool_session_id: string;
      summary_150?: string;
    }
  ) {
    return this.toolSessionService.create({
      collabSessionId: body.collab_session_id,
      taskId: body.task_id,
      provider: body.provider,
      source: body.source,
      toolSessionId: body.tool_session_id,
      initialSummary: body.summary_150
    });
  }

  @Get("v1/tool-sessions")
  listAll(
    @Query("provider") provider?: string,
    @Query("source") source?: string,
    @Query("collab_session_id") collabSessionId?: string
  ) {
    const safeProvider =
      provider === "codex" || provider === "claude_code" ? provider : undefined;
    const safeSource =
      source === "COLLAB" || source === "USER_OPENED" ? source : undefined;

    return this.toolSessionService.listAll({
      provider: safeProvider as ToolProvider | undefined,
      source: safeSource as ToolSessionSource | undefined,
      collabSessionId
    });
  }

  @Get("v1/tool-sessions/:toolSessionId/transcript")
  transcript(
    @Param("toolSessionId") toolSessionId: string,
    @Query("run_id") runId?: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number
  ) {
    const safeLimit = limit ?? 300;
    const link = this.toolSessionService.getByToolSessionId(toolSessionId);
    const provider = link?.provider;

    if (runId) {
      const output = this.toolRunService.output(runId, safeLimit);
      return {
        tool_session_id: toolSessionId,
        run_id: runId,
        provider,
        entries: output.map((row) => ({
          role: "tool",
          text: row.data,
          timestamp: row.receivedAt
        }))
      };
    }

    const entries = this.toolSessionService.peek(toolSessionId, safeLimit);
    return {
      tool_session_id: toolSessionId,
      provider,
      entries: entries.map((row) => ({
        role: "system",
        text: row
      }))
    };
  }

  @Get("v1/local-tool-sessions")
  listLocalToolSessions(
    @Query("provider") provider?: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number
  ) {
    const safeProvider =
      provider === "codex" || provider === "claude_code" ? provider : undefined;

    return this.localScanner.listSessions({
      provider: safeProvider,
      limit: limit ?? 200
    });
  }

  @Get("v1/local-tool-sessions/:provider/:toolSessionId/transcript")
  localTranscript(
    @Param("provider") provider: string,
    @Param("toolSessionId") toolSessionId: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number
  ) {
    if (provider !== "codex" && provider !== "claude_code") {
      throw new BadRequestException("provider must be codex or claude_code");
    }

    return {
      provider,
      tool_session_id: toolSessionId,
      entries: this.localScanner.readTranscript(provider, toolSessionId, limit ?? 200)
    };
  }

  @Get("v1/collab-sessions/:collabSessionId/tool-sessions")
  list(@Param("collabSessionId") collabSessionId: string) {
    return this.toolSessionService.list(collabSessionId);
  }

  @Post("v1/collab-sessions/:collabSessionId/tool-sessions/:toolSessionId/use")
  use(
    @Param("collabSessionId") collabSessionId: string,
    @Param("toolSessionId") toolSessionId: string
  ) {
    return this.toolSessionService.use(collabSessionId, toolSessionId);
  }

  @Get("v1/collab-sessions/:collabSessionId/tool-sessions/:toolSessionId/peek")
  peek(
    @Param("toolSessionId") toolSessionId: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return {
      tool_session_id: toolSessionId,
      entries: this.toolSessionService.peek(toolSessionId, limit ?? 10)
    };
  }

  @Post("internal/tool-runs")
  registerRun(
    @Body()
    body: {
      run_id: string;
      task_id: string;
      tool_session_id: string;
      provider: ToolProvider;
    }
  ) {
    return this.runManager.registerRun({
      runId: body.run_id,
      taskId: body.task_id,
      toolSessionId: body.tool_session_id,
      provider: body.provider
    });
  }

  @Post("internal/tool-runs/start")
  startRun(
    @Body()
    body: {
      collab_session_id: string;
      task_id: string;
      tool_session_id: string;
      provider: ToolProvider;
      prompt: string;
      session_id?: string;
      cwd?: string;
      run_id?: string;
    }
  ) {
    return this.toolRunService.start({
      collabSessionId: body.collab_session_id,
      taskId: body.task_id,
      toolSessionId: body.tool_session_id,
      provider: body.provider,
      prompt: body.prompt,
      sessionId: body.session_id,
      cwd: body.cwd,
      runId: body.run_id
    });
  }

  @Post("internal/tool-runs/:runId/stop")
  stopRun(@Param("runId") runId: string) {
    return this.toolRunService.stop(runId);
  }

  @Get("internal/tool-runs/:runId/output")
  runOutput(
    @Param("runId") runId: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return {
      run_id: runId,
      output: this.toolRunService.output(runId, limit ?? 200)
    };
  }

  @Post("internal/interaction-requests")
  createInteraction(
    @Body()
    body: {
      collab_session_id: string;
      tool_session_id: string;
      run_id: string;
      prompt: string;
      options?: string[];
      timeout_minutes?: number;
    }
  ) {
    return this.interactionService.create({
      collabSessionId: body.collab_session_id,
      toolSessionId: body.tool_session_id,
      runId: body.run_id,
      prompt: body.prompt,
      options: body.options,
      timeoutMinutes: body.timeout_minutes
    });
  }

  @Post("internal/tool-runs/:runId/stdin")
  writeStdin(
    @Param("runId") runId: string,
    @Body()
    body: {
      interaction_request_id: string;
      stdin_text: string;
      idempotency_key: string;
    }
  ) {
    return this.interactionService.writeToRunStdin({
      runId,
      interactionRequestId: body.interaction_request_id,
      stdinText: body.stdin_text,
      idempotencyKey: body.idempotency_key
    });
  }

  @Post("internal/tool-runs/:runId/stdin/raw")
  writeRawStdin(
    @Param("runId") runId: string,
    @Body()
    body: {
      stdin_text: string;
    }
  ) {
    return this.toolRunService.writeStdin(runId, body.stdin_text);
  }

  @Get("internal/interaction-requests/pending")
  listPendingInteractions(
    @Query("collab_session_id") collabSessionId?: string,
    @Query("tool_session_id") toolSessionId?: string,
    @Query("run_id") runId?: string
  ) {
    return this.interactionService.listPending({
      collabSessionId,
      toolSessionId,
      runId
    });
  }
}
