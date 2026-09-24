$proj = 'C:\Users\Administrator\Documents\Default Project\hbr_calc_web'
$log = "$proj\health.log"
$guard = "$proj\.last_health_restart"
$now = Get-Date

function Log($m) { Add-Content -LiteralPath $log -Value "$(Get-Date -Format s) $m" }

# 1) is the API actually answering?
$apiOk = $false
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8123/api/auth/session' -UseBasicParsing -TimeoutSec 10
  $apiOk = ($r.StatusCode -eq 200)
} catch { $apiOk = $false }

if (-not $apiOk) {
  # conservative restart: at most once per 10 minutes
  $last = $null
  if (Test-Path $guard) { try { $last = [datetime](Get-Content $guard -Raw).Trim() } catch {} }
  if ($last -and ($now - $last).TotalMinutes -lt 10) {
    Log "API unhealthy but recently restarted; skipping"
  } else {
    Log "API UNHEALTHY -> restarting backend"
    $p = (Get-NetTCPConnection -LocalPort 8123 -State Listen -ErrorAction SilentlyContinue).OwningProcess
    if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 }
    & powershell -NoProfile -ExecutionPolicy Bypass -File C:\hbr_start.ps1
    Set-Content -LiteralPath $guard -Value $now.ToString('s')
  }
}

# 2) public HTTPS reachability (log only)
try {
  $r2 = Invoke-WebRequest -Uri 'https://afsgtool.top/' -UseBasicParsing -TimeoutSec 15
  if ($r2.StatusCode -ne 200) { Log "HTTPS status $($r2.StatusCode)" }
} catch { Log "HTTPS check failed: $($_.Exception.Message)" }
