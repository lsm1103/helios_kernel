export class CommandResultDto {
  command_id!: string;
  status!: "ACCEPTED" | "REJECTED" | "NOOP_IDEMPOTENT";
  aggregate_id!: string;
  new_version?: number;
  event_ids!: string[];
  error?: {
    code: string;
    message: string;
  } | null;
  processed_at!: string;
}
