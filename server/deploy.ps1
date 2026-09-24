# One-click deploy on the server: pull latest -> install -> build -> restart services.
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File C:\hbr_deploy.ps1
$ErrorActionPreference = 'Stop'
$proj = 'C:\Users\Administrator\Documents\Default Project\hbr_calc_web'
$git  = 'C:\Users\Administrator\Documents\Default Project\tools\mingit\cmd\git.exe'
$npm  = 'C:\Program Files\nodejs\npm.cmd'
$caddy = 'C:\Users\Administrator\Documents\Default Project\tools\caddy.exe'
$log = "$proj\deploy.log"
function L($m) { Add-Content -LiteralPath $log -Value "$(Get-Date -Format s) $m"; Write-Host $m }

try {
  Set-Location -LiteralPath $proj
  L '--- pull ---'
  & $git pull --rebase origin local-db 2>&1 | ForEach-Object { $_ } | Out-Null
  L '--- npm install ---'
  & $npm install 2>&1 | Out-Null
  L '--- build ---'
  $buildOut = & $npm run build 2>&1
  if ($LASTEXITCODE -ne 0) { throw "build failed:`n$($buildOut -join "`n")" }
  L '--- restart backend + caddy (idempotent) ---'
  & powershell -NoProfile -ExecutionPolicy Bypass -File C:\hbr_start.ps1
  & $caddy reload --config Caddyfile --adapter caddyfile 2>&1 | Out-Null
  L 'DEPLOY OK'
} catch {
  L "DEPLOY FAILED: $($_.Exception.Message)"
  exit 1
}
