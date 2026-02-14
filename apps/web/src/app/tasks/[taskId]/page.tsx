"use client";

import { useParams } from "next/navigation";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { useI18n } from "../../../lib/i18n";

export default function TaskPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";
  const { dict } = useI18n();

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">{dict.task.title}</h2>
          <p className="text-sm text-muted-foreground">
            {dict.task.taskId}: {taskId}
          </p>
        </div>
        <Badge variant="secondary">{dict.task.running}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dict.task.executionTitle}</CardTitle>
            <CardDescription>{dict.task.executionDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {dict.task.provider}: codex
            </p>
            <p>
              {dict.task.runId}: run_demo_001
            </p>
            <p>
              {dict.task.toolSession}: toolsess_demo_01
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{dict.task.riskTitle}</CardTitle>
            <CardDescription>{dict.task.riskDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {dict.task.riskLevel}: L2
            </p>
            <p>
              {dict.task.approvalRequired}: {dict.task.yes}
            </p>
            <p>
              {dict.task.latestDecision}: {dict.task.pendingUserConfirmation}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
