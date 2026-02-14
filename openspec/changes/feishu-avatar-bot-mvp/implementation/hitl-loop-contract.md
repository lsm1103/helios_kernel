# HITL 闭环契约

## 1. 状态机
- `PENDING -> RESOLVED`
- `PENDING -> EXPIRED`
- `PENDING -> CANCELLED`
- 终态不可回退。

## 2. 超时与重试
- 默认超时: 15 分钟。
- 回调重试窗口: 24 小时内按 `idempotency_key` 去重。
- 过期请求收到回调时返回 `HELIOS-HITL-408-INTERACTION_EXPIRED`。

## 3. 幂等与错误码
- 幂等键: `event_id`（飞书回调唯一键）。
- 首次成功写入返回 `ACCEPTED`；重复回调返回 `NOOP_IDEMPOTENT`。
- 关键错误码:
  - `HELIOS-HITL-404-INTERACTION_NOT_FOUND`
  - `HELIOS-HITL-409-INTERACTION_NOT_PENDING`
  - `HELIOS-HITL-409-ANSWER_ALREADY_CONSUMED`
  - `HELIOS-TOOL-409-RUN_NOT_ACTIVE`

## 4. `run_id` 绑定校验
- 校验 `interaction_request_id`、`task_id`、`tool_session_id` 与 `run_id` 一致。
- 任一绑定不一致立即拒绝，不写 stdin。

## 5. 审计字段
- `audit_id`
- `interaction_request_id`
- `run_id`
- `actor_id`
- `source_event_id`
- `stdin_text_hash`
- `result`
- `occurred_at`
