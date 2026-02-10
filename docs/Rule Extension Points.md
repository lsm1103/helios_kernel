# Rule Extension Points v1

## 1. 文档目标
- 定义 Scheduled Task 与 Proactivity Feedback 的扩展点契约。
- 本文档只冻结事件与配置接口，不提供策略算法实现。
- 本文档与五域模型通过 `Task` 与 `Governance` 事件体系挂接。

## 2. 边界声明
- 扩展点属于策略层接口，不属于核心领域状态机主路径。
- 扩展点事件必须遵守不可变事件追加写原则。
- 扩展点不得绕过 `Governance` 人类裁决边界。

## 3. Scheduled Task 扩展点

### 3.1 事件契约
- `ScheduledTaskFailed`
  - 触发条件：定时任务一次执行失败。
  - 最小字段：`schedule_id`, `task_id`, `failed_at`, `error_code`, `consecutive_failures`。
- `ScheduledTaskAutoPaused`
  - 触发条件：连续失败达到阈值并自动暂停。
  - 最小字段：`schedule_id`, `paused_at`, `threshold`, `consecutive_failures`。
- `UserNotifiedPrivately`
  - 触发条件：自动暂停后私聊通知用户。
  - 最小字段：`schedule_id`, `user_id`, `channel`, `notified_at`, `message_template_id`。

### 3.2 配置接口契约
- `scheduled_failure_threshold`
  - 默认值：`5`。
  - 语义：连续失败达到阈值后触发自动暂停。
- `scheduled_notification_channel`
  - 默认值：`PRIVATE_DIRECT_MESSAGE`。
  - 语义：失败告警仅私聊通知，不群体广播。
- `scheduled_pause_cooldown`
  - 默认值：实现层定义。
  - 语义：自动暂停后再次自动恢复的最短冷却窗口。

### 3.3 挂接规则
- `ScheduledTaskFailed` 应由 Task 执行失败事件派生。
- `ScheduledTaskAutoPaused` 可触发治理案件创建以供人工复核。
- `UserNotifiedPrivately` 必须关联具体用户，且不写入群广播流。

## 4. Proactivity Feedback 扩展点

### 4.1 事件契约
- `ProactiveActionRated`
  - 触发条件：用户对主动行为进行赞/踩反馈。
  - 最小字段：`feedback_id`, `session_id`, `actor_id`, `rating`, `rated_at`。
- `FeedbackWindowClosed`
  - 触发条件：半月反馈窗口闭合。
  - 最小字段：`window_id`, `window_start`, `window_end`, `closed_at`。
- `StrategyReviewRequested`
  - 触发条件：窗口闭合后发起策略复盘。
  - 最小字段：`review_id`, `window_id`, `requested_by`, `requested_at`。

### 4.2 配置接口契约
- `proactivity_feedback_window_days`
  - 默认值：`15`。
  - 语义：反馈按半月窗口汇总分析。
- `proactivity_min_sample_size`
  - 默认值：实现层定义。
  - 语义：低样本时仅记录，不触发策略建议。
- `proactivity_review_visibility`
  - 默认值：`HUMAN_REVIEW_REQUIRED`。
  - 语义：策略调整建议必须有人类参与确认。

### 4.3 挂接规则
- `ProactiveActionRated` 追加到 Session 时间线并可关联 Agent。
- `FeedbackWindowClosed` 触发汇总任务，但不直接改动 Agent Prompt。
- `StrategyReviewRequested` 进入治理或运营流程，作为人类共同优化入口。

## 5. 不可变约束
- 扩展点事件必须可审计、可复盘、可重放。
- 扩展点不得直接修改 `Project` 终结状态。
- 扩展点不得跳过 `Session` 能力变化留痕机制。
- 扩展点中的自动化动作必须允许人类覆盖与中止。

## 6. 非目标
- 不定义失败阈值动态学习算法。
- 不定义反馈评分加权算法。
- 不定义推荐文案生成策略。
- 不定义 UI 展示样式与交互细节。
