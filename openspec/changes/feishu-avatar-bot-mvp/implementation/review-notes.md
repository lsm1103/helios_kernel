# Week1 规格评审记录

## 1. 评审范围边界
- In Scope: 飞书协作网关、工具会话桥接、HITL 回灌、技术支持与策略控制。
- Out of Scope: 企业级全自动发布、复杂审批引擎、跨平台统一前端、长期 transcript 迁移。

## 2. 术语字典
- 协作会话（collab session）: 飞书线程对应的 HELIOS 会话主线。
- 工具会话（tool session）: Codex/Claude Code 的执行上下文会话。
- 交互请求（interaction request）: 工具请求人工输入的待处理项。
- 运行实例（run）: 一次工具进程执行实例，用 `run_id` 标识。
- 回灌（stdin feed）: 将用户输入写回工具进程 stdin。
- 摘要卡片: 协作会话中展示工具状态的 150 字摘要。

## 3. PRD 与 Capability 映射
| PRD 模块 | Capability |
|---|---|
| FR-001 飞书接入与会话映射 | `feishu-collab-gateway` |
| FR-002 工具会话绑定与切换 | `tool-session-bridge` |
| FR-003 工具执行编排 | `tool-session-bridge` |
| FR-004 HITL 闭环 | `hitl-interaction-loop` |
| FR-005 技术支持问答 | `support-qa-and-policy-control` |
| FR-006 安全与权限控制 | `support-qa-and-policy-control` |

## 4. 评审结论
- 变更范围与术语已冻结。
- PRD 与 OpenSpec capability 已完成一一映射，无孤立 capability。
