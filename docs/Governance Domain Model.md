# Governance Domain Model v1

## 1. Domain Boundary
- 治理域负责制度化“人类主权”，提供可审计的裁决流程。
- 治理域负责高风险争议、项目终结、Agent 处置、任务恢复决策。
- 治理域不直接执行业务任务，不直接改写其他领域内部状态。
- 治理域通过决策事件驱动其他领域按各自约束落地状态变化。

## 2. Aggregate & Entities

### 2.1 Aggregate Root
- `GovernanceCaseAggregate`
- 主键：`governance_case_id`

### 2.2 Entities
- `GovernanceCase`
  - `governance_case_id`
  - `target_domain`（`PROJECT | SESSION | TASK | AGENT`）
  - `target_id`
  - `requested_by_actor_type: ActorType`
  - `requested_by_actor_id`
  - `status`（`OPEN | DECIDED | CANCELLED`）
  - `created_at`
  - `updated_at`
- `GovernanceDecision`
  - `decision_id`
  - `governance_case_id`
  - `decision_type: GovernanceDecisionType`
  - `decided_by_actor_type`
  - `decided_by_actor_id`
  - `decision_reason`
  - `decided_at`

### 2.3 Value Objects
- `DecisionEvidenceRef`：证据链接、摘要、来源类型。
- `DecisionScope`：影响域、影响对象、执行时限。
- `IdempotencyToken`：决策命令幂等键。

## 3. State Model

### 3.1 状态集合
- `OPEN`
- `DECIDED`
- `CANCELLED`

### 3.2 合法迁移
- `OPEN -> DECIDED`
- `OPEN -> CANCELLED`

### 3.3 禁止迁移
- 禁止 `DECIDED -> OPEN`。
- 禁止 `CANCELLED -> OPEN`。
- 禁止非 `HUMAN` Actor 执行 `TERMINATE_PROJECT` 决策。

## 4. Commands
- `CreateGovernanceCase`
  - 前置条件：目标域对象存在。
  - 幂等键：`target_domain + target_id + reason_hash + idempotency_key`。
- `UpdateGovernanceCase`
  - 前置条件：案件处于 `OPEN`。
- `ApplyGovernanceDecision`
  - 前置条件：案件处于 `OPEN`。
  - 强制规则：`TERMINATE_PROJECT` 的 `decided_by_actor_type` 必须为 `HUMAN`。
- `RecordGovernanceEvidence`
  - 前置条件：案件处于 `OPEN`。
- `EndGovernanceCase`
  - 前置条件：案件已决或确认取消。

## 5. Events
- `GovernanceCaseCreated`
  - 触发条件：`CreateGovernanceCase` 成功。
  - 最小字段：`governance_case_id`, `target_domain`, `target_id`, `created_by`, `occurred_at`。
- `GovernanceCaseUpdated`
  - 触发条件：`UpdateGovernanceCase` 成功。
  - 最小字段：`governance_case_id`, `updated_fields`, `occurred_at`。
- `GovernanceEvidenceRecorded`
  - 触发条件：新增证据。
  - 最小字段：`governance_case_id`, `evidence_ref`, `recorded_by`, `occurred_at`。
- `GovernanceDecisionRecorded`
  - 触发条件：`ApplyGovernanceDecision` 成功。
  - 最小字段：`decision_id`, `governance_case_id`, `decision_type`, `decided_by`, `occurred_at`。
- `GovernanceCaseEnded`
  - 触发条件：`EndGovernanceCase` 成功。
  - 最小字段：`governance_case_id`, `ended_reason`, `occurred_at`。

## 6. Invariants
- 项目终结决策只能由 `HUMAN` 作出。
- 治理决策必须可追溯到案件、证据、决策人。
- 治理域只能发布决策，不得越权直接改写目标域内部数据。
- 每个决策必须具备唯一 `decision_id` 与明确 `decision_type`。

## 7. Failure & Recovery
- 决策写入失败必须返回失败并不改变案件状态。
- 决策已写入但目标域应用失败时，需记录“待应用”状态并可重放。
- 非法决策（如 AGENT 终结项目）必须被拒绝并审计。
- 对同一幂等键重复请求，返回原决策结果，避免重复裁决。

## 8. Cross-Domain References
- 引用 `Project`：通过 `target_domain=PROJECT` 和 `target_id` 触发终结/归档类决策。
- 引用 `Task`：通过 `RESUME_TASK` 决策允许任务恢复。
- 引用 `Agent`：通过 `FREEZE_AGENT` 决策触发 Agent 冻结流程。
- 引用 `Session`：会话范围争议通过治理决策输出，不直接改写会话时间线。
