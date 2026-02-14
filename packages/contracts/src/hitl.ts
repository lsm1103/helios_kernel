export type InteractionStatus = "PENDING" | "RESOLVED" | "EXPIRED" | "CANCELLED";
export type AnswerType = "choice" | "text";

export interface InteractionRequest {
  interaction_request_id: string;
  collab_session_id: string;
  tool_session_id: string;
  run_id: string;
  status: InteractionStatus;
  prompt: string;
  options?: string[];
  created_at: string;
  expires_at: string;
  resolved_at?: string;
  answer?: {
    answer_type: AnswerType;
    answer_value: string;
  };
}

export interface LarkInteractionPayload {
  event_id: string;
  event_type: "interaction.answer.submitted";
  occurred_at: string;
  collab_session_id: string;
  tool_session_id: string;
  interaction_request_id: string;
  answered_by: {
    actor_type: "HUMAN";
    actor_id: string;
  };
  answer: {
    answer_type: AnswerType;
    answer_value: string;
  };
  idempotency_key: string;
}
