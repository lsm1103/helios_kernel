import { Injectable } from "@nestjs/common";
import { SqliteDbService } from "../sqlite-db.service";

export type CollabSessionStatus = "ACTIVE" | "ARCHIVED";
export type CollabSessionTool = "codex" | "claude_code";

export interface CollabSessionRecord {
  collabSessionId: string;
  name: string;
  description: string;
  status: CollabSessionStatus;
  workspacePath: string;
  activeTool?: CollabSessionTool;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  lastMessagePreview20: string;
  lastMessageTs?: string;
  lastMessageKind?: "text" | "card";
  lastMessageRole?: "user" | "assistant" | "system";
}

interface CollabSessionAuditEvent {
  eventId: string;
  collabSessionId: string;
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

@Injectable()
export class CollabSessionRepository {
  constructor(private readonly sqlite: SqliteDbService) {}

  create(record: CollabSessionRecord, auditEvent: CollabSessionAuditEvent): CollabSessionRecord {
    const trx = this.sqlite.connection.transaction(() => {
      const insertSession = this.sqlite.connection.prepare(`
        INSERT INTO collab_sessions (
          collab_session_id,
          name,
          description,
          status,
          workspace_path,
          active_tool,
          metadata_json,
          created_at,
          updated_at,
          archived_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertSession.run(
        record.collabSessionId,
        record.name,
        record.description,
        record.status,
        record.workspacePath,
        record.activeTool ?? null,
        JSON.stringify(record.metadata),
        record.createdAt,
        record.updatedAt,
        record.archivedAt ?? null
      );

      this.insertAudit(auditEvent);
    });

    trx();
    return record;
  }

  list(options?: { includeArchived?: boolean }): CollabSessionRecord[] {
    const includeArchived = options?.includeArchived ?? false;
    const stmt = this.sqlite.connection.prepare(`
      SELECT
        cs.collab_session_id,
        cs.name,
        cs.description,
        cs.status,
        cs.workspace_path,
        cs.active_tool,
        cs.metadata_json,
        cs.created_at,
        cs.updated_at,
        cs.archived_at,
        fi.kind AS last_message_kind,
        fi.role AS last_message_role,
        fi.ts AS last_message_ts,
        CASE
          WHEN fi.kind = 'text' THEN COALESCE(fi.content, '')
          WHEN fi.kind = 'card' THEN COALESCE(
            json_extract(fi.card_json, '$.payload.summary'),
            json_extract(fi.card_json, '$.title'),
            ''
          )
          ELSE ''
        END AS last_message_raw
      FROM collab_sessions cs
      LEFT JOIN collab_feed_items fi
        ON fi.item_id = (
          SELECT item_id
          FROM collab_feed_items
          WHERE collab_session_id = cs.collab_session_id
          ORDER BY ts DESC, item_id DESC
          LIMIT 1
        )
      ${includeArchived ? "" : "WHERE cs.status = 'ACTIVE'"}
      ORDER BY cs.updated_at DESC, cs.created_at DESC
    `);

    return stmt.all().map((row) => this.map(row as Record<string, unknown>));
  }

  getById(collabSessionId: string): CollabSessionRecord | undefined {
    const stmt = this.sqlite.connection.prepare(`
      SELECT
        cs.collab_session_id,
        cs.name,
        cs.description,
        cs.status,
        cs.workspace_path,
        cs.active_tool,
        cs.metadata_json,
        cs.created_at,
        cs.updated_at,
        cs.archived_at,
        fi.kind AS last_message_kind,
        fi.role AS last_message_role,
        fi.ts AS last_message_ts,
        CASE
          WHEN fi.kind = 'text' THEN COALESCE(fi.content, '')
          WHEN fi.kind = 'card' THEN COALESCE(
            json_extract(fi.card_json, '$.payload.summary'),
            json_extract(fi.card_json, '$.title'),
            ''
          )
          ELSE ''
        END AS last_message_raw
      FROM collab_sessions cs
      LEFT JOIN collab_feed_items fi
        ON fi.item_id = (
          SELECT item_id
          FROM collab_feed_items
          WHERE collab_session_id = cs.collab_session_id
          ORDER BY ts DESC, item_id DESC
          LIMIT 1
        )
      WHERE cs.collab_session_id = ?
      LIMIT 1
    `);

    const row = stmt.get(collabSessionId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : undefined;
  }

  archive(collabSessionId: string, actor: string, reason?: string): CollabSessionRecord | undefined {
    const existing = this.getById(collabSessionId);
    if (!existing) {
      return undefined;
    }

    if (existing.status === "ARCHIVED") {
      return existing;
    }

    const now = new Date().toISOString();
    const trx = this.sqlite.connection.transaction(() => {
      const stmt = this.sqlite.connection.prepare(`
        UPDATE collab_sessions
        SET status = 'ARCHIVED',
            updated_at = ?,
            archived_at = ?
        WHERE collab_session_id = ?
      `);
      stmt.run(now, now, collabSessionId);

      this.insertAudit({
        eventId: `${collabSessionId}_archived_${now}`,
        collabSessionId,
        action: "ARCHIVED",
        actor,
        payload: reason ? { reason } : {},
        createdAt: now
      });
    });

    trx();
    return this.getById(collabSessionId);
  }

  setActiveTool(
    collabSessionId: string,
    tool: CollabSessionTool,
    actor: string
  ): CollabSessionRecord | undefined {
    const existing = this.getById(collabSessionId);
    if (!existing) {
      return undefined;
    }

    const now = new Date().toISOString();
    const trx = this.sqlite.connection.transaction(() => {
      this.sqlite.connection
        .prepare(
          `UPDATE collab_sessions
           SET active_tool = ?, updated_at = ?
           WHERE collab_session_id = ?`
        )
        .run(tool, now, collabSessionId);

      this.insertAudit({
        eventId: `${collabSessionId}_tool_${now}`,
        collabSessionId,
        action: "ACTIVE_TOOL_CHANGED",
        actor,
        payload: { tool },
        createdAt: now
      });
    });

    trx();
    return this.getById(collabSessionId);
  }

  private insertAudit(event: CollabSessionAuditEvent): void {
    const insertAudit = this.sqlite.connection.prepare(`
      INSERT INTO collab_session_audit_events (
        event_id,
        collab_session_id,
        action,
        actor,
        payload_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run(
      event.eventId,
      event.collabSessionId,
      event.action,
      event.actor,
      JSON.stringify(event.payload),
      event.createdAt
    );
  }

  private map(row: Record<string, unknown>): CollabSessionRecord {
    const metadataRaw = row.metadata_json;
    let parsedMetadata: Record<string, unknown> = {};
    if (typeof metadataRaw === "string" && metadataRaw.length > 0) {
      try {
        const parsed = JSON.parse(metadataRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedMetadata = parsed as Record<string, unknown>;
        }
      } catch {
        parsedMetadata = {};
      }
    }

    const activeToolRaw = row.active_tool;
    const activeTool =
      activeToolRaw === "codex" || activeToolRaw === "claude_code"
        ? (activeToolRaw as CollabSessionTool)
        : undefined;

    const archivedAtValue = row.archived_at;
    const archivedAt =
      typeof archivedAtValue === "string" && archivedAtValue.length > 0
        ? archivedAtValue
        : undefined;

    return {
      collabSessionId: String(row.collab_session_id),
      name: String(row.name),
      description: String(row.description ?? ""),
      status: String(row.status) as CollabSessionStatus,
      workspacePath: String(row.workspace_path ?? ""),
      activeTool,
      metadata: parsedMetadata,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      archivedAt,
      lastMessagePreview20: this.toPreview20(row.last_message_raw),
      lastMessageTs: typeof row.last_message_ts === "string" ? row.last_message_ts : undefined,
      lastMessageKind: this.parseLastMessageKind(row.last_message_kind),
      lastMessageRole: this.parseLastMessageRole(row.last_message_role)
    };
  }

  private toPreview20(raw: unknown): string {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) {
      return "-";
    }

    const chars = Array.from(text);
    if (chars.length <= 20) {
      return text;
    }
    return `${chars.slice(0, 20).join("")}...`;
  }

  private parseLastMessageKind(raw: unknown): "text" | "card" | undefined {
    if (raw === "text" || raw === "card") {
      return raw;
    }
    return undefined;
  }

  private parseLastMessageRole(raw: unknown): "user" | "assistant" | "system" | undefined {
    if (raw === "user" || raw === "assistant" || raw === "system") {
      return raw;
    }
    return undefined;
  }
}
