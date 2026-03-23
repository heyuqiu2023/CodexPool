# Codex Pool Manager v2.0 更新日志

## 概述

本次大版本升级涵盖 **品牌重塑、国际化、前端优化、后端增强** 四大模块，共修改 21 个文件，新增 5 个文件，净增约 500 行代码。

---

## 一、品牌重塑（去 Lovable）

- **`index.html`** — 标题改为 `Codex Pool Manager v2.0`，移除所有 Lovable 的 OG/Twitter meta 标签和图片链接
- **`vite.config.ts`** — 移除 `lovable-tagger` 插件导入和调用，`plugins` 只保留 `[react()]`
- **`package.json`** — `name` 改为 `codex-pool-manager`，`version` 从 `0.0.0` 升为 `2.0.0`，移除 `lovable-tagger` devDependency
- **`public/favicon.ico`** → **`public/favicon.svg`** — 删除 Lovable 图标，替换为紫色渐变圆角方块 + 白色字母 "C" 的 SVG favicon
- **`index.html`** — 新增 `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`

## 二、国际化（i18n 中英切换）

### 核心架构
- **新增 `src/lib/i18n.tsx`** — 基于 React Context 的 i18n 系统
  - 导出 `I18nProvider`、`useI18n()` hook（返回 `lang`、`setLang`、`t()`、`dateLocale`）
  - 约 150+ 翻译键，覆盖所有组件
  - 自动检测浏览器语言，持久化到 `localStorage('cpm-lang')`
  - 集成 `date-fns` 的 `enUS` / `zhCN` locale，所有相对时间显示跟随语言切换

### 改造的组件（全部从硬编码中/英文改为 `t()` 调用）
- `src/components/Header.tsx` — 语言切换按钮（Globe 图标）、标题、版本号
- `src/components/LeftSidebar.tsx` — 导航菜单项
- `src/components/RightSidebar.tsx` — 操作按钮、轮换设置标签、策略下拉选项
- `src/components/FilterBar.tsx` — 筛选标签
- `src/components/AccountCard.tsx` — 卡片内所有状态文本、token 过期信息、用量显示
- `src/components/AccountGrid.tsx` — 空状态提示
- `src/components/AddAccountDialog.tsx` — 对话框标题、表单标签、按钮
- `src/pages/Index.tsx` — Dashboard 页面
- `src/pages/Tasks.tsx` — 任务队列页面
- `src/pages/Settings.tsx` — 设置页面
- `src/pages/Logs.tsx` — 日志页面
- `src/pages/NotFound.tsx` — 404 页面

### 特殊处理
- **`src/components/ErrorBoundary.tsx`**（新增）— 由于 ErrorBoundary 在 I18nProvider 外层，直接读 `localStorage` 实现双语 fallback
- **策略下拉菜单** — Least Used 选项加了"（推荐）"/ "(Recommended)" 标识

## 三、前端优化

- **`src/App.tsx`** — 包裹 `<ErrorBoundary>` + `<I18nProvider>` 层级结构
- **新增 `src/components/DouyinPromo.tsx`** — 可关闭的抖音推广横幅（ID: 87557938150），渐变背景，所有页面顶部展示
- **`src/pages/Index.tsx`** — 新增 30 秒静默自动轮询，Dashboard 数据自动刷新
- **`src/components/RightSidebar.tsx`** — 新增 Health Check 按钮（HeartPulse 图标），之前 `onHealthCheck` prop 传了但未使用
- **`src/components/AccountCard.tsx`** — 类型安全修复：
  - 创建 `LiveUsageData` 接口替代 `as any` 强转
  - 所有 `formatDistanceToNow` 传入 `locale: dateLocale` 参数
- **`src/lib/api.ts`** — 补全 `checkAccountUsage` 返回类型（`fetched_at`、`plan_type`、`primary`、`secondary`）

## 四、后端增强

### `server/index.js`
1. **`PATCH /api/accounts/:id` setActive 去重** — 原来 30 行手动逻辑（switchAuthFile + updateDB + setExpectedAccountId + reloadOpenClaw）缩减为一行 `performAccountSwitch()` 调用
2. **`POST /api/actions/health-check` 真实健康检查** — 从假的 `SELECT COUNT(*)` 改为遍历所有账号，检查：
   - auth 文件是否存在
   - JWT token 是否过期
   - 自动标记 error 状态 / 恢复 idle 状态
   - 返回每个账号的详细健康报告
3. **`getOpenClawGatewayConfig()` 异步化** — `fsSync.readFileSync` → `fs.promises.readFile`，避免阻塞事件循环
4. **全局 Error Handler 增强** — 支持自定义状态码、`res.headersSent` 防重复响应、自动记录错误到数据库日志

### `server/db.js`
5. **数据库连接池增强** — 新增配置：
   - `connectTimeout: 10000`（连接超时 10s）
   - `acquireTimeout: 10000`（获取连接超时 10s）
   - `idleTimeout: 60000`（空闲 60s 释放）
   - `enableKeepAlive: true` + `keepAliveInitialDelay: 30000`（TCP 保活）

---

## 文件变更清单

### 新增文件（5）
| 文件 | 说明 |
|------|------|
| `src/lib/i18n.tsx` | i18n 核心（Context + 翻译字典 + date-fns locale） |
| `src/components/ErrorBoundary.tsx` | 全局错误边界（双语 fallback） |
| `src/components/DouyinPromo.tsx` | 抖音推广横幅 |
| `public/favicon.svg` | 新 favicon（紫色 C 图标） |
| `CHANGELOG-v2.0.md` | 本文件 |

### 删除文件（1）
| 文件 | 说明 |
|------|------|
| `public/favicon.ico` | Lovable 旧图标 |

### 修改文件（16）
| 文件 | 主要改动 |
|------|----------|
| `index.html` | 去 Lovable meta、加 favicon link |
| `package.json` | 改名、升版本、删 lovable-tagger |
| `vite.config.ts` | 删 lovable-tagger |
| `server/index.js` | setActive 去重、health-check 真实检查、async config、error handler |
| `server/db.js` | 连接池超时/保活配置 |
| `src/App.tsx` | ErrorBoundary + I18nProvider 包裹 |
| `src/lib/api.ts` | 补全返回类型 |
| `src/components/Header.tsx` | 语言切换按钮 + i18n |
| `src/components/LeftSidebar.tsx` | i18n |
| `src/components/RightSidebar.tsx` | Health Check 按钮 + 策略推荐标签 + i18n |
| `src/components/FilterBar.tsx` | i18n |
| `src/components/AccountCard.tsx` | 类型修复 + i18n + dateLocale |
| `src/components/AccountGrid.tsx` | i18n |
| `src/components/AddAccountDialog.tsx` | i18n |
| `src/pages/Index.tsx` | 自动轮询 + DouyinPromo + i18n |
| `src/pages/Tasks.tsx` / `Settings.tsx` / `Logs.tsx` / `NotFound.tsx` | i18n |

---

## 建议的 Git 操作

```bash
# 切新分支
git checkout -b v2.0-upgrade

# 添加所有变更
git add -A

# 提交
git commit -m "feat: v2.0 — i18n, rebrand, frontend & backend optimizations

- Add React Context-based i18n system (EN/CN) with 150+ translation keys
- Remove all Lovable branding (favicon, meta tags, tagger plugin)
- Replace favicon with custom SVG icon
- Add Douyin promo banner, auto-polling, ErrorBoundary
- Fix type safety (LiveUsageData interface, API return types)
- Refactor setActive to reuse performAccountSwitch()
- Implement real health-check (auth file + token expiry verification)
- Convert getOpenClawGatewayConfig to async
- Enhance DB pool with timeout/keepalive config
- Improve Express global error handler with DB logging
- Add recommended label to Least Used strategy"

# 推送
git push -u origin v2.0-upgrade

# 然后在 GitHub 上创建 PR 合并到 main
```
