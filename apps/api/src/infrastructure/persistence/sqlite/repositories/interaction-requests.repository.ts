import { Injectable } from "@nestjs/common";
import { SqliteDbService } from "../sqlite-db.service";

export type InteractionStatus = "PENDING" | "RESOLVED" | "EXPIRED" | "CANCELLED";

export interface InteractionAnswer {
  answerType: "choice" | "text";
  answerValue: string;
}

export interface InteractionRequestRecord {
  interactionRequestId: string;
  collabSessionId: string;
  toolSessionId: string;
  runId: string;
  prompt: string;
  status: InteractionStatus;
  options: string[];
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
  answer?: InteractionAnswer;
}

@Injectable()
export class InteractionRequestsRepository {
  constructor(private readonly sqlite: SqliteDbService) {}

  create(record: InteractionRequestRecord): InteractionRequestRecord {
    const stmt = this.sqlite.connection.prepare(`
      INSERT INTO interaction_requests (
        interaction_request_id,
        collab_session_id,
        tool_session_id,
        run_id,
        prompt,
        status,
        options_json,
        created_at,
        expires_at,
        resolved_at,
        answer_type,
        answer_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.interactionRequestId,
      record.collabSessionId,
      record.toolSessionId,
      record.runId,
      record.prompt,
      record.status,
      JSON.stringify(record.options),
      record.createdAt,
      record.expiresAt,
      record.resolvedAt ?? null,
      record.answer?.answerType ?? null,
      record.answer?.answerValue ?? null
    );

    return record;
  }

  getById(interactionRequestId: string): InteractionRequestRecord | undefined {
    const stmt = this.sqlite.connection.prepare(`
      SELECT
        interaction_request_id,
        collab_session_id,
        tool_session_id,
        run_id,
        prompt,
        status,
        options_json,
        created_at,
        expires_at,
        resolved_at,
        answer_type,
        answer_value
      FROM interaction_requests
      WHERE interaction_request_id = ?
      LIMIT 1
    `);

    const row = stmt.get(interactionRequestId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : undefined;
  }

  markResolved(interactionRequestId: string, answer: InteractionAnswer): InteractionRequestRecord | undefined {
    const now = new Date().toISOString();
    this.sqlite.connection
      .prepare(
        `UPDATE interaction_requests
         SET status = 'RESOLVED', resolved_at = ?, answer_type = ?, answer_value = ?
         WHERE interaction_request_id = ?`
      )
      .run(now, answer.answerType, answer.answerValue, interactionRequestId);

    return this.getById(interactionRequestId);
  }

  listPending(filters?: {
    collabSessionId?: string;
    toolSessionId?: string;
    runId?: string;
  }): InteractionRequestRecord[] {
    const conditions = ["status = 'PENDING'"];
    const values: string[] = [];

    if (filters?.collabSessionId) {
      conditions.push("collab_session_id = ?");
      values.push(filters.collabSessionId);
    }
    if (filters?.toolSessionId) {
      conditions.push("tool_session_id = ?");
      values.push(filters.toolSessionId);
    }
    if (filters?.runId) {
      conditions.push("run_id = ?");
      values.push(filters.runId);
    }

    const stmt = this.sqlite.connection.prepare(`
      SELECT
        interaction_request_id,
        collab_session_id,
        tool_session_id,
        run_id,
        prompt,
        status,
        options_json,
        created_at,
        expires_at,
        resolved_at,
        answer_type,
        answer_value
      FROM interaction_requests
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT 100
    `);

    return stmt
      .all(...values)
      .map((row) => this.map(row as Record<string, unknown>));
  }

  hasIdempotencyKey(key: string): boolean {
    const stmt = this.sqlite.connection.prepare(
      `SELECT 1 FROM interaction_idempotency_keys WHERE key = ? LIMIT 1`
    );
    return Boolean(stmt.get(key));
  }

  consumeIdempotencyKey(key: string): void {
    this.sqlite.connection
      .prepare(
        `INSERT OR IGNORE INTO interaction_idempotency_keys (key, consumed_at) VALUES (?, ?)`
      )
      .run(key, new Date().toISOString());
  }

  private map(row: Record<string, unknown>): InteractionRequestRecord {
    const answerType = row.answer_type ? (String(row.answer_type) as "choice" | "text") : undefined;
    const answerValue = row.answer_value ? String(row.answer_value) : undefined;

    return {
      interactionRequestId: String(row.interaction_request_id),
      collabSessionId: String(row.collab_session_id),
      toolSessionId: String(row.tool_session_id),
      runId: String(row.run_id),
      prompt: String(row.prompt),
      status: String(row.status) as InteractionStatus,
      options: JSON.parse(String(row.options_json ?? "[]")),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
      answer:
        answerType && answerValue
          ? {
              answerType,
              answerValue
            }
          : undefined
    };
  }
}
