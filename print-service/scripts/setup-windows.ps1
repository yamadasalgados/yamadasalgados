$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") { throw "Este assistente deve ser executado no Windows." }

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvPath = Join-Path $Root ".env"

function First-ExistingPath([string[]]$Candidates) {
  foreach ($Candidate in $Candidates) { if ($Candidate -and (Test-Path $Candidate)) { return $Candidate } }
  return ""
}
function Read-Required([string]$Prompt, [string]$Default = "") {
  while ($true) {
    $Suffix = if ($Default) { " [$Default]" } else { "" }
    $Value = Read-Host "$Prompt$Suffix"
    if (-not $Value) { $Value = $Default }
    if ($Value) { return $Value.Trim() }
    Write-Host "Este valor é obrigatório." -ForegroundColor Yellow
  }
}

Write-Host "Order Print Service 2.0 - Configuração para Windows" -ForegroundColor Cyan
Write-Host "Crie o perfil no painel antes de continuar." -ForegroundColor DarkGray
Write-Host ""

$BaseUrl = Read-Required "URL pública do sistema (ex.: https://sua-loja.com)"
$SellerId = Read-Required "Seller ID"
$ProfileId = Read-Required "Profile ID mostrado no perfil da impressora"
$SecureToken = Read-Host "Chave da estação de impressão" -AsSecureString
$TokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
try { $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($TokenPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($TokenPtr) }
if (-not $Token) { throw "A chave da estação é obrigatória." }
$StationName = Read-Required "Nome desta estação" $env:COMPUTERNAME

$ChromePath = First-ExistingPath @(
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
)
if (-not $ChromePath) { $ChromePath = Read-Required "Caminho completo do Chrome ou Edge" }

$SumatraPath = First-ExistingPath @(
  (Join-Path $Root "tools\SumatraPDF.exe"),
  (Join-Path $env:LOCALAPPDATA "SumatraPDF\SumatraPDF.exe"),
  (Join-Path $env:ProgramFiles "SumatraPDF\SumatraPDF.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "SumatraPDF\SumatraPDF.exe")
)

$Lines = @(
  "PRINT_BASE_URL=$BaseUrl",
  "PRINT_SELLER_ID=$SellerId",
  "PRINT_PROFILE_ID=$ProfileId",
  "PRINT_STATION_TOKEN=$Token",
  "PRINT_STATION_NAME=$StationName",
  "CHROME_PATH=$ChromePath",
  "SUMATRA_PATH=$SumatraPath",
  "WINDOWS_PRINT_TIMEOUT_MS=60000",
  "TCP_TIMEOUT_MS=15000",
  "POLL_INTERVAL_MS=3000",
  "HEARTBEAT_INTERVAL_MS=30000"
)

[IO.File]::WriteAllLines($EnvPath, $Lines, [Text.UTF8Encoding]::new($false))
Write-Host ""
Write-Host "Instalando dependências locais..." -ForegroundColor Cyan
Push-Location $Root
try {
  & npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou." }
  & node "src\doctor.mjs"
  if ($LASTEXITCODE -ne 0) { throw "O diagnóstico encontrou um erro." }
} finally { Pop-Location }
Write-Host ""
Write-Host "Configuração concluída. Agora execute install-windows.cmd." -ForegroundColor Green
