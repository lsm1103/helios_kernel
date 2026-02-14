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

    this.ensureColumn("tool_session_links", "source", "TEXT NOT NULL DEFAULT 'COLLAB'");
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
