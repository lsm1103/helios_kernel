## Context

当前系统已具备协作会话、工具会话、PTY 执行、HITL 回灌，但缺少统一的“主编排 LLM”层。现有链路在需求拆解、工具选择提示、执行进度摘要、完成汇报与归档摘要等环节依赖模板化文案，缺乏一致性与可配置性。与此同时，系统尚未提供统一的多供应商模型接入面，无法在 OpenAI、Anthropic（Claude）与火山方舟之间按策略切换与故障降级。

约束：
- 不改变既有工具执行协议（Codex/Claude CLI + PTY）。
- 不把工具完整 transcript 写入协作主轨。
- 首版必须可在本地/私有部署环境运行，API Key 不能明文回显。

## Goals / Non-Goals

**Goals:**
- 建立主编排 LLM 控制面，支持 `openai`、`anthropic`、`volcengine_ark` 三供应商。
- 建立统一编排接口，覆盖需求分析、工具选择引导、HITL 问题转写、进度摘要、完成汇报、归档摘要。
- 建立供应商故障降级机制，保证主链路可用。
- 建立配置与调用审计基础字段，支持后续治理扩展。

**Non-Goals:**
- 不在本次引入复杂多 Agent 编排图或长期记忆系统。
- 不在本次实现供应商自动成本优化器（仅固定优先级降级）。
- 不在本次变更工具协议、工具会话私有文件解析规则。

## Decisions

1. 统一 Provider 抽象层
- 决策：新增 `OrchestratorLlmProvider` 接口，三个实现：`OpenAIProvider`、`AnthropicProvider`、`VolcengineArkProvider`。
- 理由：上层工作流不感知厂商差异，后续可扩展第四家供应商。
- 备选：在业务层写 `if/else` 直连各 SDK；被拒绝，原因是会放大维护成本。

2. 控制面配置模型
- 决策：新增持久化配置 `orchestrator_llm_settings`，字段包含 `primary_provider`、`fallback_providers[]`、`model`、`base_url`、`api_key_secret_ref`、`timeout_ms`、`temperature`、`max_tokens`、`updated_by`。
- 理由：配置与运行逻辑解耦，可审计、可灰度。
- 备选：仅使用 `.env`；被拒绝，原因是无法支持运行时切换与审计。

3. 密钥管理与回显策略
- 决策：API Key 仅入后端安全存储（MVP 可先 DB 加密列或 secret_ref + 环境变量），查询接口只返回掩码。
- 理由：满足最小安全要求并兼容私有部署。

4. 编排职责挂点
- 决策：在协作会话链路定义 6 个挂点：
  - `analyze_requirement`
  - `suggest_tool_and_questions`
  - `rewrite_hitl_prompt`
  - `summarize_progress`
  - `summarize_completion`
  - `summarize_archive`
- 理由：职责边界清晰，便于独立测试与降级。

5. 故障降级
- 决策：主供应商失败时，按 `fallback_providers` 顺序重试（最多 2 次），全部失败回退模板文案并记录降级事件。
- 理由：保证用户流程不中断。

## Risks / Trade-offs

- [风险] 供应商 API 协议差异导致字段映射错误 → [缓解] 统一 provider contract + 契约测试样例。
- [风险] 火山方舟 endpoint/鉴权配置错误率高 → [缓解] 增加 `test connection` 接口与错误分类提示。
- [风险] 编排 LLM 生成不稳定文案影响用户理解 → [缓解] 固定系统提示词模板 + 长度与术语约束。
- [风险] 供应商全部不可用导致体验下降 → [缓解] 回退模板文案，主链路继续执行。

## Migration Plan

1. 先发布后端配置表与 Provider 抽象（不切流量）。
2. 接入工作流挂点，默认仍使用模板文案，灰度开启 10%。
3. 开放设置页配置主/备供应商与模型，启用连通性检测。
4. 灰度观察一周后全量切换，保留模板降级开关。

回滚：
- 关闭 `orchestrator_llm_enabled` 功能开关，立即回退模板文案路径。
- 保留新表，不做 destructive migration。

## Open Questions

- API Key 在 MVP 是否采用 KMS（若无则先采用本地加密存储）？
- 火山方舟是否要求按业务线拆 endpoint（多 region）？
- 完成汇报摘要是否需要区分“面向客户版”和“面向技术版”？
