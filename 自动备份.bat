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

:: ---------- 2. 打包并生成 docs（GitHub Pages 可玩版本）----------
echo.
echo [2/5] 正在打包并生成 docs 目录（供 GitHub Pages 发布）...
call npm run build:pages
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
if errorlevel 1 (
  echo.
  echo   *** 推送失败！代码只在电脑上，GitHub 不会更新。***
  echo   请检查网络或 GitHub 登录后，再运行本脚本。
  goto :error
)
for /f %%h in ('git rev-parse --short HEAD') do set LAST_COMMIT=%%h
echo      推送成功，最新提交: %LAST_COMMIT%
echo      仓库: https://github.com/sanjitasawayan-lab/my-game

if not exist pages-bundle.json (
  echo.
  echo   *** 警告: 缺少 pages-bundle.json，网页可能无法运行！***
  goto :error
)

:: ---------- 5. 部署网页（可选，失败不影响上传）----------
echo.
echo [5/5] 正在部署网页到 gh-pages 分支 ...
echo      （主站推荐：GitHub Settings - Pages - 选 main 分支 /docs 目录）
call npm run deploy
if errorlevel 1 (
  echo.
  echo   注意: gh-pages 手动部署未成功（常见于网络或路径过长）。
  echo   源代码与 docs 已上传；请确认 Pages 源为 main/docs 或 Actions 自动部署。
  goto :done
)

:done
echo.
echo ========================================
echo   备份完成！
echo.
echo   源代码: https://github.com/sanjitasawayan-lab/my-game
echo   网页:   https://sanjitasawayan-lab.github.io/my-game/
echo ========================================
echo.
echo 推送成功后，请确认 GitHub 仓库 Settings - Pages：
echo   - 推荐：Deploy from branch - main - /docs
echo   - 或：GitHub Actions（需已启用 deploy-pages 工作流）
echo 更新后约 1~3 分钟生效，请用 Ctrl+F5 强制刷新浏览器。
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
