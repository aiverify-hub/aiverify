# Check Video (Phase 1) local test server.
# Asks for three keys at HIDDEN prompts, keeps them only in this window's process, never writes or prints them.
# Starts the backend on http://localhost:3077 with AIV_CHECK_VIDEO=local (page served to this computer only).
# Stop with Ctrl+C or by closing the window; the keys are removed when it stops.
$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot '..\..\index.js' | Resolve-Path
function Plain([Security.SecureString]$s) { $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) } }
$runs = Join-Path $env:LOCALAPPDATA 'AIVerify\check-video-runs'
New-Item -ItemType Directory -Force $runs | Out-Null
$data = Join-Path $env:LOCALAPPDATA 'AIVerify\check-video-analytics'
New-Item -ItemType Directory -Force $data | Out-Null

Write-Host ''
Write-Host 'Check Video test server. Paste each key and press Enter. Nothing shows while you paste; that is normal.' -ForegroundColor Cyan
$ant = Read-Host -AsSecureString '1 of 3: Paste the ANTHROPIC API key'
$exa = Read-Host -AsSecureString '2 of 3: Paste the EXA API key'
$sup = Read-Host -AsSecureString '3 of 3: Paste the SUPADATA API key (or just press Enter to skip)'
try {
  $env:ANTHROPIC_API_KEY = Plain $ant
  $env:EXA_API_KEY = Plain $exa
  $s = Plain $sup; if ($s) { $env:SUPADATA_API_KEY = $s }; $s = $null
  $env:AIV_CHECK_VIDEO = 'local'
  $env:AIV_CHECK_VIDEO_RUNS_DIR = $runs
  $env:AIV_ANALYTICS_STORAGE_DIR = $data
  $env:PORT = '3077'
  Write-Host ''
  Write-Host 'Keys received. Starting... When you see "BE_AIV_v5066C running", the server is ready.' -ForegroundColor Green
  Write-Host 'Leave this window open. To stop later: click here and press Ctrl+C.' -ForegroundColor Green
  node $backend
} finally {
  foreach ($n in 'ANTHROPIC_API_KEY', 'EXA_API_KEY', 'SUPADATA_API_KEY') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
  $ant.Dispose(); $exa.Dispose(); $sup.Dispose()
  Write-Host 'Server stopped; keys removed from this window.'
}
