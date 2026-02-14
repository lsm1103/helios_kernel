import { Injectable } from "@nestjs/common";
import { SqliteDbService } from "../sqlite-db.service";

export type ToolProvider = "codex" | "claude_code";
export type ToolSessionStatus = "ACTIVE" | "PAUSED" | "CLOSED";
export type ToolSessionSource = "COLLAB" | "USER_OPENED";

export interface ToolSessionLinkRecord {
  linkId: string;
  collabSessionId: string;
  taskId: string;
  provider: ToolProvider;
  source: ToolSessionSource;
  toolSessionId: string;
  status: ToolSessionStatus;
  lastSummary150: string;
  lastActiveAt: string;
  createdAt: string;
}

@Injectable()
export class ToolSessionLinkRepository {
  constructor(private readonly sqlite: SqliteDbService) {}

  create(record: ToolSessionLinkRecord): ToolSessionLinkRecord {
    const stmt = this.sqlite.connection.prepare(`
      INSERT INTO tool_session_links (
        link_id, collab_session_id, task_id, provider, source, tool_session_id,
        status, last_summary_150, last_active_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.linkId,
      record.collabSessionId,
      record.taskId,
      record.provider,
      record.source,
      record.toolSessionId,
      record.status,
      record.lastSummary150,
      record.lastActiveAt,
      record.createdAt
    );

    return record;
  }

  listByCollabSession(collabSessionId: string): ToolSessionLinkRecord[] {
    const stmt = this.sqlite.connection.prepare(`
      SELECT
        link_id,
        collab_session_id,
        task_id,
        provider,
        source,
        tool_session_id,
        status,
        last_summary_150,
        last_active_at,
        created_at
      FROM tool_session_links
      WHERE collab_session_id = ?
      ORDER BY last_active_at DESC
    `);

    return stmt
      .all(collabSessionId)
      .map((row) => this.map(row as Record<string, unknown>));
  }

  getByToolSessionId(toolSessionId: string): ToolSessionLinkRecord | undefined {
    const stmt = this.sqlite.connection.prepare(`
      SELECT
        link_id,
        collab_session_id,
        task_id,
        provider,
        source,
        tool_session_id,
        status,
        last_summary_150,
        last_active_at,
        created_at
      FROM tool_session_links
      WHERE tool_session_id = ?
      LIMIT 1
    `);

    const row = stmt.get(toolSessionId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : undefined;
  }

  getActive(collabSessionId: string): ToolSessionLinkRecord | undefined {
    const stmt = this.sqlite.connection.prepare(`
      SELECT
        link_id,
        collab_session_id,
        task_id,
        provider,
        source,
        tool_session_id,
        status,
        last_summary_150,
        last_active_at,
        created_at
      FROM tool_session_links
      WHERE collab_session_id = ? AND status = 'ACTIVE'
      ORDER BY last_active_at DESC
      LIMIT 1
    `);

    const row = stmt.get(collabSessionId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : undefined;
  }

  listAll(filters?: {
    provider?: ToolProvider;
    source?: ToolSessionSource;
    collabSessionId?: string;
  }): ToolSessionLinkRecord[] {
    const conditions: string[] = [];
    const values: string[] = [];

    if (filters?.provider) {
      conditions.push("provider = ?");
      values.push(filters.provider);
    }
    if (filters?.source) {
      conditions.push("source = ?");
      values.push(filters.source);
    }
    if (filters?.collabSessionId) {
      conditions.push("collab_session_id = ?");
      values.push(filters.collabSessionId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const stmt = this.sqlite.connection.prepare(`
      SELECT
        link_id,
        collab_session_id,
        task_id,
        provider,
        source,
        tool_session_id,
        status,
        last_summary_150,
        last_active_at,
        created_at
      FROM tool_session_links
      ${whereClause}
      ORDER BY last_active_at DESC
    `);

    return stmt.all(...values).map((row) => this.map(row as Record<string, unknown>));
  }

  setActive(collabSessionId: string, toolSessionId: string): ToolSessionLinkRecord | undefined {
    const target = this.getByToolSessionId(toolSessionId);
    if (!target || target.collabSessionId !== collabSessionId) {
      return undefined;
    }

    const trx = this.sqlite.connection.transaction(() => {
      this.sqlite.connection
        .prepare(
          `UPDATE tool_session_links SET status = 'PAUSED' WHERE collab_session_id = ? AND status = 'ACTIVE'`
        )
        .run(collabSessionId);

      this.sqlite.connection
        .prepare(
          `UPDATE tool_session_links SET status = 'ACTIVE', last_active_at = ? WHERE tool_session_id = ?`
        )
        .run(new Date().toISOString(), toolSessionId);
    });
    trx();

    return this.getByToolSessionId(toolSessionId);
  }

  appendSummary(toolSessionId: string, summary150: string): void {
    const now = new Date().toISOString();
    const clipped = summary150.slice(0, 150);

    const trx = this.sqlite.connection.transaction(() => {
      this.sqlite.connection
        .prepare(
          `UPDATE tool_session_links SET last_summary_150 = ?, last_active_at = ? WHERE tool_session_id = ?`
        )
        .run(clipped, now, toolSessionId);

      this.sqlite.connection
        .prepare(
          `INSERT INTO tool_session_peek_entries (tool_session_id, summary, created_at) VALUES (?, ?, ?)`
        )
        .run(toolSessionId, clipped, now);

      this.sqlite.connection
        .prepare(
          `DELETE FROM tool_session_peek_entries
           WHERE tool_session_id = ?
             AND id NOT IN (
               SELECT id FROM tool_session_peek_entries
               WHERE tool_session_id = ?
               ORDER BY id DESC
               LIMIT 50
             )`
        )
        .run(toolSessionId, toolSessionId);
    });

    trx();
  }

  peek(toolSessionId: string, limit: number): string[] {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const stmt = this.sqlite.connection.prepare(`
      SELECT summary
      FROM tool_session_peek_entries
      WHERE tool_session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `);

    return stmt
      .all(toolSessionId, safeLimit)
      .map((row) => String((row as { summary: string }).summary));
  }

  private map(row: Record<string, unknown>): ToolSessionLinkRecord {
    return {
      linkId: String(row.link_id),
      collabSessionId: String(row.collab_session_id),
      taskId: String(row.task_id),
      provider: String(row.provider) as ToolProvider,
      source: String(row.source ?? "COLLAB") as ToolSessionSource,
      toolSessionId: String(row.tool_session_id),
      status: String(row.status) as ToolSessionStatus,
      lastSummary150: String(row.last_summary_150 ?? ""),
      lastActiveAt: String(row.last_active_at),
      createdAt: String(row.created_at)
    };
  }
}
