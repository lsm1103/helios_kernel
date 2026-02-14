"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronRight, Download, ListTree, MessagesSquare, RefreshCcw, X } from "lucide-react";
import { getJson, postJson } from "../../../lib/api-client";
import { useI18n } from "../../../lib/i18n";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";

type ToolProvider = "codex" | "claude_code";
type ToolSessionSource = "COLLAB" | "USER_OPENED";

type LinkedSession = {
  collabSessionId: string;
  provider: ToolProvider;
  source: ToolSessionSource;
  toolSessionId: string;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
  lastSummary150: string;
  lastActiveAt: string;
};

type LocalSession = {
  provider: ToolProvider;
  toolSessionId: string;
  summary150: string;
  cwd?: string;
  sourcePath: string;
  createdAt?: string;
  lastActiveAt: string;
};

type PeekResponse = {
  entries: string[];
};

type LocalTranscriptEntry = {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: string;
};

type LocalTranscriptResponse = {
  entries: LocalTranscriptEntry[];
};

type TranscriptEntry = {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: string;
};

type SelectedSession =
  | { kind: "linked"; data: LinkedSession }
  | { kind: "local"; data: LocalSession };

const PAGE_SIZE = 8;

export default function ToolSessionPage() {
  const params = useParams<{ toolSessionId: string }>();
  const routeToolSessionId = typeof params.toolSessionId === "string" ? params.toolSessionId : "";
  const { locale } = useI18n();

  const text = useMemo(
    () =>
      locale === "zh"
        ? {
            title: "工具会话中心",
            subtitle: "解析并展示 codex / claude 本地私有会话，支持导入系统并查看 transcript。",
            refresh: "刷新",
            all: "全部",
            collabTag: "协作创建",
            userTag: "用户打开",
            localTag: "本地私有",
            active: "活跃",
            paused: "暂停",
            empty: "暂无系统会话。",
            emptyLocal: "未扫描到本地会话。",
            transcriptTitle: "会话记录",
            transcriptDesc: "右侧抽屉显示当前选中会话的聊天记录。",
            noTranscript: "暂无可展示记录。",
            openDrawer: "查看记录",
            localSection: "本地扫描会话",
            linkedSection: "系统已连接会话",
            linkedDesc: "展示已经写入系统库的会话（含协作创建与用户导入）。",
            localDesc: "来自 Codex / Claude 本地私有文件。",
            importLabel: "导入到协作会话",
            importBtn: "导入",
            importedOk: "导入成功",
            importFail: "导入失败",
            prev: "上一页",
            next: "下一页",
            page: "页",
            of: "共"
          }
        : {
            title: "Tool Session Hub",
            subtitle: "Parse local private Codex/Claude sessions, import them, and inspect transcript.",
            refresh: "Refresh",
            all: "All",
            collabTag: "From collab",
            userTag: "Opened by user",
            localTag: "Local private",
            active: "Active",
            paused: "Paused",
            empty: "No linked sessions.",
            emptyLocal: "No local sessions found.",
            transcriptTitle: "Transcript",
            transcriptDesc: "Right drawer shows transcript for current selected session.",
            noTranscript: "No transcript entries.",
            openDrawer: "Open transcript",
            localSection: "Scanned Local Sessions",
            linkedSection: "Linked Sessions",
            linkedDesc: "Sessions persisted in system DB (from collab or user import).",
            localDesc: "Loaded from local private files of Codex / Claude.",
            importLabel: "Import to Collab Session",
            importBtn: "Import",
            importedOk: "Imported",
            importFail: "Import failed",
            prev: "Prev",
            next: "Next",
            page: "Page",
            of: "of"
          },
    [locale]
  );

  const [providerFilter, setProviderFilter] = useState<"all" | "codex" | "claude_code">("all");
  const [linkedSessions, setLinkedSessions] = useState<LinkedSession[]>([]);
  const [localSessions, setLocalSessions] = useState<LocalSession[]>([]);
  const [selected, setSelected] = useState<SelectedSession | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [importCollabId, setImportCollabId] = useState("user_manual");
  const [importStatus, setImportStatus] = useState("");
  const [localPage, setLocalPage] = useState(1);
  const [linkedPage, setLinkedPage] = useState(1);

  const totalLocalPages = Math.max(1, Math.ceil(localSessions.length / PAGE_SIZE));
  const totalLinkedPages = Math.max(1, Math.ceil(linkedSessions.length / PAGE_SIZE));

  const pagedLocalSessions = useMemo(
    () => localSessions.slice((localPage - 1) * PAGE_SIZE, localPage * PAGE_SIZE),
    [localSessions, localPage]
  );
  const pagedLinkedSessions = useMemo(
    () => linkedSessions.slice((linkedPage - 1) * PAGE_SIZE, linkedPage * PAGE_SIZE),
    [linkedSessions, linkedPage]
  );

  async function loadLinkedSessions() {
    const query =
      providerFilter === "all" ? "/v1/tool-sessions" : `/v1/tool-sessions?provider=${providerFilter}`;
    const rows = await getJson<LinkedSession[]>(query);
    setLinkedSessions(rows);
    return rows;
  }

  async function loadLocalSessions() {
    const query =
      providerFilter === "all"
        ? "/v1/local-tool-sessions?limit=300"
        : `/v1/local-tool-sessions?provider=${providerFilter}&limit=300`;
    const rows = await getJson<LocalSession[]>(query);
    setLocalSessions(rows);
    return rows;
  }

  async function refreshAll() {
    const [linked, local] = await Promise.all([loadLinkedSessions(), loadLocalSessions()]);

    if (selected) {
      if (selected.kind === "linked") {
        const latest = linked.find((row) => row.toolSessionId === selected.data.toolSessionId);
        if (latest) {
          setSelected({ kind: "linked", data: latest });
          return;
        }
      }
      if (selected.kind === "local") {
        const latest = local.find(
          (row) =>
            row.toolSessionId === selected.data.toolSessionId &&
            row.provider === selected.data.provider
        );
        if (latest) {
          setSelected({ kind: "local", data: latest });
          return;
        }
      }
    }

    const linkedFromRoute = linked.find((row) => row.toolSessionId === routeToolSessionId);
    if (linkedFromRoute) {
      setSelected({ kind: "linked", data: linkedFromRoute });
      return;
    }
    const localFromRoute = local.find((row) => row.toolSessionId === routeToolSessionId);
    if (localFromRoute) {
      setSelected({ kind: "local", data: localFromRoute });
      return;
    }
    if (linked.length > 0) {
      setSelected({ kind: "linked", data: linked[0] });
      return;
    }
    if (local.length > 0) {
      setSelected({ kind: "local", data: local[0] });
      return;
    }
    setSelected(null);
  }

  async function loadTranscript(target: SelectedSession) {
    if (target.kind === "linked") {
      const response = await getJson<PeekResponse>(
        `/v1/collab-sessions/${encodeURIComponent(target.data.collabSessionId)}/tool-sessions/${encodeURIComponent(target.data.toolSessionId)}/peek?limit=100`
      );
      setTranscript((response.entries ?? []).map((textItem) => ({ role: "system", text: textItem })));
      return;
    }

    const response = await getJson<LocalTranscriptResponse>(
      `/v1/local-tool-sessions/${target.data.provider}/${encodeURIComponent(target.data.toolSessionId)}/transcript?limit=300`
    );
    setTranscript(response.entries ?? []);
  }

  useEffect(() => {
    void refreshAll();
  }, [providerFilter, routeToolSessionId]);

  useEffect(() => {
    if (localPage > totalLocalPages) {
      setLocalPage(totalLocalPages);
    }
  }, [localPage, totalLocalPages]);

  useEffect(() => {
    if (linkedPage > totalLinkedPages) {
      setLinkedPage(totalLinkedPages);
    }
  }, [linkedPage, totalLinkedPages]);

  useEffect(() => {
    setLocalPage(1);
    setLinkedPage(1);
  }, [providerFilter]);

  useEffect(() => {
    if (!selected) {
      setTranscript([]);
      return;
    }
    void loadTranscript(selected);
  }, [selected?.kind, selected?.data.toolSessionId]);

  function sourceLabel(source: ToolSessionSource) {
    return source === "COLLAB" ? text.collabTag : text.userTag;
  }

  async function importLocalSession(row: LocalSession) {
    try {
      await postJson("/v1/tool-sessions", {
        collab_session_id: importCollabId.trim() || "user_manual",
        task_id: `task_import_${Date.now()}`,
        provider: row.provider,
        source: "USER_OPENED",
        tool_session_id: row.toolSessionId,
        summary_150: row.summary150
      });
      setImportStatus(text.importedOk);
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : text.importFail;
      setImportStatus(`${text.importFail}: ${message}`);
    }
  }

  function isSelectedLinked(row: LinkedSession) {
    return selected?.kind === "linked" && selected.data.toolSessionId === row.toolSessionId;
  }

  function isSelectedLocal(row: LocalSession) {
    return (
      selected?.kind === "local" &&
      selected.data.toolSessionId === row.toolSessionId &&
      selected.data.provider === row.provider
    );
  }

  return (
    <section className="relative">
      <div className="relative min-h-[76vh]">
        <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">{text.title}</h2>
          <p className="text-sm text-muted-foreground">{text.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={providerFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setProviderFilter("all")}
          >
            {text.all}
          </Button>
          <Button
            variant={providerFilter === "codex" ? "default" : "outline"}
            size="sm"
            onClick={() => setProviderFilter("codex")}
          >
            Codex
          </Button>
          <Button
            variant={providerFilter === "claude_code" ? "default" : "outline"}
            size="sm"
            onClick={() => setProviderFilter("claude_code")}
          >
            Claude Code
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refreshAll()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {text.refresh}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListTree className="h-4 w-4" />
            {text.localSection}
          </CardTitle>
          <CardDescription>{text.localDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{text.importLabel}</p>
            <div className="flex gap-2">
              <Input value={importCollabId} onChange={(e) => setImportCollabId(e.target.value)} />
              <Badge variant="secondary">{text.userTag}</Badge>
            </div>
            {importStatus ? <p className="mt-2 text-xs text-muted-foreground">{importStatus}</p> : null}
          </div>

          {localSessions.length === 0 ? <p className="text-sm text-muted-foreground">{text.emptyLocal}</p> : null}
          {pagedLocalSessions.map((row) => (
            <div
              key={`${row.provider}_${row.toolSessionId}`}
              className={`flex items-center justify-between rounded-xl border p-3 ${
                isSelectedLocal(row) ? "border-primary bg-primary/5" : ""
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setSelected({ kind: "local", data: row });
                  setDrawerOpen(true);
                }}
              >
                <p className="truncate font-semibold">{row.toolSessionId}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.provider} · {row.cwd || row.sourcePath}
                </p>
                <div className="mt-1 flex gap-2">
                  <Badge variant="outline">{text.localTag}</Badge>
                </div>
              </button>
              <div className="ml-3 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void importLocalSession(row)}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  {text.importBtn}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelected({ kind: "local", data: row });
                    setDrawerOpen(true);
                  }}
                >
                  {text.openDrawer}
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
          {localSessions.length > 0 ? (
            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {text.page} {localPage} {text.of} {totalLocalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={localPage <= 1}
                  onClick={() => setLocalPage((prev) => Math.max(1, prev - 1))}
                >
                  {text.prev}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={localPage >= totalLocalPages}
                  onClick={() => setLocalPage((prev) => Math.min(totalLocalPages, prev + 1))}
                >
                  {text.next}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListTree className="h-4 w-4" />
            {text.linkedSection}
          </CardTitle>
          <CardDescription>{text.linkedDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedSessions.length === 0 ? <p className="text-sm text-muted-foreground">{text.empty}</p> : null}
          {pagedLinkedSessions.map((row) => (
            <button
              key={row.toolSessionId}
              type="button"
              onClick={() => {
                setSelected({ kind: "linked", data: row });
                setDrawerOpen(true);
              }}
              className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                isSelectedLinked(row) ? "border-primary bg-primary/5" : "hover:bg-muted"
              }`}
            >
              <div>
                <p className="font-semibold">{row.toolSessionId}</p>
                <p className="text-xs text-muted-foreground">
                  {row.provider} · {row.collabSessionId}
                </p>
                <div className="mt-1 flex gap-2">
                  <Badge variant="outline">{sourceLabel(row.source)}</Badge>
                  <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>
                    {row.status === "ACTIVE" ? text.active : text.paused}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  {text.openDrawer}
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
          {linkedSessions.length > 0 ? (
            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {text.page} {linkedPage} {text.of} {totalLinkedPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={linkedPage <= 1}
                  onClick={() => setLinkedPage((prev) => Math.max(1, prev - 1))}
                >
                  {text.prev}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={linkedPage >= totalLinkedPages}
                  onClick={() => setLinkedPage((prev) => Math.min(totalLinkedPages, prev + 1))}
                >
                  {text.next}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {drawerOpen ? (
        <button
          type="button"
          aria-label="close drawer backdrop"
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}
      </div>
      <aside
        className={`fixed inset-y-0 right-0 z-50 h-screen w-full border-l bg-white shadow-2xl transition-transform duration-300 sm:w-[72%] lg:w-[42%] lg:min-w-[560px] ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{text.transcriptTitle}</p>
              <h3 className="text-lg font-bold">{selected?.data.toolSessionId ?? "-"}</h3>
              <p className="text-xs text-muted-foreground">
                {selected?.kind === "local"
                  ? text.localTag
                  : selected?.kind === "linked"
                    ? sourceLabel(selected.data.source)
                    : "-"}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-5">
            {selected?.kind === "linked" ? (
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-sm">{selected.data.lastSummary150 || "-"}</p>
              </div>
            ) : null}
            {selected?.kind === "local" ? (
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-sm">{selected.data.summary150 || "-"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{selected.data.cwd || selected.data.sourcePath}</p>
              </div>
            ) : null}

            {transcript.length === 0 ? <p className="text-sm text-muted-foreground">{text.noTranscript}</p> : null}
            {transcript.map((entry, index) => (
              <div key={`${index}_${entry.text.slice(0, 20)}`} className="rounded-xl border p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <MessagesSquare className="h-3.5 w-3.5" />
                  {entry.role}
                  {entry.timestamp ? <span>· {entry.timestamp}</span> : null}
                </div>
                <p className="whitespace-pre-wrap text-sm">{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
      </div>
    </section>
  );
}
