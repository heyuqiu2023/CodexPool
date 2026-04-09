#!/usr/bin/env bash
#
# 🦞 小龙虾 CodexPool — 一键安装启动脚本 (Linux / macOS)
#
# 用法：
#   bash setup.sh          首次安装 + 启动
#   bash setup.sh --start  跳过安装，直接启动（日常使用）
#

set -e

# ── 颜色 ──────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }
step()  { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}"; }

print_banner() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   🦞 小龙虾 CodexPool 一键安装启动       ║${NC}"
  echo -e "${CYAN}║   Codex 账号池管理器 v3.0                 ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
  echo ""
}

# ── 检测操作系统 ──────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Linux*)  OS="linux" ;;
    Darwin*) OS="mac" ;;
    *)       OS="unknown" ;;
  esac
}

# ── 检测/安装 Node.js ─────────────────────────
check_node() {
  step "检查 Node.js 环境"

  if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
      info "Node.js v${NODE_VERSION} 已就绪"
      return 0
    else
      warn "Node.js 版本过低 (v${NODE_VERSION})，需要 v18+"
    fi
  else
    warn "未检测到 Node.js"
  fi

  echo ""
  echo -e "${BOLD}需要安装 Node.js 18+，选择安装方式：${NC}"
  echo ""
  echo "  1) 自动安装（使用 nvm，推荐）"
  echo "  2) 我自己安装（打开下载页面）"
  echo "  3) 退出"
  echo ""
  read -rp "  请选择 [1]: " choice
  choice=${choice:-1}

  case "$choice" in
    1)
      install_node_auto
      ;;
    2)
      echo ""
      echo "  请前往下载安装："
      echo "  👉 https://nodejs.org/zh-cn/download/"
      echo ""
      echo "  安装完成后重新运行此脚本即可。"
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
}

install_node_auto() {
  step "自动安装 Node.js 20"

  if command -v nvm &>/dev/null; then
    info "检测到 nvm，直接安装..."
    nvm install 20
    nvm use 20
  else
    info "正在安装 nvm..."
    export NVM_DIR="$HOME/.nvm"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

    # 加载 nvm
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    info "正在通过 nvm 安装 Node.js 20..."
    nvm install 20
    nvm use 20
    nvm alias default 20
  fi

  if command -v node &>/dev/null; then
    info "Node.js $(node -v) 安装成功"
    info "npm $(npm -v)"
  else
    error "Node.js 安装失败，请手动安装：https://nodejs.org"
    exit 1
  fi
}

# ── 安装依赖 ──────────────────────────────────
install_deps() {
  step "安装项目依赖"

  if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    info "依赖已安装，检查更新..."
    npm install --prefer-offline 2>/dev/null || npm install
  else
    info "首次安装依赖（可能需要 1-2 分钟）..."
    npm install
  fi

  info "依赖安装完成"
}

# ── 构建前端 ──────────────────────────────────
build_frontend() {
  step "构建前端"

  if [ -d "dist" ] && [ -f "dist/index.html" ]; then
    # 检查源码是否比 dist 新
    NEWEST_SRC=$(find src/ -type f -newer dist/index.html 2>/dev/null | head -1)
    if [ -z "$NEWEST_SRC" ]; then
      info "前端已是最新，跳过构建"
      return 0
    fi
  fi

  info "正在构建前端..."
  npm run build
  info "前端构建完成"
}

# ── 生成配置 ──────────────────────────────────
setup_env() {
  step "检查配置"

  mkdir -p data accounts

  if [ -f ".env" ]; then
    info ".env 配置已存在"
    return 0
  fi

  echo ""
  echo -e "${BOLD}简单配置（直接回车使用默认值）：${NC}"
  echo ""
  read -rp "  访问端口 [3001]: " PORT
  PORT=${PORT:-3001}

  read -rp "  设置管理密码（留空=不需要密码）: " AUTH_SECRET

  cat > .env <<EOF
PORT=${PORT}
AUTH_SECRET=${AUTH_SECRET}
EOF

  info "配置已保存"
}

# ── 启动服务 ──────────────────────────────────
start_server() {
  step "启动服务"

  # 读取端口
  PORT=$(grep -oP '^PORT=\K.*' .env 2>/dev/null || echo "3001")
  PORT=${PORT:-3001}

  # 检查端口是否被占用
  if command -v lsof &>/dev/null && lsof -i ":${PORT}" &>/dev/null; then
    warn "端口 ${PORT} 已被占用"
    # 检查是否是我们自己的进程
    if [ -f ".codexpool.pid" ]; then
      OLD_PID=$(cat .codexpool.pid)
      if kill -0 "$OLD_PID" 2>/dev/null; then
        warn "CodexPool 已在运行 (PID: ${OLD_PID})，正在重启..."
        kill "$OLD_PID" 2>/dev/null || true
        sleep 2
      fi
    else
      error "端口 ${PORT} 被其他程序占用，请修改 .env 中的 PORT 或关闭占用程序"
      exit 1
    fi
  fi

  # 后台启动
  nohup node server/index.js > codexpool.log 2>&1 &
  SERVER_PID=$!
  echo "$SERVER_PID" > .codexpool.pid

  # 等待启动
  echo -ne "  启动中..."
  for i in $(seq 1 15); do
    if curl -sf "http://localhost:${PORT}/api/health" &>/dev/null; then
      echo ""
      print_success "$PORT" "$SERVER_PID"
      return 0
    fi
    echo -ne "."
    sleep 1
  done

  # 检查进程是否还在
  echo ""
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    warn "启动较慢，但进程正在运行 (PID: ${SERVER_PID})"
    echo "  查看日志: tail -f codexpool.log"
    echo "  访问地址: http://localhost:${PORT}"
  else
    error "启动失败，请查看日志:"
    tail -20 codexpool.log
    exit 1
  fi
}

print_success() {
  local PORT=$1
  local PID=$2
  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                                                   ║${NC}"
  echo -e "${GREEN}║   🎉 启动成功！                                   ║${NC}"
  echo -e "${GREEN}║                                                   ║${NC}"
  echo -e "${GREEN}║   浏览器打开: ${BOLD}http://localhost:${PORT}${NC}${GREEN}               ║${NC}"
  echo -e "${GREEN}║                                                   ║${NC}"
  echo -e "${GREEN}║   停止服务:  bash setup.sh --stop                 ║${NC}"
  echo -e "${GREEN}║   查看日志:  tail -f codexpool.log                ║${NC}"
  echo -e "${GREEN}║   重新启动:  bash setup.sh --start                ║${NC}"
  echo -e "${GREEN}║                                                   ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
  echo ""

  # 尝试自动打开浏览器
  if [ "$OS" = "mac" ]; then
    open "http://localhost:${PORT}" 2>/dev/null || true
  elif [ "$OS" = "linux" ]; then
    xdg-open "http://localhost:${PORT}" 2>/dev/null || true
  fi
}

# ── 停止服务 ──────────────────────────────────
stop_server() {
  if [ -f ".codexpool.pid" ]; then
    PID=$(cat .codexpool.pid)
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      rm -f .codexpool.pid
      info "CodexPool 已停止 (PID: ${PID})"
    else
      rm -f .codexpool.pid
      info "服务未在运行"
    fi
  else
    info "服务未在运行"
  fi
}

# ── 主入口 ────────────────────────────────────
main() {
  cd "$(dirname "$0")"
  detect_os

  case "${1:-}" in
    --stop)
      stop_server
      exit 0
      ;;
    --start)
      print_banner
      setup_env
      start_server
      exit 0
      ;;
    --restart)
      stop_server
      sleep 1
      setup_env
      start_server
      exit 0
      ;;
    *)
      # 完整安装流程
      print_banner
      check_node
      install_deps
      build_frontend
      setup_env
      start_server
      ;;
  esac
}

main "$@"
