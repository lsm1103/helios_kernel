import { BadRequestException, Injectable } from "@nestjs/common";
import { ErrorCodes } from "../../domain/common/error-codes";
import {
  CollabFeedRepository,
  FeedTextRole,
  MixedFeedItemRecord
} from "../../infrastructure/persistence/sqlite/repositories/collab-feed.repository";
import { InteractionRequestsRepository } from "../../infrastructure/persistence/sqlite/repositories/interaction-requests.repository";
import { ToolProvider } from "../../infrastructure/persistence/sqlite/repositories/tool-session-link.repository";
import { CollabSessionService } from "./collab-session.service";
import { ToolSessionLinkService } from "../tooling/tool-session-link.service";
import { InteractionRequestService } from "../tooling/interaction-request.service";
import { CardActionResponse, CollabCard, CollabCardStatus, FeedItem } from "./collab-feed.types";

@Injectable()
export class CollabFeedService {
  constructor(
    private readonly feedRepo: CollabFeedRepository,
    private readonly collabSessionService: CollabSessionService,
    private readonly toolSessionService: ToolSessionLinkService,
    private readonly interactionService: InteractionRequestService,
    private readonly interactionRepo: InteractionRequestsRepository
  ) {}

  listFeed(input: { collabSessionId: string; cursor?: string; limit?: number }): {
    items: FeedItem[];
    next_cursor?: string;
  } {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const offset = this.decodeCursor(input.cursor);

    const page = this.feedRepo.listMixedBySession({
      collabSessionId: input.collabSessionId,
      limit,
      offset
    });

    const items = page.items
      .map((row) => this.toFeedItem(row))
      .filter((row): row is FeedItem => Boolean(row));

    return {
      items,
      next_cursor: page.hasMore ? this.encodeCursor(offset + limit) : undefined
    };
  }

  appendText(input: {
    collabSessionId: string;
    role: FeedTextRole;
    content: string;
  }): FeedItem {
    const row = this.feedRepo.appendText({
      collabSessionId: input.collabSessionId,
      role: input.role,
      content: input.content.trim()
    });

    return {
      id: row.id,
      kind: "text",
      role: row.role,
      content: row.content,
      ts: row.ts
    };
  }

  listToolProviders() {
    return [
      { provider: "codex", label: "Codex" },
      { provider: "claude_code", label: "Claude Code" }
    ] as const;
  }

  async handleCardAction(input: {
    cardId: string;
    actionId: string;
    params?: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<CardActionResponse> {
    const existing = this.feedRepo.getCardActionResponse(input.idempotencyKey);
    if (
      existing &&
      typeof existing.ok === "boolean" &&
      typeof existing.card_status === "string" &&
      Array.isArray(existing.effects)
    ) {
      return existing as unknown as CardActionResponse;
    }

    const cardRow = this.feedRepo.getCardById(input.cardId);
    if (!cardRow) {
      throw new BadRequestException("Unknown card id");
    }

    const card = cardRow.card;
    if (card.card_type !== "action_request") {
      throw new BadRequestException("status_event card does not support actions");
    }

    let response: CardActionResponse;
    switch (card.payload.action_kind) {
      case "tool_select":
        response = this.handleToolSelectAction({
          collabSessionId: cardRow.collabSessionId,
          card,
          actionId: input.actionId,
          params: input.params
        });
        break;
      case "tool_session":
        response = this.handleToolSessionAction({
          card,
          actionId: input.actionId
        });
        break;
      case "hitl_request":
        response = await this.handleHitlAction({
          collabSessionId: cardRow.collabSessionId,
          card,
          actionId: input.actionId,
          params: input.params,
          idempotencyKey: input.idempotencyKey
        });
        break;
      default:
        throw new BadRequestException("Unsupported card action");
    }

    this.feedRepo.saveCardActionResponse({
      idempotencyKey: input.idempotencyKey,
      cardId: input.cardId,
      actionId: input.actionId,
      response: response as unknown as Record<string, unknown>
    });

    return response;
  }

  private handleToolSelectAction(input: {
    collabSessionId: string;
    card: Extract<CollabCard, { card_type: "action_request" }>;
    actionId: string;
    params?: Record<string, unknown>;
  }): CardActionResponse {
    if (input.actionId !== "select_tool") {
      throw new BadRequestException("Invalid action for tool_select card");
    }

    const provider = input.params?.provider;
    if (provider !== "codex" && provider !== "claude_code") {
      throw new BadRequestException("params.provider must be codex or claude_code");
    }
    if (input.card.payload.action_kind !== "tool_select") {
      throw new BadRequestException("Card payload mismatch for tool_select");
    }

    this.collabSessionService.setActiveTool(input.collabSessionId, provider, "card_action");

    const toolSelectPayload = input.card.payload;
    const nextCard: Extract<CollabCard, { card_type: "action_request" }> = {
      ...input.card,
      status: "RESOLVED",
      payload: {
        ...toolSelectPayload,
        selected: provider
      }
    };
    this.feedRepo.upsertCard({
      collabSessionId: input.collabSessionId,
      card: nextCard,
      sourceEventKey: `action:tool_select:${input.collabSessionId}`
    });

    const item = this.appendText({
      collabSessionId: input.collabSessionId,
      role: "system",
      content: `Tool selected: ${provider}`
    });

    return {
      ok: true,
      card_status: "RESOLVED",
      effects: [
        { type: "APPEND_FEED_ITEM", item },
        { type: "SHOW_TOAST", level: "info", message: `Tool switched to ${provider}` }
      ]
    };
  }

  private handleToolSessionAction(input: {
    card: Extract<CollabCard, { card_type: "action_request" }>;
    actionId: string;
  }): CardActionResponse {
    if (input.actionId !== "open_transcript") {
      throw new BadRequestException("Invalid action for tool_session card");
    }

    if (input.card.payload.action_kind !== "tool_session") {
      throw new BadRequestException("Card payload mismatch for open_transcript");
    }

    const toolSessionId = input.card.payload.tool_session_id;
    const link = this.toolSessionService.getByToolSessionId(toolSessionId);
    if (!link) {
      this.feedRepo.updateCardStatus(input.card.card_id, "CANCELLED");
      return {
        ok: false,
        card_status: "CANCELLED",
        effects: [{ type: "SHOW_TOAST", level: "error", message: "Tool session not found" }]
      };
    }

    return {
      ok: true,
      card_status: "RESOLVED",
      effects: [
        {
          type: "OPEN_DRAWER",
          target: {
            drawer_type: "tool_session",
            card_id: input.card.card_id,
            tool_session_id: toolSessionId,
            provider: link.provider,
            run_id: input.card.payload.run_id
          }
        }
      ]
    };
  }

  private async handleHitlAction(input: {
    collabSessionId: string;
    card: Extract<CollabCard, { card_type: "action_request" }>;
    actionId: string;
    params?: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<CardActionResponse> {
    if (input.actionId !== "choose_option" && input.actionId !== "submit_text") {
      throw new BadRequestException("Invalid action for hitl_request card");
    }

    if (input.card.payload.action_kind !== "hitl_request") {
      throw new BadRequestException("Card payload mismatch for hitl_request");
    }

    const interactionRequestId = input.card.payload.interaction_request_id;
    const request = this.interactionRepo.getById(interactionRequestId);
    if (!request) {
      this.feedRepo.updateCardStatus(input.card.card_id, "EXPIRED");
      return {
        ok: false,
        card_status: "EXPIRED",
        effects: [{ type: "SHOW_TOAST", level: "error", message: ErrorCodes.InteractionNotFound }]
      };
    }

    if (request.status !== "PENDING" || new Date(request.expiresAt).getTime() <= Date.now()) {
      this.feedRepo.updateCardStatus(input.card.card_id, "EXPIRED");
      return {
        ok: false,
        card_status: "EXPIRED",
        effects: [{ type: "SHOW_TOAST", level: "error", message: ErrorCodes.InteractionExpired }]
      };
    }

    const choiceValue = input.params?.choice;
    const textValue = input.params?.text;
    const answer =
      input.actionId === "choose_option"
        ? typeof choiceValue === "string"
          ? choiceValue
          : undefined
        : typeof textValue === "string"
          ? textValue
          : undefined;

    if (!answer || answer.trim().length === 0) {
      throw new BadRequestException("Missing answer value");
    }

    try {
      await this.interactionService.writeToRunStdin({
        runId: request.runId,
        interactionRequestId,
        stdinText: `${answer.trim()}\n`,
        idempotencyKey: `card_action_${input.idempotencyKey}`
      });

      this.feedRepo.updateCardStatus(input.card.card_id, "RESOLVED");

      const item = this.appendText({
        collabSessionId: input.collabSessionId,
        role: "system",
        content: `HITL resolved: ${answer.trim()}`
      });

      return {
        ok: true,
        card_status: "RESOLVED",
        effects: [
          { type: "APPEND_FEED_ITEM", item },
          { type: "SHOW_TOAST", level: "info", message: "Interaction resolved" }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : ErrorCodes.RunNotActive;
      const cardStatus: CollabCardStatus = message.includes(ErrorCodes.RunNotActive) ? "EXPIRED" : "CANCELLED";
      this.feedRepo.updateCardStatus(input.card.card_id, cardStatus);
      return {
        ok: false,
        card_status: cardStatus,
        effects: [{ type: "SHOW_TOAST", level: "error", message }]
      };
    }
  }

  private toFeedItem(row: MixedFeedItemRecord): FeedItem | undefined {
    if (row.kind === "text") {
      return {
        id: row.id,
        kind: "text",
        role: row.role,
        content: row.content,
        ts: row.ts
      };
    }

    return {
      id: row.id,
      kind: "card",
      card: row.card,
      ts: row.ts
    };
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
  }

  private decodeCursor(cursor?: string): number {
    if (!cursor) {
      return 0;
    }

    try {
      const payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
        offset?: unknown;
      };
      if (typeof payload.offset === "number" && Number.isFinite(payload.offset) && payload.offset >= 0) {
        return Math.floor(payload.offset);
      }
      return 0;
    } catch {
      return 0;
    }
  }
}
