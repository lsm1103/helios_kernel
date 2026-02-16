"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ChevronUp,
  CircleCheck,
  Loader2,
  PauseCircle,
  Play,
  Send,
  TerminalSquare,
  X
} from "lucide-react";
import { createPortal } from "react-dom";
import { getJson, postJson } from "../../../lib/api-client";
import { useI18n } from "../../../lib/i18n";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";

type ToolProvider = "codex" | "claude_code";

type CollabSession = {
  collabSessionId: string;
  name: string;
  description: string;
  status: "ACTIVE" | "ARCHIVED";
  workspacePath: string;
  activeTool?: ToolProvider;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type ToolSessionLink = {
  toolSessionId: string;
  provider: ToolProvider;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
  lastSummary150: string;
  lastActiveAt: string;
};

type RunRecord = {
  runId?: string;
  run_id?: string;
};

type FeedItem =
  | {
      id: string;
      kind: "text";
      role: "user" | "system" | "assistant";
      content: string;
      ts: string;
    }
  | {
      id: string;
      kind: "card";
      card: CollabCard;
      ts: string;
    };

type CollabCard =
  | {
      card_id: string;
      card_type: "status_event";
      title: string;
      status: "RESOLVED";
      display?: { density?: "compact"; drawer_open?: "manual" };
      payload: {
        event_type:
          | "RUN_STARTED"
          | "RUN_PAUSED"
          | "RUN_DONE"
          | "RUN_FAILED"
          | "TOOL_SESSION_LINKED"
          | "TOOL_SWITCHED";
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
      status: "PENDING" | "RESOLVED" | "CANCELLED" | "EXPIRED";
      display?: { density?: "compact"; drawer_open?: "manual" };
      payload:
        | {
            action_kind: "tool_select";
            run_id?: string;
            options: Array<{ value: ToolProvider; label: string }>;
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

type FeedResponse = {
  items: FeedItem[];
  next_cursor?: string;
};

type CardActionResponse = {
  ok: boolean;
  card_status: "PENDING" | "RESOLVED" | "CANCELLED" | "EXPIRED";
  effects: Array<
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
    | { type: "SHOW_TOAST"; level: "info" | "error"; message: string }
  >;
};

type TranscriptResponse = {
  entries: Array<{
    role: "tool" | "system";
    text: string;
    timestamp?: string;
  }>;
};

function isActionCard(card: CollabCard): card is Extract<CollabCard, { card_type: "action_request" }> {
  return card.card_type === "action_request";
}

function isStatusCard(card: CollabCard): card is Extract<CollabCard, { card_type: "status_event" }> {
  return card.card_type === "status_event";
}

function isToolSelectCard(
  card: CollabCard
): card is Extract<CollabCard, { card_type: "action_request" }> & {
  payload: Extract<Extract<CollabCard, { card_type: "action_request" }>["payload"], { action_kind: "tool_select" }>;
} {
  return isActionCard(card) && card.payload.action_kind === "tool_select";
}

function isToolSessionCard(
  card: CollabCard
): card is Extract<CollabCard, { card_type: "action_request" }> & {
  payload: Extract<Extract<CollabCard, { card_type: "action_request" }>["payload"], { action_kind: "tool_session" }>;
} {
  return isActionCard(card) && card.payload.action_kind === "tool_session";
}

function isHitlCard(
  card: CollabCard
): card is Extract<CollabCard, { card_type: "action_request" }> & {
  payload: Extract<Extract<CollabCard, { card_type: "action_request" }>["payload"], { action_kind: "hitl_request" }>;
} {
  return isActionCard(card) && card.payload.action_kind === "hitl_request";
}

function statusIcon(card: Extract<CollabCard, { card_type: "status_event" }>) {
  if (card.payload.event_type === "RUN_FAILED") {
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  }
  if (card.payload.event_type === "RUN_PAUSED") {
    return <PauseCircle className="h-4 w-4 text-amber-500" />;
  }
  if (card.payload.event_type === "RUN_DONE") {
    return <CircleCheck className="h-4 w-4 text-emerald-600" />;
  }
  return <TerminalSquare className="h-4 w-4 text-muted-foreground" />;
}

function cardStatusVariant(status: "PENDING" | "RESOLVED" | "CANCELLED" | "EXPIRED") {
  if (status === "PENDING") {
    return "default" as const;
  }
  return "secondary" as const;
}

export default function CollabSessionPage() {
  const params = useParams<{ collabSessionId: string }>();
  const router = useRouter();
  const { locale } = useI18n();

  const collabSessionId = typeof params.collabSessionId === "string" ? params.collabSessionId : "";

  const text = useMemo(
    () =>
      locale === "zh"
        ? {
            title: "协作会话",
            subtitle: "文本优先的协作聊天，必要交互使用轻卡片。",
            active: "进行中",
            archived: "已归档",
            back: "返回会话列表",
            provider: "工具",
            session: "工具会话",
            task: "任务ID",
            prompt: "执行指令",
            startRun: "启动执行",
            feedEmpty: "暂无消息，先启动一个任务。",
            inputPlaceholder: "继续输入你的要求...",
            send: "发送",
            openTranscript: "打开记录",
            submit: "提交",
            customReply: "自定义回复",
            loadMore: "加载更多",
            loading: "加载中...",
            drawerTitle: "详情",
            drawerEmpty: "暂无可展示内容。",
            transcript: "工具会话记录",
            cardExpired: "卡片不可执行",
            runStarted: "运行已启动",
            activeTool: "当前工具",
            noSession: "未绑定会话",
            run: "运行",
            action: "操作",
            status: "状态",
            event: "状态事件"
          }
        : {
            title: "Collab Session",
            subtitle: "Text-first collaboration chat with lightweight cards for required interactions.",
            active: "Active",
            archived: "Archived",
            back: "Back to sessions",
            provider: "Tool",
            session: "Tool Session",
            task: "Task ID",
            prompt: "Prompt",
            startRun: "Start Run",
            feedEmpty: "No messages yet. Start a task first.",
            inputPlaceholder: "Type your next instruction...",
            send: "Send",
            openTranscript: "Open transcript",
            submit: "Submit",
            customReply: "Custom reply",
            loadMore: "Load more",
            loading: "Loading...",
            drawerTitle: "Detail",
            drawerEmpty: "No content.",
            transcript: "Tool transcript",
            cardExpired: "Card is not executable",
            runStarted: "Run started",
            activeTool: "Active tool",
            noSession: "No linked session",
            run: "Run",
            action: "Action",
            status: "Status",
            event: "Status event"
          },
    [locale]
  );

  const [session, setSession] = useState<CollabSession | null>(null);
  const [toolSessions, setToolSessions] = useState<ToolSessionLink[]>([]);
  const [activeRunId, setActiveRunId] = useState("");
  const [taskId, setTaskId] = useState(`task_${Date.now()}`);
  const [provider, setProvider] = useState<ToolProvider>("codex");
  const [selectedToolSessionId, setSelectedToolSessionId] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [runPrompt, setRunPrompt] = useState("");

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(false);

  const [chatInput, setChatInput] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCard, setDrawerCard] = useState<CollabCard | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerEntries, setDrawerEntries] = useState<TranscriptResponse["entries"]>([]);
  const [drawerTextReply, setDrawerTextReply] = useState("");

  const [statusText, setStatusText] = useState("");
  const [mounted, setMounted] = useState(false);

  function orderedFeedItems(items: FeedItem[]): FeedItem[] {
    return [...items].sort((a, b) => {
      const left = Date.parse(a.ts);
      const right = Date.parse(b.ts);
      if (left !== right) {
        return left - right;
      }
      return a.id.localeCompare(b.id);
    });
  }

  async function refreshSession(): Promise<void> {
    try {
      const detail = await getJson<CollabSession>(`/v1/collab-sessions/${encodeURIComponent(collabSessionId)}`);
      setSession(detail);
      setWorkspacePath(detail.workspacePath ?? "");
      if (detail.activeTool) {
        setProvider(detail.activeTool);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load session";
      setStatusText(message);
    }
  }

  async function refreshToolSessions(): Promise<void> {
    try {
      const rows = await getJson<ToolSessionLink[]>(`/v1/collab-sessions/${encodeURIComponent(collabSessionId)}/tool-sessions`);
      setToolSessions(rows);
      if (!selectedToolSessionId && rows.length > 0) {
        setSelectedToolSessionId(rows[0].toolSessionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load tool sessions";
      setStatusText(message);
      setToolSessions([]);
    }
  }

  async function refreshFeed(): Promise<void> {
    try {
      const response = await getJson<FeedResponse>(`/v1/collab-sessions/${encodeURIComponent(collabSessionId)}/feed?limit=80`);
      setFeedItems(response.items ?? []);
      setFeedCursor(response.next_cursor ?? null);
      setHasMore(Boolean(response.next_cursor));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load feed";
      setStatusText(message);
    }
  }

  async function loadMoreFeed(): Promise<void> {
    if (!feedCursor || loadingFeed) {
      return;
    }
    setLoadingFeed(true);
    try {
      const response = await getJson<FeedResponse>(
        `/v1/collab-sessions/${encodeURIComponent(collabSessionId)}/feed?limit=80&cursor=${encodeURIComponent(feedCursor)}`
      );
      setFeedItems((prev) => {
        const merged = [...prev, ...(response.items ?? [])];
        const byId = new Map<string, FeedItem>();
        for (const item of merged) {
          byId.set(item.id, item);
        }
        return orderedFeedItems(Array.from(byId.values()));
      });
      setFeedCursor(response.next_cursor ?? null);
      setHasMore(Boolean(response.next_cursor));
    } finally {
      setLoadingFeed(false);
    }
  }

  async function appendFeedText(role: "user" | "system" | "assistant", content: string): Promise<void> {
    await postJson(`/v1/collab-sessions/${encodeURIComponent(collabSessionId)}/feed/text`, {
      role,
      content
    });
  }

  async function openToolSessionDrawer(card: CollabCard, runId?: string): Promise<void> {
    setDrawerOpen(true);
    setDrawerCard(card);
    setDrawerLoading(true);
    setDrawerEntries([]);
    try {
      if (!isToolSessionCard(card)) {
        setDrawerEntries([]);
        return;
      }
      const query = runId ? `?run_id=${encodeURIComponent(runId)}&limit=300` : "?limit=300";
      const response = await getJson<TranscriptResponse>(
        `/v1/tool-sessions/${encodeURIComponent(card.payload.tool_session_id)}/transcript${query}`
      );
      setDrawerEntries(response.entries ?? []);
    } catch {
      setDrawerEntries([]);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function handleCardEffects(sourceCard: CollabCard, response: CardActionResponse): Promise<void> {
    for (const effect of response.effects) {
      if (effect.type === "SHOW_TOAST") {
        setStatusText(effect.message);
      }

      if (effect.type === "APPEND_FEED_ITEM") {
        setFeedItems((prev) => orderedFeedItems([...prev, effect.item]));
      }

      if (effect.type === "OPEN_DRAWER") {
        const targetCard =
          sourceCard.card_id === effect.target.card_id
            ? sourceCard
            : feedItems
                .filter((item): item is Extract<FeedItem, { kind: "card" }> => item.kind === "card")
                .map((item) => item.card)
                .find((candidate) => candidate.card_id === effect.target.card_id) ?? null;

        if (!targetCard) {
          continue;
        }

        if (effect.target.drawer_type === "tool_session") {
          await openToolSessionDrawer(targetCard, effect.target.run_id);
        } else {
          setDrawerCard(targetCard);
          setDrawerOpen(true);
          setDrawerEntries([]);
          setDrawerLoading(false);
          setDrawerTextReply("");
        }
      }
    }
  }

  async function performCardAction(
    card: CollabCard,
    actionId: "select_tool" | "open_transcript" | "choose_option" | "submit_text",
    params: Record<string, unknown>
  ): Promise<void> {
    try {
      const response = await postJson<CardActionResponse>(`/v1/collab-cards/${encodeURIComponent(card.card_id)}/actions`, {
        action_id: actionId,
        params,
        idempotency_key: `${card.card_id}_${actionId}_${Date.now()}`
      });
      await handleCardEffects(card, response);
      await refreshSession();
      await refreshFeed();
    } catch (error) {
      const message = error instanceof Error ? error.message : "card action failed";
      setStatusText(message);
    }
  }

  async function startRun(): Promise<void> {
    try {
      let toolSessionId = selectedToolSessionId;
      if (!toolSessionId) {
        toolSessionId = `toolsess_${Date.now()}`;
        await postJson("/v1/tool-sessions", {
          collab_session_id: collabSessionId,
          task_id: taskId.trim() || `task_${Date.now()}`,
          provider,
          source: "COLLAB",
          tool_session_id: toolSessionId,
          summary_150: runPrompt.slice(0, 150)
        });
        await refreshToolSessions();
      }

      const run = await postJson<RunRecord>("/internal/tool-runs/start", {
        collab_session_id: collabSessionId,
        task_id: taskId.trim() || `task_${Date.now()}`,
        tool_session_id: toolSessionId,
        provider,
        prompt: runPrompt.trim() || "Continue execution",
        session_id: toolSessionId,
        cwd: workspacePath.trim() || undefined
      });
      const runId = run.runId ?? run.run_id ?? "";
      setActiveRunId(runId);
      setSelectedToolSessionId(toolSessionId);
      await appendFeedText("system", `${text.runStarted}: ${runId}`);
      await refreshFeed();
      setStatusText(`${text.runStarted}: ${runId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to start run";
      setStatusText(message);
    }
  }

  async function sendMessage(): Promise<void> {
    if (!activeRunId || !chatInput.trim()) {
      return;
    }

    const content = chatInput.trim();
    setChatInput("");
    try {
      await appendFeedText("user", content);
      await postJson(`/internal/tool-runs/${encodeURIComponent(activeRunId)}/stdin/raw`, {
        stdin_text: `${content}\n`
      });
      await refreshFeed();
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to send";
      setStatusText(message);
    }
  }

  function openCardDrawer(card: CollabCard): void {
    setDrawerOpen(true);
    setDrawerCard(card);
    setDrawerEntries([]);
    setDrawerLoading(false);
    setDrawerTextReply("");
    if (isActionCard(card) && card.payload.action_kind === "tool_session") {
      void openToolSessionDrawer(card, card.payload.run_id);
    }
  }

  useEffect(() => {
    setMounted(true);
    void refreshSession();
    void refreshToolSessions();
    void refreshFeed();
  }, [collabSessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshFeed();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [collabSessionId]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const orderedFeed = orderedFeedItems(feedItems);

  const drawerLayer =
    mounted && drawerOpen
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="close drawer backdrop"
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setDrawerOpen(false)}
            />
            <aside className="fixed inset-y-0 right-0 z-50 h-screen w-screen border-l bg-white shadow-2xl lg:w-[66vw]">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{text.drawerTitle}</p>
                    <h3 className="text-lg font-bold">{drawerCard?.title ?? "-"}</h3>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {!drawerCard ? <p className="text-sm text-muted-foreground">{text.drawerEmpty}</p> : null}

                  {drawerCard && isToolSessionCard(drawerCard) ? (
                    <>
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">{text.transcript}</p>
                        <p className="text-sm">{drawerCard.payload.summary_150 || "-"}</p>
                      </div>
                      {drawerLoading ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {text.loading}
                        </p>
                      ) : null}
                      {!drawerLoading && drawerEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{text.drawerEmpty}</p>
                      ) : null}
                      {drawerEntries.map((entry, index) => (
                        <div key={`${index}_${entry.text.slice(0, 24)}`} className="rounded-xl border p-3">
                          <p className="mb-1 text-xs text-muted-foreground">
                            {entry.role}
                            {entry.timestamp ? ` · ${entry.timestamp}` : ""}
                          </p>
                          <p className="whitespace-pre-wrap text-sm">{entry.text}</p>
                        </div>
                      ))}
                    </>
                  ) : null}

                  {drawerCard && isToolSelectCard(drawerCard) ? (
                    <div className="space-y-3 rounded-xl border p-3">
                      <p className="text-sm font-semibold">{text.provider}</p>
                      <div className="flex flex-wrap gap-2">
                        {drawerCard.payload.options.map((option) => (
                          <Button
                            key={option.value}
                            size="sm"
                            variant={drawerCard.payload.selected === option.value ? "default" : "outline"}
                            onClick={() => void performCardAction(drawerCard, "select_tool", { provider: option.value })}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {drawerCard && isHitlCard(drawerCard) ? (
                    <div className="space-y-3 rounded-xl border p-3">
                      <p className="text-sm font-semibold">{drawerCard.payload.prompt}</p>
                      <div className="flex flex-wrap gap-2">
                        {drawerCard.payload.options.map((option) => (
                          <Button
                            key={option}
                            size="sm"
                            variant="outline"
                            disabled={drawerCard.status !== "PENDING"}
                            onClick={() => void performCardAction(drawerCard, "choose_option", { choice: option })}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={drawerTextReply}
                          disabled={drawerCard.status !== "PENDING"}
                          placeholder={text.customReply}
                          onChange={(event) => setDrawerTextReply(event.target.value)}
                        />
                        <Button
                          disabled={drawerCard.status !== "PENDING" || !drawerTextReply.trim()}
                          onClick={() => void performCardAction(drawerCard, "submit_text", { text: drawerTextReply.trim() })}
                        >
                          {text.submit}
                        </Button>
                      </div>
                      {drawerCard.status !== "PENDING" ? (
                        <p className="text-xs text-muted-foreground">{text.cardExpired}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </>,
          document.body
        )
      : null;

  return (
    <section className="flex h-[calc(100vh-9rem)] min-h-[560px] flex-col gap-3">
      <div className="shrink-0 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{session?.name ?? text.title}</h2>
            <p className="text-sm text-muted-foreground">{session?.description || text.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={session?.status === "ARCHIVED" ? "secondary" : "default"}>
              {session?.status === "ARCHIVED" ? text.archived : text.active}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => router.push("/sessions")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {text.back}
            </Button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border bg-background/60 p-2">
          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant={provider === "codex" ? "default" : "outline"} onClick={() => setProvider("codex")}>
                Codex
              </Button>
              <Button
                size="sm"
                variant={provider === "claude_code" ? "default" : "outline"}
                onClick={() => setProvider("claude_code")}
              >
                Claude
              </Button>
            </div>
            <Input
              className="h-9 shrink-0 lg:w-56"
              value={selectedToolSessionId}
              onChange={(event) => setSelectedToolSessionId(event.target.value)}
              placeholder={text.session}
            />
            <Input
              className="h-9 shrink-0 lg:w-40"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              placeholder={text.task}
            />
            <Input
              className="h-9 min-w-[220px] flex-1"
              value={runPrompt}
              onChange={(event) => setRunPrompt(event.target.value)}
              placeholder={text.prompt}
            />
            <Button className="h-9 shrink-0" onClick={() => void startRun()}>
              <Play className="mr-2 h-4 w-4" />
              {text.startRun}
            </Button>
            <div className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground xl:flex">
              <TerminalSquare className="h-3.5 w-3.5" />
              <span>
                {text.activeTool}: {session?.activeTool ?? provider}
              </span>
              <span>·</span>
              <span>
                {text.session}: {selectedToolSessionId || text.noSession}
              </span>
              {activeRunId ? (
                <>
                  <span>·</span>
                  <span>
                    {text.run}: {activeRunId}
                  </span>
                </>
              ) : null}
              {toolSessions.length > 0 ? (
                <>
                  <span>·</span>
                  <span>{toolSessions.length}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card">
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {hasMore ? (
              <div className="pb-1">
                <Button variant="outline" size="sm" disabled={loadingFeed} onClick={() => void loadMoreFeed()}>
                  {loadingFeed ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronUp className="mr-2 h-4 w-4" />}
                  {text.loadMore}
                </Button>
              </div>
            ) : null}

            {orderedFeed.length === 0 ? <p className="text-sm text-muted-foreground">{text.feedEmpty}</p> : null}

            {orderedFeed.map((item) => {
              if (item.kind === "text") {
                const bubbleStyle =
                  item.role === "user"
                    ? "ml-auto max-w-[85%] border-blue-200 bg-blue-50"
                    : "mr-auto max-w-[90%] border-border bg-background/60";

                return (
                  <div key={item.id} className={`rounded-xl border px-3 py-2 ${bubbleStyle}`}>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{item.role}</p>
                    <p className="whitespace-pre-wrap text-sm">{item.content}</p>
                  </div>
                );
              }

              const card = item.card;
              if (isStatusCard(card)) {
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {statusIcon(card)}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{card.title}</p>
                        {card.payload.summary ? (
                          <p className="truncate text-xs text-muted-foreground">{card.payload.summary}</p>
                        ) : null}
                      </div>
                    </div>
                    <Badge variant="secondary">{card.payload.event_type}</Badge>
                  </div>
                );
              }

              if (isToolSelectCard(card)) {
                return (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{card.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {text.action} · {card.payload.selected ?? "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={cardStatusVariant(card.status)}>{card.status}</Badge>
                      {card.payload.options.map((option) => (
                        <Button
                          key={option.value}
                          size="sm"
                          variant={card.payload.selected === option.value ? "default" : "outline"}
                          onClick={() => void performCardAction(card, "select_tool", { provider: option.value })}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              }

              if (isToolSessionCard(card)) {
                return (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{card.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {card.payload.provider} · {card.payload.summary_150 || "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={cardStatusVariant(card.status)}>{card.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => void performCardAction(card, "open_transcript", {})}>
                        {text.openTranscript}
                      </Button>
                    </div>
                  </div>
                );
              }

              if (isHitlCard(card)) {
                return (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{card.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{card.payload.prompt}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={cardStatusVariant(card.status)}>{card.status}</Badge>
                      {card.payload.options.slice(0, 2).map((option) => (
                        <Button
                          key={option}
                          size="sm"
                          variant="outline"
                          disabled={card.status !== "PENDING"}
                          onClick={() => void performCardAction(card, "choose_option", { choice: option })}
                        >
                          {option}
                        </Button>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => openCardDrawer(card)}>
                        {text.customReply}
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={item.id} className="rounded-xl border bg-background/50 px-3 py-2">
                  <p className="text-sm font-medium">{card.title}</p>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 border-t p-3">
            <div className="flex gap-2">
              <Textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={text.inputPlaceholder}
                className="min-h-[70px]"
              />
              <Button className="h-auto" onClick={() => void sendMessage()} disabled={!activeRunId || !chatInput.trim()}>
                <Send className="mr-2 h-4 w-4" />
                {text.send}
              </Button>
            </div>
            {statusText ? <p className="mt-2 text-xs text-muted-foreground">{statusText}</p> : null}
          </div>
        </div>
      </div>

      {drawerLayer}
    </section>
  );
}
