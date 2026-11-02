# installer.ps1 - Jurgen Jacobsen's Web Dev Blueprint Scaffolder & Synchronizer
# Usage:
#   Direct web run:  irm https://jurgen.fyi/blueprint/installer.ps1 | iex
#   Local run:       .\installer.ps1 [-Update] [-Uninstall] [-Reset] [-Force] [-BaseUrl <url>]

[CmdletBinding()]
param (
    [switch]$Update,
    [switch]$Uninstall,
    [switch]$Reset,
    [switch]$Force,
    [switch]$Yes,
    [switch]$Help,
    [string]$BaseUrl = "https://jurgen.fyi/blueprint"
)

$ErrorActionPreference = "Stop"
$TargetDir = $PWD.Path
$LockFileName = ".blueprint.json"
$LegacyLockFileName = ".boilerplate.json"
$LockFilePath = Join-Path -Path $TargetDir -ChildPath $LockFileName
$LegacyLockFilePath = Join-Path -Path $TargetDir -ChildPath $LegacyLockFileName
$ManifestUrl = "$BaseUrl/manifest.json"

if ($env:BLUEPRINT_FORCE -eq "1" -or $env:BLUEPRINT_YES -eq "1") {
    $Force = [switch]::Present
    $Yes = [switch]::Present
}

function Write-Header {
    param ([string]$Text)
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "   $Text" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param ([string]$Text)
    Write-Host "> $Text" -ForegroundColor White
}

function Write-Success {
    param ([string]$Text)
    Write-Host "[+] $Text" -ForegroundColor Green
}

function Write-Warn {
    param ([string]$Text)
    Write-Host "[!] $Text" -ForegroundColor Yellow
}

function Write-Err {
    param ([string]$Text)
    Write-Host "[x] $Text" -ForegroundColor Red
}

if ($Help) {
    Write-Header "Jurgen.fyi | Blueprint CLI"
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  irm $BaseUrl/installer.ps1 | iex                 # Interactive web install" -ForegroundColor White
    Write-Host "  .\installer.ps1                                  # Interactive local install" -ForegroundColor White
    Write-Host "  .\installer.ps1 -Yes                             # Non-interactive default install" -ForegroundColor White
    Write-Host "  .\installer.ps1 -Update                          # Check and apply updates" -ForegroundColor White
    Write-Host "  .\installer.ps1 -Reset                           # Reset files to upstream defaults" -ForegroundColor White
    Write-Host "  .\installer.ps1 -Uninstall                       # Remove all tracked blueprint files" -ForegroundColor White
    Write-Host "  .\installer.ps1 -Help                            # Show this help message" -ForegroundColor White
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "  -Force                                           # Force overwrite without prompting" -ForegroundColor White
    Write-Host "  -Yes                                             # Automatically accept defaults" -ForegroundColor White
    Write-Host "  -BaseUrl <url>                                   # Custom template source URL" -ForegroundColor White
    Write-Host ""
    exit 0
}

function Get-RemoteManifest {
    $localManifest = if ($PSScriptRoot -and ($PSScriptRoot -match 'public[\\/]blueprint$')) {
        Join-Path -Path $PSScriptRoot -ChildPath "manifest.json"
    } else {
        $null
    }
    $publicManifest = Join-Path -Path $TargetDir -ChildPath "public\blueprint\manifest.json"

    try {
        Write-Step "Fetching manifest from $ManifestUrl..."
        $response = Invoke-WebRequest -Uri $ManifestUrl -UseBasicParsing -TimeoutSec 5
        $contentText = if ($response.Content -is [string]) {
            $response.Content
        } elseif ($response.Content -is [byte[]]) {
            [System.Text.Encoding]::UTF8.GetString($response.Content)
        } else { "" }

        $isHtml = $contentText -and ($contentText.TrimStart().ToLower().StartsWith("<!doctype html") -or $contentText.TrimStart().ToLower().StartsWith("<html"))
        if ($contentText -and -not $isHtml) {
            return ($contentText | ConvertFrom-Json)
        }
        throw "Remote endpoint returned non-JSON content (site not yet deployed or route redirected)."
    } catch {
        if ($localManifest -and (Test-Path -Path $localManifest)) {
            Write-Warn "Remote manifest unavailable. Using local fallback: $localManifest"
            return (Get-Content -Path $localManifest -Raw -Encoding UTF8 | ConvertFrom-Json)
        }
        if (Test-Path -Path $publicManifest) {
            Write-Warn "Remote manifest unavailable. Using local fallback: $publicManifest"
            return (Get-Content -Path $publicManifest -Raw -Encoding UTF8 | ConvertFrom-Json)
        }
        Write-Err "Failed to fetch manifest from $ManifestUrl"
        Write-Err $_.Exception.Message
        exit 1
    }
}

function Get-LocalLockfile {
    $path = $null
    if (Test-Path -Path $LockFilePath) {
        $path = $LockFilePath
    } elseif (Test-Path -Path $LegacyLockFilePath) {
        $path = $LegacyLockFilePath
    }

    if ($path) {
        try {
            $content = Get-Content -Path $path -Raw -Encoding UTF8
            return ($content | ConvertFrom-Json)
        } catch {
            Write-Warn "Could not parse existing lockfile ($path). It may be corrupt."
            return $null
        }
    }
    return $null
}

function Save-LocalLockfile {
    param (
        [string]$Version,
        [string[]]$InstalledFiles
    )
    $lockData = [ordered]@{
        version        = $Version
        installedAt    = (Get-Date).ToString("o")
        source         = $BaseUrl
        installedFiles = @($InstalledFiles)
    }
    $json = $lockData | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($LockFilePath, $json, [System.Text.Encoding]::UTF8)
    if (Test-Path -Path $LegacyLockFilePath) {
        Remove-Item -Path $LegacyLockFilePath -Force -ErrorAction SilentlyContinue
    }
    Write-Success "Updated lockfile: $LockFileName"
}

function Download-BlueprintFile {
    param (
        [string]$FileName,
        [switch]$SkipConfirmation
    )
    $dest = Join-Path -Path $TargetDir -ChildPath $FileName
    $fileUrl = "$BaseUrl/$FileName"
    $templateSource = if ($PSScriptRoot -and ($PSScriptRoot -match 'public[\\/]blueprint$')) {
        Join-Path -Path $PSScriptRoot -ChildPath $FileName
    } else {
        $null
    }
    $publicSource = Join-Path -Path $TargetDir -ChildPath "public\blueprint\$FileName"

    # Avoid self-overwrite if running installer directly inside public/blueprint repository directory
    if ($PSScriptRoot -and ($PSScriptRoot -match 'public[\\/]blueprint$') -and ($PSScriptRoot -eq $TargetDir)) {
        Write-Warn "Running directly inside the template directory. Skipping download to prevent overwrite."
        return $true
    }

    if (Test-Path -Path $dest) {
        if (-not $SkipConfirmation -and -not $Force -and -not $Yes) {
            Write-Host "  File '$FileName' already exists. " -ForegroundColor Yellow -NoNewline
            Write-Host "Overwrite [Y], Skip [N], Backup [B]? (default: N): " -ForegroundColor White -NoNewline
            $ans = Read-Host
            if ($ans -match "^[Bb]$") {
                $bak = "$dest.bak"
                Copy-Item -Path $dest -Destination $bak -Force
                Write-Warn "Backed up existing '$FileName' to '$FileName.bak'"
            } elseif ($ans -notmatch "^[Yy]$") {
                Write-Host "  Skipping '$FileName'..." -ForegroundColor Gray
                return $false
            }
        }
    }

    # Try downloading from remote URL first
    try {
        $response = Invoke-WebRequest -Uri $fileUrl -UseBasicParsing -TimeoutSec 5
        $contentText = if ($response.Content -is [string]) {
            $response.Content
        } elseif ($response.Content -is [byte[]]) {
            [System.Text.Encoding]::UTF8.GetString($response.Content)
        } else { "" }

        $isHtml = $contentText -and ($contentText.TrimStart().ToLower().StartsWith("<!doctype html") -or $contentText.TrimStart().ToLower().StartsWith("<html"))
        if (-not $isHtml) {
            if ($response.Content -is [byte[]]) {
                [System.IO.File]::WriteAllBytes($dest, $response.Content)
            } elseif ($response.RawContentStream -and $response.RawContentStream.Length -gt 0) {
                [System.IO.File]::WriteAllBytes($dest, $response.RawContentStream.ToArray())
            } else {
                [System.IO.File]::WriteAllText($dest, $contentText, [System.Text.Encoding]::UTF8)
            }
            Write-Success "Installed $FileName"
            return $true
        }
        throw "Remote URL returned HTML instead of file content."
    } catch {
        # Fall back to local source file if present
        if ($templateSource -and (Test-Path -Path $templateSource)) {
            Copy-Item -Path $templateSource -Destination $dest -Force
            Write-Success "Installed $FileName (from local source)"
            return $true
        }
        if (Test-Path -Path $publicSource) {
            Copy-Item -Path $publicSource -Destination $dest -Force
            Write-Success "Installed $FileName (from local source)"
            return $true
        }
        Write-Err "Failed to acquire $FileName"
        Write-Err $_.Exception.Message
        return $false
    }
}

# ----------------------------------------------------
# ACTION: UNINSTALL
# ----------------------------------------------------
if ($Uninstall) {
    Write-Header "Blueprint - Clean Uninstall"
    $lock = Get-LocalLockfile

    if (-not $lock) {
        Write-Err "No lockfile ($LockFileName) found in current directory ($TargetDir)."
        Write-Err "Nothing to uninstall."
        exit 0
    }

    Write-Host "Files to be removed (tracked in lockfile):" -ForegroundColor Yellow
    foreach ($file in $lock.installedFiles) {
        Write-Host "  - $file" -ForegroundColor Gray
    }
    Write-Host "  - $LockFileName" -ForegroundColor Gray

    if (-not $Force -and -not $Yes) {
        Write-Host ""
        Write-Host "Proceed with removing tracked blueprint files? [y/N]: " -ForegroundColor White -NoNewline
        $ans = Read-Host
        if ($ans -notmatch "^[Yy]$") {
            Write-Host "Uninstall canceled." -ForegroundColor Gray
            exit 0
        }
    }

    foreach ($file in $lock.installedFiles) {
        $filePath = Join-Path -Path $TargetDir -ChildPath $file
        if (Test-Path -Path $filePath) {
            Remove-Item -Path $filePath -Force
            Write-Success "Removed $file"
        }
    }

    if (Test-Path -Path $LockFilePath) { Remove-Item -Path $LockFilePath -Force }
    if (Test-Path -Path $LegacyLockFilePath) { Remove-Item -Path $LegacyLockFilePath -Force }
    Write-Success "Removed lockfile"
    Write-Host ""
    Write-Host "Blueprint successfully uninstalled. User project files were left untouched." -ForegroundColor Green
    exit 0
}

# ----------------------------------------------------
# ACTION: RESET
# ----------------------------------------------------
if ($Reset) {
    Write-Header "Blueprint - Reset to Upstream Defaults"
    $lock = Get-LocalLockfile

    if (-not $lock) {
        Write-Warn "No lockfile found. Cannot reset a project that has not installed the blueprint."
        Write-Host "Run without flags to perform an initial install." -ForegroundColor Cyan
        exit 0
    }

    $manifest = Get-RemoteManifest

    if (-not $Force -and -not $Yes) {
        Write-Warn "Reset will overwrite all tracked blueprint files with fresh upstream templates."
        Write-Host "Local changes to tracked files will be overwritten." -ForegroundColor Yellow
        Write-Host "Proceed with reset? [y/N]: " -ForegroundColor White -NoNewline
        $ans = Read-Host
        if ($ans -notmatch "^[Yy]$") {
            Write-Host "Reset canceled." -ForegroundColor Gray
            exit 0
        }
    }

    $installedNow = @()
    foreach ($file in $lock.installedFiles) {
        $ok = Download-BlueprintFile -FileName $file -SkipConfirmation
        if ($ok) { $installedNow += $file }
    }

    Save-LocalLockfile -Version $manifest.version -InstalledFiles $installedNow
    Write-Host ""
    Write-Host "Blueprint files successfully reset to upstream version $($manifest.version)." -ForegroundColor Green
    exit 0
}

# ----------------------------------------------------
# ACTION: UPDATE
# ----------------------------------------------------
if ($Update) {
    Write-Header "Blueprint - Check & Synchronize Updates"
    $lock = Get-LocalLockfile

    if (-not $lock) {
        Write-Warn "No lockfile found in the current directory."
        Write-Host "Running full interactive install instead..." -ForegroundColor Cyan
    } else {
        $manifest = Get-RemoteManifest
        Write-Host "Installed version: $($lock.version)" -ForegroundColor Gray
        Write-Host "Remote version:    $($manifest.version)" -ForegroundColor Gray

        if ($lock.version -eq $manifest.version -and -not $Force) {
            Write-Success "Blueprint is already up-to-date (v$($manifest.version))."
            Write-Host "Tip: Use -Reset to restore default files or -Force to force re-download." -ForegroundColor Cyan
            exit 0
        }

        Write-Step "Updating tracked files to version $($manifest.version)..."
        $updatedFiles = @()
        foreach ($file in $lock.installedFiles) {
            $ok = Download-BlueprintFile -FileName $file
            $updatedFiles += $file
        }

        Save-LocalLockfile -Version $manifest.version -InstalledFiles $updatedFiles
        Write-Host ""
        Write-Host "Blueprint update complete (v$($manifest.version))!" -ForegroundColor Green
        exit 0
    }
}

function Show-CheckboxMenu {
    param (
        [array]$Files
    )

    $fileCount = $Files.Count
    $selections = [bool[]]::new($fileCount)
    for ($i = 0; $i -lt $fileCount; $i++) {
        $selections[$i] = [bool]$Files[$i].default
    }

    $totalItems = $fileCount + 3
    $currentIndex = 0

    # In automated/non-interactive mode, use defaults without interactive prompts
    if ($Force -or $Yes) {
        $selected = @()
        for ($i = 0; $i -lt $fileCount; $i++) {
            if ($selections[$i]) {
                $selected += $Files[$i].name
                Write-Host "* $($Files[$i].name.PadRight(20)) ($($Files[$i].category.PadRight(15))) [Y (default)]" -ForegroundColor Green
            } else {
                Write-Host "* $($Files[$i].name.PadRight(20)) ($($Files[$i].category.PadRight(15))) [N (skipped)]" -ForegroundColor DarkGray
            }
        }
        return $selected
    }

    # Verify console RawUI supports cursor positioning and key reading
    $isInteractive = $false
    try {
        if (-not [Console]::IsInputRedirected -and $Host.UI.RawUI -ne $null) {
            $isInteractive = $true
        }
    } catch {
        $isInteractive = $false
    }

    if (-not $isInteractive) {
        $selected = @()
        for ($i = 0; $i -lt $fileCount; $i++) {
            if ($selections[$i]) {
                $selected += $Files[$i].name
                Write-Host "* $($Files[$i].name.PadRight(20)) ($($Files[$i].category.PadRight(15))) [Y (default)]" -ForegroundColor Green
            } else {
                Write-Host "* $($Files[$i].name.PadRight(20)) ($($Files[$i].category.PadRight(15))) [N (skipped)]" -ForegroundColor DarkGray
            }
        }
        return $selected
    }

    # Pre-reserve console lines to prevent scrolling distortion
    $linesNeeded = $totalItems + 6
    try {
        for ($i = 0; $i -lt $linesNeeded; $i++) { Write-Host "" }
        $newY = [Math]::Max(0, $Host.UI.RawUI.CursorPosition.Y - $linesNeeded)
        $startPos = [System.Management.Automation.Host.Coordinates]::new(0, $newY)
        $Host.UI.RawUI.CursorPosition = $startPos
    } catch {
        # Fallback to default selections if cursor placement fails
        $selected = @()
        for ($i = 0; $i -lt $fileCount; $i++) {
            if ($selections[$i]) { $selected += $Files[$i].name }
        }
        return $selected
    }

    try { [Console]::CursorVisible = $false } catch {}

    try {
        while ($true) {
            try { $Host.UI.RawUI.CursorPosition = $startPos } catch {}

            $selectedCount = ($selections | Where-Object { $_ }).Count

            Write-Host ("Select configurations to install:".PadRight(75)) -ForegroundColor Cyan
            Write-Host ("  [Up/Down] Navigate   [Enter/Space] Toggle   [Tab/I] Install   [Esc/Q] Cancel".PadRight(75)) -ForegroundColor DarkGray
            Write-Host ("".PadRight(75))

            for ($i = 0; $i -lt $fileCount; $i++) {
                $isCurrent = ($i -eq $currentIndex)
                $checked = $selections[$i]
                $item = $Files[$i]

                $prefix = if ($isCurrent) { " > " } else { "   " }
                $checkMark = if ($checked) { "[X]" } else { "[ ]" }

                $fg = if ($isCurrent) { "Yellow" } else { "White" }
                $checkFg = if ($checked) { "Green" } else { "DarkGray" }

                Write-Host $prefix -NoNewline -ForegroundColor Cyan
                Write-Host $checkMark -NoNewline -ForegroundColor $checkFg
                Write-Host " $($item.name.PadRight(20))" -NoNewline -ForegroundColor $fg
                Write-Host " $($item.category.PadRight(16))" -NoNewline -ForegroundColor Cyan
                $desc = if ($item.description.Length -gt 32) { $item.description.Substring(0, 29) + "..." } else { $item.description }
                Write-Host " $desc".PadRight(35) -ForegroundColor Gray
            }

            Write-Host ("   " + ("-" * 68)).PadRight(75) -ForegroundColor DarkGray

            # Action 1: Confirm & Install
            $isActionInstall = ($currentIndex -eq $fileCount)
            $p1 = if ($isActionInstall) { " > " } else { "   " }
            $fg1 = if ($isActionInstall) { "Green" } else { "White" }
            Write-Host ("$p1[ Install Selected ($selectedCount files) ]").PadRight(75) -ForegroundColor $fg1

            # Action 2: Select All / None
            $isActionAll = ($currentIndex -eq ($fileCount + 1))
            $allSelected = ($selectedCount -eq $fileCount)
            $p2 = if ($isActionAll) { " > " } else { "   " }
            $fg2 = if ($isActionAll) { "Yellow" } else { "Gray" }
            $allLabel = if ($allSelected) { "[ Deselect All ]" } else { "[ Select All ]" }
            Write-Host ("$p2$allLabel").PadRight(75) -ForegroundColor $fg2

            # Action 3: Cancel
            $isActionCancel = ($currentIndex -eq ($fileCount + 2))
            $p3 = if ($isActionCancel) { " > " } else { "   " }
            $fg3 = if ($isActionCancel) { "Red" } else { "Gray" }
            Write-Host ("$p3[ Cancel / Exit ]").PadRight(75) -ForegroundColor $fg3

            # Read key press
            $keyInfo = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            $vk = $keyInfo.VirtualKeyCode
            $ch = $keyInfo.Character

            # Up Arrow (38) or 'k'/'K'
            if ($vk -eq 38 -or $ch -eq 'k' -or $ch -eq 'K') {
                $currentIndex = ($currentIndex - 1 + $totalItems) % $totalItems
            }
            # Down Arrow (40) or 'j'/'J'
            elseif ($vk -eq 40 -or $ch -eq 'j' -or $ch -eq 'J') {
                $currentIndex = ($currentIndex + 1) % $totalItems
            }
            # Enter (13) or Space (32)
            elseif ($vk -eq 13 -or $vk -eq 32) {
                if ($currentIndex -lt $fileCount) {
                    # Toggle checked / unchecked on the highlighted file
                    $selections[$currentIndex] = -not $selections[$currentIndex]
                }
                elseif ($currentIndex -eq $fileCount) {
                    # Confirm & Install
                    break
                }
                elseif ($currentIndex -eq ($fileCount + 1)) {
                    # Toggle All / None
                    $newVal = -not $allSelected
                    for ($j = 0; $j -lt $fileCount; $j++) {
                        $selections[$j] = $newVal
                    }
                }
                elseif ($currentIndex -eq ($fileCount + 2)) {
                    # Cancel
                    return $null
                }
            }
            # Tab (9) or 'i'/'I' or 'c'/'C': Quick Confirm & Install
            elseif ($vk -eq 9 -or $ch -eq 'i' -or $ch -eq 'I' -or $ch -eq 'c' -or $ch -eq 'C') {
                break
            }
            # 'a'/'A': Quick Toggle All
            elseif ($ch -eq 'a' -or $ch -eq 'A') {
                $newVal = -not ($selectedCount -eq $fileCount)
                for ($j = 0; $j -lt $fileCount; $j++) {
                    $selections[$j] = $newVal
                }
            }
            # Escape (27) or 'q'/'Q': Quick Cancel
            elseif ($vk -eq 27 -or $ch -eq 'q' -or $ch -eq 'Q') {
                return $null
            }
        }
    } finally {
        try { [Console]::CursorVisible = $true } catch {}
    }

    Write-Host ""
    $selected = @()
    for ($i = 0; $i -lt $fileCount; $i++) {
        if ($selections[$i]) {
            $selected += $Files[$i].name
        }
    }
    return $selected
}

# ----------------------------------------------------
# ACTION: DEFAULT (INTERACTIVE INSTALL / SCAFFOLD)
# ----------------------------------------------------
Write-Header "Jurgen.fyi | Blueprint"
Write-Host "Target Directory: $TargetDir" -ForegroundColor Gray
Write-Host ""

$manifest = Get-RemoteManifest
Write-Host "Found release v$($manifest.version) (Updated: $($manifest.updatedAt))" -ForegroundColor Green
Write-Host ""

$selectedFiles = Show-CheckboxMenu -Files $manifest.files

if ($null -eq $selectedFiles) {
    Write-Warn "Installation canceled."
    exit 0
}

if ($selectedFiles.Count -eq 0) {
    Write-Warn "No files selected. Exiting without changes."
    exit 0
}

Write-Header "Installing Selected Files"
$successfullyInstalled = @()

foreach ($file in $selectedFiles) {
    $ok = Download-BlueprintFile -FileName $file
    if ($ok) {
        $successfullyInstalled += $file
    }
}

if ($successfullyInstalled.Count -gt 0) {
    # Ensure installer.ps1 is available locally in TargetDir for subsequent -Update, -Reset, -Uninstall commands
    $installerName = "installer.ps1"
    $installerDest = Join-Path -Path $TargetDir -ChildPath $installerName
    if (-not (Test-Path -Path $installerDest)) {
        $dlOk = Download-BlueprintFile -FileName $installerName -SkipConfirmation
        if ($dlOk) {
            $successfullyInstalled += $installerName
        }
    } elseif ($successfullyInstalled -notcontains $installerName) {
        $successfullyInstalled += $installerName
    }

    Save-LocalLockfile -Version $manifest.version -InstalledFiles $successfullyInstalled
    Write-Header "Setup Complete!"
    Write-Host "Installed $($successfullyInstalled.Count) blueprint file(s) into $TargetDir" -ForegroundColor Green
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor Cyan
    Write-Host "  irm $BaseUrl/installer.ps1 | iex              # Re-run installer" -ForegroundColor Gray
    Write-Host "  .\installer.ps1 -Update                       # Check & apply updates" -ForegroundColor Gray
    Write-Host "  .\installer.ps1 -Reset                        # Restore upstream defaults" -ForegroundColor Gray
    Write-Host "  .\installer.ps1 -Uninstall                    # Remove all blueprint files" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Warn "No files were modified."
}
