# Session Domain Model v1

## 1. Domain Boundary
- 会话域负责维持长期协作关系容器。
- 会话域负责上下文隔离、历史追加写、能力变化留痕。
- 会话域不定义任务执行细节，不定义项目终结策略。
- 会话域允许同一工具联系人并行多个独立会话。

## 2. Aggregate & Entities

### 2.1 Aggregate Root
- `SessionAggregate`
- 主键：`session_id`

### 2.2 Entities
- `Session`
  - `session_id`
  - `project_id`
  - `status: SessionStatus`
  - `title`
  - `participants[]`
  - `created_at`
  - `updated_at`
- `SessionTimelineEvent`
  - `event_id`
  - `session_id`
  - `event_type`
  - `payload`
  - `occurred_at`
- `CapabilityChangeMarker`
  - `marker_id`
  - `session_id`
  - `agent_id`
  - `change_summary`
  - `impact_scope`
  - `recorded_at`

### 2.3 Value Objects
- `SessionContextSnapshot`：可缓存读取快照，不替代历史事件真相。
- `ParticipantRef`：`actor_type`, `actor_id`, `role_in_session`。
- `IdempotencyToken`：命令幂等控制。

## 3. State Model

### 3.1 状态集合
- `ACTIVE`
- `PAUSED`
- `CLOSED`

### 3.2 合法迁移
- `ACTIVE -> PAUSED`
- `PAUSED -> ACTIVE`
- `ACTIVE -> CLOSED`
- `PAUSED -> CLOSED`

### 3.3 禁止迁移
- 禁止 `CLOSED -> ACTIVE`。
- 禁止 `CLOSED -> PAUSED`。
- 禁止跳过事件日志直接改写会话上下文。

## 4. Commands
- `CreateSession`
  - 前置条件：`project_id` 存在且项目未 `ENDED`。
  - 幂等键：`project_id + external_ref + idempotency_key`。
- `UpdateSession`
  - 前置条件：会话非 `CLOSED`。
- `PauseSession`
  - 前置条件：状态为 `ACTIVE`。
- `ResumeSession`
  - 前置条件：状态为 `PAUSED`。
- `EndSession`
  - 前置条件：状态为 `ACTIVE` 或 `PAUSED`。
- `RecordMessageEvent`
  - 前置条件：会话未关闭。
- `RecordCapabilityChanged`
  - 前置条件：存在可追踪 `agent_id` 与版本变化上下文。
- `ApplyGovernanceDecision`
  - 前置条件：治理域决策适用于当前会话。

## 5. Events
- `SessionCreated`
  - 触发条件：`CreateSession` 成功。
  - 最小字段：`session_id`, `project_id`, `created_by`, `occurred_at`。
- `SessionUpdated`
  - 触发条件：`UpdateSession` 成功。
  - 最小字段：`session_id`, `updated_fields`, `occurred_at`。
- `SessionPaused`
  - 触发条件：`PauseSession` 成功。
  - 最小字段：`session_id`, `reason`, `paused_by`, `occurred_at`。
- `SessionResumed`
  - 触发条件：`ResumeSession` 成功。
  - 最小字段：`session_id`, `resumed_by`, `occurred_at`。
- `SessionEnded`
  - 触发条件：`EndSession` 成功。
  - 最小字段：`session_id`, `ended_by`, `occurred_at`。
- `SessionMessageRecorded`
  - 触发条件：记录会话消息或操作。
  - 最小字段：`session_id`, `message_id`, `actor`, `occurred_at`。
- `CapabilityChanged`
  - 触发条件：Agent Prompt/Skill 变更被确认。
  - 最小字段：`session_id`, `agent_id`, `change_summary`, `impact_scope`, `occurred_at`。
- `GovernanceDecisionRecorded`
  - 触发条件：治理决定影响会话边界时。
  - 最小字段：`session_id`, `decision_id`, `decision_type`, `occurred_at`。

## 6. Invariants
- 会话历史必须 append-only，不允许篡改或删除历史事件。
- 能力变化必须写入 `CapabilityChanged` 事件，且不可省略。
- 同一工具联系人可在多个会话中并行工作，且上下文严格隔离。
- 会话结束不代表项目结束。

## 7. Failure & Recovery
- 记录消息失败时允许重试，必须保持事件幂等。
- 写事件成功但状态提交失败时，需回滚同事务写入，避免状态/事件分裂。
- 会话关闭后的写入请求应拒绝并记录拒绝审计日志。
- 能力变化信息不完整时，拒绝记录并返回可修复错误码。

## 8. Cross-Domain References
- 引用 `Project`：通过 `project_id` 校验归属，不修改项目状态。
- 引用 `Task`：任务只保存 `session_id`，会话不直接维护任务状态副本。
- 引用 `Agent`：参与者仅以 `actor_id` 引用，能力详情由 Agent 域维护。
- 引用 `Governance`：会话可消费治理决策结果，但决策生命周期在治理域内。
