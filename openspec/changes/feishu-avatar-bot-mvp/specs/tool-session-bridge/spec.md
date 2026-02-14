## ADDED Requirements

### Requirement: 单协作会话 MUST 支持多个工具会话绑定
系统 MUST 支持在同一 `collab_session_id` 下绑定多个 `tool_session_id`，并保持会话隔离。

#### Scenario: 同会话绑定第二个工具会话
- **WHEN** 任务需要切换到另一个工具会话
- **THEN** 系统新增绑定且不影响已有绑定关系

### Requirement: 协作轨 MUST NOT 写入完整工具 transcript
协作会话时间线 MUST only 写入工具摘要卡片、状态与引用，不得写入工具完整聊天记录。

#### Scenario: 工具返回长对话内容
- **WHEN** 工具会话产生多轮输出
- **THEN** 协作轨仅记录 150 字摘要与引用链接

### Requirement: 运行映射 MUST 可用于回灌路由
系统 MUST 维护 `task_id <-> tool_session_id <-> run_id` 映射，供后续交互回灌定位。

#### Scenario: 同任务多个运行实例
- **WHEN** 同一任务存在历史运行与当前运行
- **THEN** 回灌只路由到当前活动 `run_id`
