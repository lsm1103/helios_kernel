import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CollabCard, CollabCardStatus } from "../../../../application/session/collab-feed.types";
import { SqliteDbService } from "../sqlite-db.service";

export type FeedTextRole = "user" | "system" | "assistant";

export interface FeedTextItemRecord {
  id: string;
  collabSessionId: string;
  kind: "text";
  role: FeedTextRole;
  content: string;
  ts: string;
}

export interface FeedCardItemRecord {
  id: string;
  collabSessionId: string;
  kind: "card";
  cardId: string;
  cardType: CollabCard["card_type"];
  cardStatus: CollabCardStatus | "RESOLVED";
  card: CollabCard;
  ts: string;
  sourceEventKey?: string;
}

export type MixedFeedItemRecord = FeedTextItemRecord | FeedCardItemRecord;

@Injectable()
export class CollabFeedRepository {
  constructor(private readonly sqlite: SqliteDbService) {}

  appendText(input: {
    collabSessionId: string;
    role: FeedTextRole;
    content: string;
    ts?: string;
    id?: string;
  }): FeedTextItemRecord {
    const id = input.id ?? `feed_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const ts = input.ts ?? new Date().toISOString();
    const record: FeedTextItemRecord = {
      id,
      collabSessionId: input.collabSessionId,
      kind: "text",
      role: input.role,
      content: input.content,
      ts
    };

    this.sqlite.connection
      .prepare(
        `INSERT INTO collab_feed_items (
          item_id, collab_session_id, kind, role, content,
          card_id, card_type, card_status, card_json, source_event_key, ts
        ) VALUES (?, ?, 'text', ?, ?, NULL, NULL, NULL, NULL, NULL, ?)`
      )
      .run(record.id, record.collabSessionId, record.role, record.content, record.ts);

    return record;
  }

  appendCard(input: {
    collabSessionId: string;
    card: CollabCard;
    ts?: string;
    id?: string;
    sourceEventKey?: string;
  }): FeedCardItemRecord {
    const id = input.id ?? `feed_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const ts = input.ts ?? new Date().toISOString();
    const sourceEventKey = input.sourceEventKey?.trim() || undefined;

    const insertResult = this.sqlite.connection
      .prepare(
        `INSERT OR IGNORE INTO collab_feed_items (
          item_id, collab_session_id, kind, role, content,
          card_id, card_type, card_status, card_json, source_event_key, ts
        ) VALUES (?, ?, 'card', NULL, NULL, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.collabSessionId,
        input.card.card_id,
        input.card.card_type,
        input.card.status,
        JSON.stringify(input.card),
        sourceEventKey ?? null,
        ts
      );

    if (insertResult.changes > 0) {
      const inserted = this.getCardById(input.card.card_id);
      if (inserted) {
        return inserted;
      }
    }

    if (sourceEventKey) {
      const existingByEvent = this.getCardBySourceEventKey(sourceEventKey);
      if (existingByEvent) {
        return existingByEvent;
      }
    }

    const existing = this.getCardById(input.card.card_id);
    if (existing) {
      return existing;
    }

    throw new Error("Failed to append card feed item");
  }

  upsertCard(input: {
    collabSessionId: string;
    card: CollabCard;
    ts?: string;
    sourceEventKey?: string;
  }): FeedCardItemRecord {
    const byCardId = this.getCardById(input.card.card_id);
    const sourceEventKey = input.sourceEventKey?.trim() || undefined;
    const bySourceKey = sourceEventKey ? this.getCardBySourceEventKey(sourceEventKey) : undefined;
    const existing = byCardId ?? bySourceKey;

    if (!existing) {
      return this.appendCard({
        collabSessionId: input.collabSessionId,
        card: input.card,
        ts: input.ts,
        sourceEventKey
      });
    }

    const ts = input.ts ?? existing.ts;
    const cardId = existing.cardId;

    this.sqlite.connection
      .prepare(
        `UPDATE collab_feed_items
         SET collab_session_id = ?,
             card_id = ?,
             card_type = ?,
             card_status = ?,
             card_json = ?,
             source_event_key = ?,
             ts = ?
         WHERE item_id = ?`
      )
      .run(
        input.collabSessionId,
        cardId,
        input.card.card_type,
        input.card.status,
        JSON.stringify({ ...input.card, card_id: cardId }),
        sourceEventKey ?? existing.sourceEventKey ?? null,
        ts,
        existing.id
      );

    const updated = this.getCardById(cardId);
    if (!updated) {
      throw new Error("Failed to upsert card feed item");
    }
    return updated;
  }

  updateCardStatus(cardId: string, status: CollabCardStatus): FeedCardItemRecord | undefined {
    const existing = this.getCardById(cardId);
    if (!existing) {
      return undefined;
    }

    if (existing.card.card_type !== "action_request") {
      return existing;
    }

    const nextCard: CollabCard = {
      ...existing.card,
      status
    };

    this.sqlite.connection
      .prepare(
        `UPDATE collab_feed_items
         SET card_status = ?, card_json = ?
         WHERE item_id = ?`
      )
      .run(status, JSON.stringify(nextCard), existing.id);

    return this.getCardById(cardId);
  }

  getCardById(cardId: string): FeedCardItemRecord | undefined {
    const row = this.sqlite.connection
      .prepare(
        `SELECT item_id, collab_session_id, kind, role, content, card_id, card_type, card_status, card_json, source_event_key, ts
         FROM collab_feed_items
         WHERE card_id = ?
         LIMIT 1`
      )
      .get(cardId) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    const mapped = this.mapMixed(row);
    if (!mapped || mapped.kind !== "card") {
      return undefined;
    }

    return mapped;
  }

  listMixedBySession(input: {
    collabSessionId: string;
    limit: number;
    offset: number;
  }): {
    items: MixedFeedItemRecord[];
    hasMore: boolean;
  } {
    const safeLimit = Math.max(1, Math.min(input.limit, 200));

    const rows = this.sqlite.connection
      .prepare(
        `SELECT item_id, collab_session_id, kind, role, content, card_id, card_type, card_status, card_json, source_event_key, ts
         FROM collab_feed_items
         WHERE collab_session_id = ?
         ORDER BY ts DESC, item_id DESC
         LIMIT ? OFFSET ?`
      )
      .all(input.collabSessionId, safeLimit + 1, Math.max(0, input.offset)) as Array<Record<string, unknown>>;

    const mapped = rows
      .map((row) => this.mapMixed(row))
      .filter((item): item is MixedFeedItemRecord => Boolean(item));

    return {
      items: mapped.slice(0, safeLimit),
      hasMore: mapped.length > safeLimit
    };
  }

  getCardActionResponse(idempotencyKey: string): Record<string, unknown> | undefined {
    const row = this.sqlite.connection
      .prepare(
        `SELECT response_json
         FROM collab_card_action_idempotency
         WHERE idempotency_key = ?
         LIMIT 1`
      )
      .get(idempotencyKey) as { response_json?: unknown } | undefined;

    if (!row || typeof row.response_json !== "string") {
      return undefined;
    }

    try {
      const parsed = JSON.parse(row.response_json) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  saveCardActionResponse(input: {
    idempotencyKey: string;
    cardId: string;
    actionId: string;
    response: Record<string, unknown>;
  }): void {
    this.sqlite.connection
      .prepare(
        `INSERT OR REPLACE INTO collab_card_action_idempotency (
          idempotency_key, card_id, action_id, response_json, processed_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        input.idempotencyKey,
        input.cardId,
        input.actionId,
        JSON.stringify(input.response),
        new Date().toISOString()
      );
  }

  private getCardBySourceEventKey(sourceEventKey: string): FeedCardItemRecord | undefined {
    const row = this.sqlite.connection
      .prepare(
        `SELECT item_id, collab_session_id, kind, role, content, card_id, card_type, card_status, card_json, source_event_key, ts
         FROM collab_feed_items
         WHERE source_event_key = ?
         LIMIT 1`
      )
      .get(sourceEventKey) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    const mapped = this.mapMixed(row);
    if (!mapped || mapped.kind !== "card") {
      return undefined;
    }

    return mapped;
  }

  private mapMixed(row: Record<string, unknown>): MixedFeedItemRecord | undefined {
    const kind = String(row.kind ?? "");
    if (kind === "text") {
      return {
        id: String(row.item_id),
        collabSessionId: String(row.collab_session_id),
        kind: "text",
        role: String(row.role) as FeedTextRole,
        content: String(row.content ?? ""),
        ts: String(row.ts)
      };
    }

    if (kind !== "card") {
      return undefined;
    }

    const cardId = String(row.card_id ?? "").trim();
    const cardType = String(row.card_type ?? "").trim();
    if (!cardId || !cardType) {
      return undefined;
    }

    const cardJsonRaw = row.card_json;
    if (typeof cardJsonRaw !== "string" || cardJsonRaw.length === 0) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(cardJsonRaw) as unknown;
      if (!parsed || typeof parsed !== "object") {
        return undefined;
      }

      const card = parsed as CollabCard;
      return {
        id: String(row.item_id),
        collabSessionId: String(row.collab_session_id),
        kind: "card",
        cardId,
        cardType: card.card_type,
        cardStatus: String(row.card_status ?? "RESOLVED") as CollabCardStatus | "RESOLVED",
        card,
        ts: String(row.ts),
        sourceEventKey: typeof row.source_event_key === "string" ? row.source_event_key : undefined
      };
    } catch {
      return undefined;
    }
  }
}
