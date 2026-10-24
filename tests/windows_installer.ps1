#requires -Version 5.1
# Native Windows fixture only: uses a unique temporary root, never C:\BeastCloud.
[CmdletBinding()]
param([string]$OutputDirectory=(Join-Path $env:TEMP ('BeastCloud-Windows-test-'+[guid]::NewGuid().ToString('N'))))
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$repository=Split-Path $PSScriptRoot -Parent
$work=Join-Path $OutputDirectory 'fixture'
$root=Join-Path $work 'installation'
$package=Join-Path $work 'package'
$thumbprint=$null
$ownsService=$false
New-Item -ItemType Directory -Path $work -Force|Out-Null
try {
 if(Get-Service BeastCloud -ErrorAction SilentlyContinue){throw 'This fixture requires an isolated Windows runner without BeastCloud installed.'}
 $manifest=Get-Content -LiteralPath (Join-Path $repository 'distribution\0.1.0\download.json') -Raw|ConvertFrom-Json
 $archive=Join-Path $work $manifest.archive
 $output=[IO.File]::OpenWrite($archive)
 try {
  foreach($part in $manifest.parts){
   $path=Join-Path $repository ('distribution\0.1.0\'+$part.name)
   if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $part.sha256){throw 'Fixture archive part checksum mismatch.'}
   $partStream=[IO.File]::OpenRead($path);try{$partStream.CopyTo($output)}finally{$partStream.Dispose()}
  }
 }finally{$output.Dispose()}
 if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256){throw 'Fixture archive checksum mismatch.'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 [IO.Compression.ZipFile]::ExtractToDirectory($archive,$package)
 $installer=Join-Path $repository 'scripts\Install.ps1'
 $ownsService=$true
 foreach($attempt in 1..3){
  $diagnostic=Join-Path $OutputDirectory ("setup-attempt-$attempt.log")
  # The server's browser launch is best effort on headless runners.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Root $root -PackagePath $package -Port 55443 -SetupLogPath $diagnostic
  if($LASTEXITCODE -ne 0){throw "Native installer attempt $attempt failed ($LASTEXITCODE)."}
  $installation=Get-Content -LiteralPath (Join-Path $root 'config\installation.json') -Raw|ConvertFrom-Json
  $thumbprint=$installation.thumbprint
  if((Get-Service BeastCloud).Status -ne 'Running'){throw 'The Windows service is not running.'}
  $service=Get-CimInstance Win32_Service -Filter "Name='BeastCloud'"
  if($service.StartName -ne 'NT SERVICE\BeastCloud'){throw 'The service is not using its dedicated virtual account.'}
  if((Invoke-RestMethod 'https://127.0.0.1:55443/api/health' -TimeoutSec 10).status -ne 'ready'){throw 'Trusted HTTPS did not become ready.'}
  if($attempt -eq 1){
   'preserved fixture'|Set-Content -LiteralPath (Join-Path $root 'data\installer-sentinel.txt')
   # Reproduce the exact 0.1.1 failure: this command strips inherited file
   # permissions, but its directory-only grants do not apply to existing files.
   Stop-Service BeastCloud
   # Failed 0.1.1 provisioning had not yet granted the service access to its marker.
   & icacls.exe (Join-Path $root 'config\installation.json') /remove:g 'NT SERVICE\BeastCloud'|Out-Null
   if($LASTEXITCODE -ne 0){throw 'Unable to prepare the provisioning marker regression fixture.'}
   & icacls.exe $root /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C|Out-Null
   if($LASTEXITCODE -ne 0){throw 'Unable to prepare the damaged-permissions regression fixture.'}
   $damaged=Get-Acl -LiteralPath (Join-Path $root 'scripts\Build.ps1')
   if(@($damaged.Access).Count -ne 0){throw 'The old permissions command did not reproduce an empty file DACL.'}
   $markerAcl=Get-Acl -LiteralPath (Join-Path $root 'config\installation.json')
   if(@($markerAcl.Access).Count -ne 0){throw 'The provisioning marker does not have the expected empty DACL.'}
  }elseif((Get-Content -LiteralPath (Join-Path $root 'data\installer-sentinel.txt') -Raw).Trim() -ne 'preserved fixture'){
   throw 'An installer retry changed the data sentinel.'
  }
 }
 'PASS: native Windows PowerShell 5.1 installation, recovery from empty file DACLs, normal reinstall, trusted HTTPS and data preservation.'|Tee-Object -FilePath (Join-Path $OutputDirectory 'result.txt')
}catch{
 $testFailure=$_.Exception.Message
 # A short annotation is readable even when Actions log/artifact access needs sign-in.
 $failureDetails=@($testFailure)
 foreach($diagnostic in Get-ChildItem -LiteralPath $OutputDirectory -Filter 'setup-attempt-*.log'){
  $failureDetails+=@(Get-Content -LiteralPath $diagnostic.FullName -Encoding UTF8|Where-Object {$_ -match 'FAILED during'}|Select-Object -Last 1)
 }
 $summary=($failureDetails -join "`n").Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A')
 Write-Host "::error title=Native test failure::$summary"
 try{$health=Invoke-RestMethod 'https://127.0.0.1:55443/api/health' -TimeoutSec 5;Write-Host "::error title=Native HTTPS diagnostic::Probe returned status: $($health.status)"}catch{Write-Host "::error title=Native HTTPS diagnostic::$($_.Exception.Message)"}
 $failedService=Get-Service BeastCloud -ErrorAction SilentlyContinue
 if($failedService){Write-Host "::error title=Native service diagnostic::Status: $($failedService.Status)"}
 $serviceInfo=Get-CimInstance Win32_Service -Filter "Name='BeastCloud'" -ErrorAction SilentlyContinue
 $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 55443 -ErrorAction SilentlyContinue)
 Write-Host "::error title=Native listener diagnostic::Service process: $($serviceInfo.ProcessId); exit: $($serviceInfo.ExitCode); service exit: $($serviceInfo.ServiceSpecificExitCode); identity: $($serviceInfo.StartName); command: $($serviceInfo.PathName); listening addresses: $($listeners.LocalAddress -join ',')"
 $presence=@()
 foreach($relative in @('config\setup.key','config\instance.lock','data\db\beast.db')){$presence+=($relative+'='+(Test-Path -LiteralPath (Join-Path $root $relative)))}
 Write-Host ('::error title=Native startup files::'+($presence -join '; '))
 try{
  $event=Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Service Control Manager';StartTime=(Get-Date).AddMinutes(-10);Level=@(2,3)} -MaxEvents 20 -ErrorAction SilentlyContinue|Where-Object {$_.Message -match 'BeastCloud'}|Select-Object -First 1
  if($event){Write-Host ('::error title=Native SCM diagnostic::'+$event.Message.Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A'))}
 }catch{}
 if($failedService.Status -eq 'Stopped'){
  try{
   $installation=Get-Content -LiteralPath (Join-Path $root 'config\installation.json') -Raw|ConvertFrom-Json
   $env:BEAST_ROOT=$root
   $info=[Diagnostics.ProcessStartInfo]::new($installation.executable,'--backup')
   $info.UseShellExecute=$false;$info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true;$info.CreateNoWindow=$true
   $process=[Diagnostics.Process]::Start($info)
   if(!$process.WaitForExit(10000)){$process.Kill();throw 'The console diagnostic exceeded 10 seconds.'}
   $stderr=$process.StandardError.ReadToEnd();$stdout=$process.StandardOutput.ReadToEnd()
   $message=("Exit $($process.ExitCode): "+$stderr+$stdout)
   $message=$message.Substring(0,[Math]::Min(1800,$message.Length)).Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A')
   Write-Host "::error title=Native console startup::$message"
  }catch{Write-Host "::error title=Native console startup::$($_.Exception.Message)"}
 }
 try{
  foreach($event in Get-WinEvent -FilterHashtable @{LogName='Application';ProviderName=@('.NET Runtime','Application Error');StartTime=(Get-Date).AddMinutes(-10);Level=@(2,3)} -MaxEvents 5 -ErrorAction SilentlyContinue|Where-Object {$_.Message -match 'BeastCloud'}){
   $message=$event.Message.Substring(0,[Math]::Min(1800,$event.Message.Length)).Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A')
   Write-Host "::error title=Native application event::$message"
  }
 }catch{}
 if(Test-Path -LiteralPath (Join-Path $root 'logs')){
  foreach($runtimeLog in Get-ChildItem -LiteralPath (Join-Path $root 'logs') -File|Where-Object {$_.Name -notlike 'install-*'}){
   foreach($line in Get-Content -LiteralPath $runtimeLog.FullName -Tail 8){Write-Host ('::error title=Native runtime diagnostic::'+$line.Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A'))}
  }
 }
 foreach($path in @((Join-Path $root 'scripts'),(Join-Path $root 'scripts\Build.ps1'))){
  try{
   $item=Get-Item -LiteralPath $path -Force
   $sddl=(Get-Acl -LiteralPath $path).Sddl
   Write-Host "::error title=Fixture file permissions::$path attributes=$($item.Attributes) ACL=$sddl"
  }catch{Write-Host "::error title=Fixture file permissions::$path : $($_.Exception.Message)"}
 }
 foreach($diagnostic in Get-ChildItem -LiteralPath $OutputDirectory -Filter 'setup-attempt-*.log'){
  $lines=@(Get-Content -LiteralPath $diagnostic.FullName -Encoding UTF8|Select-Object -Last 6)
  $escaped=($lines -join "`n").Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A')
  Write-Host "::error title=Native installer diagnostic::$escaped"
 }
 throw
}finally{
 if($ownsService){
  Stop-Service BeastCloud -ErrorAction SilentlyContinue
  & sc.exe delete BeastCloud|Out-Null
 }
 if(!$thumbprint -and (Test-Path -LiteralPath (Join-Path $root 'config\beastcloud.cer'))){$thumbprint=([Security.Cryptography.X509Certificates.X509Certificate2]::new((Join-Path $root 'config\beastcloud.cer'))).Thumbprint}
 if($thumbprint){Remove-Item -LiteralPath ('Cert:\LocalMachine\Root\'+$thumbprint) -ErrorAction SilentlyContinue}
 if(Test-Path -LiteralPath (Join-Path $root 'logs')){Copy-Item -LiteralPath (Join-Path $root 'logs') -Destination (Join-Path $OutputDirectory 'installation-logs') -Recurse -Force}
 # Runtime state remains only in the disposable runner, excluded from artifacts.
}
