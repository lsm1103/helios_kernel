import { Body, Controller, Post } from "@nestjs/common";
import { InteractionRequestService } from "../../application/tooling/interaction-request.service";

@Controller("webhooks/lark")
export class LarkInteractionWebhook {
  constructor(private readonly interactionService: InteractionRequestService) {}

  @Post("interaction")
  onInteraction(
    @Body()
    payload: {
      event_id: string;
      occurred_at?: string;
      interaction_request_id: string;
      answer: {
        answer_type: "choice" | "text";
        answer_value: string;
      };
      answered_by: {
        actor_id: string;
      };
      idempotency_key: string;
    }
  ) {
    return this.interactionService.handleLarkCallback({
      eventId: payload.event_id,
      idempotencyKey: payload.idempotency_key,
      interactionRequestId: payload.interaction_request_id,
      answerType: payload.answer.answer_type,
      answerValue: payload.answer.answer_value,
      answeredBy: payload.answered_by.actor_id,
      occurredAt: payload.occurred_at
    });
  }
}
