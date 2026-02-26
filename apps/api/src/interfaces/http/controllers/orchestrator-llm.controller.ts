import { Body, Controller, Get, Post } from "@nestjs/common";
import { OrchestratorLlmService } from "../../../application/orchestrator/orchestrator-llm.service";
import { OrchestratorProvider } from "../../../infrastructure/persistence/sqlite/repositories/orchestrator-llm.repository";

@Controller("v1/orchestrator-llm")
export class OrchestratorLlmController {
  constructor(private readonly orchestratorService: OrchestratorLlmService) {}

  @Get("providers")
  listProviders() {
    return this.orchestratorService.listProviders();
  }

  @Get("settings")
  settings() {
    return this.orchestratorService.getPublicSettings();
  }

  @Post("settings")
  updateSettings(
    @Body()
    body: {
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
  ) {
    return this.orchestratorService.updateSettings(body);
  }

  @Post("health-check")
  healthCheck(
    @Body()
    body?: {
      provider?: OrchestratorProvider;
    }
  ) {
    return this.orchestratorService.healthCheck(body?.provider);
  }
}
