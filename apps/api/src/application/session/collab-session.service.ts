import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CollabSessionRecord,
  CollabSessionRepository,
  CollabSessionTool
} from "../../infrastructure/persistence/sqlite/repositories/collab-session.repository";
import { CollabFeedEventService } from "./collab-feed-event.service";

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
    private readonly feedEventService: CollabFeedEventService
  ) {}

  create(input: CreateCollabSessionInput): CollabSessionRecord {
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
      updatedAt: now
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

  archive(collabSessionId: string, actor: string, reason?: string): CollabSessionRecord {
    const result = this.repo.archive(collabSessionId, actor, reason);
    if (!result) {
      throw new NotFoundException("Collaboration session not found");
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
}
