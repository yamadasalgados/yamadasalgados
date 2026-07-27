$TaskName = "Yamada Print Service"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($Task) {
  $Info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Tarefa: $TaskName" -ForegroundColor Cyan
  Write-Host "Estado: $($Task.State)"
  Write-Host "Última execução: $($Info.LastRunTime)"
  Write-Host "Último resultado: $($Info.LastTaskResult)"
  Write-Host "Próxima execução: $($Info.NextRunTime)"
} else {
  Write-Host "O serviço ainda não está instalado na inicialização automática." -ForegroundColor Yellow
}

foreach ($Name in @("output.log", "error.log")) {
  $Log = Join-Path $Root "logs\$Name"
  Write-Host ""
  Write-Host "--- $Name ---" -ForegroundColor Cyan
  if (Test-Path $Log) {
    Get-Content $Log -Tail 30
  } else {
    Write-Host "Sem registros."
  }
}
