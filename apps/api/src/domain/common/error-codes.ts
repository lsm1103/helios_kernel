export const ErrorCodes = {
  InteractionNotFound: "HELIOS-HITL-404-INTERACTION_NOT_FOUND",
  InteractionNotPending: "HELIOS-HITL-409-INTERACTION_NOT_PENDING",
  AnswerAlreadyConsumed: "HELIOS-HITL-409-ANSWER_ALREADY_CONSUMED",
  RunNotActive: "HELIOS-TOOL-409-RUN_NOT_ACTIVE",
  LarkSignatureInvalid: "HELIOS-HITL-401-LARK_SIGNATURE_INVALID",
  InteractionExpired: "HELIOS-HITL-408-INTERACTION_EXPIRED",
  BindingMismatch: "HELIOS-HITL-409-RUN_BINDING_MISMATCH"
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
