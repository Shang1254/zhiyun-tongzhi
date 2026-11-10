# 知云同职 · 一键公网预览（本机起服务 + Cloudflare 临时隧道）
# 用法（在项目根目录）：
#   powershell -ExecutionPolicy Bypass -File deploy\start-public.ps1
# 说明：电脑需保持开机；关掉窗口里的进程后公网地址立即失效。
#       正式上线请用 docs/上线部署指南.md 里的静态托管或 Render/Fly。

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root 'server'
$deployDir = Join-Path $env:LOCALAPPDATA 'zhiyun-deploy'
$cloudflared = Join-Path $deployDir 'cloudflared.exe'
$tunnelLog = Join-Path $deployDir 'tunnel.log'

if (-not (Test-Path -LiteralPath $deployDir)) { New-Item -ItemType Directory -Path $deployDir | Out-Null }

# 1) 服务
$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Host '启动数据服务（端口 3000）…'
  Start-Process -FilePath 'node' -ArgumentList 'src/index.js' -WorkingDirectory $serverDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $serverDir 'run-out.log') -RedirectStandardError (Join-Path $serverDir 'run-err.log')
  Start-Sleep -Seconds 3
} else {
  Write-Host '数据服务已在运行（端口 3000）'
}

# 2) cloudflared
if (-not (Test-Path -LiteralPath $cloudflared)) {
  Write-Host '下载 cloudflared（约 53MB）…'
  & curl.exe -L --fail --silent --show-error -o $cloudflared 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
}

if (Test-Path -LiteralPath $tunnelLog) { Remove-Item -LiteralPath $tunnelLog -Force }
Write-Host '建立公网隧道…'
Start-Process -FilePath $cloudflared -ArgumentList 'tunnel', '--url', 'http://localhost:3000', '--no-autoupdate' `
  -WindowStyle Hidden -PassThru -RedirectStandardError $tunnelLog | Out-Null

$url = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path -LiteralPath $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value; break }
  }
}

if ($url) {
  Write-Host ''
  Write-Host "公网地址：$url" -ForegroundColor Green
  Write-Host '（此地址随隧道进程存在，重启后变化；永久地址见 docs/上线部署指南.md）'
  try {
    $h = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 15
    Write-Host "健康检查：$($h.StatusCode) $($h.Content)"
  } catch {
    Write-Host "健康检查失败：$($_.Exception.Message)"
  }
} else {
  Write-Host '未拿到公网地址，请查看日志：' $tunnelLog
}
