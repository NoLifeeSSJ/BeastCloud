#requires -Version 5.1
<# Creates a current-user desktop link to the installed BeastCloud web interface.
   No administrator access, application reinstall, or configuration access is needed. #>
[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port=5443,[string]$DesktopDirectory='')
$ErrorActionPreference='Stop'
if(!$DesktopDirectory){$DesktopDirectory=[Environment]::GetFolderPath('DesktopDirectory')}
if(!$DesktopDirectory -or !(Test-Path -LiteralPath $DesktopDirectory -PathType Container)){
 throw 'Desktop folder was not found. Use -DesktopDirectory with your existing desktop folder.'
}
$shortcut=Join-Path $DesktopDirectory 'BeastCloud.url'
if(Test-Path -LiteralPath $shortcut){
 $item=Get-Item -LiteralPath $shortcut -Force
 if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'The shortcut path is a directory or link; it was preserved.'}
}
$url="https://localhost:$Port"
[IO.File]::WriteAllText($shortcut,"[InternetShortcut]`r`nURL=$url`r`n",[Text.Encoding]::ASCII)
Write-Host "Desktop shortcut created: $shortcut"
Write-Host "Double-click BeastCloud to open $url in your default browser."
