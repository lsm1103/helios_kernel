# Agent Domain Model v1

## 1. Domain Boundary
- Agent 域负责执行者身份、角色、技能版本与可替换性管理。
- Agent 域负责冻结、解雇、技能回滚等执行能力治理动作。
- Agent 域不拥有项目终结权，不定义任务业务规则。
- Agent 域的能力变化必须向 Session 域输出可记录标记。

## 2. Aggregate & Entities

### 2.1 Aggregate Root
- `AgentAggregate`
- 主键：`agent_id`

### 2.2 Entities
- `Agent`
  - `agent_id`
  - `name`
  - `status: AgentStatus`
  - `identity_version`
  - `created_at`
  - `updated_at`
- `AgentRole`
  - `agent_id`
  - `role_code`
  - `role_desc`
  - `effective_at`
- `AgentSkillVersion`
  - `agent_id`
  - `skill_version`
  - `prompt_hash`
  - `change_summary`
  - `is_current`
  - `effective_at`

### 2.3 Value Objects
- `AgentIdentity`：稳定身份标识，不随技能更新变动。
- `SkillRollbackRef`：回滚目标版本、发起人、原因。
- `IdempotencyToken`：命令幂等控制。

## 3. State Model

### 3.1 状态集合
- `ACTIVE`
- `FROZEN`
- `DISMISSED`

### 3.2 合法迁移
- `ACTIVE -> FROZEN`
- `FROZEN -> ACTIVE`
- `ACTIVE -> DISMISSED`
- `FROZEN -> DISMISSED`

### 3.3 禁止迁移
- 禁止 `DISMISSED -> ACTIVE`。
- 禁止 `DISMISSED -> FROZEN`。
- 禁止冻结或解雇后继续接收新任务分配。

## 4. Commands
- `CreateAgent`
  - 前置条件：身份唯一。
  - 幂等键：`agent_external_ref + idempotency_key`。
- `UpdateAgent`
  - 前置条件：状态非 `DISMISSED`。
- `UpdateAgentRole`
  - 前置条件：状态为 `ACTIVE` 或 `FROZEN`。
- `RecordAgentSkillUpdated`
  - 前置条件：状态非 `DISMISSED`。
- `RecordAgentSkillRolledBack`
  - 前置条件：存在目标技能版本。
- `PauseAgent`
  - 前置条件：状态为 `ACTIVE`。
- `ResumeAgent`
  - 前置条件：状态为 `FROZEN`。
- `EndAgent`
  - 前置条件：状态为 `ACTIVE` 或 `FROZEN`，并满足组织策略。
- `ApplyGovernanceDecision`
  - 前置条件：治理决策可应用到当前 Agent。

## 5. Events
- `AgentCreated`
  - 触发条件：`CreateAgent` 成功。
  - 最小字段：`agent_id`, `created_by`, `occurred_at`。
- `AgentUpdated`
  - 触发条件：`UpdateAgent` 成功。
  - 最小字段：`agent_id`, `updated_fields`, `occurred_at`。
- `AgentRoleUpdated`
  - 触发条件：角色变更成功。
  - 最小字段：`agent_id`, `role_code`, `occurred_at`。
- `AgentSkillUpdated`
  - 触发条件：技能版本升级。
  - 最小字段：`agent_id`, `skill_version`, `change_summary`, `occurred_at`。
- `AgentSkillRolledBack`
  - 触发条件：技能版本回滚。
  - 最小字段：`agent_id`, `from_version`, `to_version`, `occurred_at`。
- `AgentPaused`
  - 触发条件：冻结成功。
  - 最小字段：`agent_id`, `reason`, `paused_by`, `occurred_at`。
- `AgentResumed`
  - 触发条件：解冻成功。
  - 最小字段：`agent_id`, `resumed_by`, `occurred_at`。
- `AgentEnded`
  - 触发条件：解雇成功。
  - 最小字段：`agent_id`, `ended_by`, `occurred_at`。
- `CapabilityChanged`
  - 触发条件：技能更新或回滚后需通知会话域。
  - 最小字段：`agent_id`, `change_summary`, `impact_scope`, `occurred_at`。

## 6. Invariants
- Agent 仅是执行者，不拥有项目终结裁决权。
- Prompt/Skill 可回滚，但历史事实不可回滚。
- 任意能力变化必须可映射为 `CapabilityChanged` 事件。
- `DISMISSED` Agent 不得重新激活。

## 7. Failure & Recovery
- 技能版本发布失败时，不改变当前版本并记录失败原因。
- 回滚目标版本不存在时拒绝请求并记录审计日志。
- 对同一技能更新命令重复提交，幂等返回同一版本结果。
- 治理域冻结决策应用失败时，标记为“待重试”并保留决策链路。

## 8. Cross-Domain References
- 引用 `Session`：能力变化通过 `CapabilityChanged` 供会话域追加标记。
- 引用 `Task`：任务仅持有执行者引用，不复制技能版本快照。
- 引用 `Governance`：冻结、解雇等高影响动作可由治理域决策触发。
- 引用 `Project`：项目仅消费 Agent 身份引用，不管理 Agent 生命周期。
