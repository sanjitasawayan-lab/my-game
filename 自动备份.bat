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
if errorlevel 1 (
  echo.
  echo   *** 推送失败！代码只在电脑上，GitHub 不会更新。***
  echo   请检查网络或 GitHub 登录后，再运行本脚本。
  goto :error
)
for /f %%h in ('git rev-parse --short HEAD') do set LAST_COMMIT=%%h
echo      推送成功，最新提交: %LAST_COMMIT%
echo      仓库: https://github.com/sanjitasawayan-lab/my-game

:: ---------- 5. 部署网页（可选，失败不影响上传）----------
echo.
echo [5/5] 正在部署网页到 gh-pages ...
echo      （若失败，推送 main 后 GitHub Actions 也会自动发布网页）
call npm run deploy
if errorlevel 1 (
  echo.
  echo   注意: gh-pages 手动部署未成功（常见于网络或路径过长）。
  echo   源代码已上传；请到 GitHub 仓库 Actions 页查看自动部署进度。
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
echo 推送成功后，GitHub Actions 通常 1~3 分钟会自动更新网页。
echo 请用 Ctrl+F5 强制刷新浏览器。
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
