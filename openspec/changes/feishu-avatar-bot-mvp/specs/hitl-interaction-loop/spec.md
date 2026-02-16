## Status

- Implementation: `IMPLEMENTED` (as of 2026-02-15)
- Notes: NEED_USER_INPUT parsing, interaction_request lifecycle (pending/resolved), idempotent callback handling, and stdin relay are implemented.

## ADDED Requirements

### Requirement: 工具请求人工输入时 MUST 创建交互请求
当工具输出 `NEED_USER_INPUT` 信号时，系统 MUST 创建 `interaction_request`，初始状态为 `PENDING`。

#### Scenario: 选择型确认请求
- **WHEN** 工具请求用户在多个选项中确认一个动作
- **THEN** 系统创建 `PENDING` 请求并下发 Choice 卡片

### Requirement: 回调处理 MUST 幂等
系统处理飞书交互回调时 MUST 基于 `idempotency_key` 去重；重复回调 MUST 返回 `NOOP_IDEMPOTENT`。

#### Scenario: 飞书回调重放
- **WHEN** 同一 `event_id` 回调被重复投递
- **THEN** 仅第一次生效，后续回调返回幂等结果

### Requirement: stdin 回灌 MUST 校验绑定与状态
系统回灌 stdin 前 MUST 校验 `run_id` 与 `interaction_request_id` 绑定且请求状态为 `PENDING`。

#### Scenario: 进程已结束
- **WHEN** `run_id` 对应工具进程已结束
- **THEN** 系统拒绝写入并返回 `HELIOS-TOOL-409-RUN_NOT_ACTIVE`

#### Scenario: 请求已完成再次提交
- **WHEN** `interaction_request` 已是 `RESOLVED`
- **THEN** 系统拒绝回灌并返回 `HELIOS-HITL-409-INTERACTION_NOT_PENDING`
