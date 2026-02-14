"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, Settings2, Wrench } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../lib/i18n";

const STORAGE_KEY = "helios-settings-v1";

type AppSettings = {
  codexCommand: string;
  claudeCommand: string;
  defaultWorkspace: string;
  larkBound: boolean;
};

const defaultSettings: AppSettings = {
  codexCommand: "codex",
  claudeCommand: "claude",
  defaultWorkspace: "",
  larkBound: false
};

export default function SettingsPage() {
  const { locale } = useI18n();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  const text = useMemo(
    () =>
      locale === "zh"
        ? {
            title: "系统设置",
            subtitle: "配置本地工具路径与集成状态，供协作会话直接调用。",
            toolTitle: "本地开发工具",
            toolDesc: "这里配置可执行命令名或绝对路径，用于启动 codex / claude code。",
            codex: "Codex 命令",
            claude: "Claude 命令",
            workspace: "默认项目目录",
            save: "保存设置",
            saved: "已保存",
            integrationTitle: "第三方集成",
            integrationDesc: "绑定企业 IM 后，可将 NEED_USER_INPUT 通过卡片触达用户并回灌工具。",
            larkTitle: "飞书绑定",
            larkDesc: "推荐独立成页做引导，后续可以并列扩展 Discord/Slack/企业微信。",
            bound: "已绑定",
            unbound: "未绑定",
            openGuide: "打开绑定引导"
          }
        : {
            title: "Settings",
            subtitle: "Configure local tools and integrations for collaboration sessions.",
            toolTitle: "Local Dev Tools",
            toolDesc: "Set executable commands or absolute paths for codex / claude code.",
            codex: "Codex Command",
            claude: "Claude Command",
            workspace: "Default Workspace Path",
            save: "Save Settings",
            saved: "Saved",
            integrationTitle: "Integrations",
            integrationDesc: "After IM binding, NEED_USER_INPUT can be sent as cards and relayed to tool stdin.",
            larkTitle: "Lark Binding",
            larkDesc: "A dedicated guide page scales better for future Discord/Slack/WeCom integrations.",
            bound: "Bound",
            unbound: "Not Bound",
            openGuide: "Open Guide"
          },
    [locale]
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as AppSettings;
      setSettings({
        codexCommand: parsed.codexCommand || "codex",
        claudeCommand: parsed.claudeCommand || "claude",
        defaultWorkspace: parsed.defaultWorkspace || "",
        larkBound: Boolean(parsed.larkBound)
      });
    } catch {
      setSettings(defaultSettings);
    }
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">{text.title}</h2>
          <p className="text-sm text-muted-foreground">{text.subtitle}</p>
        </div>
        <Badge variant="secondary">
          <Settings2 className="mr-1 h-3 w-3" />
          Config
        </Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              {text.toolTitle}
            </CardTitle>
            <CardDescription>{text.toolDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">{text.codex}</p>
              <Input value={settings.codexCommand} onChange={(e) => update("codexCommand", e.target.value)} />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">{text.claude}</p>
              <Input value={settings.claudeCommand} onChange={(e) => update("claudeCommand", e.target.value)} />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">{text.workspace}</p>
              <Input
                placeholder="/Users/you/workspace/project"
                value={settings.defaultWorkspace}
                onChange={(e) => update("defaultWorkspace", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={persist}>{text.save}</Button>
              {saved ? (
                <span className="inline-flex items-center text-xs text-emerald-700">
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  {text.saved}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              {text.integrationTitle}
            </CardTitle>
            <CardDescription>{text.integrationDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-background/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{text.larkTitle}</p>
                  <p className="text-xs text-muted-foreground">{text.larkDesc}</p>
                </div>
                <Badge variant={settings.larkBound ? "default" : "outline"}>
                  {settings.larkBound ? text.bound : text.unbound}
                </Badge>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link href="/settings/lark">{text.openGuide}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
