import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CollabSessionService } from "../../../application/session/collab-session.service";

@Controller("v1/collab-sessions")
export class SessionController {
  constructor(private readonly collabSessionService: CollabSessionService) {}

  @Get()
  list(@Query("include_archived") includeArchivedRaw?: string) {
    const includeArchived =
      includeArchivedRaw === "1" ||
      includeArchivedRaw === "true" ||
      includeArchivedRaw === "yes";

    return this.collabSessionService.list({ includeArchived });
  }

  @Post()
  create(
    @Body()
    body: {
      name?: string;
      description?: string;
      workspace_path?: string;
      active_tool?: "codex" | "claude_code";
      metadata?: Record<string, unknown>;
      actor?: string;
    }
  ) {
    const name = body.name?.trim() ?? "";
    if (!name) {
      throw new BadRequestException("name is required");
    }

    return this.collabSessionService.create({
      name,
      description: body.description?.trim() ?? "",
      workspacePath: body.workspace_path?.trim() ?? "",
      activeTool: body.active_tool,
      metadata: body.metadata ?? {},
      actor: body.actor
    });
  }

  @Get(":collabSessionId")
  detail(@Param("collabSessionId") collabSessionId: string) {
    return this.collabSessionService.getById(collabSessionId);
  }

  @Post(":collabSessionId/archive")
  archive(
    @Param("collabSessionId") collabSessionId: string,
    @Body()
    body?: {
      actor?: string;
      reason?: string;
    }
  ) {
    const actor = body?.actor?.trim() || "system";
    return this.collabSessionService.archive(collabSessionId, actor, body?.reason?.trim() || undefined);
  }
}
