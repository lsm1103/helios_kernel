# HELIOS Kernel

HELIOS Kernel 是一个**文档先行（documentation-first）**的人机协作执行内核工程。

> Human-in-the-Loop Intelligent Operating System

当前仓库聚焦于领域建模、不可变规格与实现契约，作为后续工程实现（服务拆分、数据建模、接口协议）的上游设计输入。

## 项目定位

- 核心目标：定义长期运行的人机协作执行系统的**稳定内核规则**。
- 当前阶段：规范与模型冻结阶段（尚无应用运行入口）。
- 设计原则：
  - must 行动优先于完美理解。
  - must 保留可审计、可回放的不可变事件历史。
  - must 保持人类最终治理主权。

## 核心领域

HELIOS v1 冻结五个核心域：

- `Project`
- `Session`
- `Task`
- `Agent`
- `Governance`

推荐引用链：`Project(1) -> Session(n) -> Task(n)`。

## 文档结构

主要文档位于 `docs/`：

- `docs/Core Domain.md`：核心概念与系统边界
- `docs/Task & Session 不可变规格.md`：Task/Session 宪法级约束
- `docs/Domain Model Overview.md`：五域统一术语、常量与跨域不变量
- `docs/Implementation Contracts.md`：命令/事件 envelope、错误码与实现契约
- `docs/开发架构与技术栈方案.md`：开发层架构、技术栈与数据流向建议

## 快速开始（文档协作）

仓库当前没有可执行服务，请使用以下命令进行文档协作：

```bash
# 快速查看 docs 下文件
rg --files docs

# 查看文档变更
git diff -- docs

# 可选：Markdown lint（若环境可访问 npm registry）
npx markdownlint-cli2 "docs/**/*.md"
```

## 当前实现边界

本仓库当前 **must not** 视为可运行产品代码库：

- 无后端服务入口
- 无数据库迁移脚本
- 无 API 部署配置

如需进入实现阶段，建议以 `docs/Implementation Contracts.md` 与 `docs/开发架构与技术栈方案.md` 作为第一批开发输入。

## 贡献约定

- 提交应保持原子化：一次提交聚焦一个逻辑变更。
- 变更文档时应显式检查是否与不可变规格冲突。
- 示例中 must not 出现真实密钥、私有地址或内部敏感信息。

---

如果你是首次接手该项目，建议阅读顺序：

1. `docs/Core Domain.md`
2. `docs/Task & Session 不可变规格.md`
3. `docs/Domain Model Overview.md`
4. `docs/Implementation Contracts.md`
5. `docs/开发架构与技术栈方案.md`
