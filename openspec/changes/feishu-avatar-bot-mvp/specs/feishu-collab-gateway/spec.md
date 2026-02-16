## Status

- Implementation: `IN_PROGRESS` (as of 2026-02-15)
- Notes: HTTP webhook endpoint exists, but full Feishu->collab session mapping and thread reply routing are not fully implemented yet.

## ADDED Requirements

### Requirement: Feishu 消息 MUST 映射到协作会话
系统 MUST 将飞书消息按 `(project_id, chat_thread_id, contact_id)` 映射到协作会话；不存在时 MUST 创建新会话。

#### Scenario: 私聊消息创建新协作会话
- **WHEN** 收到飞书私聊消息且未找到匹配会话
- **THEN** 系统创建新协作会话并记录 `SessionCreated`

#### Scenario: 群聊消息复用已有协作会话
- **WHEN** 收到飞书群聊消息且存在匹配会话
- **THEN** 系统复用该协作会话并记录 `SessionMessageRecorded`

### Requirement: 协作响应 MUST 回发原线程
系统生成的协作响应 MUST 发送回触发消息所在飞书线程，不得跨线程发送。

#### Scenario: 普通对话意图回发原线程
- **WHEN** 消息被识别为对话意图
- **THEN** 响应发送到原 `chat_thread_id`

#### Scenario: 任务触发结果回发原线程
- **WHEN** 消息被识别为任务意图并创建/更新任务
- **THEN** 任务受理结果发送到原 `chat_thread_id`
