import { Body, Controller, Post } from "@nestjs/common";

@Controller("webhooks/social")
export class SocialAppWebhook {
  @Post("message")
  onMessage(@Body() body: Record<string, unknown>) {
    return {
      accepted: true,
      received_at: new Date().toISOString(),
      note: "Social webhook accepted. Message routing to session/task pipeline is next milestone.",
      payload: body
    };
  }
}
