## 1. 配置与数据模型

- [x] 1.1 在 SQLite 增加 `orchestrator_llm_settings` 与 `orchestrator_llm_audit_events` 表，并补充迁移逻辑
- [x] 1.2 定义配置 DTO 与领域类型（provider、model、base_url、timeout、temperature、max_tokens、fallback）
- [x] 1.3 实现 API Key 安全存储与掩码回显（禁止明文返回）
- [x] 1.4 增加配置读写审计字段（actor、action、result、timestamp）

## 2. 多供应商 Provider 抽象

- [x] 2.1 定义统一 `OrchestratorLlmProvider` 接口（chat/generate、healthCheck）
- [x] 2.2 实现 `OpenAIProvider`（兼容 OpenAI Chat Completions）
- [x] 2.3 实现 `AnthropicProvider`（兼容 Claude SDK/API 形态）
- [x] 2.4 实现 `VolcengineArkProvider`（火山方舟 API）
- [x] 2.5 实现 Provider 工厂与主备降级策略（按 fallback 顺序重试）

## 3. 主编排 LLM 工作流接入

- [x] 3.1 在协作会话入口接入 `analyze_requirement` 与 `suggest_tool_and_questions`
- [x] 3.2 在 HITL 创建链路接入 `rewrite_hitl_prompt`（保留 raw_prompt + user_prompt）
- [x] 3.3 在工具运行事件链路接入 `summarize_progress`
- [x] 3.4 在 run 完成事件接入 `summarize_completion`
- [x] 3.5 在会话归档动作接入 `summarize_archive`
- [x] 3.6 实现编排不可用时模板降级并写入降级标记

## 4. API 与前端设置页

- [x] 4.1 新增后端接口：获取/更新主编排 LLM 配置
- [x] 4.2 新增后端接口：供应商连通性检查（openai/anthropic/volcengine_ark）
- [x] 4.3 扩展设置页：主供应商、备用供应商、模型与参数配置
- [x] 4.4 设置页实现 API Key 输入但不明文回显
- [x] 4.5 协作会话页展示编排供应商/模型与编排摘要来源

## 5. 测试与验收

- [x] 5.1 Provider 契约测试：三供应商成功与失败路径
- [x] 5.2 降级测试：主供应商失败后切到备用供应商
- [x] 5.3 HITL 测试：raw_prompt/user_prompt 双轨记录与回灌不受影响
- [x] 5.4 安全测试：配置查询不返回明文 API Key
- [x] 5.5 端到端测试：需求分析 -> 工具执行 -> HITL -> 完成汇报 -> 归档摘要
- [x] 5.6 更新文档与变更记录，执行 `openspec validate orchestrator-llm-multi-provider --strict`
