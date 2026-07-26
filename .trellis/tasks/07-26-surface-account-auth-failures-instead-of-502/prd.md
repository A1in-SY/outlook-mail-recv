# 账号鉴权失效时给出明确报错，而不是一律 502

## Goal

线上刷新邮件时反复出现 502，用户只看到「刷新失败」，无法判断是**这个号已经废了**
还是**网络抖了一下**，只能反复点刷新。实际原因是微软把账号判定为滥用、作废了
refresh token——这是一个确定性的、重试无用的状态，却被表达成了一个看起来该重试的
网关错误。

目标：把「账号凭据失效」从「上游临时故障」里区分出来，用不同的状态码和明确的文案
告诉用户该做什么。

## What I already know

### 线上实测（服务器日志 + 数据库）

7 次 502 全部来自同一个错误：

```
Token refresh failed: 400 - {"error":"invalid_grant",
 "error_description":"AADSTS70000: User account is found to be in service abuse mode"}
```

`AADSTS70000` = 微软风控把账号标记为滥用，refresh token 作废。全部来自
`id=26`（SybilVenditti2612@outlook.com），同期 `id=73/74/76` 刷新返回 200——
**不是全局故障，是按账号区分的**。

另有 1 次是 `IMAP auth failed: User is authenticated but not connected.`：token 拿到了
但 IMAP 侧仍拒绝，通常是同一风控的另一种表现。

数据库佐证：74 个账号中 16 个邮件数为 0，7 个 `updated_at == created_at`
（token 从未轮换成功 = 从未刷新成功过）。

### 现状（代码）

失败链路：

| 位置 | 行为 |
|------|------|
| `services/mail_service.py:36` | token 刷新失败 → `raise Exception(...)` |
| `services/mail_service.py:126` | IMAP 认证失败 → `raise Exception(...)` |
| `routes/emails.py:126-128` | 捕获**任意** `Exception` → `HTTPException(502, "Failed to fetch emails from mail server")` |
| `frontend/src/lib/api.ts:50-53` | 读 `detail` 抛 Error |
| `frontend/src/pages/EmailList.tsx:101` | `toast.error("刷新失败: " + ...)` |

问题出在 `routes/emails.py:126` 的 `except Exception` 一把抓：把"凭据已作废"和
"IMAP 连接超时"压成了同一个 502 + 同一句话。详细原因只进了服务器日志，用户看不到。

同样的模式还有两处：`routes/emails.py:94`（取正文）、`routes/accounts.py:131`
（导入前协议测试）。后者已经把 `{e}` 拼进 detail 了，但没有区分状态码。

### 502 为什么是错的

502 Bad Gateway 的语义是"上游返回了无效响应"。但这里上游（微软）工作完全正常，
它返回的是一个**语义明确的 400 invalid_grant**——它在正确地拒绝一个已失效的凭据。
真正出问题的是我们库里存的 refresh_token 已经死了。这是本服务的状态问题，
不是网关问题。

## Requirements

- 区分两类失败：**账号凭据失效**（重试无用）vs **上游临时故障**（重试可能有用）
- 前者返回非 502 的状态码，并带明确的中文原因；后者维持 502
- 覆盖三个入口：刷新邮件列表、取邮件正文、导入前协议测试
- 前端 toast 直接展示后端给的原因，不再统一显示「刷新失败」
- 刷新按钮**不禁用**——万一账号恢复了用户仍可自行重试
- 报错文案不得泄露 refresh_token / access_token / 密码
- 更新 `.trellis/spec/backend/error-handling.md` 的状态码约定

## Acceptance Criteria

- [ ] `AADSTS70000`（滥用封禁）返回专用状态码，detail 写明「账号已被微软风控标记，
      需重新授权」，而非「Failed to fetch emails」
- [ ] `invalid_grant`（token 过期/被撤销）同样归类为凭据失效
- [ ] IMAP 认证失败归类为凭据失效
- [ ] 网络超时、Graph 5xx 等临时故障仍返回 502
- [ ] 三个入口（刷新列表 / 取正文 / 协议测试）行为一致
- [ ] 前端 toast 展示后端原因
- [ ] 单元测试覆盖每种分类，断言状态码**和** detail 文案
- [ ] lint / build / test 全绿，前端 lint 保持 5 条既有基线

## Definition of Done

- 后端 + 前端测试通过
- spec 的状态码约定同步更新
- journal 记录

## Out of Scope (explicit)

- **不落库失效状态**（用户明确选择）。这次只修单次请求的错误传达，不加字段、
  不做迁移。代价：想知道哪些号废了仍需逐个点一遍。
- **不做批量探测**（用户明确选择）。要摸底就临时跑一次性脚本，不进产品。
- 不做定时自动巡检——对已被判定滥用的账号反复探测有加重风控的风险。
- 不禁用失效账号的刷新按钮（用户明确选择）。

## Decision (ADR-lite)

**Context**: 需要给「账号凭据失效」选一个状态码。

**Decision**: 用 `409 Conflict`，并在 detail 里给出中文原因。

**Consequences**:
- **不能用 403**。`frontend/src/lib/api.ts:44-48` 对 403 做了全局拦截：
  `clearToken()` + `notifyUnauthorized()`。403 是本应用自己 secret key 校验失败的
  状态码（`core/auth.py:10`）。如果账号 token 失效也返回 403，**用户会在刷新某个
  废号时被整个应用登出**——这是必须避开的坑。
- 不用 401：本应用的鉴权语义已经占用了 4xx 的鉴权段，401 与 403 相邻，日后若有人
  给 401 加全局处理会重蹈覆辙。
- 409 Conflict 表示"资源当前状态与请求冲突"，贴合"我们存的凭据已失效"这一事实，
  且与本应用现有的 400/403/404/502 都不冲突。
- 代价：409 用于此场景不算行业惯例，需要在 spec 里写清楚，否则后来者会困惑。

## Technical Notes

### 分类依据

凭据失效（重试无用）：
- token 端点返回 `invalid_grant`（含 `AADSTS70000` 滥用封禁、token 过期、被撤销）
- IMAP `authenticate` 抛 `imaplib.IMAP4.error`

临时故障（维持 502）：
- 网络超时 / 连接失败
- token 端点返回 5xx
- Graph 返回 5xx
- 选择文件夹、搜索、抓取 header/body 失败

判定应基于**上游响应的结构化字段**（`error` 字段 == `invalid_grant`），而不是对
`error_description` 做子串匹配——描述文案是微软可以随时改的。

### 服务层如何表达

`mail_service.py` 目前一律 `raise Exception(...)`，路由层无从区分。需要一个可识别的
异常类型（如 `AccountAuthError`），让路由层能 `except AccountAuthError` 单独处理，
其余仍走 502 分支。这符合 spec 里「服务层抛普通异常、路由层转 HTTPException」的
既有分层，只是把"普通异常"细分了一级。

### 注意

- `_update_token()` 在成功路径上会写回轮换后的 refresh_token。任何探测/重试逻辑
  都必须走应用自身的刷新路径，否则微软轮换了 token 而我们没存，**会把原本正常的
  账号弄坏**。
- 文案面向的是"管理一批小号"的使用场景，应说清楚"这个号需要重新授权"，而不是
  泛泛的"认证失败"。
