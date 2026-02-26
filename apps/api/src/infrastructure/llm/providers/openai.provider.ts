import { Injectable } from "@nestjs/common";
import {
  OrchestratorLlmProvider,
  ProviderGenerateInput,
  ProviderGenerateOutput,
  withTimeout
} from "../orchestrator-llm-provider";

@Injectable()
export class OpenAiProvider implements OrchestratorLlmProvider {
  readonly provider = "openai" as const;

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
    const url = input.baseUrl?.trim() || "https://api.openai.com/v1/chat/completions";

    const payload = {
      model: input.model,
      messages: input.messages,
      temperature: input.temperature,
      max_tokens: input.maxTokens
    };

    const response = await withTimeout(input.timeoutMs, async (signal) => {
      return fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`
        },
        body: JSON.stringify(payload),
        signal
      });
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`openai_request_failed:${response.status}:${text}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("openai_empty_response");
    }

    return { text: content };
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
        message: error instanceof Error ? error.message : "openai_health_check_failed"
      };
    }
  }
}
