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
# 1. If Book Engine is already open, start its program again and stop there. The app lets only one copy run, so
#    the open window comes to the front, and the dev server of the open app keeps running (DS-13).
# 2. Otherwise free port 5173, through scripts/free-dev-port.mjs. This step used to be
#    `Get-NetTCPConnection -LocalPort 5173 | Stop-Process -Force`, which stopped WHATEVER held that port. 5173 is
#    Vite's default, so another project's dev server was stopped without a word (TL-08). The script stops only this
#    project's own leftover, and names anything else instead of killing it.
# 3. If the port is held by something else, the script exits non-zero. Wait for a key, so the shortcut window does
#    not close before the message can be read, and do not start.
# 4. Set working directory to apps/desktop and execute npm run tauri dev.
$launchCommand = "`$open = Get-Process -Name 'book-engine-desktop' -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1; if (`$open) { Start-Process -FilePath `$open.Path } else { Set-Location '$repoRoot'; node scripts/free-dev-port.mjs; if (`$LASTEXITCODE -ne 0) { Write-Host ''; Read-Host 'Press Enter to close'; exit 1 }; Set-Location '$appsDesktop'; npm run tauri dev }"

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
