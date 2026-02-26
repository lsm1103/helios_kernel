"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, Settings2, Wrench } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../lib/i18n";
import { getJson, postJson } from "../../lib/api-client";

const STORAGE_KEY = "helios-settings-v1";

type AppSettings = {
  codexCommand: string;
  claudeCommand: string;
  defaultWorkspace: string;
  larkBound: boolean;
};

type OrchestratorProvider = "openai" | "anthropic" | "volcengine_ark";

type OrchestratorSettings = {
  primary_provider: OrchestratorProvider;
  fallback_providers: OrchestratorProvider[];
  model: string;
  base_url: string;
  timeout_ms: number;
  temperature: number;
  max_tokens: number;
  api_key_masked: string;
  configured: boolean;
  updated_by: string;
  updated_at: string;
};

const defaultSettings: AppSettings = {
  codexCommand: "codex",
  claudeCommand: "claude",
  defaultWorkspace: "",
  larkBound: false
};

const defaultOrchestratorSettings: OrchestratorSettings = {
  primary_provider: "openai",
  fallback_providers: ["anthropic"],
  model: "",
  base_url: "",
  timeout_ms: 20000,
  temperature: 0.2,
  max_tokens: 1024,
  api_key_masked: "",
  configured: false,
  updated_by: "system",
  updated_at: ""
};

export default function SettingsPage() {
  const { locale } = useI18n();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [orchestrator, setOrchestrator] = useState<OrchestratorSettings>(defaultOrchestratorSettings);
  const [providerOptions, setProviderOptions] = useState<
    Array<{ provider: OrchestratorProvider; label: string }>
  >([
    { provider: "openai", label: "OpenAI" },
    { provider: "anthropic", label: "Anthropic" },
    { provider: "volcengine_ark", label: "Volcengine Ark" }
  ]);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [orchestratorSaved, setOrchestratorSaved] = useState(false);
  const [orchestratorStatusText, setOrchestratorStatusText] = useState("");

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
            openGuide: "打开绑定引导",
            orchestratorTitle: "主编排 LLM",
            orchestratorDesc: "负责需求分析、工具引导、HITL 转写、进度与完成汇报、归档摘要。",
            primaryProvider: "主供应商",
            fallbackProviders: "备用供应商",
            model: "模型",
            baseUrl: "Base URL",
            apiKey: "API Key",
            apiKeyMasked: "已保存密钥",
            timeoutMs: "超时 (ms)",
            temperature: "温度",
            maxTokens: "最大输出 tokens",
            saveOrchestrator: "保存编排配置",
            testConnection: "连通性测试",
            configured: "已配置",
            unconfigured: "未配置"
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
            openGuide: "Open Guide",
            orchestratorTitle: "Orchestrator LLM",
            orchestratorDesc: "Handles requirement analysis, tool guidance, HITL rewrite, progress and completion summaries.",
            primaryProvider: "Primary Provider",
            fallbackProviders: "Fallback Providers",
            model: "Model",
            baseUrl: "Base URL",
            apiKey: "API Key",
            apiKeyMasked: "Stored Key",
            timeoutMs: "Timeout (ms)",
            temperature: "Temperature",
            maxTokens: "Max Tokens",
            saveOrchestrator: "Save Orchestrator",
            testConnection: "Test Connection",
            configured: "Configured",
            unconfigured: "Not Configured"
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

  useEffect(() => {
    void (async () => {
      try {
        const [settingsResponse, providers] = await Promise.all([
          getJson<OrchestratorSettings>("/v1/orchestrator-llm/settings"),
          getJson<Array<{ provider: OrchestratorProvider; label: string }>>("/v1/orchestrator-llm/providers")
        ]);
        setOrchestrator(settingsResponse);
        if (providers.length > 0) {
          setProviderOptions(providers);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to load orchestrator settings";
        setOrchestratorStatusText(message);
      }
    })();
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
  }

  function toggleFallbackProvider(provider: OrchestratorProvider) {
    setOrchestrator((prev) => {
      if (provider === prev.primary_provider) {
        return prev;
      }
      const exists = prev.fallback_providers.includes(provider);
      return {
        ...prev,
        fallback_providers: exists
          ? prev.fallback_providers.filter((item) => item !== provider)
          : [...prev.fallback_providers, provider]
      };
    });
    setOrchestratorSaved(false);
  }

  async function saveOrchestratorSettings() {
    try {
      const next = await postJson<OrchestratorSettings>("/v1/orchestrator-llm/settings", {
        ...orchestrator,
        api_key: apiKeyInput.trim() || undefined,
        actor: "settings_ui"
      });
      setOrchestrator(next);
      setApiKeyInput("");
      setOrchestratorSaved(true);
      setOrchestratorStatusText("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to save orchestrator settings";
      setOrchestratorStatusText(message);
      setOrchestratorSaved(false);
    }
  }

  async function testConnection() {
    try {
      const result = await postJson<{ ok: boolean; provider: OrchestratorProvider; message: string }>(
        "/v1/orchestrator-llm/health-check",
        {
          provider: orchestrator.primary_provider
        }
      );
      setOrchestratorStatusText(`${result.provider}: ${result.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "health check failed";
      setOrchestratorStatusText(message);
    }
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

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{text.orchestratorTitle}</CardTitle>
            <CardDescription>{text.orchestratorDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{text.primaryProvider}</p>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={orchestrator.primary_provider}
                  onChange={(event) =>
                    setOrchestrator((prev) => ({
                      ...prev,
                      primary_provider: event.target.value as OrchestratorProvider,
                      fallback_providers: prev.fallback_providers.filter((item) => item !== event.target.value)
                    }))
                  }
                >
                  {providerOptions.map((option) => (
                    <option key={option.provider} value={option.provider}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{text.model}</p>
                <Input
                  value={orchestrator.model}
                  onChange={(event) => setOrchestrator((prev) => ({ ...prev, model: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{text.baseUrl}</p>
                <Input
                  value={orchestrator.base_url}
                  onChange={(event) => setOrchestrator((prev) => ({ ...prev, base_url: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{text.timeoutMs}</p>
                <Input
                  type="number"
                  value={orchestrator.timeout_ms}
                  onChange={(event) =>
                    setOrchestrator((prev) => ({ ...prev, timeout_ms: Number(event.target.value || 0) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{text.temperature}</p>
                <Input
                  type="number"
                  step="0.1"
                  value={orchestrator.temperature}
                  onChange={(event) =>
                    setOrchestrator((prev) => ({ ...prev, temperature: Number(event.target.value || 0) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{text.maxTokens}</p>
                <Input
                  type="number"
                  value={orchestrator.max_tokens}
                  onChange={(event) =>
                    setOrchestrator((prev) => ({ ...prev, max_tokens: Number(event.target.value || 0) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{text.fallbackProviders}</p>
              <div className="flex flex-wrap gap-2">
                {providerOptions.map((option) => (
                  <Button
                    key={option.provider}
                    size="sm"
                    variant={orchestrator.fallback_providers.includes(option.provider) ? "default" : "outline"}
                    disabled={option.provider === orchestrator.primary_provider}
                    onClick={() => toggleFallbackProvider(option.provider)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{text.apiKey}</p>
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{text.apiKeyMasked}</p>
                <Input disabled value={orchestrator.api_key_masked || "-"} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={orchestrator.configured ? "default" : "outline"}>
                {orchestrator.configured ? text.configured : text.unconfigured}
              </Badge>
              <Button onClick={() => void saveOrchestratorSettings()}>{text.saveOrchestrator}</Button>
              <Button variant="outline" onClick={() => void testConnection()}>
                {text.testConnection}
              </Button>
              {orchestratorSaved ? (
                <span className="inline-flex items-center text-xs text-emerald-700">
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  {text.saved}
                </span>
              ) : null}
            </div>

            {orchestratorStatusText ? <p className="text-xs text-muted-foreground">{orchestratorStatusText}</p> : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
