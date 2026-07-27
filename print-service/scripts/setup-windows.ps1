$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  throw "Este assistente deve ser executado no Windows."
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvPath = Join-Path $Root ".env"

function First-ExistingPath([string[]]$Candidates) {
  foreach ($Candidate in $Candidates) {
    if ($Candidate -and (Test-Path $Candidate)) { return $Candidate }
  }
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

Write-Host "Yamada Print Service - Configuração para Windows" -ForegroundColor Cyan
Write-Host ""

$BaseUrl = Read-Required "URL do Yamada" "https://yamadasalgados.vercel.app"
$SellerId = Read-Required "Seller ID"
$SecureToken = Read-Host "Chave da estação de impressão" -AsSecureString
$TokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
try {
  $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($TokenPtr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($TokenPtr)
}
if (-not $Token) { throw "A chave da estação é obrigatória." }

$StationName = Read-Required "Nome desta estação" $env:COMPUTERNAME

$Printers = @(Get-Printer | Sort-Object Name)
if ($Printers.Count -eq 0) {
  throw "Nenhuma impressora está instalada. Instale primeiro o driver da MUNBYN no Windows."
}

Write-Host ""
Write-Host "Impressoras instaladas:" -ForegroundColor Cyan
for ($Index = 0; $Index -lt $Printers.Count; $Index++) {
  Write-Host ("[{0}] {1}  ({2})" -f ($Index + 1), $Printers[$Index].Name, $Printers[$Index].PortName)
}

while ($true) {
  $Choice = Read-Host "Escolha o número da impressora"
  $Parsed = 0
  if ([int]::TryParse($Choice, [ref]$Parsed) -and $Parsed -ge 1 -and $Parsed -le $Printers.Count) {
    $PrinterName = $Printers[$Parsed - 1].Name
    break
  }
  Write-Host "Escolha inválida." -ForegroundColor Yellow
}

$ChromePath = First-ExistingPath @(
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
)
if (-not $ChromePath) {
  $ChromePath = Read-Required "Caminho completo do Chrome ou Edge"
}

$SumatraPath = First-ExistingPath @(
  (Join-Path $Root "tools\SumatraPDF.exe"),
  (Join-Path $env:LOCALAPPDATA "SumatraPDF\SumatraPDF.exe"),
  (Join-Path $env:ProgramFiles "SumatraPDF\SumatraPDF.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "SumatraPDF\SumatraPDF.exe")
)
if (-not $SumatraPath) {
  Write-Host ""
  Write-Host "SumatraPDF não foi encontrado." -ForegroundColor Yellow
  Write-Host "Instale o SumatraPDF ou coloque a versão portátil em:"
  Write-Host (Join-Path $Root "tools\SumatraPDF.exe") -ForegroundColor Cyan
  $SumatraPath = Read-Required "Caminho completo do SumatraPDF.exe"
}

$Lines = @(
  "YAMADA_BASE_URL=$BaseUrl",
  "YAMADA_SELLER_ID=$SellerId",
  "YAMADA_PRINT_TOKEN=$Token",
  "YAMADA_STATION_NAME=$StationName",
  "PRINT_MODE=windows",
  "PRINTER_NAME=$PrinterName",
  "CHROME_PATH=$ChromePath",
  "SUMATRA_PATH=$SumatraPath",
  "WINDOWS_PRINT_SETTINGS=fit,portrait,monochrome",
  "COPY_DELAY_MS=1000",
  "POLL_INTERVAL_MS=3000",
  "HEARTBEAT_INTERVAL_MS=30000"
)

[IO.File]::WriteAllLines($EnvPath, $Lines, [Text.UTF8Encoding]::new($false))
Write-Host ""
Write-Host "Configuração salva em $EnvPath" -ForegroundColor Green
Write-Host "Executando diagnóstico..." -ForegroundColor Cyan
Push-Location $Root
try {
  & node "src\doctor.mjs"
  if ($LASTEXITCODE -ne 0) { throw "O diagnóstico encontrou um erro." }
} finally {
  Pop-Location
}
Write-Host ""
Write-Host "Configuração concluída. Agora execute install-windows.cmd." -ForegroundColor Green
