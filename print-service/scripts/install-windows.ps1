$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  throw "Este instalador deve ser executado no Windows."
}

$TaskName = "Yamada Print Service"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvPath = Join-Path $Root ".env"
$Runner = Join-Path $PSScriptRoot "run-windows.ps1"
$NodePathFile = Join-Path $PSScriptRoot "node-path.txt"

if (-not (Test-Path $EnvPath)) {
  throw "Arquivo .env não encontrado. Execute primeiro setup-windows.cmd."
}

$NodePath = (Get-Command node -ErrorAction Stop).Source
[IO.File]::WriteAllText($NodePathFile, $NodePath, [Text.UTF8Encoding]::new($false))
New-Item -ItemType Directory -Path (Join-Path $Root "logs") -Force | Out-Null

$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""
$Action = New-ScheduledTaskAction -Execute $PowerShellPath -Argument $Arguments -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 10 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

try {
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description "Impressão automática dos pedidos Yamada" -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
} catch {
  throw "Não foi possível registrar a tarefa automática. Abra o PowerShell como administrador e tente novamente. Detalhe: $($_.Exception.Message)"
}

Write-Host "Yamada Print Service instalado e iniciado." -ForegroundColor Green
Write-Host "Ele será iniciado automaticamente quando $CurrentUser entrar no Windows."
Write-Host "Use status-windows.cmd para verificar o estado e os logs."
