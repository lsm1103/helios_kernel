export type AggregateType =
  | "PROJECT"
  | "SESSION"
  | "TASK"
  | "AGENT"
  | "GOVERNANCE_CASE";

export type ActorType = "HUMAN" | "AGENT" | "SYSTEM";

export interface CommandEnvelope<TPayload = unknown> {
  command_id: string;
  command_name: string;
  aggregate_type: AggregateType;
  aggregate_id: string;
  project_id: string;
  session_id?: string;
  actor: {
    actor_type: ActorType;
    actor_id: string;
  };
  idempotency_key: string;
  expected_version?: number;
  payload: TPayload;
  requested_at: string;
}
