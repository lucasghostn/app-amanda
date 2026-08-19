# Setup and Run helper for OrganizaFinanças API
# Usage: Open PowerShell, cd to this folder and run: .\setup-and-run.ps1
# This script will prefer Docker Compose (recommended). If Docker is not available,
# it will fall back to installing npm deps and running the server directly.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = (Resolve-Path "$scriptDir\..").Path
Write-Host "Script dir: $scriptDir"
Write-Host "Repository root: $repoRoot"

function Run-DockerCompose {
    Write-Host "Docker detected. Starting services with docker compose..."
    # prefer `docker compose` (new CLI) but fall back to `docker-compose`
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        & docker compose -f "$repoRoot\docker-compose.yml" up --build -d
        return $?
    }
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        & docker-compose -f "$repoRoot\docker-compose.yml" up --build -d
        return $?
    }
    return $false
}

function Run-LocalNode {
    Write-Host "Docker not found. Falling back to local Node.js.
If you want Docker, install Docker Desktop and re-run this script."
    # ensure .env exists
    if (-not (Test-Path "$scriptDir\.env")) {
        if (Test-Path "$scriptDir\.env.example") {
            Copy-Item "$scriptDir\.env.example" "$scriptDir\.env"
            Write-Host "Copied .env.example -> .env. Edit .env to set DATABASE_URL, JWT_SECRET and SMTP settings as needed."
        } else {
            Write-Host "No .env.example found. Create .env with DATABASE_URL and JWT_SECRET."
        }
    } else { Write-Host ".env found. Using existing .env." }

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "npm is not installed or not on PATH. Install Node.js (which includes npm) and re-run this script."; return $false
    }

    Push-Location $scriptDir
    try {
        Write-Host "Installing npm dependencies..."
        npm install
        Write-Host "Starting server (npm start). Use Ctrl+C to stop when running in foreground."
        npm start
    } finally {
        Pop-Location
    }
}

# Main
try {
    if (Run-DockerCompose) {
        Write-Host "Docker Compose started. Running containers should be up shortly."
        Write-Host "Check logs with: docker compose logs -f api"
        Write-Host "If you prefer to run the server locally without Docker, re-run this script after removing Docker."
        exit 0
    } else {
        Write-Host "Docker Compose not available or failed. Trying local Node execution..."
        $ok = Run-LocalNode
        if (-not $ok) { Write-Error "Local run failed or aborted."; exit 2 }
        exit 0
    }
} catch {
    Write-Error "Script failed: $_"
    exit 1
}
