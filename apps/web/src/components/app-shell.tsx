"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ClipboardList,
  Languages,
  LayoutDashboard,
  MessageSquareCode,
  Route,
  Settings2
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { I18nProvider, useI18n } from "../lib/i18n";

const navItems = [
  { href: "/", key: "dashboard", icon: LayoutDashboard, exact: true },
  { href: "/sessions/demo-session", key: "sessions", icon: Route },
  { href: "/tasks/demo-task", key: "tasks", icon: ClipboardList },
  { href: "/tools/demo-tool-session", key: "toolSessions", icon: MessageSquareCode },
  { href: "/settings", key: "settings", icon: Settings2 }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AppShellLayout>{children}</AppShellLayout>
    </I18nProvider>
  );
}

function AppShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale, dict } = useI18n();

  function toggleLocale() {
    setLocale(locale === "zh" ? "en" : "zh");
  }

  return (
    <div className="h-screen overflow-hidden bg-mesh-gradient">
      <div className="mx-auto flex h-screen w-full max-w-[1600px] px-4 py-4 md:px-6 lg:px-8">
        <aside className="hidden h-full w-72 shrink-0 flex-col overflow-y-auto rounded-3xl border bg-white/80 p-5 shadow-soft backdrop-blur xl:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">{dict.shell.productName}</p>
              <p className="text-lg font-extrabold">{dict.shell.productTagline}</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border bg-background/80 p-3">
            <Badge variant="secondary">{dict.shell.environment}</Badge>
            <p className="mt-2 text-sm text-muted-foreground">{dict.shell.environmentValue}</p>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl border bg-background/70 p-3">
            <Button variant="outline" size="sm" onClick={toggleLocale}>
              <Languages className="mr-2 h-4 w-4" />
              {dict.shell.languageToggle}
            </Button>
            <Badge>{dict.shell.live}</Badge>
          </div>

          <nav className="mt-8 flex flex-col gap-1">
            {navItems.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href.split("/demo-")[0]);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon size={16} className={cn("transition", active ? "text-primary-foreground" : "text-muted-foreground")} />
                  <span>{dict.shell.nav[item.key as keyof typeof dict.shell.nav]}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border bg-background/70 p-4">
            <p className="text-sm font-semibold">{dict.shell.bridgeTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{dict.shell.bridgeDesc}</p>
            <Button className="mt-3 w-full" variant="outline" asChild>
              <Link href="/settings">
                <Settings2 className="mr-2 h-4 w-4" />
                {dict.shell.openSettings}
              </Link>
            </Button>
          </div>
        </aside>

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden xl:pl-6">
          <main className="min-h-0 flex-1 overflow-y-auto rounded-2xl border bg-white/90 p-4 shadow-soft backdrop-blur md:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
