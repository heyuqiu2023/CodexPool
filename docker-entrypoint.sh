#!/bin/sh
# 小龙虾 CodexPool — Docker 入口脚本
# 自动创建数据目录、初始化数据库、启动服务

set -e

echo "🦞 CodexPool starting..."

# 确保数据目录存在
mkdir -p /app/data /app/accounts

# 启动 Node 服务 (init-db 在 index.js 中自动调用)
exec node server/index.js
