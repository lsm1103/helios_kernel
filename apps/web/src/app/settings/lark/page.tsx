"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, CheckCircle2, ShieldCheck, Webhook } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { useI18n } from "../../../lib/i18n";

export default function LarkSettingsPage() {
  const { locale } = useI18n();

  const text = useMemo(
    () =>
      locale === "zh"
        ? {
            title: "飞书绑定引导",
            subtitle: "将飞书卡片选择回灌到工具 stdin 的最小接入流程。",
            securityTitle: "安全前置",
            securityDesc: "仅允许签名校验通过的回调进入交互处理。",
            stepTitle: "接入步骤",
            stepDesc: "按顺序完成即可联通 NEED_USER_INPUT 卡片链路。",
            step1: "在飞书开放平台创建自建应用并开启机器人能力。",
            step2: "配置事件订阅地址为 /api/webhooks/lark/interaction。",
            step3: "保存 Encrypt Key / Verification Token 到服务端环境变量。",
            step4: "在消息卡片中写入 interaction_request_id 并回传 answer。",
            step5: "收到回调后写入 /api/internal/tool-runs/:runId/stdin。",
            back: "返回设置页",
            ready: "MVP Ready"
          }
        : {
            title: "Lark Binding Guide",
            subtitle: "Minimum setup to relay Lark card decisions into tool stdin.",
            securityTitle: "Security Guardrails",
            securityDesc: "Only signature-verified callbacks should be accepted.",
            stepTitle: "Integration Steps",
            stepDesc: "Complete these steps in order for NEED_USER_INPUT card flow.",
            step1: "Create a custom app in Lark and enable bot capability.",
            step2: "Set event callback to /api/webhooks/lark/interaction.",
            step3: "Store Encrypt Key / Verification Token in backend env.",
            step4: "Include interaction_request_id and answer payload in cards.",
            step5: "Write callback result to /api/internal/tool-runs/:runId/stdin.",
            back: "Back to Settings",
            ready: "MVP Ready"
          },
    [locale]
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">{text.title}</h2>
          <p className="text-sm text-muted-foreground">{text.subtitle}</p>
        </div>
        <Badge variant="secondary">{text.ready}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {text.securityTitle}
          </CardTitle>
          <CardDescription>{text.securityDesc}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            {text.stepTitle}
          </CardTitle>
          <CardDescription>{text.stepDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>1. {text.step1}</p>
          <p>2. {text.step2}</p>
          <p>3. {text.step3}</p>
          <p>4. {text.step4}</p>
          <p>5. {text.step5}</p>
        </CardContent>
      </Card>

      <Button variant="outline" asChild>
        <Link href="/settings">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {text.back}
        </Link>
      </Button>
    </section>
  );
}
