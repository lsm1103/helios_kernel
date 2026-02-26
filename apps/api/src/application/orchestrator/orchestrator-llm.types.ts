import { OrchestratorProvider } from "../../infrastructure/persistence/sqlite/repositories/orchestrator-llm.repository";

export type OrchestratorStep =
  | "analyze_requirement"
  | "suggest_tool_and_questions"
  | "rewrite_hitl_prompt"
  | "summarize_progress"
  | "summarize_completion"
  | "summarize_archive";

export interface OrchestratorMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OrchestratorGenerateResult {
  text: string;
  provider?: OrchestratorProvider;
  model?: string;
  degraded: boolean;
  fallbackUsed: boolean;
  error?: string;
}

export interface OrchestratorPublicSettings {
  primary_provider: OrchestratorProvider;
  fallback_providers: OrchestratorProvider[];
  model: string;
  base_url: string;
  timeout_ms: number;
  temperature: number;
  max_tokens: number;
  api_key_masked: string;
  configured: boolean;
  updated_by: string;
  updated_at: string;
}

export interface OrchestratorUpdateSettingsInput {
  primary_provider: OrchestratorProvider;
  fallback_providers?: OrchestratorProvider[];
  model: string;
  base_url?: string;
  api_key?: string;
  timeout_ms?: number;
  temperature?: number;
  max_tokens?: number;
  actor?: string;
}
