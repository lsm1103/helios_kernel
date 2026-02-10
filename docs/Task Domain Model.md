# Task Domain Model v1

## 1. Domain Boundary
- 任务域负责把意图转化为可执行、可追溯的 `Task` 生命周期。
- 任务域负责澄清预算、风险标记、升级流程、失败复盘标记。
- 任务域不负责项目终结裁决，项目终结由治理域驱动。
- 任务域不直接管理 Agent 技能定义，仅引用执行者身份。

## 2. Aggregate & Entities

### 2.1 Aggregate Root
- `TaskAggregate`
- 主键：`task_id`

### 2.2 Entities
- `Task`
  - `task_id`
  - `session_id`
  - `task_type: TaskType`
  - `status: TaskStatus`
  - `risk_level: RiskLevel`
  - `summary`
  - `assignee_actor_type: ActorType`
  - `assignee_actor_id`
  - `created_at`
  - `updated_at`
- `ClarificationBudget`
  - `budget_limit`（默认 30，可配置）
  - `budget_used`
  - `forced_assumption_count`
- `TaskUpgradeRecord`
  - `upgrade_reason`
  - `notified_at`
  - `human_confirmed_at`

### 2.3 Value Objects
- `TaskIntent`：任务意图与业务上下文摘要。
- `RiskMarker`：`risk_level`、触发原因、触发时间。
- `IdempotencyToken`：命令重试幂等键。

## 3. State Model

### 3.1 状态集合
- `CREATED`
- `CLARIFYING`
- `READY`
- `RUNNING`
- `PAUSED`
- `HIGH_RISK_RUNNING`
- `FAILED`
- `COMPLETED`

### 3.2 合法迁移
- `CREATED -> CLARIFYING`
- `CREATED -> READY`
- `CLARIFYING -> READY`
- `READY -> RUNNING`
- `RUNNING -> PAUSED`
- `RUNNING -> HIGH_RISK_RUNNING`
- `HIGH_RISK_RUNNING -> PAUSED`
- `PAUSED -> RUNNING`
- `PAUSED -> HIGH_RISK_RUNNING`
- `RUNNING -> FAILED`
- `HIGH_RISK_RUNNING -> FAILED`
- `RUNNING -> COMPLETED`
- `HIGH_RISK_RUNNING -> COMPLETED`

### 3.3 禁止迁移
- 禁止从 `FAILED` 或 `COMPLETED` 回到任何执行态。
- 禁止 `CREATED` 直接进入 `HIGH_RISK_RUNNING`。
- 禁止在未通知且未确认时执行任务升级后的继续运行。

## 4. Commands
- `CreateTask`
  - 前置条件：`session_id` 存在且会话非 `CLOSED`。
  - 幂等键：`task_id + idempotency_key`。
- `UpdateTask`
  - 前置条件：任务未进入终态（`FAILED | COMPLETED`）。
- `RecordClarificationAsked`
  - 前置条件：任务处于 `CLARIFYING` 或可进入 `CLARIFYING`。
- `RecordForcedAssumption`
  - 前置条件：澄清预算已耗尽。
- `PauseTask`
  - 前置条件：任务处于执行态（`RUNNING | HIGH_RISK_RUNNING`）。
- `ResumeTask`
  - 前置条件：任务处于 `PAUSED`。
- `RecordTaskUpgradeRequested`
  - 前置条件：检测到复杂度升级信号。
  - 强制流程：先触发 `PauseTask`，再触发通知与确认。
- `RecordTaskUpgradeNotified`
  - 前置条件：已存在升级请求且任务处于 `PAUSED`。
- `RecordTaskUpgradeHumanConfirmed`
  - 前置条件：已存在升级请求且已通知。
- `CompleteTask`
  - 前置条件：任务处于 `RUNNING | HIGH_RISK_RUNNING`。
- `FailTask`
  - 前置条件：任务处于 `RUNNING | HIGH_RISK_RUNNING`。
- `ApplyGovernanceDecision`
  - 用于应用治理域决策（如恢复任务）。

## 5. Events
- `TaskCreated`
  - 触发条件：`CreateTask` 成功。
  - 最小字段：`task_id`, `session_id`, `task_type`, `created_by`, `occurred_at`。
- `TaskUpdated`
  - 触发条件：`UpdateTask` 成功。
  - 最小字段：`task_id`, `updated_fields`, `updated_by`, `occurred_at`。
- `TaskClarificationAsked`
  - 触发条件：记录一次澄清。
  - 最小字段：`task_id`, `budget_used`, `occurred_at`。
- `TaskForcedAssumptionRecorded`
  - 触发条件：预算耗尽后强制假设。
  - 最小字段：`task_id`, `assumption`, `occurred_at`。
- `TaskPaused`
  - 触发条件：`PauseTask` 成功。
  - 最小字段：`task_id`, `reason`, `paused_by`, `occurred_at`。
- `TaskResumed`
  - 触发条件：`ResumeTask` 成功。
  - 最小字段：`task_id`, `resumed_by`, `occurred_at`。
- `TaskUpgraded`
  - 触发条件：升级完成且已确认。
  - 最小字段：`task_id`, `upgrade_reason`, `confirmed_by_human`, `occurred_at`。
- `TaskUpgradeNotified`
  - 触发条件：升级通知已送达用户。
  - 最小字段：`task_id`, `notification_channel`, `notified_at`。
- `TaskRiskEscalated`
  - 触发条件：进入 `HIGH_RISK_RUNNING`。
  - 最小字段：`task_id`, `from_risk_level`, `to_risk_level`, `occurred_at`。
- `TaskFailed`
  - 触发条件：`FailTask` 成功。
  - 最小字段：`task_id`, `failure_reason`, `visibility_scope`, `occurred_at`。
- `TaskCompleted`
  - 触发条件：`CompleteTask` 成功。
  - 最小字段：`task_id`, `completed_by`, `occurred_at`。

## 6. Invariants
- 长任务（`LONG`）必须进入状态管理并持续维护事件流。
- 澄清预算耗尽后必须继续执行，且状态转入 `HIGH_RISK_RUNNING`。
- 升级流程必须满足 `Pause -> Notify -> HumanConfirm`，缺一不可。
- `COMPLETED` 仅表示任务完成，不表示项目终结。
- 任务失败必须可复盘，不得被静默吞掉。

## 7. Failure & Recovery
- `HIGH_RISK_RUNNING` 失败默认仅对当事人可见，但必须保留复盘证据。
- 当升级确认超时，任务保持 `PAUSED`，并等待治理域或人类进一步决策。
- 命令重试导致重复提交时，通过幂等键返回同一执行结果，不重复写事件。
- 外部依赖故障导致任务中断时，任务转 `PAUSED` 或 `FAILED`，并记录可恢复原因码。

## 8. Cross-Domain References
- 引用 `Session`：通过 `session_id` 校验任务归属，不直接更新会话状态。
- 引用 `Governance`：通过治理决策 ID 应用恢复/拒绝结果，不绕过治理审查。
- 引用 `Agent`：通过 `assignee_actor_id` 关联执行者，不复制 Agent 技能详情。
- 引用 `Project`：通过 `Session -> Project` 间接归属，不在 Task 直接写 `project_status`。
