## ADDED Requirements

### Requirement: 协作会话管理页 MUST 提供列表与创建入口
系统 MUST 提供协作会话列表，并在同一页面提供创建会话入口。

#### Scenario: 展示会话列表
- **WHEN** 用户打开协作会话管理页
- **THEN** 系统展示会话列表，包含会话标题、状态与更新时间

#### Scenario: 创建会话成功
- **WHEN** 用户在创建会话弹窗提交 `name` 与 `description`
- **THEN** 系统创建新会话并在列表中展示该会话

### Requirement: 会话列表项 MUST 提供进入会话、详情、归档三个动作
每个会话列表项 MUST 提供进入会话、详情、归档三个可执行动作。

#### Scenario: 进入会话跳转
- **WHEN** 用户点击 `进入会话`
- **THEN** 系统跳转至该会话的独立聊天页面

#### Scenario: 查看会话详情
- **WHEN** 用户点击 `详情`
- **THEN** 系统弹出会话详情窗口并展示会话元数据

#### Scenario: 归档会话
- **WHEN** 用户确认执行 `归档`
- **THEN** 系统将会话状态更新为 `ARCHIVED` 并记录审计事件

### Requirement: 会话聊天页 MUST 显示执行上下文条
会话聊天页 MUST 在固定区域展示执行上下文，包括本地路径、当前工具和已绑定工具会话集合。

#### Scenario: 打开聊天页显示上下文
- **WHEN** 用户进入会话聊天页
- **THEN** 页面显示 `workspace_path`、`active_tool` 与 `linked_tool_sessions`

### Requirement: 工具完整 transcript MUST NOT 直接写入协作聊天主轨
协作聊天主轨 MUST 仅显示工具卡片摘要，不得直接展开工具完整 transcript。

#### Scenario: 工具执行产生输出
- **WHEN** 工具会话产生多轮输出
- **THEN** 协作时间线仅新增工具卡片，不渲染完整 transcript 内容

### Requirement: 工具卡片详情 MUST 通过 body 级右侧抽屉展示
用户点击工具卡片后，系统 MUST 使用 body 级右侧抽屉展示工具 transcript。

#### Scenario: 打开 transcript 抽屉
- **WHEN** 用户点击工具卡片的查看动作
- **THEN** 页面打开右侧抽屉并可滚动查看该工具会话历史

#### Scenario: 抽屉尺寸规范
- **WHEN** transcript 抽屉打开
- **THEN** 抽屉占据全屏高度且默认宽度约为视口 50%

### Requirement: 归档会话 MUST 默认从活跃列表隐藏
系统 MUST 在默认视图中仅展示活跃会话，归档会话仅在包含归档的筛选视图中出现。

#### Scenario: 默认筛选行为
- **WHEN** 会话状态为 `ARCHIVED`
- **THEN** 该会话不出现在默认活跃列表中
