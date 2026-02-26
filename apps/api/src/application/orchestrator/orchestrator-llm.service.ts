import { Injectable } from "@nestjs/common";
import {
  OrchestratorLlmAuditEvent,
  OrchestratorLlmRepository,
  OrchestratorProvider
} from "../../infrastructure/persistence/sqlite/repositories/orchestrator-llm.repository";
import {
  OrchestratorGenerateResult,
  OrchestratorMessage,
  OrchestratorPublicSettings,
  OrchestratorStep,
  OrchestratorUpdateSettingsInput
} from "./orchestrator-llm.types";
import { decryptSecret, encryptSecret, maskSecret } from "./secret-crypto";
import { OrchestratorLlmProvider } from "../../infrastructure/llm/orchestrator-llm-provider";
import { OpenAiProvider } from "../../infrastructure/llm/providers/openai.provider";
import { AnthropicProvider } from "../../infrastructure/llm/providers/anthropic.provider";
import { VolcengineArkProvider } from "../../infrastructure/llm/providers/volcengine-ark.provider";

interface RuntimeSettings {
  primaryProvider: OrchestratorProvider;
  fallbackProviders: OrchestratorProvider[];
  model: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
  updatedBy: string;
  updatedAt: string;
}

@Injectable()
export class OrchestratorLlmService {
  private readonly providers: Record<OrchestratorProvider, OrchestratorLlmProvider>;

  constructor(
    private readonly repo: OrchestratorLlmRepository,
    openAiProvider: OpenAiProvider,
    anthropicProvider: AnthropicProvider,
    volcengineArkProvider: VolcengineArkProvider
  ) {
    this.providers = {
      openai: openAiProvider,
      anthropic: anthropicProvider,
      volcengine_ark: volcengineArkProvider
    };
  }

  listProviders() {
    return [
      { provider: "openai", label: "OpenAI" },
      { provider: "anthropic", label: "Anthropic" },
      { provider: "volcengine_ark", label: "Volcengine Ark" }
    ] as const;
  }

  getPublicSettings(): OrchestratorPublicSettings {
    const stored = this.repo.getSettings();
    if (!stored) {
      return {
        primary_provider: "openai",
        fallback_providers: ["anthropic"],
        model: "",
        base_url: "",
        timeout_ms: 20000,
        temperature: 0.2,
        max_tokens: 1024,
        api_key_masked: "",
        configured: false,
        updated_by: "system",
        updated_at: new Date(0).toISOString()
      };
    }

    const decrypted = stored.apiKeyEncrypted ? decryptSecret(stored.apiKeyEncrypted) : "";

    return {
      primary_provider: stored.primaryProvider,
      fallback_providers: stored.fallbackProviders,
      model: stored.model,
      base_url: stored.baseUrl,
      timeout_ms: stored.timeoutMs,
      temperature: stored.temperature,
      max_tokens: stored.maxTokens,
      api_key_masked: maskSecret(decrypted),
      configured: Boolean(stored.model && decrypted),
      updated_by: stored.updatedBy,
      updated_at: stored.updatedAt
    };
  }

  updateSettings(input: OrchestratorUpdateSettingsInput): OrchestratorPublicSettings {
    const existing = this.repo.getSettings();
    const now = new Date().toISOString();

    const nextFallback = (input.fallback_providers ?? existing?.fallbackProviders ?? ["anthropic"]).filter(
      (provider) => provider !== input.primary_provider
    );

    const encryptedKey = this.resolveApiKeyEncrypted(existing?.apiKeyEncrypted, input.api_key);

    const saved = this.repo.upsertSettings({
      primaryProvider: input.primary_provider,
      fallbackProviders: this.uniqueProviders(nextFallback),
      model: input.model.trim(),
      baseUrl: input.base_url?.trim() ?? existing?.baseUrl ?? "",
      apiKeyEncrypted: encryptedKey,
      timeoutMs: this.normalizeTimeout(input.timeout_ms ?? existing?.timeoutMs ?? 20000),
      temperature: this.normalizeTemperature(input.temperature ?? existing?.temperature ?? 0.2),
      maxTokens: this.normalizeMaxTokens(input.max_tokens ?? existing?.maxTokens ?? 1024),
      updatedBy: input.actor?.trim() || "system",
      updatedAt: now
    });

    this.appendAudit({
      action: "UPSERT_SETTINGS",
      actor: input.actor?.trim() || "system",
      payload: {
        primary_provider: saved.primaryProvider,
        fallback_providers: saved.fallbackProviders,
        model: saved.model,
        base_url: saved.baseUrl,
        timeout_ms: saved.timeoutMs,
        temperature: saved.temperature,
        max_tokens: saved.maxTokens
      },
      result: "SUCCESS",
      createdAt: now
    });

    return this.getPublicSettings();
  }

  async healthCheck(provider?: OrchestratorProvider): Promise<{
    ok: boolean;
    provider: OrchestratorProvider;
    message: string;
  }> {
    const runtime = this.getRuntimeSettings();
    const targetProvider = provider ?? runtime?.primaryProvider ?? "openai";

    if (!runtime?.apiKey || !runtime.model) {
      return {
        ok: false,
        provider: targetProvider,
        message: "orchestrator_not_configured"
      };
    }

    const client = this.providers[targetProvider];
    const result = await client.healthCheck({
      model: runtime.model,
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      timeoutMs: runtime.timeoutMs,
      temperature: runtime.temperature,
      maxTokens: runtime.maxTokens
    });

    this.appendAudit({
      action: "HEALTH_CHECK",
      actor: "system",
      payload: { provider: targetProvider, ok: result.ok, message: result.message },
      result: result.ok ? "SUCCESS" : "FAILED",
      createdAt: new Date().toISOString()
    });

    return {
      ok: result.ok,
      provider: targetProvider,
      message: result.message
    };
  }

  async analyzeRequirement(input: {
    sessionName: string;
    requirementText: string;
  }): Promise<OrchestratorGenerateResult> {
    return this.generateWithStep(
      "analyze_requirement",
      [
        {
          role: "user",
          content: `会话: ${input.sessionName}\n需求: ${input.requirementText}`
        }
      ],
      ""
    );
  }

  async suggestToolAndQuestions(input: { requirementText: string }): Promise<OrchestratorGenerateResult> {
    return this.generateWithStep(
      "suggest_tool_and_questions",
      [{ role: "user", content: input.requirementText }],
      ""
    );
  }

  async rewriteHitlPrompt(input: {
    rawPrompt: string;
    options?: string[];
  }): Promise<OrchestratorGenerateResult> {
    const optionText = (input.options ?? []).join(" / ");
    return this.generateWithStep(
      "rewrite_hitl_prompt",
      [
        {
          role: "user",
          content: `原始问题: ${input.rawPrompt}\n可选项: ${optionText}`
        }
      ],
      `请确认以下操作：${input.rawPrompt}`
    );
  }

  async summarizeProgress(input: {
    runId: string;
    chunk: string;
  }): Promise<OrchestratorGenerateResult> {
    return this.generateWithStep(
      "summarize_progress",
      [{ role: "user", content: `run=${input.runId}\n输出片段:\n${input.chunk}` }],
      "执行中，正在处理最新步骤。"
    );
  }

  async summarizeCompletion(input: {
    runId: string;
    status: "RUN_DONE" | "RUN_FAILED" | "RUN_PAUSED";
    detail: string;
  }): Promise<OrchestratorGenerateResult> {
    return this.generateWithStep(
      "summarize_completion",
      [
        {
          role: "user",
          content: `run=${input.runId}\n状态=${input.status}\n详情=${input.detail}`
        }
      ],
      input.status === "RUN_DONE" ? "任务已完成。" : `任务状态：${input.status}`
    );
  }

  async summarizeArchive(input: {
    sessionName: string;
    lastSummary: string;
  }): Promise<OrchestratorGenerateResult> {
    return this.generateWithStep(
      "summarize_archive",
      [
        {
          role: "user",
          content: `会话: ${input.sessionName}\n最近摘要: ${input.lastSummary}`
        }
      ],
      `会话 ${input.sessionName} 已归档。`
    );
  }

  private async generateWithStep(
    step: OrchestratorStep,
    messages: OrchestratorMessage[],
    fallbackText: string
  ): Promise<OrchestratorGenerateResult> {
    const runtime = this.getRuntimeSettings();
    if (!runtime || !runtime.model || !runtime.apiKey) {
      return {
        text: "",
        degraded: true,
        fallbackUsed: false,
        error: "orchestrator_not_configured"
      };
    }

    const order = this.uniqueProviders([runtime.primaryProvider, ...runtime.fallbackProviders]);
    let lastError = "";

    for (let index = 0; index < order.length; index += 1) {
      const provider = order[index];
      const client = this.providers[provider];
      try {
        const result = await client.generate({
          model: runtime.model,
          baseUrl: runtime.baseUrl,
          apiKey: runtime.apiKey,
          temperature: runtime.temperature,
          maxTokens: runtime.maxTokens,
          timeoutMs: runtime.timeoutMs,
          messages: [
            {
              role: "system",
              content: this.systemPrompt(step)
            },
            ...messages
          ]
        });

        return {
          text: result.text,
          provider,
          model: runtime.model,
          degraded: index > 0,
          fallbackUsed: index > 0
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "orchestrator_generate_failed";
      }
    }

    this.appendAudit({
      action: "GENERATE_FAILED",
      actor: "system",
      payload: {
        step,
        error: lastError,
        provider_order: order
      },
      result: "FAILED",
      createdAt: new Date().toISOString()
    });

    return {
      text: fallbackText,
      provider: runtime.primaryProvider,
      model: runtime.model,
      degraded: true,
      fallbackUsed: true,
      error: lastError || "orchestrator_generate_failed"
    };
  }

  private getRuntimeSettings(): RuntimeSettings | undefined {
    const stored = this.repo.getSettings();
    if (!stored) {
      return undefined;
    }

    const apiKey = stored.apiKeyEncrypted ? decryptSecret(stored.apiKeyEncrypted) : "";
    return {
      primaryProvider: stored.primaryProvider,
      fallbackProviders: stored.fallbackProviders,
      model: stored.model,
      baseUrl: stored.baseUrl,
      apiKey,
      timeoutMs: stored.timeoutMs,
      temperature: stored.temperature,
      maxTokens: stored.maxTokens,
      updatedBy: stored.updatedBy,
      updatedAt: stored.updatedAt
    };
  }

  private resolveApiKeyEncrypted(existing: string | undefined, nextRaw: string | undefined): string | undefined {
    if (typeof nextRaw !== "string") {
      return existing;
    }

    const trimmed = nextRaw.trim();
    if (!trimmed) {
      return existing;
    }

    return encryptSecret(trimmed);
  }

  private appendAudit(input: Omit<OrchestratorLlmAuditEvent, "eventId">): void {
    this.repo.appendAudit(input);
  }

  private uniqueProviders(values: OrchestratorProvider[]): OrchestratorProvider[] {
    const result: OrchestratorProvider[] = [];
    for (const value of values) {
      if (!result.includes(value)) {
        result.push(value);
      }
    }
    return result;
  }

  private normalizeTimeout(value: number): number {
    return Math.max(1000, Math.min(Math.floor(value), 120000));
  }

  private normalizeTemperature(value: number): number {
    if (!Number.isFinite(value)) {
      return 0.2;
    }
    return Math.max(0, Math.min(value, 2));
  }

  private normalizeMaxTokens(value: number): number {
    return Math.max(64, Math.min(Math.floor(value), 8192));
  }

  private systemPrompt(step: OrchestratorStep): string {
    switch (step) {
      case "analyze_requirement":
        return "你是技术需求分析助手。输出简洁、结构化、可执行。";
      case "suggest_tool_and_questions":
        return "你是工具选择助手。请在 codex 与 claude_code 之间给出建议，并列出必要澄清问题。";
      case "rewrite_hitl_prompt":
        return "你是用户沟通助手。将技术请求改写为业务用户可理解的问题。";
      case "summarize_progress":
        return "你是执行进度摘要助手。用 1-2 句说明当前进展与下一步。";
      case "summarize_completion":
        return "你是任务完成汇报助手。输出完成结果、风险与后续建议。";
      case "summarize_archive":
        return "你是会话归档助手。用简短文字总结会话目标、产出与状态。";
      default:
        return "你是协作编排助手。";
    }
  }
}
