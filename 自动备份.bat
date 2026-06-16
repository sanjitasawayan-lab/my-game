@echo off
echo 正在自动备份小游戏到 Gitee...
git add .
git commit -m "自动备份 %date% %time%"
git push
echo 备份完成！
pause