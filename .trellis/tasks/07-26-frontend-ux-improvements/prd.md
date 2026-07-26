# 前端体验优化：深色模式 / 批量删除 / 搜索防抖等

## 背景

本项目是 Outlook 邮箱批量管理工具，核心场景是「批量管理账号」+「读取验证邮件」。
代码评审发现若干体验短板：已写好的深色主题从未接线、批量选择能力不对称（能批量导出却不能批量删除）、
搜索无防抖导致每次按键触发 2 个请求、验证码需要人眼找并手动选中复制。

本任务集中修复这批体验问题，**不改动数据库结构**。

## 目标与范围

### 纳入范围（11 项）

| # | 项 | 说明 |
| --- | --- | --- |
| 1 | 深色模式接线 | 点亮 `index.css` 已定义的 `.dark` 主题：右上角切换按钮，默认跟随系统，localStorage 记忆 |
| 2 | 批量删除 | `AccountList` 加「删除选中(N)」；单删 + 批删统一用 shadcn 确认弹窗，移除原生 `confirm()` |
| 3 | 搜索防抖 | `AccountList` 搜索输入 300ms 防抖（现为 `setTimeout(..., 0)` 等于无防抖） |
| 4 | 表格刷新不闪烁 | 刷新/翻页时保留旧行并降低透明度，不再整块替换为「加载中…」 |
| 5 | 验证码一键复制 | `EmailViewDialog` 内从主题 + 正文抽取验证码，顶部显著展示并提供复制按钮 |
| 6 | 编辑账号 | 新增编辑弹窗（密码 / client_id / refresh_token / 协议），接后端已有的 `PUT /api/accounts/{id}` |
| 7 | 鉴权顺滑 | 进页面先 `verifyToken()` 校验；403 改用 router 跳转替代 `window.location.href` 整页刷新 |
| 8 | html lang | `index.html` 的 `lang="en"` 改为 `zh-CN` |
| 9 | RT 有效期文案 | 「剩余 0 天」歧义 → 当天到期显示「今天到期」 |
| 10 | 导出预览自动刷新 | `ExportDialog` 改分隔符后自动更新预览（防抖），不必手点「刷新预览」 |
| 11 | 协议测试文案 | 注明「仅测试第一行」，避免误解为全量测试 |

### 明确排除（用户已确认）

- **邮件已读/未读**：需要给 `email` 表加字段 + 迁移，本次不做，避免数据库结构变更。
- **邮件列表内搜索**：本次不做。
- **手动新增单个账号**：本次不做（导入已覆盖主要路径）。
- **列表行内验证码展示**：仅在详情弹窗内做，列表不加。

## 关键设计决策

### 1. 深色模式

- 新增 `frontend/src/lib/theme.ts`：纯函数 + DOM 操作，管理 `light | dark | system` 三态。
- localStorage key: `theme`。默认 `system`，通过 `matchMedia('(prefers-color-scheme: dark)')` 解析。
- 在 `index.html` 内联脚本或 `main.tsx` 顶部尽早应用，避免首屏白闪。
- `App.tsx` 内提供切换按钮所需状态；按钮放在 `AccountList` / `EmailList` 头部操作区。
- `Toaster` 需要感知主题（sonner 的 `theme` prop）。

### 2. 确认弹窗（替代原生 confirm）

- 新增 `frontend/src/components/ConfirmDialog.tsx`：受控业务弹窗（`open` / `onOpenChange`），
  props 含 `title` / `description` / `confirmText` / `variant` / `onConfirm`。
- 复用现有 `ui/dialog` 原语，不新建 UI primitive。
- 供单个删除、批量删除共用。

### 3. 验证码抽取

- 新增 `frontend/src/lib/verification-code.ts`：**纯函数**，可测试。
- 输入邮件主题 + 正文纯文本，输出候选验证码（最多 1 个，取置信度最高）。
- 规则：优先匹配关键词邻近的 4–8 位数字（验证码 / 校验码 / code / OTP / verification 等），
  其次匹配独立成词的 6 位数字。需排除年份、电话号码等误报。
- 按 `.trellis/spec/frontend/type-safety.md` 要求，纯工具函数需配 Node 测试：
  新增 `frontend/tests/verification-code.test.ts`，与现有 `platform-filter.test.ts` 同风格。

### 4. 编辑账号

- 新增 `frontend/src/components/EditAccountDialog.tsx`。
- `api.ts` 补 `accounts.update(id, data)`，对应后端已存在的 `AccountUpdate` schema。
- email 字段只读展示（改邮箱等价于换账号，避免误操作）；密码用 password input，可切换明文。
- 协议至少选一个，前端做轻量校验（后端为权威校验）。

### 5. 鉴权

- `App.tsx` 的 `PrivateRoute` 改为：先 `hasToken()` 短路，再异步 `verifyToken()` 校验，校验中显示占位。
- `api.ts` 的 403 分支不再 `window.location.href = "/"`，改为 `clearToken()` + 派发事件/抛出，
  由路由层跳转，避免整页 reload 闪烁。

## 约束

- 遵循 `.trellis/spec/frontend/` 全部规范：
  - 所有后端调用走 `lib/api.ts`；后端响应类型定义在 `api.ts`。
  - 不引入 `any`；catch 用 `unknown` + `errorMessage()` helper。
  - 受控弹窗 `open` / `onOpenChange`；弹窗含 `DialogTitle`。
  - 复用 shadcn 原语，不在 `components/ui/` 加业务逻辑。
  - 不引入 React Query / Zustand 等新库。
  - `Set` 状态不可原地修改。
  - 搜索 / 筛选变化时重置 `page` 为 1。
- 不改动数据库结构，不新增后端迁移。
- 后端仅在必要时改动（本次预计无需改动，`PUT` 与 `DELETE` 均已存在）。

## 验收标准

功能：

1. 深色模式可切换，刷新后保持，首屏无白闪；深色下表格、弹窗、toast 均正常可读。
2. 勾选多个账号后可一次性删除，有确认弹窗，删除后列表与选择集同步刷新。
3. 单个删除不再出现浏览器原生 confirm 弹窗。
4. 搜索框连续输入时请求被合并（300ms 内只发一次）。
5. 搜索 / 翻页时表格不再闪烁为空白「加载中」。
6. 打开含验证码的邮件，弹窗顶部展示验证码并可一键复制。
7. 账号可编辑密码 / client_id / refresh_token / 协议并持久化。
8. token 失效时不再出现「先闪进主页再弹回登录」。
9. RT 当天到期显示「今天到期」而非「剩余 0 天」。
10. 导出弹窗改分隔符后预览自动更新。
11. 导入弹窗协议测试处注明仅测首行。

质量：

- `cd frontend && npm run lint` 通过。
- `cd frontend && npm run build` 通过。
- `frontend/tests/verification-code.test.ts` 通过（命令记录在完成报告中）。
- 现有 `frontend/tests/platform-filter.test.ts` 仍通过。
- 后端测试 `cd backend && python -m pytest` 仍通过（若本次触及后端）。
