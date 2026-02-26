import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CollabSessionRecord,
  CollabSessionRepository,
  CollabSessionTool
} from "../../infrastructure/persistence/sqlite/repositories/collab-session.repository";
import {
  CollabFeedRepository,
  LatestRunStateRecord
} from "../../infrastructure/persistence/sqlite/repositories/collab-feed.repository";
import { ToolSessionLinkService } from "../tooling/tool-session-link.service";
import { CollabFeedEventService } from "./collab-feed-event.service";
import { OrchestratorLlmService } from "../orchestrator/orchestrator-llm.service";

interface CreateCollabSessionInput {
  name: string;
  description: string;
  workspacePath?: string;
  activeTool?: CollabSessionTool;
  metadata?: Record<string, unknown>;
  actor?: string;
}

@Injectable()
export class CollabSessionService {
  constructor(
    private readonly repo: CollabSessionRepository,
    private readonly feedEventService: CollabFeedEventService,
    private readonly toolSessionService: ToolSessionLinkService,
    private readonly feedRepo: CollabFeedRepository,
    private readonly orchestratorService: OrchestratorLlmService
  ) {}

  async create(input: CreateCollabSessionInput): Promise<CollabSessionRecord> {
    const now = new Date().toISOString();
    const collabSessionId = `collab_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

    const record: CollabSessionRecord = {
      collabSessionId,
      name: input.name.trim(),
      description: input.description.trim(),
      status: "ACTIVE",
      workspacePath: input.workspacePath?.trim() ?? "",
      activeTool: input.activeTool,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      lastMessagePreview20: "-"
    };

    const created = this.repo.create(record, {
      eventId: randomUUID(),
      collabSessionId: record.collabSessionId,
      action: "CREATED",
      actor: input.actor ?? "system",
      payload: {
        name: record.name,
        status: record.status
      },
      createdAt: now
    });

    this.feedEventService.ensureToolSelectCard({
      collabSessionId: created.collabSessionId,
      selected: created.activeTool,
      ts: created.updatedAt
    });

    const requirementText = `${created.name}\n${created.description}`.trim();
    if (requirementText) {
      const analysis = await this.orchestratorService.analyzeRequirement({
        sessionName: created.name,
        requirementText
      });
      if (analysis.text.trim()) {
        this.feedEventService.appendOrchestratorSummary({
          collabSessionId: created.collabSessionId,
          content: `[orchestrator:${analysis.provider ?? "degraded"}] ${analysis.text.trim()}`
        });
      }

      const suggestion = await this.orchestratorService.suggestToolAndQuestions({
        requirementText
      });
      if (suggestion.text.trim()) {
        this.feedEventService.appendOrchestratorSummary({
          collabSessionId: created.collabSessionId,
          content: `[orchestrator:${suggestion.provider ?? "degraded"}] ${suggestion.text.trim()}`
        });
      }
    }

    return created;
  }

  list(options?: { includeArchived?: boolean }): CollabSessionRecord[] {
    return this.repo.list(options);
  }

  getById(collabSessionId: string): CollabSessionRecord {
    const result = this.repo.getById(collabSessionId);
    if (!result) {
      throw new NotFoundException("Collaboration session not found");
    }
    return result;
  }

  async archive(collabSessionId: string, actor: string, reason?: string): Promise<CollabSessionRecord> {
    const result = this.repo.archive(collabSessionId, actor, reason);
    if (!result) {
      throw new NotFoundException("Collaboration session not found");
    }

    const archiveSummary = await this.orchestratorService.summarizeArchive({
      sessionName: result.name,
      lastSummary: result.lastMessagePreview20
    });
    if (archiveSummary.text.trim()) {
      this.feedEventService.appendOrchestratorSummary({
        collabSessionId,
        content: `[orchestrator:${archiveSummary.provider ?? "degraded"}] ${archiveSummary.text.trim()}`
      });
    }
    return result;
  }

  setActiveTool(collabSessionId: string, tool: CollabSessionTool, actor: string): CollabSessionRecord {
    const result = this.repo.setActiveTool(collabSessionId, tool, actor);
    if (!result) {
      throw new NotFoundException("Collaboration session not found");
    }

    this.feedEventService.ensureToolSelectCard({
      collabSessionId,
      selected: tool,
      ts: result.updatedAt
    });
    this.feedEventService.appendStatusEvent({
      collabSessionId,
      eventType: "TOOL_SWITCHED",
      provider: tool,
      summary: `Switched active tool to ${tool}`,
      sourceEventKey: `status:tool_switched:${collabSessionId}:${result.updatedAt}`,
      ts: result.updatedAt
    });

    return result;
  }

  workspaceState(collabSessionId: string): {
    session: CollabSessionRecord;
    linkedToolSessions: ReturnType<ToolSessionLinkService["list"]>;
    latestRunState: LatestRunStateRecord;
    orchestrator: {
      provider: string;
      model: string;
    };
  } {
    const session = this.getById(collabSessionId);
    const linkedToolSessions = this.toolSessionService.list(collabSessionId);
    const latestRunState = this.feedRepo.getLatestRunStateBySession(collabSessionId);
    const orchestratorSettings = this.orchestratorService.getPublicSettings();

    return {
      session,
      linkedToolSessions,
      latestRunState,
      orchestrator: {
        provider: orchestratorSettings.primary_provider,
        model: orchestratorSettings.model
      }
    };
  }
}
