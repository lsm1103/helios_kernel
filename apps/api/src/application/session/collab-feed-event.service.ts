import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ToolProvider } from "../../infrastructure/persistence/sqlite/repositories/tool-session-link.repository";
import { CollabFeedRepository } from "../../infrastructure/persistence/sqlite/repositories/collab-feed.repository";
import {
  CollabCard,
  CollabCardStatus,
  COMPACT_CARD_DISPLAY,
  FeedItem,
  StatusEventType
} from "./collab-feed.types";

interface StatusEventInput {
  collabSessionId: string;
  eventType: StatusEventType;
  summary?: string;
  runId?: string;
  toolSessionId?: string;
  provider?: ToolProvider;
  sourceEventKey?: string;
  ts?: string;
}

@Injectable()
export class CollabFeedEventService {
  constructor(private readonly feedRepo: CollabFeedRepository) {}

  ensureToolSelectCard(input: {
    collabSessionId: string;
    selected?: ToolProvider;
    runId?: string;
    ts?: string;
  }): FeedItem {
    const card: CollabCard = {
      card_id: `action:tool_select:${input.collabSessionId}`,
      card_type: "action_request",
      title: "Choose tool",
      status: input.selected ? "RESOLVED" : "PENDING",
      display: COMPACT_CARD_DISPLAY,
      payload: {
        action_kind: "tool_select",
        run_id: input.runId,
        options: [
          { value: "codex", label: "Codex" },
          { value: "claude_code", label: "Claude Code" }
        ],
        selected: input.selected
      },
      actions: [{ action_id: "select_tool", label: "Apply", style: "primary" }]
    };

    const stored = this.feedRepo.upsertCard({
      collabSessionId: input.collabSessionId,
      card,
      ts: input.ts,
      sourceEventKey: `action:tool_select:${input.collabSessionId}`
    });

    return { id: stored.id, kind: "card", card: stored.card, ts: stored.ts };
  }

  upsertToolSessionCard(input: {
    collabSessionId: string;
    toolSessionId: string;
    provider: ToolProvider;
    summary150: string;
    runId?: string;
    ts?: string;
  }): FeedItem {
    const card: CollabCard = {
      card_id: `action:tool_session:${input.toolSessionId}`,
      card_type: "action_request",
      title: `Tool session · ${input.toolSessionId}`,
      status: "PENDING",
      display: COMPACT_CARD_DISPLAY,
      payload: {
        action_kind: "tool_session",
        tool_session_id: input.toolSessionId,
        provider: input.provider,
        summary_150: input.summary150.slice(0, 150),
        run_id: input.runId
      },
      actions: [{ action_id: "open_transcript", label: "Open transcript" }]
    };

    const stored = this.feedRepo.upsertCard({
      collabSessionId: input.collabSessionId,
      card,
      ts: input.ts,
      sourceEventKey: `action:tool_session:${input.toolSessionId}`
    });

    return { id: stored.id, kind: "card", card: stored.card, ts: stored.ts };
  }

  appendHitlRequestCard(input: {
    collabSessionId: string;
    interactionRequestId: string;
    runId: string;
    prompt: string;
    options: string[];
    expiresAt: string;
    ts?: string;
  }): FeedItem {
    const expired = new Date(input.expiresAt).getTime() <= Date.now();
    const card: CollabCard = {
      card_id: `action:hitl_request:${input.interactionRequestId}`,
      card_type: "action_request",
      title: "NEED_USER_INPUT",
      status: expired ? "EXPIRED" : "PENDING",
      display: COMPACT_CARD_DISPLAY,
      payload: {
        action_kind: "hitl_request",
        interaction_request_id: input.interactionRequestId,
        run_id: input.runId,
        prompt: input.prompt,
        options: input.options
      },
      actions: [
        { action_id: "choose_option", label: "Choose option" },
        { action_id: "submit_text", label: "Submit text" }
      ]
    };

    const stored = this.feedRepo.upsertCard({
      collabSessionId: input.collabSessionId,
      card,
      ts: input.ts,
      sourceEventKey: `action:hitl_request:${input.interactionRequestId}`
    });

    return { id: stored.id, kind: "card", card: stored.card, ts: stored.ts };
  }

  appendStatusEvent(input: StatusEventInput): FeedItem {
    const cardId = this.buildStatusCardId(input);
    const card: CollabCard = {
      card_id: cardId,
      card_type: "status_event",
      title: this.statusTitle(input.eventType),
      status: "RESOLVED",
      display: COMPACT_CARD_DISPLAY,
      payload: {
        event_type: input.eventType,
        summary: input.summary,
        run_id: input.runId,
        tool_session_id: input.toolSessionId,
        provider: input.provider
      },
      actions: []
    };

    const stored = this.feedRepo.upsertCard({
      collabSessionId: input.collabSessionId,
      card,
      ts: input.ts,
      sourceEventKey: input.sourceEventKey
    });

    return { id: stored.id, kind: "card", card: stored.card, ts: stored.ts };
  }

  updateActionCardStatus(cardId: string, status: CollabCardStatus): FeedItem | undefined {
    const updated = this.feedRepo.updateCardStatus(cardId, status);
    if (!updated) {
      return undefined;
    }

    return {
      id: updated.id,
      kind: "card",
      card: updated.card,
      ts: updated.ts
    };
  }

  private buildStatusCardId(input: StatusEventInput): string {
    const suffix =
      input.runId ??
      input.toolSessionId ??
      input.sourceEventKey ??
      `${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;

    return `status:${input.eventType.toLowerCase()}:${suffix}`;
  }

  private statusTitle(eventType: StatusEventType): string {
    switch (eventType) {
      case "RUN_STARTED":
        return "Run started";
      case "RUN_PAUSED":
        return "Run paused";
      case "RUN_DONE":
        return "Run done";
      case "RUN_FAILED":
        return "Run failed";
      case "TOOL_SESSION_LINKED":
        return "Tool session linked";
      case "TOOL_SWITCHED":
        return "Tool switched";
      default:
        return "Status update";
    }
  }
}
