## ADDED Requirements

### Requirement: 主编排 LLM 配置 MUST 支持多供应商
系统 MUST 支持配置并切换 `openai`、`anthropic`、`volcengine_ark` 三种供应商，且每个供应商 MUST 支持模型、Base URL、超时、温度与最大输出长度配置。

#### Scenario: 配置 OpenAI 供应商
- **WHEN** 管理员将主供应商设置为 `openai` 并保存模型参数
- **THEN** 系统持久化配置并将后续编排请求路由到 OpenAI Provider

#### Scenario: 配置 Anthropic 供应商
- **WHEN** 管理员将主供应商设置为 `anthropic` 并保存模型参数
- **THEN** 系统持久化配置并将后续编排请求路由到 Anthropic Provider

#### Scenario: 配置火山方舟供应商
- **WHEN** 管理员将主供应商设置为 `volcengine_ark` 并保存模型参数
- **THEN** 系统持久化配置并将后续编排请求路由到 Volcengine Ark Provider

### Requirement: API Key 管理 MUST 安全且不可明文回显
系统 MUST 接收并保存供应商 API Key，但查询配置时 MUST 仅返回掩码值，不得返回明文。

#### Scenario: 读取配置
- **WHEN** 客户端请求读取主编排 LLM 配置
- **THEN** 返回的 `api_key` 字段为掩码或空值，且不包含可还原明文

### Requirement: 连通性检查 MUST 可独立执行
系统 MUST 提供供应商级别的连通性检查接口，返回可诊断的成功/失败结果。

#### Scenario: 方舟连通性检查失败
- **WHEN** 管理员触发 `volcengine_ark` 连通性检查且鉴权失败
- **THEN** 系统返回失败结果并附带错误分类，且不影响已生效配置

### Requirement: 供应商调用 MUST 支持主备降级
系统 MUST 支持主供应商失败后按备用供应商顺序重试，并记录降级事件。

#### Scenario: 主供应商失败后降级成功
- **WHEN** 主供应商请求失败且第一个备用供应商可用
- **THEN** 系统使用备用供应商完成响应并记录 `fallback_used=true`
