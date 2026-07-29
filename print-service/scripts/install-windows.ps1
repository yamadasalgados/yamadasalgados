$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") { throw "Este instalador deve ser executado no Windows." }

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvPath = Join-Path $Root ".env"
$Runner = Join-Path $PSScriptRoot "run-windows.ps1"
$NodePathFile = Join-Path $PSScriptRoot "node-path.txt"
if (-not (Test-Path $EnvPath)) { throw "Arquivo .env não encontrado. Execute primeiro setup-windows.cmd." }

$ProfileLine = Get-Content $EnvPath | Where-Object { $_ -match '^PRINT_PROFILE_ID=' } | Select-Object -First 1
$ProfileId = if ($ProfileLine) { ($ProfileLine -replace '^PRINT_PROFILE_ID=', '').Trim() } else { "legacy" }
$SafeProfile = ($ProfileId -replace '[^A-Za-z0-9_.-]', '_')
$TaskName = "Order Print Service - $SafeProfile"
$LegacyTaskNames = @("Order Print Service", "Yamada Print Service")

$NodePath = (Get-Command node -ErrorAction Stop).Source
[IO.File]::WriteAllText($NodePathFile, $NodePath, [Text.UTF8Encoding]::new($false))
New-Item -ItemType Directory -Path (Join-Path $Root "logs") -Force | Out-Null

$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""
$Action = New-ScheduledTaskAction -Execute $PowerShellPath -Argument $Arguments -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

foreach ($LegacyTaskName in $LegacyTaskNames) {
  $LegacyTask = Get-ScheduledTask -TaskName $LegacyTaskName -ErrorAction SilentlyContinue
  if ($LegacyTask) {
    Stop-ScheduledTask -TaskName $LegacyTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $LegacyTaskName -Confirm:$false
  }
}
$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 700 }

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description "Impressão automática do perfil $ProfileId" -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "$TaskName instalado e iniciado." -ForegroundColor Green
Write-Host "Para vários perfis no mesmo PC, mantenha uma cópia separada da pasta print-service para cada perfil."
