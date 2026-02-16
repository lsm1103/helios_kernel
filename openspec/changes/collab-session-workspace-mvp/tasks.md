## 1. Session API and Persistence

- [x] 1.1 定义协作会话实体字段与状态枚举（`ACTIVE`、`ARCHIVED`）并完成 SQLite 迁移
- [x] 1.2 实现会话列表与创建接口（支持 `name`、`description`）
- [x] 1.3 实现会话详情查询接口并返回可扩展 metadata 结构
- [x] 1.4 实现会话归档接口（状态更新 + 审计记录）

## 2. Session Management Page

- [x] 2.1 重构协作会话页为管理页，仅保留列表与创建入口
- [x] 2.2 实现创建会话弹窗与表单校验，提交成功后刷新列表
- [x] 2.3 为列表项实现固定三动作：进入会话、详情、归档
- [x] 2.4 实现默认仅显示活跃会话，并支持显示归档筛选

## 3. Session Chat Workspace Page

- [x] 3.1 新增独立路由 `/sessions/[sessionId]` 承载会话聊天
- [x] 3.2 在聊天页顶部实现上下文条，显示 `workspace_path`、`active_tool`、`linked_tool_sessions`
- [x] 3.3 调整时间线渲染策略，仅显示工具卡片，不直接显示完整 transcript
- [x] 3.4 实现工具卡片点击行为，支持打开工具详情抽屉

## 4. Tool Transcript Drawer

- [x] 4.1 将工具详情抽屉改为 body 级渲染，避免组件容器约束
- [x] 4.2 固定抽屉布局为右侧、全屏高度、约 50% 视口宽度
- [x] 4.3 为抽屉内容实现会话消息滚动与加载状态展示
- [x] 4.4 补充抽屉开关、Esc 关闭、遮罩关闭等交互一致性处理

## 5. Validation and Rollout

- [x] 5.1 补充会话创建、详情、归档的 API 单元测试/集成测试
- [x] 5.2 补充会话管理页与聊天页关键交互的前端测试
- [x] 5.3 执行联调验证：会话列表 -> 进入会话 -> 工具卡片 -> 抽屉查看 -> 归档
- [x] 5.4 更新变更文档并运行 `openspec validate collab-session-workspace-mvp --strict`
