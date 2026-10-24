#requires -Version 5.1
[CmdletBinding()]
param([string]$Root='C:\BeastCloud',[int]$Port=5443,[string]$Storage='', [switch]$Lan,[string]$LanAddress='',[switch]$Elevated)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
try {
 if ($env:OS -ne 'Windows_NT') { throw 'BeastCloud installation requires Windows.' }
 if ([Environment]::OSVersion.Version.Build -lt 20348) { throw 'Windows 11 or Windows Server 2022 (or later) is required.' }
 if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This package requires Windows x64. Use 64-bit PowerShell.' }
 foreach ($p in @($Root,$Storage,$LanAddress)) { if ($p -match '["\r\n]') { throw 'Arguments may not contain quotes or newlines.' } }
 $Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
 if (!$Storage) {$Storage=Join-Path $Root 'data\files'}
 $Storage=[IO.Path]::GetFullPath($Storage).TrimEnd('\')
 if ($Root.StartsWith('\\') -or $Storage.StartsWith('\\') -or $Root.Length -lt 4 -or $Storage.Length -lt 4) {throw 'Use a dedicated directory on a local disk.'}
 if ($Port -lt 1024 -or $Port -gt 65535) {throw 'Choose a port from 1024 through 65535.'}
 if ($Lan -and (!$LanAddress -or ![Net.IPAddress]::TryParse($LanAddress,[ref]([Net.IPAddress]$null)))) {throw 'LAN mode requires -LanAddress with the explicit private IPv4 address of this computer.'}
 if($Lan -and $LanAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'){throw 'LAN mode requires an RFC1918 private IPv4 address.'}
 $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 if (!$admin) {
  $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -Root "'+$Root+'" -Storage "'+$Storage+'" -Port '+$Port+' -Elevated'
  if ($Lan) {$arguments+=' -Lan -LanAddress "'+$LanAddress+'"'}
  $proc=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
  exit $proc.ExitCode
 }
 $package=Split-Path $PSScriptRoot -Parent
 . (Join-Path $PSScriptRoot 'Package.ps1')
 $manifest=Test-BeastPackage $package
 if(Test-Path $Root){Assert-NoReparse $Root; if(!(Test-Path (Join-Path $Root 'config\installation.json')) -and (Get-ChildItem -Force $Root|Measure-Object).Count -gt 0){throw 'Target is not a marked BeastCloud installation. Existing files were preserved. Choose an empty root.'}}
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
 foreach($dir in @('app','config','data\db','data\versions','data\trash','data\thumbnails','data\search','data\temp','logs','backups','releases','scripts','docs')){New-Item -ItemType Directory -Force (Join-Path $Root $dir)|Out-Null}
 $previous=$null
 & icacls.exe $Root /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Failed to protect the installation directory before writing secrets.'}
 if(!$existing){@{executable='';version=$manifest.version;storage=$Storage;port=$Port;lan=[bool]$Lan;lanAddress=$LanAddress;thumbprint='';state='provisioning'}|ConvertTo-Json|Set-Content (Join-Path $Root 'config\installation.json') -Encoding UTF8}
 $log=Join-Path $Root ('logs\install-'+(Get-Date -Format yyyyMMdd-HHmmss)+'.log')
 'Beginning local package installation'|Out-File $log
 if($oldService){Stop-Service BeastCloud; (Get-Service BeastCloud).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60))}
 $previous=$null
 if($oldService){$previous=(Get-CimInstance Win32_Service -Filter "Name='BeastCloud'").PathName}
 $env:BEAST_ROOT=$Root
 if($existing -and (Test-Path (Join-Path $Root 'data\db\beast.db'))){$exe=(Get-Content (Join-Path $Root 'config\installation.json') -Raw|ConvertFrom-Json).executable;& $exe --backup;if($LASTEXITCODE -ne 0){throw 'Pre-update backup failed. Installation stopped.'}}
 $version=$manifest.version+'-'+(Get-Date -Format yyyyMMddHHmmss)
 $target=Join-Path $Root ('app\'+$version)
 New-Item -ItemType Directory $target|Out-Null
 Copy-Item (Join-Path $package 'server\*') $target -Recurse
 Copy-Item (Join-Path $package 'scripts\*') (Join-Path $Root 'scripts') -Force
 Copy-Item (Join-Path $package 'docs\*') (Join-Path $Root 'docs') -Recurse -Force
 if(!(Test-Path $Storage)){New-Item -ItemType Directory $Storage|Out-Null}
 if(!$existing -and (Get-ChildItem -Force $Storage|Measure-Object).Count -gt 0){throw 'Managed storage must be empty on first installation. Import existing files by copying after setup.'}
 if(!(Test-Path (Join-Path $Root 'config\server.json'))){
  $secretBytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($secretBytes);$rng.Dispose();$password=[Convert]::ToBase64String($secretBytes)
  $certParams=@{Type='Custom';Subject='CN=BeastCloud local server';HashAlgorithm='SHA256';KeyUsage=@('DigitalSignature','KeyEncipherment');CertStoreLocation='Cert:\LocalMachine\My';KeyExportPolicy='Exportable';NotAfter=(Get-Date).AddYears(2);FriendlyName='BeastCloud local TLS';KeyAlgorithm='RSA';KeyLength=3072}
  if($Lan){$certParams.TextExtension=@('2.5.29.37={text}1.3.6.1.5.5.7.3.1','2.5.29.17={text}DNS=localhost&DNS='+$env:COMPUTERNAME+'&IPAddress=127.0.0.1&IPAddress='+$LanAddress)}else{$certParams.TextExtension=@('2.5.29.37={text}1.3.6.1.5.5.7.3.1','2.5.29.17={text}DNS=localhost&DNS='+$env:COMPUTERNAME+'&IPAddress=127.0.0.1')}
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
 # Administrators and SYSTEM own code/config; the service SID gets only the required write locations.
 & icacls.exe $Root /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C|Out-File $log -Append
 if($LASTEXITCODE -ne 0){throw 'Failed to protect installation ACLs.'}
 $exe=Join-Path $target 'BeastCloud.Server.exe'
 if(!$existing){@{executable=$exe;version=$manifest.version;storage=$Storage;port=$Port;lan=[bool]$Lan;lanAddress=$LanAddress;thumbprint=$thumbprint;state='provisioning'}|ConvertTo-Json|Set-Content (Join-Path $Root 'config\installation.json') -Encoding UTF8}
 $binary='"'+$exe+'" --contentRoot "'+$target+'"'
 if(!$oldService){New-Service -Name BeastCloud -DisplayName 'BeastCloud private cloud' -BinaryPathName $binary -StartupType Automatic|Out-Null}
 $service=Get-CimInstance Win32_Service -Filter "Name='BeastCloud'"
 $changed=Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{PathName=$binary;StartMode='Automatic';StartName='NT SERVICE\BeastCloud';StartPassword=''}
 if($changed.ReturnValue -ne 0){throw "Service configuration failed: $($changed.ReturnValue)"}
 & sc.exe sidtype BeastCloud unrestricted|Out-File $log -Append
 & sc.exe failure BeastCloud reset= 86400 actions= restart/5000/restart/15000/restart/60000|Out-File $log -Append
 & icacls.exe $Root /grant 'NT SERVICE\BeastCloud:RX'|Out-File $log -Append
 foreach($path in @($target,(Join-Path $Root 'config'))){& icacls.exe $path /grant 'NT SERVICE\BeastCloud:(OI)(CI)RX' /T /C|Out-File $log -Append;if($LASTEXITCODE -ne 0){throw 'Unable to grant service read access'}}
 & icacls.exe $Storage /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C|Out-File $log -Append
 if($LASTEXITCODE -ne 0){throw 'Unable to protect managed storage ACLs'}
 foreach($path in @((Join-Path $Root 'data'),(Join-Path $Root 'logs'),(Join-Path $Root 'backups'),(Join-Path $Root 'config'),$Storage)){& icacls.exe $path /grant 'NT SERVICE\BeastCloud:(OI)(CI)M' /T /C|Out-File $log -Append;if($LASTEXITCODE -ne 0){throw 'Unable to grant service data access'}}
 $reg='HKLM:\SYSTEM\CurrentControlSet\Services\BeastCloud'
 New-ItemProperty $reg -Name Environment -PropertyType MultiString -Value @("BEAST_ROOT=$Root",'DOTNET_CLI_TELEMETRY_OPTOUT=1') -Force|Out-Null
 Start-Service BeastCloud
 $address='localhost'
 $url="https://${address}:$Port"
 $ready=$false
 for($i=0;$i -lt 30;$i++){try{$response=Invoke-RestMethod "$url/api/health" -TimeoutSec 2;if($response.status -eq 'ready'){$ready=$true;break}}catch{};Start-Sleep -Seconds 1}
 if(!$ready){throw 'Service did not pass HTTPS readiness. Check Windows Event Viewer, certificate trust and the installation log.'}
 @{executable=$exe;version=$manifest.version;storage=$Storage;port=$Port;lan=[bool]$Lan;lanAddress=$LanAddress;thumbprint=$thumbprint}|ConvertTo-Json|Set-Content (Join-Path $Root 'config\installation.json') -Encoding UTF8
 'Installation passed HTTPS readiness.'|Out-File $log -Append
 Write-Host "BeastCloud is running at $url. Local setup key: $Root\config\setup.key"
 if($Lan){Write-Host 'LAN listener explicitly enabled. No firewall rule was added. See docs/NETWORK.md for certificate trust and private firewall scope.'}
 Start-Process $url
 exit 0
} catch {
 Write-Error -ErrorAction Continue $_.Exception.Message
 if($previous){try{Stop-Service BeastCloud -ErrorAction SilentlyContinue;$service=Get-CimInstance Win32_Service -Filter "Name='BeastCloud'";Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{PathName=$previous}|Out-Null;if($wasRunning){Start-Service BeastCloud}}catch{Write-Warning 'Automatic service rollback failed; use Maintain.ps1 repair with the previous package.'}}
 exit 1
}
