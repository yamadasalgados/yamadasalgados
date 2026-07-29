$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvPath = Join-Path $Root ".env"
$ProfileLine = if (Test-Path $EnvPath) { Get-Content $EnvPath | Where-Object { $_ -match '^PRINT_PROFILE_ID=' } | Select-Object -First 1 } else { $null }
$ProfileId = if ($ProfileLine) { ($ProfileLine -replace '^PRINT_PROFILE_ID=', '').Trim() } else { "legacy" }
$SafeProfile = ($ProfileId -replace '[^A-Za-z0-9_.-]', '_')
$TaskNames = @("Order Print Service - $SafeProfile", "Order Print Service", "Yamada Print Service")
$TaskName = $null
$Task = $null
foreach ($Candidate in $TaskNames) {
  $Found = Get-ScheduledTask -TaskName $Candidate -ErrorAction SilentlyContinue
  if ($Found) { $TaskName = $Candidate; $Task = $Found; break }
}
if ($Task) {
  $Info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Tarefa: $TaskName" -ForegroundColor Cyan
  Write-Host "Estado: $($Task.State)"
  Write-Host "Última execução: $($Info.LastRunTime)"
  Write-Host "Último resultado: $($Info.LastTaskResult)"
} else { Write-Host "O serviço deste perfil ainda não está instalado." -ForegroundColor Yellow }
foreach ($Name in @("output.log", "error.log")) {
  $Log = Join-Path $Root "logs\$Name"
  Write-Host ""; Write-Host "--- $Name ---" -ForegroundColor Cyan
  if (Test-Path $Log) { Get-Content $Log -Tail 30 } else { Write-Host "Sem registros." }
}
