#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('status','start','stop','restart','backup','verify','restore','update','repair','uninstall','encrypt','decrypt')][string]$Action,[string]$Root='C:\BeastCloud',[string]$Package,[string]$Source,[string]$Destination)
$ErrorActionPreference='Stop'
try{
 $install=Get-Content (Join-Path $Root 'config\installation.json') -Raw|ConvertFrom-Json
 $env:BEAST_ROOT=$Root
 switch($Action){
  status {Get-Service BeastCloud;Get-CimInstance Win32_Service -Filter "Name='BeastCloud'"|Select-Object Name,State,StartMode,StartName;Write-Host "Version: $($install.version)";Write-Host "Managed files: $($install.storage)";Write-Host "Storage marker present: $(Test-Path (Join-Path $install.storage '.beastcloud-volume'))";Invoke-RestMethod "https://localhost:$($install.port)/api/health";break}
  start {Start-Service BeastCloud;break}
  stop {Stop-Service BeastCloud;break}
  restart {Restart-Service BeastCloud;break}
  backup {$running=(Get-Service BeastCloud).Status -eq 'Running';if($running){Stop-Service BeastCloud};try{& $install.executable --backup;if($LASTEXITCODE -ne 0){throw 'Backup failed'}}finally{if($running){Start-Service BeastCloud}};break}
  verify {& $install.executable --verify-backup $Source;if($LASTEXITCODE -ne 0){throw 'Backup verification failed'};break}
  restore {if(!$Destination -or !$Source){throw 'Use -Source backup-directory -Destination NEW-empty-directory'};& $install.executable --restore $Source $Destination;if($LASTEXITCODE -ne 0){throw 'Restore failed'};break}
  encrypt {& $install.executable --encrypt-backup $Source $Destination;if($LASTEXITCODE -ne 0){throw 'Encryption failed'};break}
  decrypt {& $install.executable --decrypt-backup $Source $Destination;if($LASTEXITCODE -ne 0){throw 'Decryption failed'};break}
  {$_ -in 'update','repair'} {if(!$Package){throw 'Provide the extracted local package with -Package'};$installer=Join-Path $Package 'scripts\Install.ps1';$params=@{Root=$Root;Storage=$install.storage;Port=[int]$install.port};if($install.lan){$params.Lan=$true;$params.LanAddress=$install.lanAddress};& $installer @params;if($LASTEXITCODE -ne 0){throw 'Installation failed'};break}
  uninstall {Stop-Service BeastCloud -ErrorAction SilentlyContinue;& sc.exe delete BeastCloud;if($LASTEXITCODE -ne 0){throw 'Service deletion failed'};Write-Host 'Service removed. All files, accounts, certificates and backups preserved. Delete data only as a separate deliberate operation. Remove the certificate trust entry manually if no longer needed.';break}
 }
 exit 0
}catch{Write-Error -ErrorAction Continue $_.Exception.Message;exit 1}
