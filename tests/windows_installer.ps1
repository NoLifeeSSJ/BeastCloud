#requires -Version 5.1
# Native Windows fixture only: uses a unique temporary root, never C:\BeastCloud.
[CmdletBinding()]
param([string]$OutputDirectory=(Join-Path $env:TEMP ('BeastCloud-Windows-test-'+[guid]::NewGuid().ToString('N'))))
$ErrorActionPreference='Stop'
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
 foreach($attempt in 1..2){
  $diagnostic=Join-Path $OutputDirectory ("setup-attempt-$attempt.log")
  # The server's browser launch is best effort on headless runners.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Root $root -PackagePath $package -Port 55443 -SetupLogPath $diagnostic
  if($LASTEXITCODE -ne 0){throw "Native installer attempt $attempt failed ($LASTEXITCODE)."}
  $installation=Get-Content -LiteralPath (Join-Path $root 'config\installation.json') -Raw|ConvertFrom-Json
  $thumbprint=$installation.thumbprint
  if((Get-Service BeastCloud).Status -ne 'Running'){throw 'The Windows service is not running.'}
  if((Invoke-RestMethod 'https://localhost:55443/api/health').status -ne 'ready'){throw 'Trusted HTTPS did not become ready.'}
  if($attempt -eq 1){
   'preserved fixture'|Set-Content -LiteralPath (Join-Path $root 'data\installer-sentinel.txt')
  }elseif((Get-Content -LiteralPath (Join-Path $root 'data\installer-sentinel.txt') -Raw).Trim() -ne 'preserved fixture'){
   throw 'An installer retry changed the data sentinel.'
  }
 }
 'PASS: native Windows PowerShell 5.1 installation, protected-file replacement, service identity, trusted HTTPS and data preservation.'|Tee-Object -FilePath (Join-Path $OutputDirectory 'result.txt')
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
