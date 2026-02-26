import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SqliteDbService } from "../sqlite-db.service";

export type OrchestratorProvider = "openai" | "anthropic" | "volcengine_ark";

export interface OrchestratorLlmSettingsRecord {
  settingsId: string;
  primaryProvider: OrchestratorProvider;
  fallbackProviders: OrchestratorProvider[];
  model: string;
  baseUrl: string;
  apiKeyEncrypted?: string;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
  updatedBy: string;
  updatedAt: string;
}

export interface OrchestratorLlmAuditEvent {
  eventId: string;
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  result: "SUCCESS" | "FAILED";
  createdAt: string;
}

@Injectable()
export class OrchestratorLlmRepository {
  constructor(private readonly sqlite: SqliteDbService) {}

  getSettings(): OrchestratorLlmSettingsRecord | undefined {
    const row = this.sqlite.connection
      .prepare(
        `SELECT
            settings_id,
            primary_provider,
            fallback_providers_json,
            model,
            base_url,
            api_key_encrypted,
            timeout_ms,
            temperature,
            max_tokens,
            updated_by,
            updated_at
         FROM orchestrator_llm_settings
         WHERE settings_id = 'default'
         LIMIT 1`
      )
      .get() as Record<string, unknown> | undefined;

    return row ? this.mapSettings(row) : undefined;
  }

  upsertSettings(input: Omit<OrchestratorLlmSettingsRecord, "settingsId">): OrchestratorLlmSettingsRecord {
    const settingsId = "default";

    this.sqlite.connection
      .prepare(
        `INSERT INTO orchestrator_llm_settings (
            settings_id,
            primary_provider,
            fallback_providers_json,
            model,
            base_url,
            api_key_encrypted,
            timeout_ms,
            temperature,
            max_tokens,
            updated_by,
            updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(settings_id) DO UPDATE SET
            primary_provider = excluded.primary_provider,
            fallback_providers_json = excluded.fallback_providers_json,
            model = excluded.model,
            base_url = excluded.base_url,
            api_key_encrypted = excluded.api_key_encrypted,
            timeout_ms = excluded.timeout_ms,
            temperature = excluded.temperature,
            max_tokens = excluded.max_tokens,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at`
      )
      .run(
        settingsId,
        input.primaryProvider,
        JSON.stringify(input.fallbackProviders),
        input.model,
        input.baseUrl,
        input.apiKeyEncrypted ?? null,
        input.timeoutMs,
        input.temperature,
        input.maxTokens,
        input.updatedBy,
        input.updatedAt
      );

    const stored = this.getSettings();
    if (!stored) {
      throw new Error("Failed to persist orchestrator settings");
    }
    return stored;
  }

  appendAudit(input: Omit<OrchestratorLlmAuditEvent, "eventId"> & { eventId?: string }): OrchestratorLlmAuditEvent {
    const eventId = input.eventId ?? `orchestrator_audit_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const record: OrchestratorLlmAuditEvent = {
      eventId,
      action: input.action,
      actor: input.actor,
      payload: input.payload,
      result: input.result,
      createdAt: input.createdAt
    };

    this.sqlite.connection
      .prepare(
        `INSERT INTO orchestrator_llm_audit_events (
          event_id,
          action,
          actor,
          payload_json,
          result,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.eventId,
        record.action,
        record.actor,
        JSON.stringify(record.payload),
        record.result,
        record.createdAt
      );

    return record;
  }

  private mapSettings(row: Record<string, unknown>): OrchestratorLlmSettingsRecord {
    const fallbackRaw = row.fallback_providers_json;
    let fallbackProviders: OrchestratorProvider[] = [];
    if (typeof fallbackRaw === "string" && fallbackRaw.length > 0) {
      try {
        const parsed = JSON.parse(fallbackRaw) as unknown;
        if (Array.isArray(parsed)) {
          fallbackProviders = parsed.filter((value): value is OrchestratorProvider => {
            return value === "openai" || value === "anthropic" || value === "volcengine_ark";
          });
        }
      } catch {
        fallbackProviders = [];
      }
    }

    return {
      settingsId: String(row.settings_id ?? "default"),
      primaryProvider: this.parseProvider(row.primary_provider),
      fallbackProviders,
      model: String(row.model ?? ""),
      baseUrl: String(row.base_url ?? ""),
      apiKeyEncrypted:
        typeof row.api_key_encrypted === "string" && row.api_key_encrypted.length > 0
          ? row.api_key_encrypted
          : undefined,
      timeoutMs: Number(row.timeout_ms ?? 20000),
      temperature: Number(row.temperature ?? 0.2),
      maxTokens: Number(row.max_tokens ?? 1024),
      updatedBy: String(row.updated_by ?? "system"),
      updatedAt: String(row.updated_at ?? new Date().toISOString())
    };
  }

  private parseProvider(raw: unknown): OrchestratorProvider {
    if (raw === "openai" || raw === "anthropic" || raw === "volcengine_ark") {
      return raw;
    }
    return "openai";
  }
}
