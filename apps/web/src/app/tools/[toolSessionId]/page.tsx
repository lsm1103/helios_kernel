"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronRight, Download, MessagesSquare, RefreshCcw, X } from "lucide-react";
import { createPortal } from "react-dom";
import { getJson, postJson } from "../../../lib/api-client";
import { useI18n } from "../../../lib/i18n";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";

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
            subtitle: "统一查看本地扫描会话与系统已连接会话。",
            refresh: "刷新",
            all: "全部",
            codex: "Codex",
            claude: "Claude Code",
            collabTag: "协作创建",
            userTag: "用户打开",
            localTag: "本地私有",
            active: "活跃",
            paused: "暂停",
            transcriptTitle: "会话记录",
            noTranscript: "暂无可展示记录。",
            openDrawer: "查看记录",
            sourceFilter: "来源筛选",
            sourceAll: "全部",
            sourceLocal: "本地扫描",
            sourceLinked: "系统已连接",
            providerFilter: "工具",
            importBtn: "导入",
            importedOk: "导入成功",
            importFail: "导入失败",
            prev: "上一页",
            next: "下一页",
            page: "页",
            of: "共",
            emptyList: "当前筛选条件下没有会话。"
          }
        : {
            title: "Tool Session Hub",
            subtitle: "View local scanned sessions and linked sessions in one list.",
            refresh: "Refresh",
            all: "All",
            codex: "Codex",
            claude: "Claude Code",
            collabTag: "From collab",
            userTag: "Opened by user",
            localTag: "Local private",
            active: "Active",
            paused: "Paused",
            transcriptTitle: "Transcript",
            noTranscript: "No transcript entries.",
            openDrawer: "Open transcript",
            sourceFilter: "Source Filter",
            sourceAll: "All",
            sourceLocal: "Local Scanned",
            sourceLinked: "Linked",
            providerFilter: "Provider",
            importBtn: "Import",
            importedOk: "Imported",
            importFail: "Import failed",
            prev: "Prev",
            next: "Next",
            page: "Page",
            of: "of",
            emptyList: "No sessions under current filters."
          },
    [locale]
  );

  const [providerFilter, setProviderFilter] = useState<"all" | "codex" | "claude_code">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "local" | "linked">("all");
  const [linkedSessions, setLinkedSessions] = useState<LinkedSession[]>([]);
  const [localSessions, setLocalSessions] = useState<LocalSession[]>([]);
  const [selected, setSelected] = useState<SelectedSession | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [importStatus, setImportStatus] = useState("");
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false);

  const filteredSessions = useMemo(() => {
    const rows: SelectedSession[] = [];

    if (sourceFilter === "all" || sourceFilter === "local") {
      for (const row of localSessions) {
        rows.push({ kind: "local", data: row });
      }
    }

    if (sourceFilter === "all" || sourceFilter === "linked") {
      for (const row of linkedSessions) {
        rows.push({ kind: "linked", data: row });
      }
    }

    return rows.sort((a, b) => Date.parse(b.data.lastActiveAt) - Date.parse(a.data.lastActiveAt));
  }, [sourceFilter, localSessions, linkedSessions]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const pagedSessions = useMemo(
    () => filteredSessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredSessions, page]
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
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [providerFilter, sourceFilter]);

  useEffect(() => {
    if (!selected) {
      setTranscript([]);
      return;
    }
    void loadTranscript(selected);
  }, [selected?.kind, selected?.data.toolSessionId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  function sourceLabel(source: ToolSessionSource) {
    return source === "COLLAB" ? text.collabTag : text.userTag;
  }

  async function importLocalSession(row: LocalSession) {
    try {
      await postJson("/v1/tool-sessions", {
        collab_session_id: "user_manual",
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

  function isSelectedEntry(entry: SelectedSession) {
    if (!selected || selected.kind !== entry.kind) {
      return false;
    }
    if (entry.kind === "local") {
      return (
        selected.data.toolSessionId === entry.data.toolSessionId &&
        selected.data.provider === entry.data.provider
      );
    }
    return selected.data.toolSessionId === entry.data.toolSessionId;
  }

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
            <aside className="fixed inset-y-0 right-0 z-50 h-screen w-full border-l bg-white shadow-2xl transition-transform duration-300 sm:w-[80%] lg:w-1/2 lg:min-w-[640px]">
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selected.data.cwd || selected.data.sourcePath}
                      </p>
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
          </>,
          document.body
        )
      : null;

  return (
    <section className="relative">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold">{text.title}</h2>
            <p className="text-sm text-muted-foreground">{text.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={sourceFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setSourceFilter("all")}>
              {text.sourceAll}
            </Button>
            <Button variant={sourceFilter === "local" ? "default" : "outline"} size="sm" onClick={() => setSourceFilter("local")}>
              {text.sourceLocal}
            </Button>
            <Button variant={sourceFilter === "linked" ? "default" : "outline"} size="sm" onClick={() => setSourceFilter("linked")}>
              {text.sourceLinked}
            </Button>
            <Button variant={providerFilter === "codex" ? "default" : "outline"} size="sm" onClick={() => setProviderFilter("codex")}>
              {text.codex}
            </Button>
            <Button variant={providerFilter === "claude_code" ? "default" : "outline"} size="sm" onClick={() => setProviderFilter("claude_code")}>
              {text.claude}
            </Button>
            <Button variant={providerFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setProviderFilter("all")}>
              {text.all}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {text.refresh}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4">
            {importStatus ? <p className="text-xs text-muted-foreground">{importStatus}</p> : null}

            {filteredSessions.length === 0 ? <p className="text-sm text-muted-foreground">{text.emptyList}</p> : null}

            {pagedSessions.map((entry, index) => {
              const row = entry.data;
              const isLocal = entry.kind === "local";
              return (
                <div
                  key={`${entry.kind}_${row.toolSessionId}_${index}`}
                  role="button"
                  tabIndex={0}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${
                    isSelectedEntry(entry) ? "border-primary bg-primary/5" : ""
                  }`}
                  onClick={() => {
                    setSelected(entry);
                    setDrawerOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(entry);
                      setDrawerOpen(true);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate font-semibold">{row.toolSessionId}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.provider} · {isLocal ? ((row as LocalSession).cwd || (row as LocalSession).sourcePath) : (row as LinkedSession).collabSessionId}
                    </p>
                    <div className="mt-1 flex gap-2">
                      <Badge variant="outline">
                        {isLocal ? text.localTag : sourceLabel((row as LinkedSession).source)}
                      </Badge>
                      {!isLocal ? (
                        <Badge variant={(row as LinkedSession).status === "ACTIVE" ? "default" : "secondary"}>
                          {(row as LinkedSession).status === "ACTIVE" ? text.active : text.paused}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    {isLocal ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void importLocalSession(row as LocalSession);
                        }}
                      >
                        <Download className="mr-2 h-3.5 w-3.5" />
                        {text.importBtn}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(entry);
                        setDrawerOpen(true);
                      }}
                    >
                      {text.openDrawer}
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}

            {filteredSessions.length > 0 ? (
              <div className="flex items-center justify-between border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  {text.page} {page} {text.of} {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                    {text.prev}
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                    {text.next}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {drawerLayer}
    </section>
  );
}
