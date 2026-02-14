"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "zh" | "en";

const LOCALE_STORAGE_KEY = "helios-locale";

const dictionaries = {
  en: {
    shell: {
      productName: "Helios Kernel",
      productTagline: "Ops Console",
      environment: "Environment",
      environmentValue: "Local / Development",
      nav: {
        dashboard: "Dashboard",
        sessions: "Sessions",
        tasks: "Tasks",
        toolSessions: "Tool Sessions",
        settings: "Settings"
      },
      bridgeTitle: "Need user input bridge",
      bridgeDesc: "HITL callback and stdin relay are available in API.",
      openSettings: "Open Settings",
      controlCenter: "Control Center",
      workspaceTitle: "Helios Admin Workspace",
      live: "Live",
      languageToggle: "中 / EN"
    },
    home: {
      title: "Operations Overview",
      subtitle: "Monitor collaboration, tool execution, and human-in-the-loop decisions.",
      mvp: "MVP",
      stats: {
        activeCollabSessions: "Active Collab Sessions",
        linkedToolSessions: "Linked Tool Sessions",
        hitlRequests: "HITL Requests",
        policyAlerts: "Policy Alerts",
        plus3Today: "+3 today",
        pendingReview: "4 pending review",
        unresolved: "2 unresolved",
        approvalRequired: "L3 approval required"
      },
      whatYouCanDo: "What You Can Do Here",
      quickGuide: "Route-level quick guide for current MVP.",
      sessions: "Sessions",
      sessionsDesc: "View collab session context and linked tool sessions.",
      tasks: "Tasks",
      tasksDesc: "Check execution state, risk markers, and ownership.",
      toolSessions: "Tool Sessions",
      toolSessionsDesc: "Inspect summaries and bridge HITL callbacks to tool stdin."
    },
    session: {
      title: "Collaboration Session",
      sessionId: "Session ID",
      active: "ACTIVE",
      timelineTitle: "Timeline Snapshot",
      timelineDesc: "Latest collaboration and task events.",
      timelineItem1: "User requested API migration plan and rollout guardrails.",
      timelineItem2: "Tool session linked: codex / toolsess_demo_01.",
      timelineItem3: "HITL prompt issued for production deployment window.",
      participantsTitle: "Participants",
      participantsDesc: "Current actors in this session.",
      participantHumanOwner: "HumanOwner",
      participantAgent: "Agent",
      participantAuditor: "Auditor"
    },
    task: {
      title: "Task Detail",
      taskId: "Task ID",
      running: "RUNNING",
      executionTitle: "Execution",
      executionDesc: "Runtime state and linked sessions.",
      provider: "Provider",
      runId: "Run ID",
      toolSession: "Tool Session",
      riskTitle: "Risk & Governance",
      riskDesc: "Safety markers and approval status.",
      riskLevel: "Risk level",
      approvalRequired: "Approval required",
      latestDecision: "Latest decision",
      yes: "Yes",
      pendingUserConfirmation: "pending user confirmation"
    },
    tool: {
      title: "Tool Session",
      toolSessionId: "Tool Session ID",
      transcriptTitle: "Transcript Preview",
      transcriptDesc: "Recent output and HITL markers from tool runtime.",
      transcriptItem2: "HITL resolved by user_001: Tonight",
      transcriptItem3: "Run resumed and continued execution."
    }
  },
  zh: {
    shell: {
      productName: "Helios Kernel",
      productTagline: "运维控制台",
      environment: "环境",
      environmentValue: "本地 / 开发",
      nav: {
        dashboard: "总览",
        sessions: "协作会话",
        tasks: "任务",
        toolSessions: "工具会话",
        settings: "设置"
      },
      bridgeTitle: "人工输入桥接",
      bridgeDesc: "API 已支持 HITL 回调与 stdin 回灌。",
      openSettings: "打开设置",
      controlCenter: "控制中心",
      workspaceTitle: "Helios 管理工作台",
      live: "在线",
      languageToggle: "中 / EN"
    },
    home: {
      title: "运行总览",
      subtitle: "监控协作进度、工具执行与人工介入决策。",
      mvp: "MVP",
      stats: {
        activeCollabSessions: "活跃协作会话",
        linkedToolSessions: "已关联工具会话",
        hitlRequests: "HITL 请求",
        policyAlerts: "策略告警",
        plus3Today: "今日 +3",
        pendingReview: "4 个待复核",
        unresolved: "2 个未处理",
        approvalRequired: "需要 L3 审批"
      },
      whatYouCanDo: "你可以在这里做什么",
      quickGuide: "当前 MVP 的路由级快速说明。",
      sessions: "协作会话",
      sessionsDesc: "查看协作上下文与关联工具会话。",
      tasks: "任务",
      tasksDesc: "查看执行状态、风险标记与归属信息。",
      toolSessions: "工具会话",
      toolSessionsDesc: "查看摘要并将 HITL 回调桥接到工具 stdin。"
    },
    session: {
      title: "协作会话",
      sessionId: "会话 ID",
      active: "进行中",
      timelineTitle: "时间线快照",
      timelineDesc: "最近的协作与任务事件。",
      timelineItem1: "用户请求 API 迁移方案与发布护栏。",
      timelineItem2: "已关联工具会话：codex / toolsess_demo_01。",
      timelineItem3: "已发起生产发布窗口的 HITL 提示。",
      participantsTitle: "参与方",
      participantsDesc: "当前会话中的角色。",
      participantHumanOwner: "业务负责人",
      participantAgent: "Agent",
      participantAuditor: "审计方"
    },
    task: {
      title: "任务详情",
      taskId: "任务 ID",
      running: "执行中",
      executionTitle: "执行信息",
      executionDesc: "运行时状态与关联会话。",
      provider: "提供方",
      runId: "运行 ID",
      toolSession: "工具会话",
      riskTitle: "风险与治理",
      riskDesc: "安全标记与审批状态。",
      riskLevel: "风险等级",
      approvalRequired: "是否需要审批",
      latestDecision: "最新决策",
      yes: "是",
      pendingUserConfirmation: "待用户确认"
    },
    tool: {
      title: "工具会话",
      toolSessionId: "工具会话 ID",
      transcriptTitle: "对话预览",
      transcriptDesc: "工具运行的近期输出与 HITL 标记。",
      transcriptItem2: "用户 user_001 已处理 HITL：Tonight",
      transcriptItem3: "运行已恢复并继续执行。"
    }
  }
} as const;

type Dictionary = (typeof dictionaries)[Locale];

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dict: Dictionary;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "en";
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "zh" || stored === "en") {
    return stored;
  }

  return detectBrowserLocale();
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(getInitialLocale());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      dict: dictionaries[locale]
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
