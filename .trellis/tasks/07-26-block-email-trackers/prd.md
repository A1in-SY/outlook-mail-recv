# 屏蔽邮件正文中的追踪器

## Goal

邮件正文里的远程资源（尤其是 1x1 追踪像素）会在用户打开邮件的瞬间向发件方回连，
泄露**打开时间**和**客户端 IP**。对这个项目而言危害比普通邮箱客户端更大：它管理的是
批量注册用的小号，一次回连等于向平台确认"这个号是活的、并且有人在盯着"，而这正是
小号被风控标记的典型信号。

目标：默认阻断正文里一切会自动发起网络请求的资源，并给用户一个显式的"我要看图"开关。

## What I already know

### 现状（代码）

- `EmailViewDialog.tsx:31-37` 用 DOMPurify 3.4.5 做 sanitize，配置为
  `{ ADD_TAGS: ["style"], ADD_ATTR: ["target"] }`
- DOMPurify 是 **XSS 过滤器，不是隐私过滤器**：`<img src="https://...">` 是它明确
  允许的合法输出，追踪像素原样通过
- 后端 `mail_service.py:107` 原样存储 `body_html`，未做任何清洗
- 正文列表页不渲染 HTML，只有 `EmailViewDialog` 一处 `dangerouslySetInnerHTML`

### `<head>` 里的 style/link 早已被丢弃（实测修正）

最初以为 `ADD_TAGS: ["style"]` 放行了 `<style>` 块。实测证否：

`purify.es.mjs:923` 的 `_initDocument` 用 DOMParser 解析后**只返回 `<body>`**，
所以**顶层/`<head>` 里的 `<style>` 和 `<link>` 在任何 hook 运行之前就被丢掉了**，
且与 `ADD_TAGS` / `FORBID_CONTENTS` 无关（`FORCE_BODY: true` 才会保留它们）。

线上 99 封 HTML 邮件全部带 `<html>` + `<head>` 结构，98 封有 `<style>`，其中只有
**1 封**的 `<style>` 在 `<head>` 之外。也就是说那 38 封「`<style>` 内含远程 url()」
的邮件，其样式表**在改动前就没有加载过**——这不是本次引入的回归，而是既有行为。

结论：**不启用 `FORCE_BODY`**。启用它反而会把原本被丢弃的 `<head>` 样式表放进
DOM，扩大攻击面；保持现状 + 对 body 内的向量做屏蔽即可。body 内嵌的 `<style>`
（1 封）确实会经过 hook，已覆盖。

### 现状（线上真实数据，505 封邮件实测）

| 指标 | 数量 |
|------|------|
| 邮件总数 | 505 |
| 含 HTML 正文 | 99 |
| 远程 `<img>` | 273 |
| **其中 1–3px 追踪像素** | **95** |
| 含 CSS `url()` 的邮件 | 38 |

投放追踪像素的 host 全部是 ESP 的 open-tracking 端点：
`u20216706.ct.sendgrid.net`(57)、`url8792.mail.anthropic.com`(27)、
`mandrillapp.com`(7)、`url3243.email.openai.com`(3)、`callback.cloudses.com`(1)。

正常图片则是品牌 logo：`cdn.openai.com`(109)、`claude.ai`(48)。

结论：**追踪像素占远程图片的 35%**，且与正常图片来自不同 host，但**不能靠 host 白名单
区分**——同一 ESP 既发 logo 也发像素。

## Assumptions (temporary)

- 用户看邮件主要为了取验证码，正文配图可有可无 → 默认屏蔽不影响主要用途
- 验证码提取走的是纯文本 `body`，不受 HTML 屏蔽影响（已确认：
  `extractVerificationCode(subject, body)`）

## Requirements

- 默认阻断正文中所有会自动发起外部请求的资源
- 覆盖面不能只有 `<img src>`（见 Technical Notes 的向量清单）
- 提供显式的"显示图片"开关，仅对当前邮件生效，不持久化
- 告知用户本封邮件屏蔽了多少个资源
- 不修改已存储的 `body_html`（屏蔽是渲染期决策，必须可逆）
- `cid:` / `data:` 等本地资源不屏蔽
- 切换邮件时屏蔽状态自动重置

## Acceptance Criteria

- [x] 打开含追踪像素的邮件，DevTools Network 中没有任何指向 ESP 端点的请求
      （实测 `performance.getEntriesByType("resource")` 返回 `[]`）
- [x] 各类向量均被覆盖（img/srcset/style url()/link/iframe/video/svg 等）
- [x] 点击"显示图片"后，图片正常加载（实测点击后恰好 3 条请求）
- [x] 关闭弹窗重新打开，回到屏蔽状态
- [x] 验证码提取不受影响（屏蔽状态下仍提取出 294817）
- [x] 单元测试覆盖各向量（`tests/tracker-blocking.test.ts`，43 项全绿）
- [x] lint / build / test 全绿，lint 保持 5 条既有基线
- [x] 被屏蔽的图片显示为占位框，而非浏览器的破图标

## Definition of Done

- 单元测试覆盖所有屏蔽向量
- `npm run lint` / `npm run build` / `npm test` 全绿
- 浏览器实测确认无回连请求
- journal 记录

## Out of Scope (explicit)

- 不改后端、不改数据模型、不做迁移
- 不做图片代理（自建 proxy 转发是另一种方案，但需要后端改造 + 服务器出网，MVP 不做）

## Decision (ADR-lite)

**Context**: 需要决定屏蔽策略的激进程度，以及"显示图片"开关的作用范围。

**Decision**:
1. **全量屏蔽 + 每封邮件的手动开关**。不做启发式识别。
2. 开关**仅对当前这封邮件生效**，弹窗关闭即失效，不持久化。

**Consequences**:
- 启发式识别（按尺寸/URL 特征判断"疑似追踪器"）被否决：追踪像素可以伪装成任意
  尺寸、任意路径，任何启发式规则都能被绕过；而线上数据已证明无法靠 host 区分。
  全量屏蔽是唯一没有漏网可能的策略，也是 Gmail / Thunderbird / Proton 的做法。
- 代价：品牌 logo 默认不显示。可接受——这个工具的主要用途是取验证码，而验证码走
  纯文本路径，不受影响。
- 不持久化开关状态意味着不需要新增存储，也避免了"信任某个发件人"这种恰好是追踪方
  希望用户做出的选择。每封邮件都是一次独立的、显式的决定。

## Technical Notes

### 必须覆盖的追踪向量（只堵 `<img src>` 是不够的）

| 向量 | 说明 |
|------|------|
| `<img src>` | 最常见 |
| `<img srcset>` / `<source srcset>` | 同样自动加载 |
| `<img/table background=>` | 老式 HTML 属性 |
| `style="background:url(...)"` | 行内样式，线上 5 封邮件有 |
| `<style>` 块内的 `url()` | 仅 body 内嵌的会到达 hook；`<head>` 里的早被丢弃 |
| `<link rel=stylesheet/preload>` | 同上，`<head>` 里的早被丢弃；body 内的会拦 |
| `<iframe> / <object> / <embed>` | 直接嵌入远程文档 |
| `<video poster> / <audio src>` | 媒体资源 |
| SVG `<image href>` / `<use href>` | 易被忽略 |
| `@import` in CSS | 样式表内引用 |

### 关键约束

- `cid:` 内联附件和 `data:` URI 是本地资源，**不应**被屏蔽
- 屏蔽必须发生在 HTML 进入 DOM **之前**——一旦 `dangerouslySetInnerHTML` 写进去，
  浏览器立刻发起请求，事后再删属性已经晚了
- DOMPurify 的 hook 机制（`addHook('afterSanitizeAttributes')`）在文档解析阶段介入，
  用的是脱离主文档的 template，不会触发加载，是正确的介入点

### 占位符：为什么不能只删 src

只删 `src` 的 `<img>` 浏览器仍会画一个"破图"图标（只要元素带 `alt` 就一定会画），
看起来像 bug 而不是"我故意挡了它"。因此被屏蔽的 `<img>` 会：

1. 换成内联透明 1x1 GIF（`data:` URI，不产生请求），消除破图标；
2. 打上 `data-blocked-remote` 标记，由 `index.css` 渲染成虚线占位框；
3. 删掉邮件自带的 `width` / `height`，否则占位框会被撑成原图尺寸留下大片空白。
