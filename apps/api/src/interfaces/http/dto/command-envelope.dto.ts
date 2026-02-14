export class CommandEnvelopeDto {
  command_id!: string;
  command_name!: string;
  aggregate_type!: "PROJECT" | "SESSION" | "TASK" | "AGENT" | "GOVERNANCE_CASE";
  aggregate_id!: string;
  project_id!: string;
  session_id?: string;
  actor!: {
    actor_type: "HUMAN" | "AGENT" | "SYSTEM";
    actor_id: string;
  };
  idempotency_key!: string;
  expected_version?: number;
  payload!: Record<string, unknown>;
  requested_at!: string;
}
