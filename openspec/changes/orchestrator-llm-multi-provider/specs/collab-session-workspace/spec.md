## MODIFIED Requirements

### Requirement: 会话聊天页 MUST 显式显示执行上下文
会话聊天页 MUST 在固定上下文区展示本地路径、当前工具、已绑定工具会话集合，并 MUST 展示当前主编排 LLM 供应商与模型信息。

#### Scenario: 打开聊天页显示编排上下文
- **WHEN** 用户进入某会话聊天页
- **THEN** 页面顶部显示 `workspace_path`、`active_tool`、`linked_tool_sessions`、`orchestrator_provider`、`orchestrator_model`

### Requirement: 工具 transcript MUST NOT 污染协作聊天主轨
协作聊天主轨 MUST NOT 展示工具完整 transcript；工具交互以工具卡片展示并支持抽屉查看详情，且执行进度与完成汇报 MUST 使用主编排 LLM 摘要。

#### Scenario: 时间线展示编排摘要
- **WHEN** 工具执行产生输出
- **THEN** 协作时间线新增编排摘要消息或轻卡片，不写入完整工具 transcript

#### Scenario: 点击工具卡片查看详情
- **WHEN** 用户点击工具卡片
- **THEN** 系统以 body 级右侧抽屉展示该工具会话 transcript
