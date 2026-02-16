import { ToolProvider } from "../../infrastructure/persistence/sqlite/repositories/tool-session-link.repository";

export type CollabCardStatus = "PENDING" | "RESOLVED" | "CANCELLED" | "EXPIRED";

export type StatusEventType =
  | "RUN_STARTED"
  | "RUN_PAUSED"
  | "RUN_DONE"
  | "RUN_FAILED"
  | "TOOL_SESSION_LINKED"
  | "TOOL_SWITCHED";

export interface CardDisplayMeta {
  density: "compact";
  drawer_open: "manual";
}

export interface ToolOption {
  value: ToolProvider;
  label: string;
}

export type CollabCard =
  | {
      card_id: string;
      card_type: "status_event";
      title: string;
      status: "RESOLVED";
      display: CardDisplayMeta;
      payload: {
        event_type: StatusEventType;
        summary?: string;
        run_id?: string;
        tool_session_id?: string;
        provider?: ToolProvider;
      };
      actions: [];
    }
  | {
      card_id: string;
      card_type: "action_request";
      title: string;
      status: CollabCardStatus;
      display: CardDisplayMeta;
      payload:
        | {
            action_kind: "tool_select";
            run_id?: string;
            options: ToolOption[];
            selected?: ToolProvider;
          }
        | {
            action_kind: "tool_session";
            tool_session_id: string;
            provider: ToolProvider;
            summary_150: string;
            run_id?: string;
          }
        | {
            action_kind: "hitl_request";
            interaction_request_id: string;
            run_id: string;
            prompt: string;
            options: string[];
          };
      actions: Array<{
        action_id: "select_tool" | "open_transcript" | "choose_option" | "submit_text";
        label: string;
        style?: "primary" | "default";
      }>;
    };

export type FeedItem =
  | { id: string; kind: "text"; role: "user" | "system" | "assistant"; content: string; ts: string }
  | { id: string; kind: "card"; card: CollabCard; ts: string };

export type CardActionEffect =
  | {
      type: "OPEN_DRAWER";
      target: {
        drawer_type: "tool_session" | "tool_select" | "hitl_request";
        tool_session_id?: string;
        provider?: ToolProvider;
        run_id?: string;
        card_id: string;
      };
    }
  | { type: "APPEND_FEED_ITEM"; item: FeedItem }
  | { type: "SHOW_TOAST"; level: "info" | "error"; message: string };

export interface CardActionResponse {
  ok: boolean;
  card_status: CollabCardStatus;
  effects: CardActionEffect[];
}

export const COMPACT_CARD_DISPLAY: CardDisplayMeta = {
  density: "compact",
  drawer_open: "manual"
};
