import { Injectable } from "@nestjs/common";
import {
  OrchestratorLlmProvider,
  ProviderGenerateInput,
  ProviderGenerateOutput,
  withTimeout
} from "../orchestrator-llm-provider";

@Injectable()
export class AnthropicProvider implements OrchestratorLlmProvider {
  readonly provider = "anthropic" as const;

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
    const url = input.baseUrl?.trim() || "https://api.anthropic.com/v1/messages";
    const systemMessage = input.messages.find((msg) => msg.role === "system")?.content;
    const messages = input.messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content }));

    const payload = {
      model: input.model,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      system: systemMessage,
      messages
    };

    const response = await withTimeout(input.timeoutMs, async (signal) => {
      return fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": input.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(payload),
        signal
      });
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`anthropic_request_failed:${response.status}:${text}`);
    }

    const json = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    const text = json.content?.find((part) => part.type === "text")?.text?.trim();
    if (!text) {
      throw new Error("anthropic_empty_response");
    }

    return { text };
  }

  async healthCheck(input: Omit<ProviderGenerateInput, "messages">): Promise<{ ok: boolean; message: string }> {
    try {
      await this.generate({
        ...input,
        maxTokens: Math.min(input.maxTokens, 8),
        messages: [{ role: "user", content: "ping" }]
      });
      return { ok: true, message: "ok" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "anthropic_health_check_failed"
      };
    }
  }
}
