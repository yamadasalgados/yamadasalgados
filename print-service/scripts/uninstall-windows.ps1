$ErrorActionPreference = "Stop"
$TaskName = "Yamada Print Service"

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Yamada Print Service removido da inicialização automática." -ForegroundColor Green
} else {
  Write-Host "A tarefa automática não estava instalada."
}

$NodePathFile = Join-Path $PSScriptRoot "node-path.txt"
Remove-Item $NodePathFile -Force -ErrorAction SilentlyContinue
