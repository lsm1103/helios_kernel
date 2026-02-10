# HELIOS v1 规格冻结评审（Step 1）

## 1. 评审目标
- 对 v1 规格进行冻结前一致性评审。
- 只检查“是否满足已定规则”，不新增功能范围。
- 输出冻结结论、验收结果、遗留风险。

## 2. 评审范围
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Domain Model Overview.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Task Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Session Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Governance Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Project Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Agent Domain Model.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Rule Extension Points.md`
- `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Business Flows.md`

## 3. 冻结基线
- 建模范式：`Current State + Immutable Events`（混合模型）。
- 五域范围：`Project / Session / Task / Agent / Governance`。
- 扩展点边界：Scheduled 与 Proactivity 仅保留契约，不落策略算法。
- 文档风格：中文叙述 + 英文标识常量。

## 4. 关键不变量评审结果
- `PASS`：Project 终结仅允许 `HUMAN` 通过治理决策触发。
- `PASS`：Session 历史 append-only，不允许篡改；能力变化要求 `CapabilityChanged`。
- `PASS`：Task 升级三连完整落地：`Pause -> Notify -> HumanConfirm`。
- `PASS`：澄清预算耗尽后进入 `HIGH_RISK_RUNNING` 并继续执行。
- `PASS`：Agent Prompt/Skill 回滚不改变历史事实。
- `PASS`：跨域只引用 ID，不跨域直接写状态。

## 5. 验收场景对照
1. 场景：Task 升级复杂化。
- 结果：`PASS`
- 证据：Task 领域文档定义 `RecordTaskUpgradeRequested`、`RecordTaskUpgradeNotified`、`RecordTaskUpgradeHumanConfirmed` 与对应事件；流程图第 2 节一致。

2. 场景：澄清预算耗尽。
- 结果：`PASS`
- 证据：Task 领域文档定义强制假设、风险升级和 `HIGH_RISK_RUNNING`。

3. 场景：Agent 技能变化留痕。
- 结果：`PASS`
- 证据：Agent 输出 `CapabilityChanged`；Session 要求追加该事件并保持历史不可篡改。

4. 场景：Agent 终结项目。
- 结果：`PASS`
- 证据：Governance 禁止非 `HUMAN` 执行 `TERMINATE_PROJECT`；流程图第 5 节给出拒绝与审计。

5. 场景：Session 历史修订请求。
- 结果：`PASS`
- 证据：Session 明确 append-only，只允许追加事件。

6. 场景：定时任务连续失败。
- 结果：`PASS`
- 证据：扩展点定义 `ScheduledTaskFailed`、`ScheduledTaskAutoPaused`、`UserNotifiedPrivately` 契约。

7. 场景：主动行为半月反馈。
- 结果：`PASS`
- 证据：扩展点定义 `ProactiveActionRated`、`FeedbackWindowClosed`、`StrategyReviewRequested`。

## 6. 社交交互与工具会话评审结果
- `PASS`：`Session = 私聊/群聊协作容器` 已在流程图第 7 节显式建模。
- `PASS`：同一工具联系人可并行多个 Session，且上下文隔离。
- `PASS`：Codex/Claude Code 等工具会话通过 `ToolSessionBinding` 进行绑定、复用、失效重建。

## 7. 冻结决议
- 决议：`v1 规格通过冻结评审`。
- 冻结内容：当前九份文档作为实现输入基线。
- 冻结策略：后续仅允许“纠错类修订”，禁止新增范围型需求进入 v1。

## 8. 实施前残余风险（不阻塞）
- 风险 A：命令入参与错误码尚未统一成实现契约。
- 处理：在 `/Users/xm/Desktop/work_project/backend/helios_kernel/docs/Implementation Contracts.md` 固化。
- 风险 B：事件 envelope 字段尚未统一定义。
- 处理：同上文档一次性定稿。

## 9. 结论
- 规格质量状态：`Ready for Implementation`。
- 下一步：执行 Step 2，补齐实现契约并作为开发入口规范。
