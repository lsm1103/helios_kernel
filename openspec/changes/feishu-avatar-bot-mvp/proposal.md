## Why

- 当前系统已经明确“飞书会话主导协作、工具会话主导执行”的方向，但缺少可执行的 OpenSpec 变更工件。
- 团队需要一版可落地的 MVP 规格，覆盖飞书入口、工具会话桥接、人工确认闭环、技术支持与策略控制。
- 该能力是后续实现和验收的基线，必须先固化需求边界与开发任务。

## What Changes

- 新增飞书协作网关能力，规范会话映射、线程回发与协作主线。
- 新增工具会话桥接能力，支持单协作会话绑定多个工具 session，并保持协作轨/工具轨隔离。
- 新增 HITL 交互闭环能力，覆盖交互请求、飞书卡片回调、stdin 回灌和状态机。
- 新增技术支持与策略控制能力，覆盖规则区/API 问答、命令白名单和高风险审批审计。

## Capabilities

### New Capabilities
- `feishu-collab-gateway`: 飞书消息接入、协作会话定位与同线程响应。
- `tool-session-bridge`: 多工具 session 绑定、切换查看与摘要回传。
- `hitl-interaction-loop`: 工具请求人工输入的飞书闭环与幂等回灌。
- `support-qa-and-policy-control`: 技术问答、命令白名单、高风险审批与审计。

### Modified Capabilities
- None.

## Impact

- 规格与工件：`openspec/changes/feishu-avatar-bot-mvp/*`
- 需求与设计文档：
  - `docs/飞书分身机器人-MVP-PRD.md`
  - `docs/飞书-HITL-桥接最小API草案.md`
  - `docs/协作会话与工具会话集成-需求与功能设计汇总.md`
- 预期影响代码范围（后续实现阶段）：
  - `apps/api/src/interfaces/webhook/`
  - `apps/api/src/application/tooling/`
  - `apps/api/src/infrastructure/tool-runners/`
  - `apps/api/src/infrastructure/persistence/sqlite/repositories/`
  - `apps/web/src/app/sessions/` 与 `apps/web/src/app/tools/`
