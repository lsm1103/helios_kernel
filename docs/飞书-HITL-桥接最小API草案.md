# 飞书-HITL-桥接最小 API 草案（v0）

## 1. 目标与范围
- 本文仅定义最小闭环：`工具请求用户输入 -> 飞书触达 -> 用户回传 -> 回灌工具 stdin`。
- 本文不定义 UI 样式细节，不定义工具 transcript 长期存储策略。
- 本文默认 `协作会话` 与 `工具会话` 分离；协作会话中只保留引用卡片与 150 字摘要。

## 2. 术语
- `collab_session_id`：HELIOS 协作会话 ID（映射飞书私聊/群聊线程）。
- `tool_session_id`：外部工具会话 ID（如 Codex/Claude Code 会话标识）。
- `interaction_request_id`：一次待用户决策请求的唯一 ID。
- `run_id`：一次工具执行进程实例 ID（用于 stdin 回灌路由）。

## 3. 飞书卡片字段（最小）

### 3.1 Choice 卡片（用户二选一/多选一）
```json
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": { "tag": "plain_text", "content": "需要你的选择" },
      "template": "blue"
    },
    "elements": [
      { "tag": "markdown", "content": "**任务**: task_123\n**工具**: codex\n**摘要**: 需要你确认是否继续执行高风险变更。" },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "继续" },
            "type": "primary",
            "value": {
              "interaction_request_id": "ir_001",
              "answer_type": "choice",
              "answer_value": "continue"
            }
          },
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "暂停" },
            "value": {
              "interaction_request_id": "ir_001",
              "answer_type": "choice",
              "answer_value": "pause"
            }
          }
        ]
      }
    ]
  }
}
```

### 3.2 Text 卡片（用户自由输入）
```json
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": { "tag": "plain_text", "content": "需要你的回复" },
      "template": "orange"
    },
    "elements": [
      { "tag": "markdown", "content": "**问题**: 请给出数据库迁移窗口（例如: tonight 23:00-23:30）。" },
      {
        "tag": "input",
        "name": "answer_text",
        "placeholder": { "tag": "plain_text", "content": "请输入回复" }
      },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "提交" },
            "type": "primary",
            "value": {
              "interaction_request_id": "ir_002",
              "answer_type": "text"
            }
          }
        ]
      }
    ]
  }
}
```

## 4. 飞书 webhook payload（服务端统一格式）

### 4.1 入站原始回调（飞书）
- 服务端必须校验签名、时间戳与重放窗口。
- 服务端必须提取 `interaction_request_id` 与用户输入。

### 4.2 标准化后内部 payload
```json
{
  "event_id": "lark_evt_123",
  "event_type": "interaction.answer.submitted",
  "occurred_at": "2026-02-12T10:00:00Z",
  "collab_session_id": "sess_001",
  "tool_session_id": "toolsess_codex_abc",
  "interaction_request_id": "ir_001",
  "answered_by": {
    "actor_type": "HUMAN",
    "actor_id": "user_u123"
  },
  "answer": {
    "answer_type": "choice",
    "answer_value": "continue"
  },
  "idempotency_key": "lark_evt_123"
}
```

### 4.3 约束
- `interaction_request_id` 必填，且必须是 `PENDING` 状态。
- 同一 `event_id` 重放必须返回 `NOOP_IDEMPOTENT`。
- 超时或已关闭请求必须拒绝，并返回可审计错误码。

## 5. stdin 回灌接口（内部 API）

### 5.1 API 定义
- `POST /internal/tool-runs/{run_id}/stdin`

请求体：
```json
{
  "interaction_request_id": "ir_001",
  "stdin_text": "continue\n",
  "source": {
    "channel": "lark",
    "event_id": "lark_evt_123",
    "actor_id": "user_u123"
  },
  "idempotency_key": "lark_evt_123"
}
```

响应体：
```json
{
  "status": "ACCEPTED",
  "run_id": "run_001",
  "interaction_request_id": "ir_001",
  "written_bytes": 9,
  "processed_at": "2026-02-12T10:00:01Z"
}
```

### 5.2 行为约束
- 服务端必须校验 `run_id` 与 `interaction_request_id` 绑定关系。
- 服务端必须保证一次请求最多写入一次 stdin（幂等）。
- 写入成功后必须将请求状态改为 `RESOLVED`，并记录审计事件。
- 若工具进程已结束，必须返回 `HELIOS-TOOL-409-RUN_NOT_ACTIVE`。

## 6. 最小状态机
- `PENDING -> RESOLVED`
- `PENDING -> EXPIRED`
- `PENDING -> CANCELLED`
- `RESOLVED/EXPIRED/CANCELLED` 不可回退。

## 7. 端到端流程（最小闭环）
1. 工具运行时输出 `NEED_USER_INPUT` 结构化信号。
2. HELIOS 创建 `interaction_request`（状态 `PENDING`）。
3. HELIOS 发送飞书交互卡片到协作会话。
4. 用户在飞书点击或输入后触发 webhook。
5. HELIOS 标准化 payload 并调用 stdin 回灌接口。
6. 工具继续执行；HELIOS 回发一条 150 字进展摘要到协作会话。

## 8. 最小错误码（建议）
- `HELIOS-HITL-404-INTERACTION_NOT_FOUND`
- `HELIOS-HITL-409-INTERACTION_NOT_PENDING`
- `HELIOS-HITL-409-ANSWER_ALREADY_CONSUMED`
- `HELIOS-TOOL-409-RUN_NOT_ACTIVE`
- `HELIOS-HITL-401-LARK_SIGNATURE_INVALID`
- `HELIOS-HITL-408-INTERACTION_EXPIRED`
