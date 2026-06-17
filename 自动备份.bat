@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions
cd /d "%~dp0"

set "FAIL_REASON="

echo ========================================
echo   自动备份并推送到 GitHub - my-game
echo ========================================
echo.

REM ---------- 1. 依赖 ----------
if not exist node_modules goto install_deps
echo [1/4] 依赖已就绪
goto step2
:install_deps
echo [1/4] 正在安装依赖 npm install ...
call npm install
if errorlevel 1 goto err_npm_install
:step2

REM ---------- 2. 构建 Pages ----------
echo.
echo [2/4] 正在构建 npm run build:pages ...
call npm run build:pages
if errorlevel 1 goto err_build

if not exist pages-bundle.json goto err_missing_bundle

REM ---------- 3. 提交 ----------
echo.
echo [3/4] 正在提交 git commit ...
git add -A
git diff --cached --quiet
if errorlevel 1 goto do_commit
echo      没有新的改动，跳过提交
goto step4
:do_commit
for /f "tokens=1-3 delims=/ " %%a in ('echo %date%') do set COMMIT_DATE=%%a-%%b-%%c
set COMMIT_TIME=%time:~0,8%
git commit -m "auto backup %COMMIT_DATE% %COMMIT_TIME%"
if errorlevel 1 goto err_commit
echo      已创建提交
:step4

REM ---------- 4. 推送（最多重试 3 次）----------
echo.
echo [4/4] 正在推送 git push origin main ...
set PUSH_TRY=0
:push_retry
set /a PUSH_TRY+=1
echo      第 %PUSH_TRY%/3 次尝试 ...
git push origin main
if not errorlevel 1 goto push_ok
if %PUSH_TRY% lss 3 (
  echo      网络异常，10 秒后重试 ...
  timeout /t 10 /nobreak >nul
  goto push_retry
)
goto err_push

:push_ok
for /f %%h in ('git rev-parse --short HEAD') do set LAST_COMMIT=%%h
goto done

REM ---------- 失败原因（各步骤）----------
:err_npm_install
set "FAIL_REASON=npm install 失败。请检查：网络是否正常；Node.js 和 npm 是否已安装（命令行输入 node -v 测试）。"
goto error

:err_build
set "FAIL_REASON=npm run build:pages 构建失败。请查看上方红色报错信息，常见原因是代码语法错误或缺少依赖。"
goto error

:err_missing_bundle
set "FAIL_REASON=构建后未找到 pages-bundle.json，说明生产构建未完成。请检查 scripts/copy-pages.js 是否执行成功。"
goto error

:err_commit
set "FAIL_REASON=git commit 失败。可能原因：Git 未配置用户名/邮箱，或 pre-commit 钩子拒绝了提交。请运行 git config --list 检查。"
goto error

:err_push
set "FAIL_REASON=git push 连续 3 次均失败，代码仅保存在本机。请尝试：手机热点 / VPN / 代理后重新运行本脚本，或手动执行 git push origin main。若提示权限问题，请确认已登录 GitHub 账号。"
goto error

REM ---------- 成功 ----------
:done
echo.
echo ========================================
echo   【备份已完成】
echo ========================================
echo   提交版本：%LAST_COMMIT%
echo   仓库地址：https://github.com/sanjitasawayan-lab/my-game
echo   游戏网址：https://sanjitasawayan-lab.github.io/my-game/
echo.
echo   若网页未更新：确认 GitHub Settings - Pages 为 main 分支 /docs 目录
echo   等待 2~5 分钟后，在浏览器按 Ctrl+F5 强制刷新。
echo ========================================
echo.
pause
exit /b 0

REM ---------- 失败 ----------
:error
echo.
echo ========================================
echo   【备份失败】
echo ========================================
if defined FAIL_REASON (
  echo   失败原因：
  echo   %FAIL_REASON%
) else (
  echo   失败原因：未知错误，请查看上方输出信息。
)
echo ========================================
echo.
pause
exit /b 1
