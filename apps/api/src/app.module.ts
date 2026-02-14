import { Module } from "@nestjs/common";
import { ToolSessionController } from "./interfaces/http/controllers/tool-session.controller";
import { LarkInteractionWebhook } from "./interfaces/webhook/lark-interaction.webhook";
import { SocialAppWebhook } from "./interfaces/webhook/social-app.webhook";
import { ToolSessionLinkService } from "./application/tooling/tool-session-link.service";
import { InteractionRequestService } from "./application/tooling/interaction-request.service";
import { ToolRunService } from "./application/tooling/tool-run.service";
import { ToolSessionLinkRepository } from "./infrastructure/persistence/sqlite/repositories/tool-session-link.repository";
import { InteractionRequestsRepository } from "./infrastructure/persistence/sqlite/repositories/interaction-requests.repository";
import { PtyRunManager } from "./infrastructure/tool-runners/pty-run-manager";
import { CodexAdapter } from "./infrastructure/tool-runners/codex.adapter";
import { ClaudeAdapter } from "./infrastructure/tool-runners/claude.adapter";
import { SqliteDbService } from "./infrastructure/persistence/sqlite/sqlite-db.service";
import { LocalSessionScannerService } from "./infrastructure/tool-runners/local-session-scanner.service";

@Module({
  imports: [],
  controllers: [ToolSessionController, LarkInteractionWebhook, SocialAppWebhook],
  providers: [
    ToolSessionLinkService,
    InteractionRequestService,
    ToolRunService,
    ToolSessionLinkRepository,
    InteractionRequestsRepository,
    SqliteDbService,
    PtyRunManager,
    CodexAdapter,
    ClaudeAdapter,
    LocalSessionScannerService
  ]
})
export class AppModule {}
