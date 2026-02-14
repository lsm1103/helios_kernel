# 工具会话桥接契约

## 1. `tool_session_links` 数据模型
- `link_id`
- `collab_session_id`
- `task_id`
- `provider` (`codex|claude_code`)
- `tool_session_id`
- `status` (`ACTIVE|PAUSED|CLOSED`)
- `last_active_at`
- `created_at`

## 2. 状态迁移
- `ACTIVE -> PAUSED`
- `PAUSED -> ACTIVE`
- `ACTIVE -> CLOSED`
- `PAUSED -> CLOSED`
- `CLOSED` 不可回退。

## 3. list/use/peek 能力
### list
- 列出 `collab_session_id` 下所有工具会话，按 `last_active_at` 倒序。

### use
- 将指定工具会话标记为当前活动会话。
- 并发冲突策略: 乐观锁版本不一致则返回冲突错误。

### peek
- 返回目标会话最近 N 条摘要视图，不回传完整 transcript。

## 4. 权限边界
- 仅会话参与者与治理审计角色可 list/peek。
- use 操作需具备任务执行权限。

## 5. 摘要卡片与 150 字规则
- 模板字段: provider、tool_session_id、status、summary_150、last_active_at、open_link。
- 摘要长度 > 150 时截断并追加 `...`。
- 敏感信息（密钥、内网地址、凭据）必须脱敏。
