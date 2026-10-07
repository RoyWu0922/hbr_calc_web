# Auto-sync: if origin/local-db has new commits, pull + build + restart + verify.
$proj = 'C:\Users\Administrator\Documents\Default Project\hbr_calc_web'
$git  = 'C:\Users\Administrator\Documents\Default Project\tools\mingit\cmd\git.exe'
$log  = "$proj\autosync.log"
function L($m) { Add-Content -LiteralPath $log -Value "$(Get-Date -Format s) $m" }

Set-Location -LiteralPath $proj
$out = & $git fetch origin local-db 2>&1
if ($LASTEXITCODE -ne 0) { L "git fetch failed (exit $LASTEXITCODE): $($out -join ' | ')"; exit 1 }
$new = (& $git rev-parse origin/local-db).Trim()
$cur = (& $git rev-parse HEAD).Trim()
if ($new -eq $cur) { exit 0 }

L "new commits detected ($cur -> $new), deploying"
& powershell -NoProfile -ExecutionPolicy Bypass -File C:\hbr_deploy.ps1 *>> $log
