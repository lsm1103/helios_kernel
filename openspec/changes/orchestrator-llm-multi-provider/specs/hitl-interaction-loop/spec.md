## MODIFIED Requirements

### Requirement: 工具请求人工输入时 MUST 创建交互请求
当工具输出 `NEED_USER_INPUT` 信号时，系统 MUST 创建 `interaction_request`，初始状态为 `PENDING`，并 MUST 生成用户可读问题文案与原始工具问题的双轨记录。

#### Scenario: 编排 LLM 转写交互问题
- **WHEN** 工具输出包含复杂技术术语的 `NEED_USER_INPUT`
- **THEN** 系统创建 `PENDING` 请求，保存 `raw_prompt`，并生成 `user_prompt` 用于飞书卡片展示

#### Scenario: 编排 LLM 不可用时降级
- **WHEN** 生成 `user_prompt` 时主备供应商均失败
- **THEN** 系统使用模板文案创建 `PENDING` 请求并记录 `orchestrator_degraded=true`

### Requirement: stdin 回灌 MUST 校验绑定与状态
系统回灌 stdin 前 MUST 校验 `run_id` 与 `interaction_request_id` 绑定且请求状态为 `PENDING`，并 MUST 保存用户答案与转写上下文。

#### Scenario: 用户提交有效答案
- **WHEN** 用户在飞书卡片提交答案且绑定校验通过
- **THEN** 系统写入目标运行进程 stdin，更新请求为 `RESOLVED`，并保存 `answer_value` 与 `user_prompt` 上下文

#### Scenario: 请求已完成再次提交
- **WHEN** `interaction_request` 已是 `RESOLVED`
- **THEN** 系统拒绝回灌并返回 `HELIOS-HITL-409-INTERACTION_NOT_PENDING`
