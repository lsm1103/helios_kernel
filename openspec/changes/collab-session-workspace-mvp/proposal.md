## Why

当前协作会话页面混合了会话管理、聊天执行和工具轨查看，用户在高频切换时认知负担高且操作路径不清晰。需要将“会话管理”与“会话执行”分离，建立稳定的工作台交互模型，支撑后续功能迭代。

## What Changes

- 新增协作会话管理页，提供会话列表与创建会话入口。
- 新增会话创建弹窗，先支持手填 `name` 和 `description`，后续可扩展单句需求经 LLM 生成草稿。
- 新增会话列表三动作：进入会话、查看详情、归档会话。
- 新增独立会话聊天页，显示执行上下文（本地路径、当前工具、绑定工具 sessions）。
- 聊天时间线保留协作主轨，工具输出以工具卡片展示，点击后在 body 级右侧抽屉查看 transcript。
- 新增协作会话归档生命周期规则，归档后默认从活跃列表隐藏。

## Capabilities

### New Capabilities
- `collab-session-workspace`: 协作会话管理页与聊天页的交互规范、状态规则和工具卡片查看路径。

### Modified Capabilities
- None.

## Impact

- Affected Web Routes:
  - `apps/web/src/app/sessions/page.tsx`
  - `apps/web/src/app/sessions/[sessionId]/page.tsx`
- Affected UI Components:
  - `apps/web/src/components/*` (会话列表项、创建弹窗、详情弹窗、工具卡片、body 级抽屉)
- Affected API and Persistence:
  - `apps/api/src/interfaces/http/*` (会话列表/创建/详情/归档接口)
  - `apps/api/src/infrastructure/persistence/sqlite/*` (协作会话状态与元数据持久化)
- 依赖现有 `tool-session-bridge` 与 `hitl-interaction-loop`，不改变其核心协议，仅定义在工作台中的呈现与交互约束。
