# Run only in a disposable Windows 10/11 x64 test account.
param([string]$Installer = "$PSScriptRoot\..\downloads\Hamshift-Setup-2.1.0-x64.exe")
$ErrorActionPreference = 'Stop'
$Registry = 'HKCU:\Software\Hamshift'
$DataDir = Join-Path $env:APPDATA 'Hamshift'
if ((Test-Path $Registry) -or (Test-Path $DataDir)) { throw 'Use a clean test account without an existing Hamshift installation or data.' }
$InstallDir = Join-Path $env:LOCALAPPDATA ('HamshiftSmoke-' + [guid]::NewGuid().ToString('N'))
$AppProcess = $null
try {
    $Install = Start-Process -FilePath (Resolve-Path $Installer) -ArgumentList @('/S', "/D=$InstallDir") -PassThru -Wait
    if ($Install.ExitCode -ne 0) { throw "Installer failed: $($Install.ExitCode)" }
    $Exe = Join-Path $InstallDir 'Hamshift.exe'
    if (!(Test-Path $Exe) -or !(Test-Path (Join-Path $InstallDir 'Uninstall.exe'))) { throw 'Missing application or uninstaller.' }
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = Get-ChildItem ([Environment]::GetFolderPath('Desktop')) -Filter '*.lnk' | Where-Object { $Shell.CreateShortcut($_.FullName).TargetPath -eq $Exe } | Select-Object -First 1
    if (!$Shortcut) { throw 'Desktop shortcut was not created.' }
    $Link = $Shell.CreateShortcut($Shortcut.FullName)
    if (!$Link.IconLocation.StartsWith($Exe)) { throw 'Desktop shortcut does not use the branded executable icon.' }
    $AppProcess = Start-Process $Exe -PassThru
    $Deadline = (Get-Date).AddSeconds(30)
    do { Start-Sleep -Milliseconds 300; $AppProcess.Refresh() } while (!$AppProcess.HasExited -and $AppProcess.MainWindowHandle -eq 0 -and (Get-Date) -lt $Deadline)
    if ($AppProcess.HasExited -or $AppProcess.MainWindowHandle -eq 0) { throw 'Application did not open its own native window.' }
    $null = $AppProcess.CloseMainWindow()
    if (!$AppProcess.WaitForExit(10000)) { Stop-Process -Id $AppProcess.Id -Force }
    $AppProcess = $null
    Set-Content (Join-Path $InstallDir 'keep-me.txt') 'Personal file must survive uninstall.'
    Start-Process (Join-Path $InstallDir 'Uninstall.exe') -ArgumentList '/S' -Wait
    $Deadline = (Get-Date).AddSeconds(30)
    while ((Test-Path $Exe) -and (Get-Date) -lt $Deadline) { Start-Sleep -Milliseconds 300 }
    if (Test-Path $Exe) { throw 'Uninstaller did not remove the executable.' }
    if (!(Test-Path (Join-Path $InstallDir 'keep-me.txt'))) { throw 'Uninstaller removed an unrelated personal file.' }
    if (Test-Path $Shortcut.FullName) { throw 'Uninstaller left the desktop shortcut behind.' }
    if (Test-Path $Registry) { throw 'Uninstaller left the install registry entry behind.' }
    Write-Output 'PASS: install, branded desktop shortcut, native launch, uninstall and personal-file preservation.'
} finally {
    if ($AppProcess -and !$AppProcess.HasExited) { Stop-Process -Id $AppProcess.Id -Force }
    # Delete only the unique smoke-test folder, never an existing installation.
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
}
