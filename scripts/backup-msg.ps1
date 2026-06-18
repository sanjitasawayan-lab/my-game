param(
  [Parameter(Mandatory = $true)][string]$Status,
  [string]$Code = ''
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$messages = @{
  ok = @(
    '',
    '【备份已完成】',
    '若网页未更新：GitHub Settings - Pages 选 main 分支 /docs 目录',
    '等待 2~5 分钟后，浏览器按 Ctrl+F5 强制刷新。'
  )
  fail = @{
    '1' = '失败原因：npm install 失败，请检查网络和 Node.js 是否已安装。'
    '2' = '失败原因：build:pages 构建失败，请查看上方报错。'
    '3' = '失败原因：未找到 pages-bundle.json，构建未完成。'
    '4' = '失败原因：git commit 失败，请检查 Git 用户名和邮箱配置。'
    '5' = '失败原因：git push 连续 3 次失败，请换网络或热点后重试。'
  }
}

if ($Status -eq 'ok') {
  foreach ($line in $messages.ok) {
    Write-Host $line
  }
  exit 0
}

Write-Host ''
Write-Host '【备份失败】'
if ($Code -and $messages.fail.ContainsKey($Code)) {
  Write-Host $messages.fail[$Code]
} else {
  Write-Host '失败原因：未知错误，请查看上方输出。'
}
