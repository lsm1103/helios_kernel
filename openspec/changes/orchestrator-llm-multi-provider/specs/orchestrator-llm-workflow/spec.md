## ADDED Requirements

### Requirement: 主编排 LLM MUST 执行需求分析与工具引导
系统 MUST 在新需求进入协作会话时执行需求分析，并生成工具选择建议与必要澄清问题。

#### Scenario: 需求进入协作会话
- **WHEN** 用户在协作会话中提交新的开发需求
- **THEN** 系统生成结构化需求摘要并给出工具建议（codex 或 claude_code）

### Requirement: 主编排 LLM MUST 生成执行中进度摘要
系统 MUST 在工具执行过程中生成可读的进度摘要，并写入协作主轨。

#### Scenario: 工具产生阶段性输出
- **WHEN** 工具运行输出达到进度摘要触发条件
- **THEN** 系统写入一条由编排 LLM 生成的进度摘要消息

### Requirement: 主编排 LLM MUST 生成完成汇报与归档摘要
系统 MUST 在 run 完成后生成完成汇报，并在会话归档时生成归档摘要。

#### Scenario: run 正常结束
- **WHEN** 工具 run 状态变为 `RUN_DONE`
- **THEN** 系统生成任务完成汇报并写入协作会话

#### Scenario: 会话归档
- **WHEN** 用户归档协作会话
- **THEN** 系统生成归档摘要并持久化到会话摘要字段
