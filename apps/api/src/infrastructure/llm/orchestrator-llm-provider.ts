import { OrchestratorProvider } from "../persistence/sqlite/repositories/orchestrator-llm.repository";
import { OrchestratorMessage } from "../../application/orchestrator/orchestrator-llm.types";

export interface ProviderGenerateInput {
  model: string;
  baseUrl?: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  messages: OrchestratorMessage[];
}

export interface ProviderGenerateOutput {
  text: string;
}

export interface OrchestratorLlmProvider {
  readonly provider: OrchestratorProvider;
  generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput>;
  healthCheck(input: Omit<ProviderGenerateInput, "messages">): Promise<{ ok: boolean; message: string }>;
}

export async function withTimeout<T>(
  timeoutMs: number,
  callback: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await callback(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
