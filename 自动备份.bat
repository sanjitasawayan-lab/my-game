@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   一键备份并更新 GitHub（my-game）
echo ========================================
echo.

:: ---------- 1. 依赖 ----------
if not exist node_modules (
  echo [1/5] 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 goto :error
) else (
  echo [1/5] 依赖已就绪，跳过安装
)

:: ---------- 2. 打包 ----------
echo.
echo [2/5] 正在打包构建 dist ...
call npm run build
if errorlevel 1 goto :error

:: ---------- 3. 提交源代码到 main ----------
echo.
echo [3/5] 正在提交源代码到 main 分支...
git add -A
git diff --cached --quiet
if errorlevel 1 (
  for /f "tokens=1-3 delims=/ " %%a in ('echo %date%') do set COMMIT_DATE=%%a-%%b-%%c
  set COMMIT_TIME=%time:~0,8%
  git commit -m "自动备份 %COMMIT_DATE% %COMMIT_TIME%"
  if errorlevel 1 goto :error
  echo      已创建提交
) else (
  echo      源代码无变更，跳过提交
)

:: ---------- 4. 推送到 GitHub main ----------
echo.
echo [4/5] 正在推送到 GitHub main ...
git push origin main
if errorlevel 1 goto :error

:: ---------- 5. 部署网页到 gh-pages ----------
echo.
echo [5/5] 正在部署网页到 gh-pages ...
call npm run deploy
if errorlevel 1 goto :error

echo.
echo ========================================
echo   全部完成！
echo.
echo   源代码: https://github.com/sanjitasawayan-lab/my-game
echo   网页:   https://sanjitasawayan-lab.github.io/my-game/
echo ========================================
echo.
echo 若 GitHub Pages 已开启 Actions 部署，推送 main 后也会自动构建。
echo 稍等 1~2 分钟再刷新网页即可看到最新版本。
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo   操作失败，请查看上方错误信息。
echo.
echo   常见原因:
echo   - 未登录 GitHub（需配置 git 凭据或 SSH）
echo   - 网络连接问题
echo   - npm 或 git 未安装
echo ========================================
echo.
pause
exit /b 1
