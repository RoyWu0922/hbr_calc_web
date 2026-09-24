# One-click deploy on the server: pull latest -> install -> build -> restart services.
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File C:\hbr_deploy.ps1
$proj = 'C:\Users\Administrator\Documents\Default Project\hbr_calc_web'
$git  = 'C:\Users\Administrator\Documents\Default Project\tools\mingit\cmd\git.exe'
$npm  = 'C:\Program Files\nodejs\npm.cmd'
$caddy = 'C:\Users\Administrator\Documents\Default Project\tools\caddy.exe'
$log = "$proj\deploy.log"
function L($m) { Add-Content -LiteralPath $log -Value "$(Get-Date -Format s) $m"; Write-Host $m }

Set-Location -LiteralPath $proj

L '--- pull ---'
& $git pull --rebase origin local-db 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { L "DEPLOY FAILED: git pull (exit $LASTEXITCODE)"; exit 1 }

L '--- npm install ---'
& $npm install 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { L "DEPLOY FAILED: npm install (exit $LASTEXITCODE)"; exit 1 }

L '--- build ---'
$buildOut = & $npm run build 2>&1
if ($LASTEXITCODE -ne 0) { L "DEPLOY FAILED: build`n$($buildOut -join "`n")"; exit 1 }

L '--- restart services ---'
& powershell -NoProfile -ExecutionPolicy Bypass -File C:\hbr_start.ps1
& $caddy reload --config Caddyfile --adapter caddyfile 2>&1 | Out-Null

L 'DEPLOY OK'
