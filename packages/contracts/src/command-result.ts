export type CommandStatus = "ACCEPTED" | "REJECTED" | "NOOP_IDEMPOTENT";

export interface CommandResult {
  command_id: string;
  status: CommandStatus;
  aggregate_id: string;
  new_version?: number;
  event_ids: string[];
  error?: {
    code: string;
    message: string;
  } | null;
  processed_at: string;
}
