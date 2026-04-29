$ErrorActionPreference = "Stop"

$Repo = if ($env:REASONYOU_REPO) { $env:REASONYOU_REPO } else { "mob999/reason-you" }
$Version = if ($env:REASONYOU_VERSION) { $env:REASONYOU_VERSION } else { "latest" }
$InstallDir = if ($env:REASONYOU_INSTALL_DIR) {
    $env:REASONYOU_INSTALL_DIR
} else {
    Join-Path $env:LOCALAPPDATA "Programs\reasonyou\bin"
}

function Get-ReasonYouTarget {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture

    switch ($arch) {
        "X64" { return "bun-windows-x64" }
        "Arm64" { return "bun-windows-arm64" }
        default {
            throw "reasonyou installer: unsupported architecture: $arch"
        }
    }
}

$Target = Get-ReasonYouTarget
$Asset = "reasonyou-$Target.exe"

if ($Version -eq "latest") {
    $Url = "https://github.com/$Repo/releases/latest/download/$Asset"
} else {
    $Url = "https://github.com/$Repo/releases/download/$Version/$Asset"
}

$Temp = Join-Path ([System.IO.Path]::GetTempPath()) "reasonyou-install-$PID.exe"
$InstallPath = Join-Path $InstallDir "reasonyou.exe"

try {
    Write-Host "Downloading $Asset from $Repo..."
    Invoke-WebRequest -Uri $Url -OutFile $Temp

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Move-Item -Force -Path $Temp -Destination $InstallPath

    Write-Host "Installed reasonyou to $InstallPath"

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathParts = $userPath -split ";" | Where-Object { $_ }
    if ($pathParts -notcontains $InstallDir) {
        [Environment]::SetEnvironmentVariable("Path", ($pathParts + $InstallDir -join ";"), "User")
        Write-Host "Added $InstallDir to your user PATH. Restart the terminal before running reasonyou."
    }
} finally {
    if (Test-Path $Temp) {
        Remove-Item -Force $Temp
    }
}
