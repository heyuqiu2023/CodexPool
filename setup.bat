@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title 小龙虾 CodexPool

:: ── 处理参数 ──────────────────────────────────
if "%1"=="--stop" goto :stop
if "%1"=="--start" goto :quick_start
if "%1"=="--restart" (
    call :stop_silent
    timeout /t 2 /nobreak >nul
    goto :quick_start
)

:: ── 完整安装流程 ─────────────────────────────
:full_install
echo.
echo ╔═══════════════════════════════════════════╗
echo ║   小龙虾 CodexPool 一键安装启动          ║
echo ║   Codex 账号池管理器 v3.0                ║
echo ╚═══════════════════════════════════════════╝
echo.

:: ── 检查 Node.js ─────────────────────────────
echo -- 检查 Node.js 环境 --
echo.

where node >nul 2>&1
if %errorlevel% neq 0 goto :no_node

:: 检查版本
for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_VER=%NODE_VER:v=%
if %NODE_VER% GEQ 18 (
    echo [OK] Node.js 已就绪
    for /f %%v in ('node -v') do echo      版本: %%v
    goto :install_deps
)

echo [!] Node.js 版本过低，需要 v18+

:no_node
echo.
echo [!] 需要安装 Node.js 18+
echo.
echo     请前往下载安装：
echo     https://nodejs.org/zh-cn/download/
echo.
echo     下载 Windows Installer (.msi)，双击安装，
echo     全部选默认即可。
echo.
echo     安装完成后重新运行此脚本。
echo.
pause
exit /b 1

:: ── 安装依赖 ──────────────────────────────────
:install_deps
echo.
echo -- 安装项目依赖 --
echo.

if exist node_modules\express (
    echo [OK] 依赖已安装，检查更新...
    call npm install --prefer-offline 2>nul || call npm install
) else (
    echo [..] 首次安装依赖（可能需要 1-2 分钟）...
    call npm install
)

if %errorlevel% neq 0 (
    echo [X] 依赖安装失败
    pause
    exit /b 1
)
echo [OK] 依赖安装完成

:: ── 构建前端 ──────────────────────────────────
echo.
echo -- 构建前端 --
echo.

if exist dist\index.html (
    echo [OK] 前端已构建，跳过
) else (
    echo [..] 正在构建前端...
    call npm run build
    if %errorlevel% neq 0 (
        echo [X] 前端构建失败
        pause
        exit /b 1
    )
    echo [OK] 前端构建完成
)

:: ── 配置 ─────────────────────────────────────
:setup_env
echo.
echo -- 检查配置 --
echo.

if not exist data mkdir data
if not exist accounts mkdir accounts

if exist .env (
    echo [OK] .env 配置已存在
    goto :start_server
)

echo 简单配置（直接回车使用默认值）：
echo.

set /p PORT="  访问端口 [3001]: "
if "!PORT!"=="" set PORT=3001

set /p AUTH_SECRET="  设置管理密码（留空=不需要密码）: "

(
    echo PORT=!PORT!
    echo AUTH_SECRET=!AUTH_SECRET!
) > .env

echo [OK] 配置已保存

:: ── 启动服务 ──────────────────────────────────
:start_server
echo.
echo -- 启动服务 --
echo.

:: 读取端口
set PORT=3001
for /f "tokens=2 delims==" %%a in ('findstr /b "PORT=" .env 2^>nul') do set PORT=%%a
if "!PORT!"=="" set PORT=3001

:: 停止旧进程
if exist .codexpool.pid (
    set /p OLD_PID=<.codexpool.pid
    taskkill /PID !OLD_PID! /F >nul 2>&1
    del .codexpool.pid >nul 2>&1
)

:: 后台启动
start /b "" cmd /c "node server/index.js > codexpool.log 2>&1 & echo %%PID%% > .codexpool.pid"

:: 用 PowerShell 获取 node 进程 PID 并写入文件
timeout /t 2 /nobreak >nul
for /f %%p in ('powershell -command "(Get-Process node -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending | Select-Object -First 1).Id"') do (
    echo %%p > .codexpool.pid
)

:: 等待服务启动
echo 启动中...
set /a COUNT=0
:wait_loop
if %COUNT% geq 15 goto :start_slow
timeout /t 1 /nobreak >nul
curl -sf "http://localhost:!PORT!/api/health" >nul 2>&1
if %errorlevel% equ 0 goto :start_ok
set /a COUNT+=1
goto :wait_loop

:start_ok
echo.
echo ══════════════════════════════════════════════════
echo.
echo   启动成功！
echo.
echo   浏览器打开: http://localhost:!PORT!
echo.
echo   停止服务:   setup.bat --stop
echo   重新启动:   setup.bat --restart
echo   查看日志:   type codexpool.log
echo.
echo ══════════════════════════════════════════════════
echo.

:: 自动打开浏览器
start "" "http://localhost:!PORT!"
goto :eof

:start_slow
echo.
echo [!] 启动较慢，请稍等后访问 http://localhost:!PORT!
echo     查看日志: type codexpool.log
echo.
pause
goto :eof

:: ── 快速启动（跳过安装） ─────────────────────
:quick_start
echo.
echo [..] 快速启动 CodexPool...
goto :setup_env

:: ── 停止服务 ──────────────────────────────────
:stop
call :stop_silent
echo [OK] 完成
pause
goto :eof

:stop_silent
if exist .codexpool.pid (
    set /p PID=<.codexpool.pid
    taskkill /PID !PID! /F >nul 2>&1
    del .codexpool.pid >nul 2>&1
    echo [OK] CodexPool 已停止
) else (
    echo [OK] 服务未在运行
)
goto :eof
