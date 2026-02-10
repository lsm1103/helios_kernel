# HELIOS Implementation Contracts v1（Step 2）

## 1. 文档目标
- 固化实现层契约，作为工程开发直接输入。
- 冻结三类内容：命令入参、事件 envelope、错误码。
- 与领域模型文档保持一一映射，不引入新业务范围。

## 2. 适用边界
- 适用领域：`Project / Session / Task / Agent / Governance`。
- 适用对象：应用服务层、领域服务层、事件存储与审计组件。
- 不包含：数据库 DDL、HTTP/gRPC 传输协议、鉴权实现细节。

## 3. 全局约定
- 所有时间字段使用 UTC，格式 `RFC3339`。
- 所有 ID 使用全局唯一 ID（实现层可映射 `UUIDv7`）。
- 所有命令必须带 `idempotency_key`。
- 命令处理必须是“校验 -> 状态变更 -> 事件追加”原子流程。
- 拒绝类结果必须可审计（拒绝日志或拒绝事件至少一种）。

## 4. Command Envelope（统一命令封装）

### 4.1 结构
```json
{
  "command_id": "cmd_...",
  "command_name": "CreateTask",
  "aggregate_type": "TASK",
  "aggregate_id": "task_...",
  "project_id": "proj_...",
  "session_id": "sess_...",
  "actor": {
    "actor_type": "HUMAN",
    "actor_id": "user_..."
  },
  "idempotency_key": "idem_...",
  "expected_version": 12,
  "payload": {},
  "requested_at": "2026-02-10T15:30:00Z"
}
```

### 4.2 字段约束
- `command_id`：命令唯一标识，用于追踪。
- `command_name`：必须命中已注册命令清单。
- `aggregate_type`：`PROJECT | SESSION | TASK | AGENT | GOVERNANCE_CASE`。
- `aggregate_id`：目标聚合 ID。
- `actor.actor_type`：`HUMAN | AGENT | SYSTEM`。
- `idempotency_key`：同一聚合下同命令唯一。
- `expected_version`：可选，开启乐观并发控制时必填。
- `payload`：命令特定参数。

## 5. Command Result Envelope（统一返回）

```json
{
  "command_id": "cmd_...",
  "status": "ACCEPTED",
  "aggregate_id": "task_...",
  "new_version": 13,
  "event_ids": ["evt_1", "evt_2"],
  "error": null,
  "processed_at": "2026-02-10T15:30:01Z"
}
```

- `status`：`ACCEPTED | REJECTED | NOOP_IDEMPOTENT`。
- `NOOP_IDEMPOTENT`：检测到同 key 重放且 payload 等价。
- `REJECTED` 必须返回标准错误码。

## 6. Event Envelope（统一事件封装）

### 6.1 结构
```json
{
  "event_id": "evt_...",
  "event_name": "TaskCreated",
  "aggregate_type": "TASK",
  "aggregate_id": "task_...",
  "project_id": "proj_...",
  "session_id": "sess_...",
  "task_id": "task_...",
  "causation_id": "cmd_...",
  "correlation_id": "corr_...",
  "actor": {
    "actor_type": "HUMAN",
    "actor_id": "user_..."
  },
  "occurred_at": "2026-02-10T15:30:01Z",
  "aggregate_version": 13,
  "schema_version": 1,
  "payload": {}
}
```

### 6.2 字段约束
- `event_id`：事件唯一 ID。
- `event_name`：必须来自领域文档事件清单。
- `causation_id`：必须指向触发命令 ID。
- `correlation_id`：同一业务链路共享一个关联 ID。
- `aggregate_version`：事件写入后的聚合版本号。
- `payload`：最小字段集遵循领域文档定义。

## 7. 幂等与并发契约
- 唯一键建议：`(aggregate_id, command_name, idempotency_key)`。
- 同 key + 同 payload：返回 `NOOP_IDEMPOTENT`。
- 同 key + 不同 payload：返回 `HELIOS-CMD-409-IDEMPOTENCY_KEY_REUSE_CONFLICT`。
- `expected_version` 不匹配：返回 `HELIOS-CMD-409-VERSION_CONFLICT`。

## 8. 命令入参契约（v1 必须实现）

## 8.1 Project Commands

### `CreateProject`
- `payload` 必填：`name`, `owner_id`。
- 强制：`actor.actor_type=HUMAN`。
- 触发事件：`ProjectCreated`。
- 典型拒绝：`HELIOS-PRJ-403-OWNER_MUST_BE_HUMAN`。

### `EndProject`
- `payload` 必填：`decision_id`, `reason`。
- 前置：有效治理决策且类型为 `TERMINATE_PROJECT`。
- 触发事件：`ProjectEnded`。
- 典型拒绝：`HELIOS-PRJ-403-END_REQUIRES_HUMAN_GOV_DECISION`。

## 8.2 Session Commands

### `CreateSession`
- `payload` 必填：`project_id`, `chat_thread_id`, `contact_id`, `chat_type`（`PRIVATE | GROUP`）。
- 前置：项目非 `ENDED`。
- 触发事件：`SessionCreated`。
- 典型拒绝：`HELIOS-SES-404-PROJECT_NOT_FOUND`, `HELIOS-SES-409-PROJECT_ENDED`。

### `RecordMessageEvent`
- `payload` 必填：`message_id`, `message_type`, `content_ref`。
- 前置：会话非 `CLOSED`。
- 触发事件：`SessionMessageRecorded`。
- 典型拒绝：`HELIOS-SES-409-SESSION_CLOSED`。

### `RecordCapabilityChanged`
- `payload` 必填：`agent_id`, `change_summary`, `impact_scope`。
- 前置：`agent_id` 有效且可追踪。
- 触发事件：`CapabilityChanged`。
- 典型拒绝：`HELIOS-SES-422-CAPABILITY_CHANGE_INCOMPLETE`。

## 8.3 Task Commands

### `CreateTask`
- `payload` 必填：`session_id`, `task_type`, `summary`。
- 前置：会话非 `CLOSED`。
- 触发事件：`TaskCreated`。
- 典型拒绝：`HELIOS-TSK-409-SESSION_CLOSED`。

### `RecordClarificationAsked`
- `payload` 必填：`question_ref`。
- 前置：任务处于 `CLARIFYING` 或可进入该状态。
- 触发事件：`TaskClarificationAsked`。
- 典型拒绝：`HELIOS-TSK-409-INVALID_STATE_TRANSITION`。

### `RecordForcedAssumption`
- `payload` 必填：`assumption`, `reason`。
- 前置：`budget_used >= budget_limit`。
- 触发事件：`TaskForcedAssumptionRecorded`, `TaskRiskEscalated`。
- 典型拒绝：`HELIOS-TSK-422-CLARIFICATION_BUDGET_NOT_EXHAUSTED`。

### `PauseTask`
- `payload` 必填：`reason`。
- 前置：状态为 `RUNNING | HIGH_RISK_RUNNING`。
- 触发事件：`TaskPaused`。
- 典型拒绝：`HELIOS-TSK-409-INVALID_STATE_TRANSITION`。

### `RecordTaskUpgradeRequested`
- `payload` 必填：`upgrade_reason`, `impact_assessment`。
- 前置：任务已暂停（升级三连第 1 步）。
- 触发事件：`TaskUpdated` 或实现层专用升级请求事件。
- 典型拒绝：`HELIOS-TSK-412-UPGRADE_REQUIRES_PAUSE`。

### `RecordTaskUpgradeNotified`
- `payload` 必填：`notification_channel`, `notified_user_id`。
- 前置：升级请求已存在。
- 触发事件：`TaskUpgradeNotified`。
- 典型拒绝：`HELIOS-TSK-412-UPGRADE_REQUEST_NOT_FOUND`。

### `RecordTaskUpgradeHumanConfirmed`
- `payload` 必填：`confirmed_by_human_id`, `confirmation_note`。
- 前置：已通知用户且确认人是 `HUMAN`。
- 触发事件：`TaskUpgraded`。
- 典型拒绝：`HELIOS-TSK-403-UPGRADE_CONFIRM_REQUIRES_HUMAN`。

### `ResumeTask`
- `payload` 必填：`reason`。
- 前置：任务状态为 `PAUSED`。
- 触发事件：`TaskResumed`。
- 典型拒绝：`HELIOS-TSK-409-INVALID_STATE_TRANSITION`。

### `CompleteTask`
- `payload` 必填：`completion_summary`。
- 前置：状态为 `RUNNING | HIGH_RISK_RUNNING`。
- 触发事件：`TaskCompleted`。
- 典型拒绝：`HELIOS-TSK-409-INVALID_STATE_TRANSITION`。

### `FailTask`
- `payload` 必填：`failure_reason`, `visibility_scope`。
- 前置：状态为 `RUNNING | HIGH_RISK_RUNNING`。
- 触发事件：`TaskFailed`。
- 典型拒绝：`HELIOS-TSK-409-INVALID_STATE_TRANSITION`。

## 8.4 Agent Commands

### `CreateAgent`
- `payload` 必填：`name`, `initial_role`, `initial_skill_version`, `prompt_hash`。
- 触发事件：`AgentCreated`, `AgentRoleUpdated`, `AgentSkillUpdated`。
- 典型拒绝：`HELIOS-AGT-409-IDENTITY_CONFLICT`。

### `RecordAgentSkillUpdated`
- `payload` 必填：`skill_version`, `prompt_hash`, `change_summary`, `impact_scope`。
- 前置：Agent 非 `DISMISSED`。
- 触发事件：`AgentSkillUpdated`, `CapabilityChanged`。
- 典型拒绝：`HELIOS-AGT-409-AGENT_DISMISSED`。

### `RecordAgentSkillRolledBack`
- `payload` 必填：`from_version`, `to_version`, `reason`。
- 前置：目标版本存在。
- 触发事件：`AgentSkillRolledBack`, `CapabilityChanged`。
- 典型拒绝：`HELIOS-AGT-404-SKILL_VERSION_NOT_FOUND`。

### `PauseAgent`
- `payload` 必填：`reason`。
- 前置：状态为 `ACTIVE`。
- 触发事件：`AgentPaused`。
- 典型拒绝：`HELIOS-AGT-409-INVALID_STATE_TRANSITION`。

### `EndAgent`
- `payload` 必填：`reason`。
- 前置：状态为 `ACTIVE | FROZEN`。
- 触发事件：`AgentEnded`。
- 典型拒绝：`HELIOS-AGT-409-INVALID_STATE_TRANSITION`。

## 8.5 Governance Commands

### `CreateGovernanceCase`
- `payload` 必填：`target_domain`, `target_id`, `reason`。
- 触发事件：`GovernanceCaseCreated`。
- 典型拒绝：`HELIOS-GOV-404-TARGET_NOT_FOUND`。

### `RecordGovernanceEvidence`
- `payload` 必填：`evidence_ref`, `evidence_type`, `summary`。
- 前置：案件处于 `OPEN`。
- 触发事件：`GovernanceEvidenceRecorded`。
- 典型拒绝：`HELIOS-GOV-409-CASE_NOT_OPEN`。

### `ApplyGovernanceDecision`
- `payload` 必填：`decision_type`, `decision_reason`, `target_domain`, `target_id`。
- 前置：案件处于 `OPEN`。
- 强制：若 `decision_type=TERMINATE_PROJECT`，`actor.actor_type` 必须为 `HUMAN`。
- 触发事件：`GovernanceDecisionRecorded`。
- 典型拒绝：`HELIOS-GOV-403-NON_HUMAN_TERMINATE_PROJECT_DENIED`。

### `EndGovernanceCase`
- `payload` 必填：`end_reason`。
- 前置：案件状态 `DECIDED | CANCELLED`。
- 触发事件：`GovernanceCaseEnded`。
- 典型拒绝：`HELIOS-GOV-409-CASE_NOT_CLOSABLE`。

## 9. 错误码契约

## 9.1 错误返回结构
```json
{
  "code": "HELIOS-TSK-412-UPGRADE_REQUIRES_PAUSE",
  "message": "Task upgrade requires paused state before request.",
  "category": "PRECONDITION",
  "retryable": false,
  "details": {
    "task_id": "task_...",
    "current_status": "RUNNING"
  }
}
```

## 9.2 通用错误码（跨域）
- `HELIOS-CMD-400-INVALID_PAYLOAD`：入参缺失或类型错误。
- `HELIOS-CMD-401-UNAUTHENTICATED`：未认证。
- `HELIOS-CMD-403-FORBIDDEN`：无操作权限。
- `HELIOS-CMD-404-AGGREGATE_NOT_FOUND`：目标聚合不存在。
- `HELIOS-CMD-409-VERSION_CONFLICT`：聚合版本冲突。
- `HELIOS-CMD-409-IDEMPOTENCY_KEY_REUSE_CONFLICT`：同 key 不同 payload。
- `HELIOS-CMD-422-INVARIANT_VIOLATION`：违反领域不变量。
- `HELIOS-CMD-503-DEPENDENCY_UNAVAILABLE`：外部依赖不可用。

## 9.3 领域关键错误码（必须保留）
- `HELIOS-PRJ-403-OWNER_MUST_BE_HUMAN`
- `HELIOS-PRJ-403-END_REQUIRES_HUMAN_GOV_DECISION`
- `HELIOS-SES-409-SESSION_CLOSED`
- `HELIOS-SES-422-CAPABILITY_CHANGE_INCOMPLETE`
- `HELIOS-TSK-412-UPGRADE_REQUIRES_PAUSE`
- `HELIOS-TSK-412-UPGRADE_REQUEST_NOT_FOUND`
- `HELIOS-TSK-403-UPGRADE_CONFIRM_REQUIRES_HUMAN`
- `HELIOS-TSK-422-CLARIFICATION_BUDGET_NOT_EXHAUSTED`
- `HELIOS-AGT-404-SKILL_VERSION_NOT_FOUND`
- `HELIOS-AGT-409-AGENT_DISMISSED`
- `HELIOS-GOV-403-NON_HUMAN_TERMINATE_PROJECT_DENIED`
- `HELIOS-GOV-409-CASE_NOT_OPEN`

## 10. 事件最小字段对齐要求
- 实现必须保证事件 payload 至少包含各领域文档定义的最小字段。
- 如果实现层新增字段，只允许追加，不允许删除或重命名既有字段。
- 事件 `schema_version` 升级时必须提供向后兼容读取策略。

## 11. 与流程图的一致性门禁
- 上线前必须通过以下流程一致性检查：
1. Task 升级必须完整触发 `Pause -> Notify -> HumanConfirm`。
2. 澄清预算耗尽必须进入 `HIGH_RISK_RUNNING`。
3. Agent 能力变化必须产生 `CapabilityChanged` 并由 Session 追加写。
4. 非 HUMAN 的 `TERMINATE_PROJECT` 必须被拒绝并记录审计。
5. 社交 App 私聊/群聊必须映射到可追踪 Session。
6. 工具会话绑定（Codex/Claude Code）必须支持复用与失效重建。

## 12. 参考文档
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Domain Model Overview.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Task Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Session Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Project Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Agent Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Governance Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Business Flows.md`
