# scripts/create_desktop_shortcut.ps1
# Generates a one-click desktop shortcut for Book Engine

$ErrorActionPreference = "Stop"

# Determine workspace paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$appsDesktop = Join-Path $repoRoot "apps\desktop"
$iconPath = Join-Path $appsDesktop "src-tauri\icons\icon.ico"

# Resolve Desktop folder
$desktopPath = [Environment]::GetFolderPath("Desktop")
if (-not (Test-Path $desktopPath)) {
    $desktopPath = Join-Path $env:USERPROFILE "Desktop"
}

$shortcutPath = Join-Path $desktopPath "Book Engine.lnk"

# Launcher command:
# 1. Kill any lingering process occupying port 5173
# 2. Set working directory to apps/desktop
# 3. Execute npm run tauri dev
$launchCommand = "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force -ErrorAction SilentlyContinue }; Set-Location '$appsDesktop'; npm run tauri dev"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"$launchCommand`""
$shortcut.WorkingDirectory = $appsDesktop
$shortcut.Description = "Book Engine - Local-First Academic Reader"

if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath, 0"
}

# WindowStyle: 1 = Normal (prevents Windows STARTUPINFO from forcing child GUI into minimized state)
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "[+] Desktop shortcut created successfully!"
Write-Host "    Shortcut: $shortcutPath"
Write-Host "    Target: powershell.exe"
Write-Host "    Arguments: $($shortcut.Arguments)"
Write-Host "    WorkingDirectory: $appsDesktop"
Write-Host "    Icon: $iconPath"
