## Why

- 当前系统已具备协作会话、工具执行与 HITL 回灌链路，但缺少“主编排 LLM”这一统一决策层，导致需求分析、工具选择、进度摘要、完结汇报与归档风格不稳定。
- 现阶段没有统一的多供应商模型配置入口，无法在 OpenAI、Claude、火山方舟之间按策略切换与降级，影响可用性与可维护性。

## What Changes

- 新增主编排 LLM 控制面能力：支持配置默认供应商、模型、API Key、Base URL、超时、温度、最大输出长度。
- 新增多供应商编排适配能力：首版支持 `openai`、`anthropic`（Claude SDK/API 形态）、`volcengine_ark`（火山方舟 API）。
- 新增编排职责链路：需求分析、工具推荐与确认问题、NEED_USER_INPUT 转写、执行中进度摘要、任务完成汇报、归档摘要生成。
- 新增运行时容错策略：主供应商失败时按优先级自动切换到备用供应商，保持协作链路不中断。
- 新增设置与状态接口：提供可审计的配置读写（密钥脱敏回显）与供应商连通性检查。

## Capabilities

### New Capabilities
- `orchestrator-llm-control-plane`: 主编排 LLM 的配置、密钥管理、供应商选择与连通性检查。
- `orchestrator-llm-workflow`: 在协作会话生命周期中执行需求分析、工具引导、HITL 转写、进度汇总、完成汇报与归档摘要。

### Modified Capabilities
- `hitl-interaction-loop`: 交互请求文案由主编排 LLM 生成用户友好版本，并保留原始工具请求作为审计字段。
- `collab-session-workspace`: 协作会话页面需展示主编排 LLM 生成的进度与完成摘要，不直接暴露底层工具原始噪声输出。

## Impact

- 规格与工件：`openspec/changes/orchestrator-llm-multi-provider/*`
- 预期影响后端范围：
  - `apps/api/src/application/session/`（编排流程接入）
  - `apps/api/src/application/tooling/`（HITL 与执行事件编排）
  - `apps/api/src/interfaces/http/controllers/`（配置与健康检查接口）
  - `apps/api/src/infrastructure/persistence/sqlite/`（编排配置与审计持久化）
  - `apps/api/src/infrastructure/llm/`（OpenAI/Anthropic/Ark 适配器）
- 预期影响前端范围：
  - `apps/web/src/app/settings/`（主编排 LLM 配置页）
  - `apps/web/src/components/collab-workspace.tsx`（展示编排摘要）
