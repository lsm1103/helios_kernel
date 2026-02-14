"use client";

import { Activity, CircleGauge, Link2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { useI18n } from "../lib/i18n";

export default function HomePage() {
  const { dict } = useI18n();

  const statCards = [
    {
      label: dict.home.stats.activeCollabSessions,
      value: "12",
      delta: dict.home.stats.plus3Today,
      icon: Activity
    },
    {
      label: dict.home.stats.linkedToolSessions,
      value: "29",
      delta: dict.home.stats.pendingReview,
      icon: Link2
    },
    {
      label: dict.home.stats.hitlRequests,
      value: "7",
      delta: dict.home.stats.unresolved,
      icon: CircleGauge
    },
    {
      label: dict.home.stats.policyAlerts,
      value: "1",
      delta: dict.home.stats.approvalRequired,
      icon: ShieldCheck
    }
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">{dict.home.title}</h2>
          <p className="text-sm text-muted-foreground">{dict.home.subtitle}</p>
        </div>
        <Badge variant="secondary">{dict.home.mvp}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center justify-between">
                  {stat.label}
                  <Icon className="h-4 w-4" />
                </CardDescription>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">{stat.delta}</CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict.home.whatYouCanDo}</CardTitle>
          <CardDescription>{dict.home.quickGuide}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-semibold">{dict.home.sessions}</p>
            <p className="text-muted-foreground">{dict.home.sessionsDesc}</p>
          </div>
          <Separator />
          <div>
            <p className="font-semibold">{dict.home.tasks}</p>
            <p className="text-muted-foreground">{dict.home.tasksDesc}</p>
          </div>
          <Separator />
          <div>
            <p className="font-semibold">{dict.home.toolSessions}</p>
            <p className="text-muted-foreground">{dict.home.toolSessionsDesc}</p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
