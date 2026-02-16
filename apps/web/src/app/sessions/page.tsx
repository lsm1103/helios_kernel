"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Info, Plus, RefreshCcw } from "lucide-react";
import { createPortal } from "react-dom";
import { getJson, postJson } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";
import { filterSessionsByArchive } from "../../lib/session-workspace-logic";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

type CollabSession = {
  collabSessionId: string;
  name: string;
  description: string;
  status: "ACTIVE" | "ARCHIVED";
  workspacePath: string;
  activeTool?: "codex" | "claude_code";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export default function SessionsPage() {
  const router = useRouter();
  const { locale } = useI18n();

  const text = useMemo(
    () =>
      locale === "zh"
        ? {
            title: "协作会话",
            subtitle: "创建并管理协作会话，进入后在独立工作区执行开发任务。",
            create: "创建会话",
            refresh: "刷新",
            showArchived: "显示已归档",
            active: "进行中",
            archived: "已归档",
            empty: "当前没有会话，先创建一个。",
            name: "需求名称",
            desc: "需求描述",
            namePlaceholder: "例如：接入飞书机器人会话归档能力",
            descPlaceholder: "补充背景、目标和边界。",
            cancel: "取消",
            confirmCreate: "创建",
            enter: "进入会话",
            detail: "详情",
            archive: "归档",
            archiveConfirm: "确认归档该会话？归档后默认从活跃列表隐藏。",
            updatedAt: "更新时间",
            createdAt: "创建时间",
            workspacePath: "本地路径",
            activeTool: "当前工具",
            close: "关闭",
            requiredName: "需求名称必填",
            noDescription: "暂无描述",
            metadata: "元数据",
            detailTitle: "会话详情",
            createTitle: "创建协作会话",
            createDesc: "先手动输入名称和描述，后续可扩展为 LLM 自动生成草稿。",
            archiveDone: "会话已归档"
          }
        : {
            title: "Collab Sessions",
            subtitle: "Create and manage collab sessions, then execute work in a dedicated workspace.",
            create: "Create Session",
            refresh: "Refresh",
            showArchived: "Show Archived",
            active: "Active",
            archived: "Archived",
            empty: "No sessions yet. Create one first.",
            name: "Requirement Name",
            desc: "Requirement Description",
            namePlaceholder: "Example: add archive flow for Feishu bot sessions",
            descPlaceholder: "Describe goals, background, and boundaries.",
            cancel: "Cancel",
            confirmCreate: "Create",
            enter: "Enter",
            detail: "Detail",
            archive: "Archive",
            archiveConfirm: "Archive this session? It will be hidden from the default active list.",
            updatedAt: "Updated",
            createdAt: "Created",
            workspacePath: "Workspace Path",
            activeTool: "Active Tool",
            close: "Close",
            requiredName: "Name is required",
            noDescription: "No description",
            metadata: "Metadata",
            detailTitle: "Session Detail",
            createTitle: "Create Collaboration Session",
            createDesc: "Input name and description manually for now; LLM draft can be added later.",
            archiveDone: "Session archived"
          },
    [locale]
  );

  const [showArchived, setShowArchived] = useState(false);
  const [sessions, setSessions] = useState<CollabSession[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<CollabSession | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [statusText, setStatusText] = useState("");
  const [mounted, setMounted] = useState(false);

  async function refreshSessions(): Promise<void> {
    try {
      const query = showArchived ? "?include_archived=1" : "";
      const rows = await getJson<CollabSession[]>(`/v1/collab-sessions${query}`);
      setSessions(filterSessionsByArchive(rows, showArchived));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load sessions";
      setStatusText(message);
      setSessions([]);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [showArchived]);

  async function createSession(): Promise<void> {
    if (!name.trim()) {
      setStatusText(text.requiredName);
      return;
    }

    try {
      await postJson<CollabSession, { name: string; description: string }>("/v1/collab-sessions", {
        name: name.trim(),
        description: description.trim()
      });
      setCreateOpen(false);
      setName("");
      setDescription("");
      setStatusText("");
      await refreshSessions();
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
      await refreshSessions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to archive";
      setStatusText(message);
    }
  }

  function openDetail(row: CollabSession): void {
    setDetailTarget(row);
    setDetailOpen(true);
  }

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
            <div className="fixed inset-x-0 top-[8vh] z-50 mx-auto w-[92vw] max-w-2xl rounded-2xl border bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold">{text.detailTitle}</h3>
                  <p className="text-sm text-muted-foreground">{detailTarget.collabSessionId}</p>
                </div>
                <Badge variant={detailTarget.status === "ACTIVE" ? "default" : "secondary"}>
                  {detailTarget.status === "ACTIVE" ? text.active : text.archived}
                </Badge>
              </div>
              <div className="space-y-4 p-5 text-sm">
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
                    <p className="text-xs font-semibold text-muted-foreground">{text.activeTool}</p>
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

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">{text.title}</h2>
          <p className="text-sm text-muted-foreground">{text.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowArchived((prev) => !prev)}>
            {text.showArchived}
          </Button>
          <Button variant="outline" onClick={() => void refreshSessions()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {text.refresh}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {text.create}
          </Button>
        </div>
      </div>

      {statusText ? <p className="text-sm text-muted-foreground">{statusText}</p> : null}

      <div className="space-y-3">
        {sessions.length === 0 ? <p className="text-sm text-muted-foreground">{text.empty}</p> : null}
        {sessions.map((row) => (
          <Card key={row.collabSessionId}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="truncate">{row.name}</span>
                <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>
                  {row.status === "ACTIVE" ? text.active : text.archived}
                </Badge>
              </CardTitle>
              <CardDescription>{row.description || text.noDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
              <div className="text-xs text-muted-foreground">
                {text.updatedAt}: {new Date(row.updatedAt).toLocaleString()}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => router.push(`/sessions/${encodeURIComponent(row.collabSessionId)}`)}>
                  {text.enter}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openDetail(row)}>
                  <Info className="mr-1 h-4 w-4" />
                  {text.detail}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={row.status === "ARCHIVED"}
                  onClick={() => void archiveSession(row)}
                >
                  <Archive className="mr-1 h-4 w-4" />
                  {text.archive}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {createLayer}
      {detailLayer}
    </section>
  );
}
