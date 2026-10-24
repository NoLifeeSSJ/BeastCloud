#requires -Version 5.1
param([ValidateSet('install','remove')][string]$Action='install',[string]$Executable,[string]$Profile="$env:LOCALAPPDATA\BeastCloudSync\default")
$ErrorActionPreference='Stop'
try{
 $name='BeastCloud Sync '+(Split-Path $Profile -Leaf)
 if($Action -eq 'remove'){Unregister-ScheduledTask -TaskName $name -Confirm:$false;exit 0}
 if(!(Test-Path $Executable -PathType Leaf) -or !(Test-Path (Join-Path $Profile 'config.json'))){throw 'Pair the companion before enabling startup.'}
 foreach($p in @($Executable,$Profile)){if($p.Contains('"')){throw 'Invalid argument'}}
 $action=New-ScheduledTaskAction -Execute ([IO.Path]::GetFullPath($Executable)) -Argument ('run --profile "'+$Profile+'"')
 $trigger=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Selected-folder sync with a locally owned BeastCloud server'|Out-Null
 Start-ScheduledTask -TaskName $name
}catch{Write-Error -ErrorAction Continue $_.Exception.Message;exit 1}
