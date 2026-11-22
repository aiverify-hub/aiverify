# Check Video (Phase 1) local test server.
# Keys: read from a saved file locked to this Windows account (if Cary chose to save them), otherwise asked for at
# HIDDEN prompts. Keys are kept only in this window's process; this script never prints them.
# Saved-key file: %LOCALAPPDATA%\AIVerify\check-video-keys.xml (Windows DPAPI: only this Windows user on this computer
# can unlock it). Delete that file to forget the keys.
# Starts the backend on http://localhost:3077 with AIV_CHECK_VIDEO=local (page served to this computer only).
# Stop with Ctrl+C or by closing the window; the keys are removed from the window when it stops.
$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot '..\..\index.js' | Resolve-Path
function Plain([Security.SecureString]$s) { if (-not $s) { return '' }; $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) } }
$home2 = Join-Path $env:LOCALAPPDATA 'AIVerify'
$runs = Join-Path $home2 'check-video-runs'
$data = Join-Path $home2 'check-video-analytics'
$keyFile = Join-Path $home2 'check-video-keys.xml'
New-Item -ItemType Directory -Force $runs, $data | Out-Null
# This launcher's server is the only writer of the spending ledger; clear a lock left by a crashed earlier server.
# (The port is checked first so a second running server is never disturbed.)
if (-not (Get-NetTCPConnection -LocalPort 3077 -State Listen -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath (Join-Path $runs 'spend.lock') -ErrorAction SilentlyContinue }
if (Test-Path -LiteralPath (Join-Path $runs 'spend-UNRESOLVED.json')) { Write-Host 'Note: an earlier cost was not recorded (spend-UNRESOLVED.json). Paid checks stay blocked until it is reconciled.' -ForegroundColor Yellow }

$keys = $null
if (Test-Path -LiteralPath $keyFile) {
  try { $keys = Import-Clixml -LiteralPath $keyFile; Write-Host 'Using the keys saved on this computer.' -ForegroundColor Cyan }
  catch { Write-Host 'The saved keys could not be unlocked; please paste them again.' -ForegroundColor Yellow; $keys = $null }
}
if (-not $keys) {
  Write-Host ''
  Write-Host 'Check Video test server. Paste each key and press Enter. Nothing shows while you paste; that is normal.' -ForegroundColor Cyan
  $keys = @{
    Anthropic = Read-Host -AsSecureString '1 of 3: Paste the ANTHROPIC API key'
    Exa       = Read-Host -AsSecureString '2 of 3: Paste the EXA API key'
    Supadata  = Read-Host -AsSecureString '3 of 3: Paste the SUPADATA API key (or just press Enter to skip)'
  }
  Write-Host ''
  $save = Read-Host 'Save these keys on this computer, locked to your Windows account, so you need not paste them again? Type Y and press Enter for yes, or just press Enter for no'
  if ($save -match '^\s*[Yy]') {
    $keys | Export-Clixml -LiteralPath $keyFile
    Write-Host "Saved. To forget them later, delete this file: $keyFile" -ForegroundColor Green
  }
}
try {
  $env:ANTHROPIC_API_KEY = Plain $keys.Anthropic
  $env:EXA_API_KEY = Plain $keys.Exa
  # A skipped Supadata key must not fall back to one inherited from the parent shell (Fred review #3).
  foreach ($n in 'SUPADATA_API_KEY', 'EXTERNAL_YOUTUBE_TRANSCRIPT_API_KEY') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
  $s = Plain $keys.Supadata; if ($s) { $env:SUPADATA_API_KEY = $s }; $s = $null
  $env:AIV_CHECK_VIDEO = 'local'
  # Per-launch restart secret, readable only by this Windows user (Fred re-check #1).
  $bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $env:AIV_CHECK_VIDEO_RESTART_TOKEN = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  Set-Content -LiteralPath (Join-Path $home2 'check-video-restart.token') -Value $env:AIV_CHECK_VIDEO_RESTART_TOKEN -Encoding ascii -NoNewline
  $env:AIV_CHECK_VIDEO_RUNS_DIR = $runs
  $env:AIV_ANALYTICS_STORAGE_DIR = $data
  $env:PORT = '3077'
  # v2 plan: Cary set $15/day and $39 total (Nov 22, 2026; triple Bob's proposal, within his $500 monthly budget).
  $env:AIV_CHECK_VIDEO_DAILY_USD = '15'
  Write-Host ''
  Write-Host 'Keys ready. Starting... When you see "BE_AIV_v5066C running", the server is ready.' -ForegroundColor Green
  Write-Host 'Leave this window open. To stop later: click here and press Ctrl+C.' -ForegroundColor Green
  # Exit code 75 = restart requested from this computer after a code change (keys stay in this window's memory).
  do {
    node $backend
    $code = $LASTEXITCODE
    if ($code -eq 75) { Write-Host 'Restarting with updated code...' -ForegroundColor Green }
  } while ($code -eq 75)
} finally {
  foreach ($n in 'ANTHROPIC_API_KEY', 'EXA_API_KEY', 'SUPADATA_API_KEY') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
  foreach ($k in @($keys.Values)) { if ($k) { $k.Dispose() } }
  Write-Host 'Server stopped; keys removed from this window.'
}
