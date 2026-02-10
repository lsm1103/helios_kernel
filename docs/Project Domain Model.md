# Project Domain Model v1

## 1. Domain Boundary
- 项目域负责长期目标的归属、责任与生命周期边界。
- 项目域负责组织会话的归属关系与项目级状态。
- 项目域不负责任务执行细节与 Agent 能力细节。
- 项目终结必须由治理域的人类决策驱动。

## 2. Aggregate & Entities

### 2.1 Aggregate Root
- `ProjectAggregate`
- 主键：`project_id`

### 2.2 Entities
- `Project`
  - `project_id`
  - `name`
  - `owner_type`（固定为 `HUMAN`）
  - `owner_id`
  - `status: ProjectStatus`
  - `created_at`
  - `ended_at`
- `ProjectSessionRef`
  - `project_id`
  - `session_id`
  - `linked_at`
- `ProjectMetadata`
  - `description`
  - `tags[]`
  - `priority`

### 2.3 Value Objects
- `ProjectOwnership`：人类归属声明与责任主体。
- `ProjectLifecycleMarker`：归档/终结原因与触发来源。
- `IdempotencyToken`：命令幂等控制。

## 3. State Model

### 3.1 状态集合
- `ACTIVE`
- `ARCHIVED`
- `ENDED`

### 3.2 合法迁移
- `ACTIVE -> ARCHIVED`
- `ARCHIVED -> ACTIVE`
- `ACTIVE -> ENDED`
- `ARCHIVED -> ENDED`

### 3.3 禁止迁移
- 禁止 `ENDED -> ACTIVE`。
- 禁止 `ENDED -> ARCHIVED`。
- 禁止 AGENT/SYSTEM 直接触发 `ENDED`。

## 4. Commands
- `CreateProject`
  - 前置条件：`owner_type` 必须为 `HUMAN`。
  - 幂等键：`owner_id + external_ref + idempotency_key`。
- `UpdateProject`
  - 前置条件：项目未 `ENDED`。
- `ArchiveProject`
  - 前置条件：项目处于 `ACTIVE`。
- `ResumeProject`
  - 前置条件：项目处于 `ARCHIVED`。
- `EndProject`
  - 前置条件：项目处于 `ACTIVE` 或 `ARCHIVED`，且存在有效治理决策。
- `RecordProjectSessionLinked`
  - 前置条件：会话存在且归属一致。
- `ApplyGovernanceDecision`
  - 前置条件：治理决策类型适用于项目。

## 5. Events
- `ProjectCreated`
  - 触发条件：`CreateProject` 成功。
  - 最小字段：`project_id`, `owner_id`, `status`, `occurred_at`。
- `ProjectUpdated`
  - 触发条件：`UpdateProject` 成功。
  - 最小字段：`project_id`, `updated_fields`, `occurred_at`。
- `ProjectArchived`
  - 触发条件：`ArchiveProject` 成功。
  - 最小字段：`project_id`, `reason`, `archived_by`, `occurred_at`。
- `ProjectResumed`
  - 触发条件：`ResumeProject` 成功。
  - 最小字段：`project_id`, `resumed_by`, `occurred_at`。
- `ProjectEnded`
  - 触发条件：`EndProject` 成功。
  - 最小字段：`project_id`, `decision_id`, `ended_by_human`, `occurred_at`。
- `ProjectSessionLinked`
  - 触发条件：新增会话归属。
  - 最小字段：`project_id`, `session_id`, `occurred_at`。

## 6. Invariants
- 项目永远属于人类，`owner_type` 必须为 `HUMAN`。
- 项目不能被 Agent 终结。
- 会话结束不自动终结项目。
- 项目所有状态变化必须可由事件链回放解释。

## 7. Failure & Recovery
- 治理决策缺失时终结请求必须拒绝并记录审计。
- 重复终结请求在幂等键一致时返回同一结果，不重复写事件。
- 归档/恢复失败时保持原状态并返回可修复错误码。
- 外域引用失效（如 session 不存在）时拒绝链接并记录拒绝日志。

## 8. Cross-Domain References
- 引用 `Session`：通过 `ProjectSessionRef` 管理归属，不维护会话内部状态。
- 引用 `Governance`：`EndProject` 必须引用治理决策 `decision_id`。
- 引用 `Task`：项目不直接聚合任务状态，任务通过会话间接归属。
- 引用 `Agent`：项目可记录参与 Agent ID，但不维护技能版本细节。
