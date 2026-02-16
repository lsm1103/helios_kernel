## Status

- Implementation: `NOT_STARTED` (as of 2026-02-15)
- Notes: This capability is specified but not yet implemented in current API/UI code.

## ADDED Requirements

### Requirement: 技术问答 MUST 支持规则区/API 文档检索
系统 MUST 能回答规则区与 API 文档范围内问题；回答 SHOULD 附来源标识。

#### Scenario: 用户询问 API 参数
- **WHEN** 用户询问已收录 API 的参数与调用方式
- **THEN** 系统返回答案并附文档来源

### Requirement: 命令执行 MUST 受白名单约束
系统 MUST 仅执行白名单内命令；未授权命令 MUST NOT 执行。

#### Scenario: 用户请求未授权命令
- **WHEN** 用户请求执行不在白名单内的命令
- **THEN** 系统拒绝执行并记录拒绝审计

### Requirement: 高风险动作 MUST 先人工确认
系统 MUST 在高风险命令执行前发起人工确认；未确认 MUST NOT 执行。

#### Scenario: 高风险命令未确认
- **WHEN** 高风险命令未获得审批人确认
- **THEN** 系统保持待处理或拒绝状态，不执行命令
