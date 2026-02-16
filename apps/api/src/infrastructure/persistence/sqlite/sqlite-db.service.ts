import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

@Injectable()
export class SqliteDbService implements OnModuleDestroy {
  private readonly db: Database.Database;

  constructor() {
    const configured = process.env.HELIOS_DB_PATH;
    const dbPath = configured
      ? resolve(configured)
      : resolve(process.cwd(), ".helios", "helios.db");

    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  get connection(): Database.Database {
    return this.db;
  }

  onModuleDestroy(): void {
    this.db.close();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collab_sessions (
        collab_session_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        workspace_path TEXT NOT NULL DEFAULT '',
        active_tool TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_collab_sessions_status_updated
      ON collab_sessions(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS collab_session_audit_events (
        event_id TEXT PRIMARY KEY,
        collab_session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_collab_session_audit_events_session
      ON collab_session_audit_events(collab_session_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS collab_feed_items (
        item_id TEXT PRIMARY KEY,
        collab_session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        role TEXT,
        content TEXT,
        card_id TEXT,
        card_type TEXT,
        card_status TEXT,
        card_json TEXT,
        source_event_key TEXT,
        ts TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_collab_feed_items_session_ts
      ON collab_feed_items(collab_session_id, ts DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_feed_items_card_id_unique
      ON collab_feed_items(card_id)
      WHERE card_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_feed_items_source_event_key_unique
      ON collab_feed_items(source_event_key)
      WHERE source_event_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS collab_card_action_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        response_json TEXT NOT NULL,
        processed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_session_links (
        link_id TEXT PRIMARY KEY,
        collab_session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'COLLAB',
        tool_session_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        last_summary_150 TEXT NOT NULL DEFAULT '',
        last_active_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tool_session_links_collab
      ON tool_session_links(collab_session_id, last_active_at DESC);

      CREATE TABLE IF NOT EXISTS tool_session_peek_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_session_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tool_session_peek_entries_session
      ON tool_session_peek_entries(tool_session_id, id DESC);

      CREATE TABLE IF NOT EXISTS interaction_requests (
        interaction_request_id TEXT PRIMARY KEY,
        collab_session_id TEXT NOT NULL,
        tool_session_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        options_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        resolved_at TEXT,
        answer_type TEXT,
        answer_value TEXT
      );

      CREATE TABLE IF NOT EXISTS interaction_idempotency_keys (
        key TEXT PRIMARY KEY,
        consumed_at TEXT NOT NULL
      );
    `);

    this.ensureColumn("collab_sessions", "description", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("collab_sessions", "status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
    this.ensureColumn("collab_sessions", "workspace_path", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("collab_sessions", "active_tool", "TEXT");
    this.ensureColumn("collab_sessions", "metadata_json", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("collab_sessions", "updated_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("collab_sessions", "archived_at", "TEXT");
    this.ensureColumn("tool_session_links", "source", "TEXT NOT NULL DEFAULT 'COLLAB'");
    this.ensureColumn("collab_feed_items", "card_id", "TEXT");
    this.ensureColumn("collab_feed_items", "card_type", "TEXT");
    this.ensureColumn("collab_feed_items", "card_status", "TEXT");
    this.ensureColumn("collab_feed_items", "card_json", "TEXT");
    this.ensureColumn("collab_feed_items", "source_event_key", "TEXT");

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_feed_items_card_id_unique
      ON collab_feed_items(card_id)
      WHERE card_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_feed_items_source_event_key_unique
      ON collab_feed_items(source_event_key)
      WHERE source_event_key IS NOT NULL;
    `);
  }

  private ensureColumn(table: string, column: string, ddl: string): void {
    const rows = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name?: unknown }>;

    const exists = rows.some((row) => String(row.name) === column);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }
}
