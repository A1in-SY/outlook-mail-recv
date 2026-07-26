# 修复删除按钮对比度与平台列表重复请求

## 背景

用户在使用上一个任务（`07-26-frontend-ux-improvements`）交付的版本时提出两点意见：

1. 平台"使用"弹窗每次打开都请求后端拉平台列表，这个列表几乎不变，是否可以前后端各自维护固定枚举
2. 浅色模式下删除按钮的"删除"文字看不清

## 调查结论

### 问题 1：删除按钮对比度（真 bug，非配色偏好）

`--destructive-foreground` 这个 CSS 变量**从未在 `index.css` 中定义**，但被两个组件引用：

- `frontend/src/components/ui/button.tsx:12` — `text-destructive-foreground`
- `frontend/src/components/ui/badge.tsx:12` — `text-destructive-foreground`

类名解析为空值，文字回退到继承的 `--foreground`（深色），压在红底上。

实测对比度（WCAG AA 正文要求 ≥ 4.5:1）：

| 模式 | 底色 | 当前（继承前景） | 修复后 |
|------|------|------------------|--------|
| 浅色 | `oklch(0.577 0.245 27.325)` → rgb(231,0,11) | **4.15:1** ❌ | 4.76:1（白字）✅ |
| 深色 | `oklch(0.704 0.191 22.216)` → rgb(255,100,103) | **2.77:1** ❌ | 6.84:1（深色字）✅ |

注意深色模式的底色是**亮红**，所以前景要用深色字才够对比度，不能两个模式都用白字。

这是上一个任务之前就存在的缺陷，只是新增的行内"删除"按钮让它更显眼（此前 destructive variant 用得少）。

### 问题 2：平台列表 —— 不能改成前端硬编码枚举

用户的直觉合理（静态列表不值得每次网络往返），但**当前数据模型下直接改会导致数据错位**：

前端提交的是**平台 id**（`updatePlatforms(accountId, number[])`），关联表 `account_platforms` 存的也是 `platform_id`。这些 id 是数据库自增的**插入顺序**，与代码中 `PLATFORM_LIST`（sorted）的顺序不一致。

线上实际数据（`txy-sg` 生产库）：

```
id=2  → Google    ← backend/app/models/platform.py 的 PLATFORM_LIST 中不存在
id=25 → Kiro      ← 后期追加，排在末位，而非字母序位置
```

若前端按字母序硬编码 id，`Claude` 前端会是 id=4、数据库是 id=17，**61 条已有关联全部错位**。线上 41 个账号标记 ChatGPT、20 个标记 Claude，都会指向错误平台。

`Google` 只存在于数据库而不在代码列表中，说明该表历史上被手工修改过，代码与数据已不同步。

**决策：采用前端缓存方案**，去掉重复请求但不触碰数据模型。彻底去除依赖需要改用 name 作标识 + 数据迁移，风险与收益不匹配，本次不做。

补充观察：25 个平台中仅 2 个在使用（ChatGPT 41、Claude 20），其余 23 个零使用。列表精简的价值可能高于传输方式优化，但属于产品决策，不在本次范围。

## 范围

### 做

1. **补全 `--destructive-foreground` token** — `frontend/src/index.css` 的 `:root` 与 `.dark` 各定义一次，修复 button 与 badge 两个组件
2. **平台列表前端缓存** — 模块级缓存 + 同一份 in-flight promise 去重，避免并发重复请求；提供失效入口

### 不做

- 平台标识改用 name（需要后端改接口 + 数据迁移，风险不匹配）
- 精简未使用的 23 个平台（产品决策）
- 后端任何改动

## 设计要点

### destructive-foreground

```css
:root  { --destructive-foreground: oklch(0.985 0 0); }  /* 近白，配深红底 */
.dark  { --destructive-foreground: oklch(0.145 0 0); }  /* 近黑，配亮红底 */
```

深色模式用深色前景是刻意为之，不是笔误——深色模式的 `--destructive` 比浅色模式更亮。

### 平台缓存

缓存需要处理并发：弹窗可能在列表页加载完成前打开，两处同时请求。用一份共享的 in-flight promise 去重，而不是简单的 `if (cache) return cache`。

失败不可缓存——网络错误后下次打开应重试，否则用户会卡在空列表。

## 验收标准

- [ ] 浅色/深色模式下删除按钮文字对比度均 ≥ 4.5:1
- [ ] destructive badge 同步修复
- [ ] 平台弹窗重复打开只发一次 `/api/platforms` 请求
- [ ] 并发打开（列表页 + 弹窗）不产生重复请求
- [ ] 请求失败后重新打开会重试，不会缓存失败态
- [ ] 已有的 61 条账号-平台关联不受影响
- [ ] `npm run lint` 不超过既有基线（5 个错误）
- [ ] `npm run build` 通过
- [ ] `npm test` 全绿
