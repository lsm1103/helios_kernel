# 一、项目命名（不是产品名，是工程名）

你这个东西，本质不是 Agent，也不是 Bot，而是：

> **一个“长期运行的人机协作执行内核”**

我给你三个层级的名字，你可以任选，甚至同时用：

---

## ✅ 推荐工程名（强烈建议）

### **`HELIOS`**

**Human-in-the-Loop Intelligent Operating System**

含义非常贴合你的理念：

* 长期运行（像太阳）
* 多 Agent 围绕
* 人类拥有最终裁决权
* 系统级，而非工具级

工程里这样用：`helios-kernel`
---

# 二、Core Domain 映射（这是你系统真正的“骨架”）

> 目标：
> **任何工程师 / AI / Agent，只看这一节，就知道系统“是什么”，而不是“怎么实现”**

---

## Core Domain 总览

```
Project
 ├── Session (1..n)
 │    ├── Task (0..n)
 │    │    ├── TaskState
 │    │    ├── Clarification
 │    │    └── RiskMarker
 │    └── Message / Event
 │
 ├── Agent (0..n)
 │    ├── Skill (Prompt)
 │    └── Role
 │
 └── Governance (Human Authority)
```

---

# 1️⃣ Project（项目域）

### 定义

> **Project 是 HELIOS 中“最高级别的责任与归属单元”**

* 一个项目 = 一项需要被推进、被负责、被终结的目标
* 项目可以：

  * 有人类
  * 暂无人类
  * 但**永远属于人类**

---

### 核心职责

* 承载长期目标
* 组织多个 Session
* 组织多个 Agent
* 作为**最终失败 / 成功的归因容器**

---

### 不可变规则（来自规格）

* ❌ Project **不能被 Agent 终结**
* ✅ Project 只能由人类终结
* ❌ Project 不因 Session 结束而结束
* ✅ Agent 可在无人类参与时继续推进 Project

---

### 你未来一定会用到的隐含字段（概念级）

* `project_id`
* `owner_type = human`
* `status = active | archived`
* `created_at / ended_at`

---

# 2️⃣ Session（会话域）【极其重要】

### 定义

> **Session 是一个“持续的协作关系容器”**

不是聊天记录，而是：

* 一个上下文边界
* 一个责任边界
* 一个历史不可篡改的工作流载体

---

### Session 是什么

* 一个社交 App 里的：

  * 单聊
  * 群聊
* 一个工具即联系人的 **一次“工作关系实例”**

---

### 核心职责

* 承载上下文
* 承载任务发生的时间线
* 承载能力变化标记
* 承载人类与 Agent 的协作历史

---

### 不可变规则

* ✅ 同一个 Agent / 工具 **可以拥有多个 Session**
* ✅ 每个 Session **上下文严格隔离**
* ❌ Session 历史不可被修改
* ✅ Agent 能力变化 **必须写入 Session**

---

### 关键子概念

#### Capability Change Marker

> 用于标记 Agent Prompt / Skill 变化

* 时间
* 变更摘要
* 影响范围（认知 / 执行 / 风格）

这是你未来**复盘、责任划分、信任重建**的关键。

---

# 3️⃣ Task（任务域）【系统运转的核心】

### 定义

> **Task 是一个“意图被系统接管后的执行单元”**

不是一句话，而是：

* 有生命周期
* 有状态
* 有风险标记
* 可失败、可升级

---

### Task 分类（来自规格）

* **Short Task**

  * 即时执行
  * 不进入长期状态
* **Long Task**

  * ≥10 分钟
  * 必须进入状态管理
  * 可升级、可暂停、可失败

---

### Task 核心状态（概念级）

```
CREATED
CLARIFYING
READY
RUNNING
PAUSED (升级 / 等人类确认)
HIGH_RISK_RUNNING
FAILED
COMPLETED (非终结)
```

⚠️ 注意：
**COMPLETED ≠ Project 结束**

---

### 澄清机制（Clarification）

* Task 拥有：

  * 澄清预算
  * 已使用澄清次数
* 预算耗尽：

  * 强制假设
  * 打上 High-Risk Marker
  * 继续执行

---

### 高风险执行（Risk Marker）

* 高风险 Task：

  * 失败仅对当事人可见
  * 但必须可复盘
* Risk 是：

  * 状态
  * 不是错误

---

# 4️⃣ Agent（代理域）

### 定义

> **Agent 是具备角色与技能的“可替换执行者”**

Agent 永远不是系统本体。

---

### Agent 的三层结构（概念模型）

```
Agent
 ├── Identity (稳定)
 ├── Role (职责 / 岗位)
 └── Skill (Prompt / 能力)
```

---

### 不可变规则

* ✅ Agent 可被解雇 / 冻结
* ✅ Agent Prompt / Skill 可回滚
* ❌ 回滚不影响历史 Session
* ❌ Agent 不拥有 Project 终结权

---

### 学习模型（你已明确）

* 系统学习 ≠ Agent Prompt 频繁自改
* 学习来源于：

  * Skill 沉淀
  * Skill 版本迭代
  * 人类参与分析

---

# 5️⃣ Governance（治理域，隐性但必须存在）

### 定义

> **Governance 是“人类主权”的制度化体现**

不是 UI，是规则。

---

### 职责

* 项目终结
* Agent 裁决
* 冲突仲裁
* 高风险执行的最终责任承担

---

### 核心原则

* 人类 **可以不参与执行**
* 但 **永远参与裁决**

---
