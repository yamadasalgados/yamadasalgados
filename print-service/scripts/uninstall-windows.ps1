$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvPath = Join-Path $Root ".env"
$ProfileLine = if (Test-Path $EnvPath) { Get-Content $EnvPath | Where-Object { $_ -match '^PRINT_PROFILE_ID=' } | Select-Object -First 1 } else { $null }
$ProfileId = if ($ProfileLine) { ($ProfileLine -replace '^PRINT_PROFILE_ID=', '').Trim() } else { "legacy" }
$SafeProfile = ($ProfileId -replace '[^A-Za-z0-9_.-]', '_')
$TaskNames = @("Order Print Service - $SafeProfile", "Order Print Service", "Yamada Print Service")
$Removed = $false
foreach ($TaskName in $TaskNames) {
  $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($Task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    $Removed = $true
  }
}
if ($Removed) { Write-Host "Order Print Service removido da inicialização automática." -ForegroundColor Green }
else { Write-Host "A tarefa automática não estava instalada." }
Remove-Item (Join-Path $PSScriptRoot "node-path.txt") -Force -ErrorAction SilentlyContinue
