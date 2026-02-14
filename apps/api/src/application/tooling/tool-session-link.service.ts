import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ToolProvider,
  ToolSessionSource,
  ToolSessionLinkRecord,
  ToolSessionLinkRepository
} from "../../infrastructure/persistence/sqlite/repositories/tool-session-link.repository";

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
  constructor(private readonly repo: ToolSessionLinkRepository) {}

  create(input: CreateToolSessionLinkInput): ToolSessionLinkRecord {
    return this.repo.create({
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

  use(collabSessionId: string, toolSessionId: string): ToolSessionLinkRecord {
    const updated = this.repo.setActive(collabSessionId, toolSessionId);
    if (!updated) {
      throw new NotFoundException("Tool session link not found for this collaboration session");
    }
    return updated;
  }

  peek(toolSessionId: string, limit = 10): string[] {
    return this.repo.peek(toolSessionId, limit);
  }

  appendSummary(toolSessionId: string, summary150: string): void {
    this.repo.appendSummary(toolSessionId, summary150.slice(0, 150));
  }
}
