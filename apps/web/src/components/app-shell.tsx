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
  { href: "/sessions", key: "sessions", icon: Route },
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
  const isSessionsRoute = pathname.startsWith("/sessions");

  function toggleLocale() {
    setLocale(locale === "zh" ? "en" : "zh");
  }

  return (
    <div className="h-screen overflow-hidden bg-[#d7d7dc]">
      <div className="h-screen w-full p-2 md:p-3">
        <div className="mx-auto flex h-full max-w-[1800px] overflow-hidden rounded-2xl border border-zinc-300 bg-[#f5f5f7] shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-300 bg-[#ececef] md:flex">
            <div className="shrink-0 border-b border-zinc-300 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
                  <Bot size={16} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {dict.shell.productName}
                  </p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900">{dict.shell.productTagline}</p>
                    <Badge variant="secondary" className="shrink-0">
                      {dict.shell.live}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="h-8 w-full justify-center" onClick={toggleLocale}>
                  <Languages className="mr-1 h-3.5 w-3.5" />
                  {dict.shell.languageToggle}
                </Button>
                <div className="flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-700">
                  <span className="truncate">
                    {dict.shell.environment}: {dict.shell.environmentValue}
                  </span>
                </div>
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {navItems.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href.split("/demo-")[0]);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
                      active
                        ? "border border-zinc-300 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                        : "text-zinc-600 hover:bg-white/80 hover:text-zinc-900"
                    )}
                  >
                    <Icon size={15} className={cn(active ? "text-zinc-900" : "text-zinc-500")} />
                    <span>{dict.shell.nav[item.key as keyof typeof dict.shell.nav]}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col bg-[#fafafa]">
            <header className="shrink-0 border-b border-zinc-200 bg-[#f7f7f9] px-3 py-2 md:hidden">
              <div className="flex items-center gap-2 overflow-x-auto">
                {navItems.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href.split("/demo-")[0]);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                        active ? "border-zinc-300 bg-white text-zinc-900" : "border-transparent text-zinc-600"
                      )}
                    >
                      <Icon size={13} />
                      <span>{dict.shell.nav[item.key as keyof typeof dict.shell.nav]}</span>
                    </Link>
                  );
                })}
              </div>
            </header>

            <main
              className={cn(
                "min-h-0 flex-1 overflow-y-auto bg-white",
                isSessionsRoute ? "rounded-none p-0" : "p-3 md:p-4"
              )}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
