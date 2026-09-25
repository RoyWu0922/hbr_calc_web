$proj = 'C:\Users\Administrator\Documents\Default Project\hbr_calc_web'
$node = 'C:\Program Files\nodejs\node.exe'
$dir = "$proj\backups"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest = "$dir\hbr-$stamp.db"

try {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  & $node "$proj\server\backup.mjs" "$proj\server\data\hbr.db" "$dest" | Out-Null
  # also back up the JWT secret so sessions can be recovered after a disaster
  Copy-Item "$proj\server\.env" "$dir\env-$stamp.txt" -Force -ErrorAction SilentlyContinue
  # keep the last 14 daily snapshots
  Get-ChildItem $dir -Filter 'hbr-*.db' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem $dir -Filter 'env-*.txt' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue
  Add-Content "$proj\backup.log" "$(Get-Date -Format s) OK -> hbr-$stamp.db"
} catch {
  Add-Content "$proj\backup.log" "$(Get-Date -Format s) ERROR: $($_.Exception.Message)"
}
