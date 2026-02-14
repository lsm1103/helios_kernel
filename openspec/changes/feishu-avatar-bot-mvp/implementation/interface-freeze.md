# HITL 最小接口冻结（v1）

## 1. 冻结范围
- Choice 卡片字段
- Text 卡片字段
- webhook 标准化 payload
- stdin 回灌接口

## 2. 冻结字段来源
- 以 `docs/飞书-HITL-桥接最小API草案.md` 为唯一来源。

## 3. 变更控制
- 新增/删除字段必须经过变更评审。
- 字段语义变更必须提升接口版本号并更新 OpenSpec spec。
- 变更单必须包含兼容性说明与回滚方案。
