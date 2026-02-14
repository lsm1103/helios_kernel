export type ToolProvider = "codex" | "claude_code";
export type ToolSessionStatus = "ACTIVE" | "PAUSED" | "CLOSED";

export interface ToolSessionLink {
  link_id: string;
  collab_session_id: string;
  task_id: string;
  provider: ToolProvider;
  tool_session_id: string;
  status: ToolSessionStatus;
  last_summary_150?: string;
  last_active_at: string;
  created_at: string;
}
