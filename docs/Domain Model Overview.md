# HELIOS Domain Model Overview v1

## 1. 文档目标
- 本文档冻结 HELIOS v1 的五域领域模型公共约定。
- 本文档是 `/docs/Project Domain Model.md`、`/docs/Session Domain Model.md`、`/docs/Task Domain Model.md`、`/docs/Agent Domain Model.md`、`/docs/Governance Domain Model.md` 的上位约束。
- 本文档遵循混合模型：`Current State + Immutable Events`。

## 2. 适用范围
- 覆盖领域：`Project / Session / Task / Agent / Governance`。
- 覆盖内容：术语、状态常量、跨域不变量、命令/事件命名族、引用规则。
- 不覆盖内容：数据库表结构、外部 API 协议、具体技术栈、策略算法细节。

## 3. 冻结术语与类型常量

### 3.1 全局角色与身份
- `ActorType = HUMAN | AGENT | SYSTEM`

### 3.2 领域状态常量
- `ProjectStatus = ACTIVE | ARCHIVED | ENDED`
- `SessionStatus = ACTIVE | PAUSED | CLOSED`
- `TaskType = SHORT | LONG`
- `TaskStatus = CREATED | CLARIFYING | READY | RUNNING | PAUSED | HIGH_RISK_RUNNING | FAILED | COMPLETED`
- `RiskLevel = NORMAL | HIGH_RISK`
- `AgentStatus = ACTIVE | FROZEN | DISMISSED`
- `GovernanceDecisionType = APPROVE | REJECT | TERMINATE_PROJECT | FREEZE_AGENT | RESUME_TASK`

### 3.3 命令与事件命名族
- 核心命令命名族：`Create*`, `Update*`, `Pause*`, `Resume*`, `End*`, `Record*`, `ApplyGovernanceDecision`
- 核心事件命名族：`*Created`, `*Updated`, `*Paused`, `*Resumed`, `*Failed`, `*Completed`, `CapabilityChanged`, `GovernanceDecisionRecorded`

## 4. 通用数据约束
- 所有领域 ID 必须全局唯一，默认可映射 `UUIDv7`。
- 时间字段统一使用 UTC 存储，展示层进行时区转换。
- 所有可审计行为必须追加不可变事件，禁止覆盖历史事件。
- 状态字段用于读取与查询优化，事件字段用于审计与复盘。
- 任何命令必须携带幂等键（`idempotency_key`）以支持重试安全。

## 5. 跨域不变量（一次性定稿）
1. `Project` 只能由 `HUMAN` 通过治理决策终结。
2. `Session` 历史不可篡改；能力变更必须追加 `CapabilityChanged` 事件。
3. `Task` 升级必须执行三连：`Pause -> Notify -> HumanConfirm`。
4. 澄清预算耗尽后，`Task` 必须进入 `HIGH_RISK_RUNNING`，系统不得阻塞执行。
5. `Agent` 的 Prompt/Skill 回滚不改变历史 `Session/Task` 事实记录。
6. Scheduled/Proactivity 本轮仅定义扩展点契约，不定义策略算法。

## 6. 跨域引用与写入边界
- 统一引用原则：跨域只保存外域 ID，不直接写外域状态。
- 推荐引用链：`Project(1) -> Session(n) -> Task(n)`。
- 约束：一个 `Session` 只属于一个 `Project`，一个 `Task` 只属于一个 `Session`。
- `Governance` 通过决策事件影响目标域，不绕过目标域聚合约束。
- `Agent` 参与执行时只以 `agent_id` 或 `actor_id` 被引用。

## 7. 混合模型落地规范
- 写入路径：命令校验成功后，先更新当前状态，再追加领域事件。
- 一致性要求：单聚合内状态与事件同事务提交。
- 回放原则：任一状态变更都可由事件序列解释。
- 审计要求：任何“拒绝操作”也应记录为可审计事件或拒绝日志。

## 8. 扩展点边界
- Scheduled Task 扩展点事件：`ScheduledTaskFailed`, `ScheduledTaskAutoPaused`, `UserNotifiedPrivately`。
- Proactivity Feedback 扩展点事件：`ProactiveActionRated`, `FeedbackWindowClosed`, `StrategyReviewRequested`。
- 本轮只冻结事件契约与配置接口，不给阈值算法、评分算法、推荐算法实现。

## 9. 上位约束来源
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Core Domain.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Task & Session 不可变规格.md`
