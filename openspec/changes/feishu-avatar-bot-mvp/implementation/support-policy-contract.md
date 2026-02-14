# 技术支持与策略控制契约

## 1. 问答检索范围
- 数据源白名单:
  - 规则区文档（`docs/*.md` 中策略类文档）
  - API 契约文档（接口定义与实现契约）
- 回答模板必须包含来源字段: `source_doc`, `section`, `retrieved_at`。
- 无来源时返回: “当前未检索到可信来源，建议人工确认”。

## 2. 命令白名单与风险分级
### L1（低风险，自动执行）
1. `git status`
2. `rg --files docs`
3. `openspec list --json`
4. `openspec status --change <id> --json`
5. `openspec validate <id> --strict`

### L2（中风险，需确认）
1. `npm test`
2. `npm run lint`
3. `openspec archive <id>`
4. `git commit -m <msg>`
5. `git push`

### L3（高风险，双确认）
1. `rm -rf <path>`
2. `git reset --hard`
3. `git clean -fd`
4. `sudo <cmd>`
5. 写入生产环境配置/密钥文件的命令

## 3. 审批触发条件
- 命中 L2: 单次人工确认。
- 命中 L3: 审批人 + 发起人双确认。

## 4. 审批与审计字段最小集
- `actor_id`
- `action`
- `resource`
- `risk_level`
- `approval_required`
- `approval_by`
- `result`
- `timestamp`
- `correlation_id`
