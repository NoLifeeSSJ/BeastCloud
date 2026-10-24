#requires -Version 5.1
[CmdletBinding()]
param([string]$Root='C:\BeastCloud',[int]$Port=5443,[string]$Storage='', [switch]$Lan,[string]$LanAddress='',[switch]$Elevated,[string]$PackagePath='',[string]$SetupLogPath='')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
# Windows PowerShell 5.1's TLS setting is process-local; elevation starts a new
# process and does not inherit the bootstrap's TLS 1.2 selection.
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$stage='Initializing installer'
$log=$null
$previous=$null
$wasRunning=$false
$password=$null
if(!$SetupLogPath){$SetupLogPath=Join-Path ([IO.Path]::GetTempPath()) ('BeastCloud-setup-'+[guid]::NewGuid().ToString('N')+'.log')}
try {
 . (Join-Path $PSScriptRoot 'InstallerSupport.ps1')
 Write-BeastSetupLog -Path $SetupLogPath -Message 'Starting BeastCloud Windows installer revision 0.1.2'
 Write-Host "Setup diagnostics: $SetupLogPath"
 $stage='Checking Windows and arguments'
 if ($env:OS -ne 'Windows_NT') { throw 'BeastCloud installation requires Windows.' }
 if ([Environment]::OSVersion.Version.Build -lt 20348) { throw 'Windows 11 or Windows Server 2022 (or later) is required.' }
 if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This package requires Windows x64. Use 64-bit PowerShell.' }
 foreach ($p in @($Root,$Storage,$LanAddress,$PackagePath,$SetupLogPath)) { if ($p -match '["\r\n]') { throw 'Arguments may not contain quotes or newlines.' } }
 $Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
 if (!$Storage) {$Storage=Join-Path $Root 'data\files'}
 $Storage=[IO.Path]::GetFullPath($Storage).TrimEnd('\')
 if($PackagePath){$PackagePath=[IO.Path]::GetFullPath($PackagePath)}
 $SetupLogPath=[IO.Path]::GetFullPath($SetupLogPath)
 if ($Root.StartsWith('\\') -or $Storage.StartsWith('\\') -or $Root.Length -lt 4 -or $Storage.Length -lt 4) {throw 'Use a dedicated directory on a local disk.'}
 if ($Port -lt 1024 -or $Port -gt 65535) {throw 'Choose a port from 1024 through 65535.'}
 if ($Lan -and (!$LanAddress -or ![Net.IPAddress]::TryParse($LanAddress,[ref]([Net.IPAddress]$null)))) {throw 'LAN mode requires -LanAddress with the explicit private IPv4 address of this computer.'}
 if($Lan -and $LanAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'){throw 'LAN mode requires an RFC1918 private IPv4 address.'}
 $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 if (!$admin) {
  $stage='Requesting administrator elevation'
  Write-BeastSetupLog -Path $SetupLogPath -Message 'Requesting UAC elevation'
  $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -Root "'+$Root+'" -Storage "'+$Storage+'" -Port '+$Port+' -Elevated'
  if ($Lan) {$arguments+=' -Lan -LanAddress "'+$LanAddress+'"'}
  if($PackagePath){$arguments+=' -PackagePath "'+$PackagePath+'"'}
  $arguments+=' -SetupLogPath "'+$SetupLogPath+'"'
  $proc=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
  if($proc.ExitCode -ne 0){Write-Host 'The elevated installer failed. Its detailed diagnostic follows:' -ForegroundColor Red;Get-Content -LiteralPath $SetupLogPath -Encoding UTF8 -Tail 50|ForEach-Object {Write-Host $_};Write-Host "Diagnostic log: $SetupLogPath"}
  exit $proc.ExitCode
 }
 $stage='Verifying the offline application package'
 $package=if($PackagePath){[IO.Path]::GetFullPath($PackagePath)}else{Split-Path $PSScriptRoot -Parent}
 . (Join-Path $package 'scripts/Package.ps1')
 $manifest=Test-BeastPackage $package
 Write-BeastSetupLog -Path $SetupLogPath -Message 'Application package checksums passed'
 $stage='Checking target paths, service, port, and disk space'
 if(Test-Path $Root){Assert-NoReparse $Root;Assert-NoReparse (Join-Path $Root 'config');Repair-BeastInstallationMarkerAccess -Path (Join-Path $Root 'config\installation.json') -SetupLogPath $SetupLogPath; if(!(Test-Path (Join-Path $Root 'config\installation.json')) -and (Get-ChildItem -Force $Root|Measure-Object).Count -gt 0){throw 'Target is not a marked BeastCloud installation. Existing files were preserved. Choose an empty root.'}}
 Assert-NoReparse $Storage
 $oldService=Get-Service BeastCloud -ErrorAction SilentlyContinue
 $wasRunning=$oldService -and $oldService.Status -eq 'Running'
 $existing=Test-Path (Join-Path $Root 'config\installation.json')
 if ($existing) {
  $oldConfig=Get-Content (Join-Path $Root 'config\installation.json') -Raw|ConvertFrom-Json
  if($oldConfig.storage -ne $Storage -or $oldConfig.port -ne $Port -or [bool]$oldConfig.lan -ne [bool]$Lan -or [string]$oldConfig.lanAddress -ne $LanAddress){throw 'Rerun with the existing storage, port, and network arguments. Changing live storage or access scope requires a separate deliberate migration.'}
 }
 $listeners=@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
 if($listeners.Count -gt 0){if(!$oldService){throw 'Selected port is already in use.'};$serviceInfo=Get-CimInstance Win32_Service -Filter "Name='BeastCloud'";if(@($listeners|Where-Object {$_.OwningProcess -ne $serviceInfo.ProcessId}).Count -gt 0){throw 'Selected port is in use by another process.'}}
 foreach($diskPath in @($Root,$Storage)){ $volume=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($diskPath));if($volume.DriveType -eq [IO.DriveType]::Network -or $volume.DriveFormat -notin @('NTFS','ReFS')){throw 'Application and managed storage require a local NTFS/ReFS volume; mapped network drives are not supported.'};$drive=Get-PSDrive -Name ([IO.Path]::GetPathRoot($diskPath).Substring(0,1));if($drive.Free -lt 2GB){throw 'At least 2 GiB free space is required on each target volume.'}}
 if(!$existing -and (Test-Path $Storage) -and (Get-ChildItem -Force $Storage|Measure-Object).Count -gt 0){throw 'First-install managed storage must be empty; existing files were preserved.'}
 $stage='Creating installation directories and protecting permissions'
 Write-BeastSetupLog -Path $SetupLogPath -Message $stage
 foreach($dir in @('app','config','data\db','data\versions','data\trash','data\thumbnails','data\search','data\temp','logs','backups','releases','scripts','docs')){Assert-NoReparse (Join-Path $Root $dir);New-Item -ItemType Directory -Force (Join-Path $Root $dir)|Out-Null}
 $previous=$null
 Grant-BeastTreeAccess -Path $Root -Identities @('*S-1-5-18','*S-1-5-32-544') -Rights F -Protect
 if(!$existing){@{executable='';version=$manifest.version;storage=$Storage;port=$Port;lan=[bool]$Lan;lanAddress=$LanAddress;thumbprint='';state='provisioning'}|ConvertTo-Json|Set-Content (Join-Path $Root 'config\installation.json') -Encoding UTF8}
 $log=Join-Path $Root ('logs\install-'+(Get-Date -Format yyyyMMdd-HHmmss)+'.log')
 'Beginning local package installation'|Out-File $log -Encoding UTF8
 Write-BeastSetupLog -Path $SetupLogPath -Message "Local installation log: $log"
 $stage='Stopping the previous service and creating a recovery checkpoint'
 if($oldService){Stop-Service BeastCloud; (Get-Service BeastCloud).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60))}
 $previous=$null
 if($oldService){$previous=(Get-CimInstance Win32_Service -Filter "Name='BeastCloud'").PathName}
 $env:BEAST_ROOT=$Root
 if($existing -and (Test-Path (Join-Path $Root 'data\db\beast.db'))){$exe=(Get-Content (Join-Path $Root 'config\installation.json') -Raw|ConvertFrom-Json).executable;& $exe --backup;if($LASTEXITCODE -ne 0){throw 'Pre-update backup failed. Installation stopped.'}}
 $stage='Copying the application and installer scripts'
 Write-BeastSetupLog -Path $SetupLogPath -Message $stage
 $version=$manifest.version+'-'+(Get-Date -Format yyyyMMddHHmmss)
 $target=Join-Path $Root ('app\'+$version)
 New-Item -ItemType Directory $target|Out-Null
 Copy-Item (Join-Path $package 'server\*') $target -Recurse
 Copy-Item (Join-Path $package 'scripts\*') (Join-Path $Root 'scripts') -Force
 foreach($patched in @('Install.ps1','InstallerSupport.ps1','Get-BeastCloud.ps1')){$source=Join-Path $PSScriptRoot $patched;$destination=Join-Path $Root ('scripts\'+$patched);if([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($destination)){Copy-Item -LiteralPath $source -Destination $destination -Force}}
 Copy-Item (Join-Path $package 'docs\*') (Join-Path $Root 'docs') -Recurse -Force
 $guide=Join-Path $PSScriptRoot 'GITHUB-INSTALL.md';if(Test-Path -LiteralPath $guide){Copy-Item -LiteralPath $guide -Destination (Join-Path $Root 'docs\GITHUB-INSTALL.md') -Force}
 if(!(Test-Path $Storage)){New-Item -ItemType Directory $Storage|Out-Null}
 if(!$existing -and (Get-ChildItem -Force $Storage|Measure-Object).Count -gt 0){throw 'Managed storage must be empty on first installation. Import existing files by copying after setup.'}
 $stage='Creating and trusting the local TLS certificate'
 Write-BeastSetupLog -Path $SetupLogPath -Message $stage
 if(!(Test-Path (Join-Path $Root 'config\server.json'))){
  $secretBytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($secretBytes);$rng.Dispose();$password=[Convert]::ToBase64String($secretBytes)
  $certParams=New-BeastCertificateParameters -ComputerName $env:COMPUTERNAME -Lan:$Lan -LanAddress $LanAddress
  $cert=New-SelfSignedCertificate @certParams
  $secure=ConvertTo-SecureString $password -AsPlainText -Force
  Export-PfxCertificate -Cert $cert -FilePath (Join-Path $Root 'config\https.pfx') -Password $secure|Out-Null
  Export-Certificate -Cert $cert -FilePath (Join-Path $Root 'config\beastcloud.cer')|Out-Null
  # Trust only this installation's certificate on this computer. Other devices require explicit import.
  Import-Certificate -FilePath (Join-Path $Root 'config\beastcloud.cer') -CertStoreLocation Cert:\LocalMachine\Root|Out-Null
  Remove-Item ('Cert:\LocalMachine\My\'+$cert.Thumbprint)
  $address='127.0.0.1';if($Lan){$address=$LanAddress}
  $endpoints=@{Https=@{Url="https://127.0.0.1:$Port";Certificate=@{Path=(Join-Path $Root 'config\https.pfx');Password=$password}}}
  if($Lan){$endpoints.Lan=@{Url="https://${address}:$Port";Certificate=@{Path=(Join-Path $Root 'config\https.pfx');Password=$password}}}
  @{Kestrel=@{Endpoints=$endpoints};Logging=@{LogLevel=@{Default='Warning';'Microsoft.AspNetCore'='Warning'}}}|ConvertTo-Json -Depth 10|Set-Content (Join-Path $Root 'config\server.json') -Encoding UTF8
  @{files=$Storage}|ConvertTo-Json|Set-Content (Join-Path $Root 'config\storage.json') -Encoding UTF8
  [guid]::NewGuid().ToString()|Set-Content (Join-Path $Storage '.beastcloud-volume')
  $thumbprint=$cert.Thumbprint
 }else{$thumbprint=([Security.Cryptography.X509Certificates.X509Certificate2]::new((Join-Path $Root 'config\beastcloud.cer'))).Thumbprint}
 $stage='Configuring the Windows service identity and permissions'
 Write-BeastSetupLog -Path $SetupLogPath -Message $stage
 # Administrators and SYSTEM own code/config; the service SID gets only the required write locations.
 Grant-BeastTreeAccess -Path $Root -Identities @('*S-1-5-18','*S-1-5-32-544') -Rights F -Protect -LogPath $log
 $exe=Join-Path $target 'BeastCloud.Server.exe'
 if(!$existing){@{executable=$exe;version=$manifest.version;installerRevision='0.1.2';storage=$Storage;port=$Port;lan=[bool]$Lan;lanAddress=$LanAddress;thumbprint=$thumbprint;state='provisioning'}|ConvertTo-Json|Set-Content (Join-Path $Root 'config\installation.json') -Encoding UTF8}
 $binary='"'+$exe+'" --contentRoot "'+$target+'"'
 if(!$oldService){New-Service -Name BeastCloud -DisplayName 'BeastCloud private cloud' -BinaryPathName $binary -StartupType Automatic|Out-Null}
 $service=Get-CimInstance Win32_Service -Filter "Name='BeastCloud'"
 $changed=Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{PathName=$binary;StartMode='Automatic'}
 if($changed.ReturnValue -ne 0){throw "Service configuration failed: $($changed.ReturnValue)"}
 & sc.exe sidtype BeastCloud unrestricted|Out-File $log -Encoding UTF8 -Append
 if($LASTEXITCODE -ne 0){throw 'Unable to configure the Windows service SID.'}
 # Configure the virtual account through SCM without a password. The WMI
 # provider rejects this identity when supplied as StartName/StartPassword.
 & sc.exe config BeastCloud obj= 'NT SERVICE\BeastCloud'|Out-File $log -Encoding UTF8 -Append
 if($LASTEXITCODE -ne 0){throw 'Unable to configure the Windows virtual service account.'}
 & sc.exe failure BeastCloud reset= 86400 actions= restart/5000/restart/15000/restart/60000|Out-File $log -Encoding UTF8 -Append
 if($LASTEXITCODE -ne 0){throw 'Unable to configure automatic Windows service recovery.'}
 & icacls.exe $Root /grant 'NT SERVICE\BeastCloud:RX'|Out-File $log -Encoding UTF8 -Append
 if($LASTEXITCODE -ne 0){throw 'Unable to grant Windows service root access.'}
 foreach($path in @($target,(Join-Path $Root 'config'))){Grant-BeastTreeAccess -Path $path -Identities @('NT SERVICE\BeastCloud') -Rights RX -LogPath $log}
 Grant-BeastTreeAccess -Path $Storage -Identities @('*S-1-5-18','*S-1-5-32-544') -Rights F -Protect -LogPath $log
 foreach($path in @((Join-Path $Root 'data'),(Join-Path $Root 'logs'),(Join-Path $Root 'backups'),(Join-Path $Root 'config'),$Storage)){Grant-BeastTreeAccess -Path $path -Identities @('NT SERVICE\BeastCloud') -Rights M -LogPath $log}
 $reg='HKLM:\SYSTEM\CurrentControlSet\Services\BeastCloud'
 New-ItemProperty $reg -Name Environment -PropertyType MultiString -Value @("BEAST_ROOT=$Root",'DOTNET_CLI_TELEMETRY_OPTOUT=1') -Force|Out-Null
 $stage='Starting the Windows service'
 Write-BeastSetupLog -Path $SetupLogPath -Message $stage
 Start-Service BeastCloud
 $stage='Checking trusted HTTPS readiness'
 $address='localhost'
 $url="https://${address}:$Port"
 # Match the IPv4 listener directly. Windows PowerShell can spend its short
 # timeout trying localhost's IPv6 address before falling back to IPv4.
 $healthUrl="https://127.0.0.1:$Port/api/health"
 $ready=$false
 $readinessFailure='No ready response received.'
 $deadline=(Get-Date).AddSeconds(60)
 do{try{$response=Invoke-RestMethod $healthUrl -TimeoutSec 5;if($response.status -eq 'ready'){$ready=$true;break};$readinessFailure='Unexpected health response status: '+[string]$response.status}catch{$readinessFailure=$_.Exception.Message};Start-Sleep -Seconds 1}while((Get-Date) -lt $deadline)
 if(!$ready){throw "Service did not pass trusted HTTPS readiness: $readinessFailure Check Windows Event Viewer and the installation log."}
 @{executable=$exe;version=$manifest.version;installerRevision='0.1.2';storage=$Storage;port=$Port;lan=[bool]$Lan;lanAddress=$LanAddress;thumbprint=$thumbprint}|ConvertTo-Json|Set-Content (Join-Path $Root 'config\installation.json') -Encoding UTF8
 'Installation passed HTTPS readiness.'|Out-File $log -Encoding UTF8 -Append
 Write-BeastSetupLog -Path $SetupLogPath -Message 'SUCCESS: installation passed trusted HTTPS readiness'
 Write-Host "BeastCloud is running at $url. Local setup key: $Root\config\setup.key"
 if($Lan){Write-Host 'LAN listener explicitly enabled. No firewall rule was added. See docs/NETWORK.md for certificate trust and private firewall scope.'}
 try{Start-Process $url}catch{Write-Warning "Installation succeeded. Open $url in your browser."}
 exit 0
} catch {
 $failure=$_.Exception.Message
 if($password){$failure=$failure.Replace($password,'[redacted]')}
 $detail="FAILED during ${stage}: $failure"
 try{Write-BeastSetupLog -Path $SetupLogPath -Message $detail -Secrets @($password)}catch{Write-Warning 'Could not write the temporary setup diagnostic.'}
 if($log){try{Write-BeastSetupLog -Path $log -Message $detail -Secrets @($password)}catch{}}
 Write-Host "Diagnostic log: $SetupLogPath" -ForegroundColor Red
 Write-Error -ErrorAction Continue $detail
 if($previous){try{Stop-Service BeastCloud -ErrorAction SilentlyContinue;$service=Get-CimInstance Win32_Service -Filter "Name='BeastCloud'";Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{PathName=$previous}|Out-Null;if($wasRunning){Start-Service BeastCloud}}catch{Write-Warning 'Automatic service rollback failed; use Maintain.ps1 repair with the previous package.'}}
 exit 1
}
