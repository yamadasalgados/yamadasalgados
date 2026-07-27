$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$NodePathFile = Join-Path $PSScriptRoot "node-path.txt"
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

if (Test-Path $NodePathFile) {
  $NodePath = (Get-Content $NodePathFile -Raw).Trim()
} else {
  $NodePath = (Get-Command node -ErrorAction Stop).Source
}

Push-Location $Root
try {
  & $NodePath "src\index.mjs" 1>> (Join-Path $LogDir "output.log") 2>> (Join-Path $LogDir "error.log")
} finally {
  Pop-Location
}
