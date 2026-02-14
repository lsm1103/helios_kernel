# Feishu 协作网关规则

## 1. 会话映射规则
- SessionKey: `(project_id, chat_thread_id, contact_id)`。
- 若命中现有 ACTIVE/PAUSED 会话则复用；否则创建新会话。
- 对同一事件重复投递按 `event_id` 幂等去重。

## 2. 私聊/群聊解析规则
### 2.1 私聊
- `chat_thread_id`: 飞书会话线程 ID。
- `contact_id`: 机器人对端用户 ID。

### 2.2 群聊
- `chat_thread_id`: 群线程 ID。
- `contact_id`: 被 @ 的工具联系人；若无 @ 则按群默认路由联系人。

### 2.3 样例
1. 私聊输入 `请帮我写接口` -> `(proj_a, thread_u1, codex_bot)`。
2. 群聊 `@codex 设计数据库` -> `(proj_a, thread_g1, codex_bot)`。
3. 群聊 `@claude 写测试` -> `(proj_a, thread_g1, claude_bot)`。

## 3. 异常输入拒绝规则
- 缺失 `project_id` -> 拒绝并返回 `HELIOS-SES-422-PROJECT_REQUIRED`。
- 群聊无可解析联系人 -> 拒绝并返回 `HELIOS-SES-422-CONTACT_UNRESOLVED`。
- 线程 ID 非法 -> 拒绝并记录审计。

## 4. 同线程响应验收用例
### 成功用例
1. 私聊消息触发对话响应，响应回原 `chat_thread_id`。
2. 群聊 @codex 触发任务创建，受理结果回原 `chat_thread_id`。
3. 群聊 @claude 触发任务更新，更新结果回原 `chat_thread_id`。

### 失败用例
1. 线程回发失败触发重试（最多 3 次，指数退避）。
2. 重试耗尽后写告警事件并转人工处理队列。
3. 下游飞书 API 超时时返回可重试错误并保留关联 ID。
