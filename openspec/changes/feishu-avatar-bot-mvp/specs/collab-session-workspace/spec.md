## Status

- Implementation: `NOT_STARTED` (as of 2026-02-15)
- Notes: This capability captures session workspace UX and lifecycle rules for list/create/enter/detail/archive.

## ADDED Requirements

### Requirement: 协作会话管理页 MUST 提供列表与创建入口
系统 MUST 提供协作会话列表，并在同页提供“创建会话”入口。

#### Scenario: 创建会话弹窗提交成功
- **WHEN** 用户在创建弹窗输入 `name` 与 `description` 并提交
- **THEN** 系统创建新协作会话并回到列表展示新会话

#### Scenario: 后续单句需求增强
- **WHEN** 用户只输入一句需求文本
- **THEN** 系统 SHOULD 支持通过 LLM 生成可编辑的 `name` 与 `description`

### Requirement: 会话列表项 MUST 提供进入会话、详情、归档
每个协作会话列表项 MUST 包含 `进入会话`、`详情`、`归档` 三个动作。

#### Scenario: 进入会话
- **WHEN** 用户点击 `进入会话`
- **THEN** 系统跳转到该会话的独立聊天页面

#### Scenario: 查看详情
- **WHEN** 用户点击 `详情`
- **THEN** 系统弹出会话详情窗，展示 metadata 与运行信息

#### Scenario: 归档会话
- **WHEN** 用户确认归档
- **THEN** 系统将会话状态更新为 `ARCHIVED` 并记录审计事件

### Requirement: 会话聊天页 MUST 显式显示执行上下文
会话聊天页 MUST 在固定上下文区展示本地路径、当前工具、已绑定工具会话集合。

#### Scenario: 打开聊天页显示上下文
- **WHEN** 用户进入某会话聊天页
- **THEN** 页面顶部显示 `workspace_path`、`active_tool` 与 `linked_tool_sessions`

### Requirement: 工具 transcript MUST NOT 污染协作聊天主轨
协作聊天主轨 MUST NOT 展示工具完整 transcript；工具交互以工具卡片展示并支持抽屉查看详情。

#### Scenario: 时间线展示工具卡片
- **WHEN** 工具执行产生输出
- **THEN** 协作时间线仅新增工具卡片（摘要、状态、引用）

#### Scenario: 点击工具卡片查看详情
- **WHEN** 用户点击工具卡片
- **THEN** 系统以 body 级右侧抽屉展示该工具会话 transcript

### Requirement: 工具 transcript 抽屉 MUST 为全屏高度并占据半屏宽度
工具 transcript 抽屉 MUST 以全屏高度渲染，并默认使用视口约 50% 的宽度。

#### Scenario: 侧边抽屉渲染规范
- **WHEN** 工具详情抽屉打开
- **THEN** 抽屉固定在右侧，宽度约为视口一半，可滚动浏览历史消息
