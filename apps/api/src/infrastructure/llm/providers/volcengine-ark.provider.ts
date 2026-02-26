import { Injectable } from "@nestjs/common";
import {
  OrchestratorLlmProvider,
  ProviderGenerateInput,
  ProviderGenerateOutput,
  withTimeout
} from "../orchestrator-llm-provider";

@Injectable()
export class VolcengineArkProvider implements OrchestratorLlmProvider {
  readonly provider = "volcengine_ark" as const;

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
    const url = this.resolveApiUrl(input.baseUrl);

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
      throw new Error(`ark_request_failed:${response.status}:${text}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("ark_empty_response");
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
        message: error instanceof Error ? error.message : "ark_health_check_failed"
      };
    }
  }

  private resolveApiUrl(rawBaseUrl?: string): string {
    const fallback = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
    const trimmed = rawBaseUrl?.trim();
    if (!trimmed) {
      return fallback;
    }

    try {
      const parsed = new URL(trimmed);
      const normalizedPath = parsed.pathname.replace(/\/+$/, "");
      if (normalizedPath === "" || normalizedPath === "/") {
        parsed.pathname = "/api/v3/chat/completions";
        return parsed.toString();
      }
      if (normalizedPath === "/api/v3") {
        parsed.pathname = "/api/v3/chat/completions";
        return parsed.toString();
      }
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }
}
