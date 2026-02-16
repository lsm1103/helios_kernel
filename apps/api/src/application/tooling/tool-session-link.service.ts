import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ToolProvider,
  ToolSessionSource,
  ToolSessionLinkRecord,
  ToolSessionLinkRepository
} from "../../infrastructure/persistence/sqlite/repositories/tool-session-link.repository";
import { CollabFeedEventService } from "../session/collab-feed-event.service";

interface CreateToolSessionLinkInput {
  collabSessionId: string;
  taskId: string;
  provider: ToolProvider;
  source?: ToolSessionSource;
  toolSessionId: string;
  initialSummary?: string;
}

@Injectable()
export class ToolSessionLinkService {
  constructor(
    private readonly repo: ToolSessionLinkRepository,
    private readonly feedEventService: CollabFeedEventService
  ) {}

  create(input: CreateToolSessionLinkInput): ToolSessionLinkRecord {
    const created = this.repo.create({
      linkId: randomUUID(),
      collabSessionId: input.collabSessionId,
      taskId: input.taskId,
      provider: input.provider,
      source: input.source ?? "COLLAB",
      toolSessionId: input.toolSessionId,
      status: "ACTIVE",
      lastSummary150: (input.initialSummary ?? "").slice(0, 150),
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    this.feedEventService.upsertToolSessionCard({
      collabSessionId: created.collabSessionId,
      toolSessionId: created.toolSessionId,
      provider: created.provider,
      summary150: created.lastSummary150,
      ts: created.lastActiveAt
    });

    this.feedEventService.appendStatusEvent({
      collabSessionId: created.collabSessionId,
      eventType: "TOOL_SESSION_LINKED",
      toolSessionId: created.toolSessionId,
      provider: created.provider,
      summary: `Linked ${created.provider} session ${created.toolSessionId}`,
      sourceEventKey: `status:tool_session_linked:${created.toolSessionId}`,
      ts: created.lastActiveAt
    });

    return created;
  }

  list(collabSessionId: string): ToolSessionLinkRecord[] {
    return this.repo.listByCollabSession(collabSessionId);
  }

  listAll(filters?: {
    provider?: ToolProvider;
    source?: ToolSessionSource;
    collabSessionId?: string;
  }): ToolSessionLinkRecord[] {
    return this.repo.listAll(filters);
  }

  getByToolSessionId(toolSessionId: string): ToolSessionLinkRecord | undefined {
    return this.repo.getByToolSessionId(toolSessionId);
  }

  use(collabSessionId: string, toolSessionId: string): ToolSessionLinkRecord {
    const updated = this.repo.setActive(collabSessionId, toolSessionId);
    if (!updated) {
      throw new NotFoundException("Tool session link not found for this collaboration session");
    }
    this.feedEventService.upsertToolSessionCard({
      collabSessionId: updated.collabSessionId,
      toolSessionId: updated.toolSessionId,
      provider: updated.provider,
      summary150: updated.lastSummary150,
      ts: updated.lastActiveAt
    });
    return updated;
  }

  peek(toolSessionId: string, limit = 10): string[] {
    return this.repo.peek(toolSessionId, limit);
  }

  appendSummary(toolSessionId: string, summary150: string): void {
    this.repo.appendSummary(toolSessionId, summary150.slice(0, 150));
    const updated = this.repo.getByToolSessionId(toolSessionId);
    if (!updated) {
      return;
    }
    this.feedEventService.upsertToolSessionCard({
      collabSessionId: updated.collabSessionId,
      toolSessionId: updated.toolSessionId,
      provider: updated.provider,
      summary150: updated.lastSummary150,
      ts: updated.lastActiveAt
    });
  }
}
