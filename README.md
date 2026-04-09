# 🦞 小龙虾 — Codex 账号池管理器

[![Version](https://img.shields.io/badge/version-3.0-green?style=flat-square)](https://github.com/heyuqiu2023/CodexPool/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/heyuqiu2023/CodexPool?style=flat-square)](https://github.com/heyuqiu2023/CodexPool/stargazers)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)
[![抖音](https://img.shields.io/badge/抖音-87557938150-000000?style=flat-square&logo=tiktok&logoColor=white)](https://www.douyin.com/search/87557938150)
[![小红书](https://img.shields.io/badge/小红书-秋雨河-FF2442?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyeiIvPjwvc3ZnPg==&logoColor=white)](https://www.xiaohongshu.com/search_result?keyword=9493195118)

多账号 Codex 管理仪表板，支持 GPT / Gemini / Claude 等多平台账号，实时监控用量、自动轮换，一键登录新账号。

> Originally designed for OpenAI Codex, but works with any platform using ChatGPT OAuth tokens.

---

## 🚀 一键部署

### 第一步：下载项目

```bash
git clone https://github.com/heyuqiu2023/CodexPool.git
cd CodexPool
```

> 💡 没有 Git？直接从 [Releases](https://github.com/heyuqiu2023/CodexPool/releases) 下载 ZIP 解压即可。

### 第二步：运行安装脚本

**macOS / Linux：**

```bash
bash setup.sh
```

**Windows：**

双击 `setup.bat`

脚本会自动完成所有事情：检查 Node.js → 安装依赖 → 构建前端 → 启动服务 → 打开浏览器。

> 如果没有 Node.js，脚本会引导你安装（Mac/Linux 可自动安装，Windows 需要先去 [nodejs.org](https://nodejs.org/zh-cn/) 下载安装包双击装一下）。

### 第三步：没有第三步，打开浏览器用就行了

---

## 📦 日常使用

| 操作 | macOS / Linux | Windows |
|------|---------------|---------|
| 启动 | `bash start.sh` | 双击 `start.bat` |
| 停止 | `bash stop.sh` | 双击 `stop.bat` |
| 重启 | `bash setup.sh --restart` | `setup.bat --restart` |
| 查看日志 | `tail -f codexpool.log` | 打开 `codexpool.log` |

---

## 🔄 版本更新

```bash
cd CodexPool
git pull
bash setup.sh
```

脚本会自动检测变更，重新安装依赖、构建前端并启动。Windows 用户同理，`git pull` 之后双击 `setup.bat`。

---

## ✨ Features

- **平台分类** — 支持 GPT、Gemini、Claude 等多平台账号，可自定义添加新平台
- **一键登录** — 在界面内直接完成 `codex login` OAuth 授权，auth 文件自动保存
- **批量用量检测** — 一键检测所有账号的 5h 窗口用量，结果实时展示在各账号卡片
- **智能轮换** — 基于用量增长趋势预测性轮换，在触达限额前主动切换
- **WebSocket 实时推送** — 所有状态变更实时同步到前端，无需手动刷新
- **用量趋势图表** — 可视化展示各账号用量变化历史
- **API 认证** — 可选密码保护管理界面
- **中英双语** — 界面支持中文 / English 一键切换
- **亮暗主题** — 支持深色 / 浅色模式随时切换
- **多视图模式** — 网格视图和紧凑列表视图自由切换
- **实时日志** — 完整记录轮换事件、Token 刷新、用量检测
- **Docker 支持** — 可选 Docker 一键部署

## 📸 Screenshots

| 仪表板 | 添加账号 | 日志 |
|--------|---------|------|
| ![Dashboard](assets/screenshot-dashboard.png) | ![Add Account](assets/screenshot-add.png) | ![Logs](assets/screenshot-logs.png) |

---

## 🛠 Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui + recharts
- **Backend**: Express.js + Node.js（模块化架构）
- **Database**: SQLite（零配置，数据自动持久化）
- **实时通信**: WebSocket（自动重连）

---

## ➕ 添加账号

### 方式一：一键登录（推荐）

1. 点击右上角 **+ 添加账号**
2. 点击 **一键登录新账号**
3. 在弹出的终端中完成浏览器 OAuth 授权
4. 授权成功后账号自动保存 ✅

### 方式二：手动导入

1. 在终端执行 `codex login`，完成授权
2. 复制 auth 文件：`cp ~/.codex/auth.json ~/Desktop/openai-accounts/acc1.json`
3. 点击 **+ 添加账号 → 扫描**，选择文件路径

---

## 🔄 自动轮换

| 5h 用量 | 行为 |
|--------|------|
| < 50%  | 每 30 分钟检查 |
| 50–80% | 每 10 分钟检查 |
| > 80%  | 每 5 分钟检查 |
| **> 90%** | **预测性切换到下一个账号** |

---

## ⚙️ 可选配置

在项目根目录的 `.env` 文件中可以修改（安装脚本会自动创建）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3001` |
| `AUTH_SECRET` | 管理密码（留空=不需要密码） | 空 |

---

## 🐳 Docker 部署（可选）

如果你更喜欢用 Docker：

```bash
docker compose up -d --build
```

打开 `http://localhost:3001`，数据保存在 `data/` 和 `accounts/` 目录。

---

## ⚠️ 注意事项

- Auth 文件包含 OAuth Token，请勿提交到版本控制
- 用量检测调用零 Token 接口，不消耗 Codex 配额
- 自动轮换仅在开启 **自动轮换** 开关时生效
- 数据库文件保存在 `data/` 目录，升级时不会丢失

---

## 🤝 参与贡献

欢迎提交 PR！无论是 Bug 修复、功能增强、文档改进还是代码优化，只要是有效贡献，你都会被列入**贡献者墙**并成为项目正式贡献者。

### 如何贡献

1. Fork 本仓库
2. 创建你的分支 `git checkout -b feature/my-improvement`
3. 提交更改 `git commit -m "feat: 描述你的改进"`
4. 推送到你的 Fork `git push origin feature/my-improvement`
5. 发起 Pull Request

### 贡献者墙

感谢所有为小龙虾做出贡献的开发者们！

<a href="https://github.com/heyuqiu2023/CodexPool/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=heyuqiu2023/CodexPool" />
</a>

---

## ❤️ 赞助

如果这个项目对你有帮助，欢迎请我喝杯咖啡 ☕

你的支持是我持续更新、带来更好作品的动力，感谢每一位愿意赞助的朋友！

<img src="assets/wechat-donate.png" width="200" alt="微信收款码" />

---

## License

MIT
