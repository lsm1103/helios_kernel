"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  CircleCheck,
  Info,
  Loader2,
  PauseCircle,
  Play,
  Plus,
  RefreshCcw,
  Send,
  TerminalSquare,
  X
} from "lucide-react";
import { createPortal } from "react-dom";
import { getJson, postJson } from "../lib/api-client";
import { useI18n } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

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
  archivedAt?: string;
  lastMessagePreview20: string;
  lastMessageTs?: string;
  lastMessageKind?: "text" | "card";
  lastMessageRole?: "user" | "assistant" | "system";
};

type ToolSessionLink = {
  toolSessionId: string;
  provider: ToolProvider;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
  lastSummary150: string;
  lastActiveAt: string;
};

type WorkspaceStateResponse = {
  session: CollabSession;
  linkedToolSessions: ToolSessionLink[];
  latestRunState: {
    runId?: string;
    status: "RUN_STARTED" | "RUN_PAUSED" | "RUN_DONE" | "RUN_FAILED" | "UNKNOWN";
    provider?: ToolProvider;
    toolSessionId?: string;
    updatedAt?: string;
  };
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

export function CollabWorkspace({ initialCollabSessionId }: { initialCollabSessionId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useI18n();

  const text = useMemo(
    () =>
      locale === "zh"
        ? {
            title: "协作会话",
            subtitle: "左会话、中聊天、右详情的三栏协作工作台。",
            refresh: "刷新",
            create: "创建",
            showArchived: "显示已归档",
            active: "进行中",
            archived: "已归档",
            empty: "暂无会话，请先创建。",
            noDescription: "暂无描述",
            detail: "详情",
            archive: "归档",
            archiveConfirm: "确认归档该会话？归档后默认隐藏。",
            archiveDone: "会话已归档",
            close: "关闭",
            name: "需求名称",
            desc: "需求描述",
            createTitle: "创建协作会话",
            createDesc: "输入需求名称和描述。",
            namePlaceholder: "例如：实现会话三栏协作页",
            descPlaceholder: "补充背景、目标和边界。",
            requiredName: "需求名称必填",
            confirmCreate: "创建",
            cancel: "取消",
            detailTitle: "会话详情",
            createdAt: "创建时间",
            updatedAt: "更新时间",
            workspacePath: "本地路径",
            metadata: "元数据",
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
            event: "状态事件",
            latestRun: "最近运行",
            linkedSessions: "关联工具会话",
            noRun: "暂无运行状态",
            noLinkedSession: "暂无关联工具会话"
          }
        : {
            title: "Collab Sessions",
            subtitle: "Three-column workspace: sessions, chat, and runtime details.",
            refresh: "Refresh",
            create: "Create",
            showArchived: "Show Archived",
            active: "Active",
            archived: "Archived",
            empty: "No sessions yet.",
            noDescription: "No description",
            detail: "Detail",
            archive: "Archive",
            archiveConfirm: "Archive this session? It will be hidden by default.",
            archiveDone: "Session archived",
            close: "Close",
            name: "Requirement Name",
            desc: "Requirement Description",
            createTitle: "Create Collaboration Session",
            createDesc: "Input requirement name and description.",
            namePlaceholder: "Example: implement three-column session workspace",
            descPlaceholder: "Describe goal, background and boundaries.",
            requiredName: "Name is required",
            confirmCreate: "Create",
            cancel: "Cancel",
            detailTitle: "Session Detail",
            createdAt: "Created",
            updatedAt: "Updated",
            workspacePath: "Workspace",
            metadata: "Metadata",
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
            event: "Status event",
            latestRun: "Latest run",
            linkedSessions: "Linked tool sessions",
            noRun: "No run status",
            noLinkedSession: "No linked tool sessions"
          },
    [locale]
  );

  const [showArchived, setShowArchived] = useState(false);
  const [sessions, setSessions] = useState<CollabSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [selectedCollabSessionId, setSelectedCollabSessionId] = useState(initialCollabSessionId ?? "");
  const [workspaceState, setWorkspaceState] = useState<WorkspaceStateResponse | null>(null);

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

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<CollabSession | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCard, setDrawerCard] = useState<CollabCard | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerEntries, setDrawerEntries] = useState<TranscriptResponse["entries"]>([]);
  const [drawerTextReply, setDrawerTextReply] = useState("");

  const [statusText, setStatusText] = useState("");
  const [mounted, setMounted] = useState(false);

  const selectedSession =
    sessions.find((row) => row.collabSessionId === selectedCollabSessionId) ?? null;

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

  async function refreshSessions(): Promise<CollabSession[]> {
    const query = showArchived ? "?include_archived=1" : "";
    const rows = await getJson<CollabSession[]>(`/v1/collab-sessions${query}`);
    setSessions(rows);
    setSessionsLoaded(true);
    return rows;
  }

  async function refreshWorkspaceState(collabSessionId: string): Promise<void> {
    const state = await getJson<WorkspaceStateResponse>(
      `/v1/collab-sessions/${encodeURIComponent(collabSessionId)}/workspace-state`
    );
    setWorkspaceState(state);
    setWorkspacePath(state.session.workspacePath ?? "");
    if (state.session.activeTool) {
      setProvider(state.session.activeTool);
    }

    const latestRunId =
      state.latestRunState.status === "RUN_STARTED" ? state.latestRunState.runId ?? "" : "";
    setActiveRunId(latestRunId);

    const exists = state.linkedToolSessions.some((row) => row.toolSessionId === selectedToolSessionId);
    if (!exists) {
      setSelectedToolSessionId(state.linkedToolSessions[0]?.toolSessionId ?? "");
    }
  }

  async function refreshFeed(collabSessionId: string): Promise<void> {
    const response = await getJson<FeedResponse>(
      `/v1/collab-sessions/${encodeURIComponent(collabSessionId)}/feed?limit=80`
    );
    setFeedItems(response.items ?? []);
    setFeedCursor(response.next_cursor ?? null);
    setHasMore(Boolean(response.next_cursor));
  }

  async function loadMoreFeed(): Promise<void> {
    if (!selectedCollabSessionId || !feedCursor || loadingFeed) {
      return;
    }
    setLoadingFeed(true);
    try {
      const response = await getJson<FeedResponse>(
        `/v1/collab-sessions/${encodeURIComponent(selectedCollabSessionId)}/feed?limit=80&cursor=${encodeURIComponent(feedCursor)}`
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

  async function appendFeedText(collabSessionId: string, role: "user" | "system" | "assistant", content: string): Promise<void> {
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
    if (!selectedCollabSessionId) {
      return;
    }

    try {
      const response = await postJson<CardActionResponse>(`/v1/collab-cards/${encodeURIComponent(card.card_id)}/actions`, {
        action_id: actionId,
        params,
        idempotency_key: `${card.card_id}_${actionId}_${Date.now()}`
      });
      await handleCardEffects(card, response);
      await Promise.all([
        refreshSessions(),
        refreshWorkspaceState(selectedCollabSessionId),
        refreshFeed(selectedCollabSessionId)
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "card action failed";
      setStatusText(message);
    }
  }

  async function startRun(): Promise<void> {
    if (!selectedCollabSessionId) {
      return;
    }

    try {
      let toolSessionId = selectedToolSessionId;
      if (!toolSessionId) {
        toolSessionId = `toolsess_${Date.now()}`;
        await postJson("/v1/tool-sessions", {
          collab_session_id: selectedCollabSessionId,
          task_id: taskId.trim() || `task_${Date.now()}`,
          provider,
          source: "COLLAB",
          tool_session_id: toolSessionId,
          summary_150: runPrompt.slice(0, 150)
        });
      }

      const run = await postJson<RunRecord>("/internal/tool-runs/start", {
        collab_session_id: selectedCollabSessionId,
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
      await appendFeedText(selectedCollabSessionId, "system", `${text.runStarted}: ${runId}`);
      await Promise.all([
        refreshSessions(),
        refreshWorkspaceState(selectedCollabSessionId),
        refreshFeed(selectedCollabSessionId)
      ]);
      setStatusText(`${text.runStarted}: ${runId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to start run";
      setStatusText(message);
    }
  }

  async function sendMessage(): Promise<void> {
    if (!selectedCollabSessionId || !activeRunId || !chatInput.trim()) {
      return;
    }

    const content = chatInput.trim();
    setChatInput("");
    try {
      await appendFeedText(selectedCollabSessionId, "user", content);
      await postJson(`/internal/tool-runs/${encodeURIComponent(activeRunId)}/stdin/raw`, {
        stdin_text: `${content}\n`
      });
      await Promise.all([refreshSessions(), refreshFeed(selectedCollabSessionId)]);
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
    if (isToolSessionCard(card)) {
      void openToolSessionDrawer(card, card.payload.run_id);
    }
  }

  async function createSession(): Promise<void> {
    if (!name.trim()) {
      setStatusText(text.requiredName);
      return;
    }

    try {
      const created = await postJson<CollabSession, { name: string; description: string }>("/v1/collab-sessions", {
        name: name.trim(),
        description: description.trim()
      });
      setCreateOpen(false);
      setName("");
      setDescription("");
      await refreshSessions();
      setSelectedCollabSessionId(created.collabSessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to create session";
      setStatusText(message);
    }
  }

  async function archiveSession(row: CollabSession): Promise<void> {
    const confirmed = window.confirm(text.archiveConfirm);
    if (!confirmed) {
      return;
    }

    try {
      await postJson(`/v1/collab-sessions/${encodeURIComponent(row.collabSessionId)}/archive`, {
        actor: "user_ui"
      });
      setStatusText(text.archiveDone);
      const rows = await refreshSessions();
      if (!rows.some((item) => item.collabSessionId === selectedCollabSessionId)) {
        const next = rows.find((item) => item.status === "ACTIVE") ?? rows[0];
        setSelectedCollabSessionId(next?.collabSessionId ?? "");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to archive";
      setStatusText(message);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshSessions();
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to load sessions";
        setStatusText(message);
        setSessions([]);
        setSessionsLoaded(true);
      }
    })();
  }, [showArchived]);

  useEffect(() => {
    if (!sessionsLoaded) {
      return;
    }

    if (sessions.length === 0) {
      setSelectedCollabSessionId("");
      setWorkspaceState(null);
      setFeedItems([]);
      setFeedCursor(null);
      setHasMore(false);
      if (pathname !== "/sessions") {
        router.replace("/sessions");
      }
      return;
    }

    const byInitial =
      initialCollabSessionId && sessions.find((row) => row.collabSessionId === initialCollabSessionId);
    const bySelected = sessions.find((row) => row.collabSessionId === selectedCollabSessionId);
    const next = bySelected ?? byInitial ?? sessions.find((row) => row.status === "ACTIVE") ?? sessions[0];

    if (next && next.collabSessionId !== selectedCollabSessionId) {
      setSelectedCollabSessionId(next.collabSessionId);
    }
  }, [sessionsLoaded, sessions, selectedCollabSessionId, initialCollabSessionId, pathname, router]);

  useEffect(() => {
    if (!selectedCollabSessionId) {
      return;
    }
    const target = `/sessions/${encodeURIComponent(selectedCollabSessionId)}`;
    if (pathname !== target) {
      router.replace(target);
    }
  }, [selectedCollabSessionId, pathname, router]);

  useEffect(() => {
    if (!selectedCollabSessionId) {
      return;
    }

    let alive = true;
    void (async () => {
      try {
        await Promise.all([
          refreshWorkspaceState(selectedCollabSessionId),
          refreshFeed(selectedCollabSessionId)
        ]);
      } catch (error) {
        if (!alive) {
          return;
        }
        const message = error instanceof Error ? error.message : "failed to load workspace";
        setStatusText(message);
      }
    })();

    const timer = window.setInterval(() => {
      void refreshFeed(selectedCollabSessionId).catch((error: unknown) => {
        if (!alive) {
          return;
        }
        const message = error instanceof Error ? error.message : "failed to refresh feed";
        setStatusText(message);
      });
    }, 2500);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [selectedCollabSessionId]);

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

  const createLayer =
    mounted && createOpen
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="close create modal backdrop"
              className="fixed inset-0 z-40 bg-black/25"
              onClick={() => setCreateOpen(false)}
            />
            <div className="fixed inset-x-0 top-[10vh] z-50 mx-auto w-[92vw] max-w-xl rounded-2xl border bg-white shadow-2xl">
              <div className="border-b px-5 py-4">
                <h3 className="text-lg font-bold">{text.createTitle}</h3>
                <p className="text-sm text-muted-foreground">{text.createDesc}</p>
              </div>
              <div className="space-y-4 p-5">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{text.name}</p>
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={text.namePlaceholder} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{text.desc}</p>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={text.descPlaceholder}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    {text.cancel}
                  </Button>
                  <Button onClick={() => void createSession()}>{text.confirmCreate}</Button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  const detailLayer =
    mounted && detailOpen && detailTarget
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="close detail modal backdrop"
              className="fixed inset-0 z-40 bg-black/25"
              onClick={() => setDetailOpen(false)}
            />
            <div className="fixed inset-x-0 top-[4vh] z-50 mx-auto flex h-[90vh] w-[96vw] max-w-5xl flex-col rounded-2xl border bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold">{text.detailTitle}</h3>
                  <p className="text-sm text-muted-foreground">{detailTarget.collabSessionId}</p>
                </div>
                <Badge variant={detailTarget.status === "ACTIVE" ? "default" : "secondary"}>
                  {detailTarget.status === "ACTIVE" ? text.active : text.archived}
                </Badge>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{text.name}</p>
                  <p>{detailTarget.name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{text.desc}</p>
                  <p className="whitespace-pre-wrap">{detailTarget.description || text.noDescription}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{text.workspacePath}</p>
                    <p>{detailTarget.workspacePath || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{text.provider}</p>
                    <p>{detailTarget.activeTool || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{text.createdAt}</p>
                    <p>{new Date(detailTarget.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{text.updatedAt}</p>
                    <p>{new Date(detailTarget.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{text.metadata}</p>
                  <pre className="max-h-60 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs">
                    {JSON.stringify(detailTarget.metadata ?? {}, null, 2)}
                  </pre>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setDetailOpen(false)}>
                    {text.close}
                  </Button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

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
    <section className="h-[calc(100vh-8.5rem)] min-h-[620px] overflow-hidden">
      <div className="flex h-full overflow-hidden rounded-none border-0 bg-[#f4f4f6] shadow-none">
        <aside className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-[#ececef]">
          <div className="shrink-0 border-b border-zinc-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">{text.title}</h2>
                <p className="text-[11px] text-zinc-500">{sessions.length}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => void refreshSessions()}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {text.create}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setShowArchived((prev) => !prev)}>
                {text.showArchived}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
            {sessions.length === 0 ? <p className="px-2 text-xs text-zinc-500">{text.empty}</p> : null}
            {sessions.map((row) => {
              const active = row.collabSessionId === selectedCollabSessionId;
              return (
                <div
                  key={row.collabSessionId}
                  className={`rounded-lg border px-2 py-2 transition ${
                    active
                      ? "border-zinc-300 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                      : "border-transparent bg-transparent hover:border-zinc-200 hover:bg-white/70"
                  }`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedCollabSessionId(row.collabSessionId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-medium text-zinc-900">{row.name}</p>
                      <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>
                        {row.status === "ACTIVE" ? text.active : text.archived}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500" title={row.lastMessagePreview20}>
                      {row.lastMessagePreview20 || "-"}
                    </p>
                  </button>
                  <div className="mt-2 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-zinc-600 hover:text-zinc-900"
                      onClick={() => {
                        setDetailTarget(row);
                        setDetailOpen(true);
                      }}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-zinc-600 hover:text-zinc-900"
                      disabled={row.status === "ARCHIVED"}
                      onClick={() => void archiveSession(row)}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden bg-white">
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-zinc-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-semibold text-zinc-900">{selectedSession?.name ?? text.noSession}</h3>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{selectedSession?.description || text.noDescription}</p>
                </div>
                {selectedSession ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      setDetailTarget(selectedSession);
                      setDetailOpen(true);
                    }}
                  >
                    <Info className="mr-1 h-4 w-4" />
                    {text.detail}
                  </Button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  <Button size="sm" variant={provider === "codex" ? "default" : "outline"} className="h-8" onClick={() => setProvider("codex")}>
                    Codex
                  </Button>
                  <Button
                    size="sm"
                    className="h-8"
                    variant={provider === "claude_code" ? "default" : "outline"}
                    onClick={() => setProvider("claude_code")}
                  >
                    Claude
                  </Button>
                </div>
                <Input
                  className="h-8 w-44"
                  value={selectedToolSessionId}
                  onChange={(event) => setSelectedToolSessionId(event.target.value)}
                  placeholder={text.session}
                />
                <Input className="h-8 w-32" value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder={text.task} />
                <Input
                  className="h-8 min-w-[220px] flex-1"
                  value={runPrompt}
                  onChange={(event) => setRunPrompt(event.target.value)}
                  placeholder={text.prompt}
                />
                <Button className="h-8" onClick={() => void startRun()} disabled={!selectedCollabSessionId}>
                  <Play className="mr-1 h-4 w-4" />
                  {text.startRun}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span>{text.activeTool}: {workspaceState?.session.activeTool ?? provider}</span>
                <span>•</span>
                <span>{text.run}: {(workspaceState?.latestRunState.runId ?? activeRunId) || "-"}</span>
                <span>•</span>
                <span>{text.status}: {workspaceState?.latestRunState.status ?? "UNKNOWN"}</span>
                <span>•</span>
                <span>{text.linkedSessions}: {workspaceState?.linkedToolSessions.length ?? 0}</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-[#fcfcfd] px-3 py-2">
              {hasMore ? (
                <div className="pb-1">
                  <Button variant="ghost" size="sm" disabled={loadingFeed} onClick={() => void loadMoreFeed()}>
                    {loadingFeed ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TerminalSquare className="mr-2 h-4 w-4" />}
                    {text.loadMore}
                  </Button>
                </div>
              ) : null}

              {orderedFeed.length === 0 ? <p className="text-sm text-zinc-500">{text.feedEmpty}</p> : null}

              {orderedFeed.map((item) => {
                if (item.kind === "text") {
                  const bubbleStyle =
                    item.role === "user"
                      ? "ml-auto max-w-[86%] border-blue-200 bg-blue-50"
                      : "mr-auto max-w-[92%] border-zinc-200 bg-white";

                  return (
                    <div key={item.id} className={`rounded-lg border px-3 py-2 ${bubbleStyle}`}>
                      <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">{item.role}</p>
                      <p className="whitespace-pre-wrap text-sm text-zinc-900">{item.content}</p>
                    </div>
                  );
                }

                const card = item.card;
                if (isStatusCard(card)) {
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {statusIcon(card)}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{card.title}</p>
                          {card.payload.summary ? <p className="truncate text-xs text-zinc-500">{card.payload.summary}</p> : null}
                        </div>
                      </div>
                      <Badge variant="secondary">{card.payload.event_type}</Badge>
                    </div>
                  );
                }

                if (isToolSelectCard(card)) {
                  return (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{card.title}</p>
                        <p className="text-xs text-zinc-500">
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
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{card.title}</p>
                        <p className="truncate text-xs text-zinc-500">
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
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{card.title}</p>
                        <p className="truncate text-xs text-zinc-500">{card.payload.prompt}</p>
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
                  <div key={item.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    <p className="text-sm font-medium">{card.title}</p>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-zinc-200 bg-white px-3 py-2">
              <div className="flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder={text.inputPlaceholder}
                  className="min-h-[56px] rounded-lg"
                />
                <Button
                  className="h-auto"
                  onClick={() => void sendMessage()}
                  disabled={!selectedCollabSessionId || !activeRunId || !chatInput.trim()}
                >
                  <Send className="mr-1 h-4 w-4" />
                  {text.send}
                </Button>
              </div>
              {statusText ? <p className="mt-1 text-xs text-zinc-500">{statusText}</p> : null}
            </div>
          </div>
        </main>
      </div>

      {createLayer}
      {detailLayer}
      {drawerLayer}
    </section>
  );
}
