"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageSquare, Play, Send, Sparkles, TerminalSquare } from "lucide-react";
import { getJson, postJson } from "../../../lib/api-client";
import { useI18n } from "../../../lib/i18n";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";

type ToolProvider = "codex" | "claude_code";
type ToolSessionSource = "COLLAB" | "USER_OPENED";

type ToolSessionLink = {
  toolSessionId: string;
  provider: ToolProvider;
  source: ToolSessionSource;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
  lastSummary150: string;
  lastActiveAt: string;
};

type RunRecord = {
  runId?: string;
  run_id?: string;
  status?: string;
};

type OutputRow = {
  data: string;
  receivedAt?: string;
};

type OutputResponse = {
  output: OutputRow[];
};

type InteractionRequest = {
  interactionRequestId: string;
  runId: string;
  prompt: string;
  options: string[];
  createdAt: string;
  toolSessionId: string;
};

type InteractionApiRecord = {
  interactionRequestId?: string;
  interaction_request_id?: string;
  runId?: string;
  run_id?: string;
  prompt: string;
  options?: string[];
  createdAt?: string;
  created_at?: string;
  toolSessionId?: string;
  tool_session_id?: string;
};

type ChatRow = {
  id: string;
  role: "system" | "user" | "tool";
  content: string;
  ts: string;
};

const SETTINGS_STORAGE_KEY = "helios-settings-v1";

function toInteraction(record: InteractionApiRecord): InteractionRequest {
  return {
    interactionRequestId: String(record.interactionRequestId ?? record.interaction_request_id ?? ""),
    runId: String(record.runId ?? record.run_id ?? ""),
    prompt: record.prompt,
    options: record.options ?? [],
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    toolSessionId: String(record.toolSessionId ?? record.tool_session_id ?? "")
  };
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
            title: "协作会话工作台",
            subtitle: "在同一个会话里完成任务规划、工具接入、执行与人工确认。",
            openSession: "打开会话",
            openSessionHint: "输入会话 ID 后跳转",
            taskCard: "任务规划",
            taskCardDesc: "任务 ID 与执行目标",
            taskId: "任务 ID",
            taskGoal: "任务目标",
            pathCard: "本地项目目录",
            pathDesc: "用于启动 codex / claude 的 cwd",
            providerCard: "工具与会话",
            providerDesc: "选择 provider 与接续方式",
            modeNew: "新开工具会话",
            modeResume: "接续已有会话",
            selectSession: "选择已有工具会话",
            startRun: "启动执行",
            chooseTool: "选择工具",
            prompt: "给工具的指令",
            promptPlaceholder: "例如：把 interaction_requests 改成 SQLite 并补测试",
            chatTitle: "协作对话",
            chatDesc: "支持持续对话并实时查看工具输出",
            send: "发送",
            needInputTitle: "待你选择",
            needInputDesc: "来自工具 NEED_USER_INPUT 的操作卡片",
            choose: "选择",
            inputReply: "自定义回复",
            pendingNone: "当前没有待处理交互请求。",
            runStarted: "已启动运行",
            startFailed: "启动失败",
            chatPlaceholder: "继续给工具发送下一步要求...",
            toolSourceCollab: "协作创建",
            toolSourceUser: "用户打开",
            active: "活跃",
            paused: "暂停",
            system: "系统",
            tool: "工具",
            you: "你"
          }
        : {
            title: "Collaboration Workbench",
            subtitle: "Plan tasks, pick tools, execute runs, and handle approvals in one session.",
            openSession: "Open Session",
            openSessionHint: "Jump by session ID",
            taskCard: "Task Planning",
            taskCardDesc: "Task identity and execution target",
            taskId: "Task ID",
            taskGoal: "Task Goal",
            pathCard: "Local Workspace Path",
            pathDesc: "cwd used to start codex / claude",
            providerCard: "Tool & Session",
            providerDesc: "Pick provider and run mode",
            modeNew: "Start New Tool Session",
            modeResume: "Resume Existing Session",
            selectSession: "Select Existing Tool Session",
            startRun: "Start Run",
            chooseTool: "Choose Tool",
            prompt: "Prompt to Tool",
            promptPlaceholder: "Example: migrate interaction_requests to SQLite and add tests",
            chatTitle: "Collab Chat",
            chatDesc: "Continue conversation and stream tool output",
            send: "Send",
            needInputTitle: "Action Required",
            needInputDesc: "Interactive cards from NEED_USER_INPUT",
            choose: "Choose",
            inputReply: "Custom Reply",
            pendingNone: "No pending interaction requests.",
            runStarted: "Run started",
            startFailed: "Start failed",
            chatPlaceholder: "Send the next instruction to the tool...",
            toolSourceCollab: "From collab",
            toolSourceUser: "Opened by user",
            active: "Active",
            paused: "Paused",
            system: "System",
            tool: "Tool",
            you: "You"
          },
    [locale]
  );

  const [jumpId, setJumpId] = useState(collabSessionId);
  const [taskId, setTaskId] = useState(`task_${Date.now()}`);
  const [taskGoal, setTaskGoal] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [provider, setProvider] = useState<ToolProvider>("codex");
  const [mode, setMode] = useState<"new" | "resume">("new");
  const [prompt, setPrompt] = useState("");
  const [toolSessions, setToolSessions] = useState<ToolSessionLink[]>([]);
  const [selectedToolSessionId, setSelectedToolSessionId] = useState("");
  const [activeRunId, setActiveRunId] = useState("");
  const [runOutput, setRunOutput] = useState<OutputRow[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatRows, setChatRows] = useState<ChatRow[]>([]);
  const [pendingInteractions, setPendingInteractions] = useState<InteractionRequest[]>([]);
  const [pendingReply, setPendingReply] = useState<Record<string, string>>({});
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { defaultWorkspace?: string };
      if (parsed.defaultWorkspace) {
        setWorkspacePath(parsed.defaultWorkspace);
      }
    } catch {
      // ignore parse failure
    }
  }, []);

  useEffect(() => {
    setJumpId(collabSessionId);
  }, [collabSessionId]);

  async function refreshToolSessions() {
    try {
      const rows = await getJson<ToolSessionLink[]>(`/v1/collab-sessions/${collabSessionId}/tool-sessions`);
      setToolSessions(rows);
      if (!selectedToolSessionId && rows.length > 0) {
        setSelectedToolSessionId(rows[0].toolSessionId);
      }
    } catch {
      // ignore for now
    }
  }

  async function refreshPendingInteractions() {
    try {
      const rows = await getJson<InteractionApiRecord[]>(
        `/internal/interaction-requests/pending?collab_session_id=${encodeURIComponent(collabSessionId)}`
      );
      setPendingInteractions(rows.map((row) => toInteraction(row)));
    } catch {
      // ignore for now
    }
  }

  useEffect(() => {
    void refreshToolSessions();
    void refreshPendingInteractions();
  }, [collabSessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPendingInteractions();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [collabSessionId]);

  useEffect(() => {
    if (!activeRunId) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const result = await getJson<OutputResponse>(
          `/internal/tool-runs/${encodeURIComponent(activeRunId)}/output?limit=300`
        );
        setRunOutput((prev) => {
          if (result.output.length <= prev.length) {
            return prev;
          }
          const delta = result.output.slice(prev.length);
          const newRows = [...prev, ...delta];

          const converted = delta.map((item) => ({
            id: `${Date.now()}_${Math.random()}`,
            role: "tool" as const,
            content: item.data.trim() || item.data,
            ts: new Date().toISOString()
          }));

          if (converted.length > 0) {
            setChatRows((existing) => [...existing, ...converted]);
          }

          return newRows;
        });
      } catch {
        // keep quiet during polling
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [activeRunId]);

  function openAnotherSession() {
    if (!jumpId.trim()) {
      return;
    }
    router.push(`/sessions/${encodeURIComponent(jumpId.trim())}`);
  }

  async function startRun() {
    try {
      const currentToolSessionId =
        mode === "resume" && selectedToolSessionId ? selectedToolSessionId : `toolsess_${Date.now()}`;

      if (mode === "new" || !selectedToolSessionId) {
        await postJson("/v1/tool-sessions", {
          collab_session_id: collabSessionId,
          task_id: taskId.trim() || `task_${Date.now()}`,
          provider,
          source: "COLLAB",
          tool_session_id: currentToolSessionId,
          summary_150: taskGoal.slice(0, 150)
        });
        await refreshToolSessions();
        setSelectedToolSessionId(currentToolSessionId);
      }

      const run = await postJson<RunRecord>("/internal/tool-runs/start", {
        collab_session_id: collabSessionId,
        task_id: taskId.trim() || `task_${Date.now()}`,
        tool_session_id: currentToolSessionId,
        provider,
        prompt: prompt.trim() || taskGoal.trim() || "Start execution for this task.",
        session_id: mode === "resume" ? currentToolSessionId : undefined,
        cwd: workspacePath.trim() || undefined
      });

      const runId = run.runId ?? run.run_id ?? "";
      setActiveRunId(runId);
      setRunOutput([]);
      setStatusText(`${text.runStarted}: ${runId}`);
      setChatRows((prev) => [
        ...prev,
        {
          id: `${Date.now()}_${Math.random()}`,
          role: "system",
          content: `${text.runStarted} (${provider} / ${currentToolSessionId})`,
          ts: new Date().toISOString()
        }
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : text.startFailed;
      setStatusText(`${text.startFailed}: ${message}`);
    }
  }

  async function sendChatMessage() {
    if (!activeRunId || !chatInput.trim()) {
      return;
    }
    const content = chatInput.trim();
    setChatRows((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random()}`,
        role: "user",
        content,
        ts: new Date().toISOString()
      }
    ]);
    setChatInput("");

    try {
      await postJson(`/internal/tool-runs/${encodeURIComponent(activeRunId)}/stdin/raw`, {
        stdin_text: content
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "send failed";
      setChatRows((prev) => [
        ...prev,
        {
          id: `${Date.now()}_${Math.random()}`,
          role: "system",
          content: message,
          ts: new Date().toISOString()
        }
      ]);
    }
  }

  async function resolveInteraction(interaction: InteractionRequest, answerValue: string) {
    if (!answerValue.trim()) {
      return;
    }

    try {
      await postJson(`/internal/tool-runs/${encodeURIComponent(interaction.runId)}/stdin`, {
        interaction_request_id: interaction.interactionRequestId,
        stdin_text: `${answerValue.trim()}\n`,
        idempotency_key: `${interaction.interactionRequestId}_${Date.now()}`
      });

      setChatRows((prev) => [
        ...prev,
        {
          id: `${Date.now()}_${Math.random()}`,
          role: "system",
          content: `HITL: ${interaction.prompt} => ${answerValue.trim()}`,
          ts: new Date().toISOString()
        }
      ]);
      setPendingReply((prev) => ({ ...prev, [interaction.interactionRequestId]: "" }));
      await refreshPendingInteractions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "resolve failed";
      setStatusText(message);
    }
  }

  function labelForSource(source: ToolSessionSource) {
    return source === "COLLAB" ? text.toolSourceCollab : text.toolSourceUser;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">{text.title}</h2>
          <p className="text-sm text-muted-foreground">{text.subtitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">ID: {collabSessionId}</p>
        </div>
        <Badge>{text.active}</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>{text.openSession}</CardTitle>
            <CardDescription>{text.openSessionHint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input value={jumpId} onChange={(e) => setJumpId(e.target.value)} />
            <Button className="w-full" variant="outline" onClick={openAnotherSession}>
              {text.openSession}
            </Button>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>{text.taskCard}</CardTitle>
            <CardDescription>{text.taskCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">{text.taskId}</p>
            <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} />
            <p className="text-xs font-semibold text-muted-foreground">{text.taskGoal}</p>
            <Textarea value={taskGoal} onChange={(e) => setTaskGoal(e.target.value)} className="min-h-[88px]" />
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>{text.pathCard}</CardTitle>
            <CardDescription>{text.pathDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Input value={workspacePath} onChange={(e) => setWorkspacePath(e.target.value)} placeholder="/path/to/repo" />
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>{text.providerCard}</CardTitle>
            <CardDescription>{text.providerDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={provider === "codex" ? "default" : "outline"}
                size="sm"
                onClick={() => setProvider("codex")}
              >
                Codex
              </Button>
              <Button
                variant={provider === "claude_code" ? "default" : "outline"}
                size="sm"
                onClick={() => setProvider("claude_code")}
              >
                Claude Code
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant={mode === "new" ? "default" : "outline"} size="sm" onClick={() => setMode("new")}>
                {text.modeNew}
              </Button>
              <Button
                variant={mode === "resume" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("resume")}
              >
                {text.modeResume}
              </Button>
            </div>

            <p className="text-xs font-semibold text-muted-foreground">{text.selectSession}</p>
            <div className="max-h-28 space-y-2 overflow-y-auto rounded-lg border p-2">
              {toolSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">-</p>
              ) : (
                toolSessions.map((item) => (
                  <button
                    key={item.toolSessionId}
                    type="button"
                    className={`w-full rounded-md border px-2 py-1 text-left text-xs ${
                      selectedToolSessionId === item.toolSessionId ? "border-primary bg-primary/10" : "border-border"
                    }`}
                    onClick={() => setSelectedToolSessionId(item.toolSessionId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{item.toolSessionId}</span>
                      <Badge variant={item.status === "ACTIVE" ? "default" : "outline"}>
                        {item.status === "ACTIVE" ? text.active : text.paused}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {item.provider} · {labelForSource(item.source)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4" />
            {text.chooseTool}
          </CardTitle>
          <CardDescription>{text.prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={text.promptPlaceholder}
            className="min-h-[96px]"
          />
          <div className="flex items-center gap-2">
            <Button onClick={startRun}>
              <Play className="mr-2 h-4 w-4" />
              {text.startRun}
            </Button>
            {statusText ? <p className="text-xs text-muted-foreground">{statusText}</p> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {text.chatTitle}
            </CardTitle>
            <CardDescription>{text.chatDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-xl border bg-background/60 p-3">
              {chatRows.map((row) => (
                <div key={row.id} className="rounded-lg border bg-card p-2">
                  <p className="text-xs text-muted-foreground">
                    {row.role === "system" ? text.system : row.role === "user" ? text.you : text.tool}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{row.content}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void sendChatMessage();
                  }
                }}
                placeholder={text.chatPlaceholder}
              />
              <Button onClick={sendChatMessage} disabled={!activeRunId}>
                <Send className="mr-2 h-4 w-4" />
                {text.send}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {text.needInputTitle}
            </CardTitle>
            <CardDescription>{text.needInputDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInteractions.length === 0 ? <p className="text-sm text-muted-foreground">{text.pendingNone}</p> : null}
            {pendingInteractions.map((item) => (
              <div key={item.interactionRequestId} className="rounded-xl border bg-background/70 p-3">
                <p className="text-sm font-semibold">{item.prompt}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.toolSessionId} · {item.runId}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.options.map((choice) => (
                    <Button
                      key={choice}
                      variant="outline"
                      size="sm"
                      onClick={() => void resolveInteraction(item, choice)}
                    >
                      {text.choose}: {choice}
                    </Button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={pendingReply[item.interactionRequestId] ?? ""}
                    onChange={(e) =>
                      setPendingReply((prev) => ({ ...prev, [item.interactionRequestId]: e.target.value }))
                    }
                    placeholder={text.inputReply}
                  />
                  <Button
                    size="sm"
                    onClick={() => void resolveInteraction(item, pendingReply[item.interactionRequestId] ?? "")}
                  >
                    {text.send}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
