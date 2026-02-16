import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { CollabFeedService } from "../../../application/session/collab-feed.service";

@Controller()
export class CollabFeedController {
  constructor(private readonly collabFeedService: CollabFeedService) {}

  @Get("v1/collab-sessions/:collabSessionId/feed")
  feed(
    @Param("collabSessionId") collabSessionId: string,
    @Query("cursor") cursor?: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return this.collabFeedService.listFeed({
      collabSessionId,
      cursor,
      limit
    });
  }

  @Post("v1/collab-sessions/:collabSessionId/feed/text")
  appendText(
    @Param("collabSessionId") collabSessionId: string,
    @Body()
    body?: {
      role?: "user" | "system" | "assistant";
      content?: string;
    }
  ) {
    const role = body?.role ?? "user";
    if (role !== "user" && role !== "system" && role !== "assistant") {
      throw new BadRequestException("role must be user/system/assistant");
    }
    const content = body?.content?.trim() ?? "";
    if (!content) {
      throw new BadRequestException("content is required");
    }
    return this.collabFeedService.appendText({
      collabSessionId,
      role,
      content
    });
  }

  @Post("v1/collab-cards/:cardId/actions")
  async cardAction(
    @Param("cardId") cardId: string,
    @Body()
    body?: {
      action_id?: string;
      params?: Record<string, unknown>;
      idempotency_key?: string;
    }
  ) {
    const actionId = body?.action_id?.trim();
    const idempotencyKey = body?.idempotency_key?.trim();
    if (!actionId) {
      throw new BadRequestException("action_id is required");
    }
    if (!idempotencyKey) {
      throw new BadRequestException("idempotency_key is required");
    }

    return this.collabFeedService.handleCardAction({
      cardId,
      actionId,
      params: body?.params,
      idempotencyKey
    });
  }

  @Get("v1/tool-providers")
  providers() {
    return this.collabFeedService.listToolProviders();
  }
}
