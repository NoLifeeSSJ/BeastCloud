#requires -Version 5.1
<#
Downloads a versioned BeastCloud offline bundle from the owner's GitHub repository.
Checks every part and the complete archive before extraction or installer execution.
No runtime service depends on GitHub. DownloadOnly also works in PowerShell 7 on Linux.
#>
[CmdletBinding()]
param(
 [string]$Root='C:\BeastCloud',
 [string]$Storage='',
 [ValidateRange(1024,65535)][int]$Port=5443,
 [ValidatePattern('^(v[0-9]+\.[0-9]+\.[0-9]+|[a-f0-9]{40})$')][string]$SourceRef='v0.1.2',
 [string]$CacheDirectory='',
 [switch]$DownloadOnly
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$version='0.1.0'

function Assert-SafeDownloadPath([string]$Path) {
 $full=[IO.Path]::GetFullPath($Path)
 if(Test-Path -LiteralPath $full){$item=Get-Item -LiteralPath $full -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Download cache contains a reparse point or symbolic link.'}}
 $parent=[IO.DirectoryInfo]::new($full)
 while($parent){if($parent.Exists -and ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Download cache contains a reparse point or symbolic link.'};$parent=$parent.Parent}
}
function Test-DownloadHash([string]$Path,[long]$Bytes,[string]$Hash) {
 Assert-SafeDownloadPath $Path
 return ((Test-Path -LiteralPath $Path -PathType Leaf) -and (Get-Item -LiteralPath $Path).Length -eq $Bytes -and (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Hash)
}
function Get-VerifiedFile([string]$Uri,[string]$Path,[long]$Bytes,[string]$Hash) {
 if(Test-DownloadHash $Path $Bytes $Hash){Write-Host ('Using verified cached '+[IO.Path]::GetFileName($Path));return}
 $pending=$Path+'.download'
 Assert-SafeDownloadPath $pending
 for($attempt=1;$attempt -le 3;$attempt++){
  try{
   Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $pending -ErrorAction Stop
   if(!(Test-DownloadHash $pending $Bytes $Hash)){throw 'Downloaded data failed its size or SHA-256 check.'}
   Move-Item -LiteralPath $pending -Destination $Path -Force
   return
  }catch{
   if(Test-Path -LiteralPath $pending){Remove-Item -LiteralPath $pending -Force}
   if($attempt -eq 3){throw}
   Write-Host "Download interrupted; retry $attempt of 3."
   Start-Sleep -Seconds ([Math]::Min(4,2*$attempt))
  }
 }
}


function Test-ExtractedPackage([string]$Archive,[string]$Package) {
 # Read expected checksums from the already verified ZIP, never from mutable cache code.
 $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
 try{
  $entry=$zip.GetEntry('manifest.json')
  if(!$entry -or $entry.Length -gt 2MB){throw 'Package manifest missing or too large.'}
  $reader=[IO.StreamReader]::new($entry.Open())
  try{$expected=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}
 }finally{$zip.Dispose()}
 if($expected.format -ne 1 -or $expected.version -ne $version -or $expected.platform -ne 'win-x64'){throw 'Unexpected extracted package version.'}
 foreach($file in $expected.files.PSObject.Properties){
  $name=$file.Name.Replace('\','/')
  if([IO.Path]::IsPathRooted($name) -or $name.Contains(':') -or @($name.Split('/')|Where-Object {$_ -eq '..' -or $_ -eq '.'}).Count -gt 0 -or $file.Value -notmatch '^[a-f0-9]{64}$'){throw 'Unsafe package manifest entry.'}
  $path=Join-Path $Package $name
  Assert-SafeDownloadPath $path
  if(!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.Value){throw ('Cached package failed verification: '+$name+'. Delete only the download cache directory and rerun.')}
 }
 $prefix=[IO.Path]::GetFullPath($Package).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
 foreach($item in Get-ChildItem -LiteralPath $Package -Recurse -Force){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Extracted package contains a reparse point.'}
  if(!$item.PSIsContainer){$relative=$item.FullName.Substring($prefix.Length).Replace('\','/');if($relative -ne 'manifest.json' -and !$expected.files.PSObject.Properties[$relative]){throw 'Extracted package contains an unlisted file.'}}
 }
 foreach($required in @('server/BeastCloud.Server.exe','sync/BeastCloud.Sync.exe','scripts/Install.ps1','scripts/Maintain.ps1','scripts/Package.ps1')){if(!$expected.files.PSObject.Properties[$required]){throw ('Missing package member: '+$required)}}
 return $expected
}

try {
 if(!$DownloadOnly){
  if($env:OS -ne 'Windows_NT'){throw 'Installation requires Windows. Use -DownloadOnly to download and verify without installing.'}
  if([Environment]::OSVersion.Version.Build -lt 20348 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64'){throw 'This installer supports Windows 11 / Server 2022 or later, x64, in 64-bit PowerShell.'}
 }
 foreach($path in @($Root,$Storage,$CacheDirectory)){if($path -match '["\r\n]'){throw 'Paths may not contain quotes or newlines.'}}
 if(!$CacheDirectory){
  if($env:LOCALAPPDATA){$CacheDirectory=Join-Path $env:LOCALAPPDATA 'BeastCloud/Downloads'}else{$CacheDirectory=Join-Path ([IO.Path]::GetTempPath()) 'BeastCloud-downloads'}
 }
 Assert-SafeDownloadPath $CacheDirectory
 New-Item -ItemType Directory -Path $CacheDirectory -Force|Out-Null
 # This setting applies only to this PowerShell process. Certificate validation stays enabled.
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $base="https://raw.githubusercontent.com/NoLifeeSSJ/BeastCloud/$SourceRef/distribution/$version"
 $manifestFile=Join-Path $CacheDirectory ('manifest-'+[guid]::NewGuid().ToString('N')+'.json')
 try{
  Invoke-WebRequest -UseBasicParsing -Uri "$base/download.json" -OutFile $manifestFile -ErrorAction Stop
  if((Get-Item -LiteralPath $manifestFile).Length -gt 65536){throw 'Download manifest is unexpectedly large.'}
  $manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8|ConvertFrom-Json
 }finally{if(Test-Path -LiteralPath $manifestFile){Remove-Item -LiteralPath $manifestFile -Force}}
 if($manifest.format -ne 1 -or $manifest.version -ne $version -or $manifest.platform -ne 'win-x64' -or $manifest.archive -ne "BeastCloud-$version-win-x64.zip" -or $manifest.sha256 -notmatch '^[a-f0-9]{64}$' -or [long]$manifest.bytes -lt 1 -or [long]$manifest.bytes -gt 2GB){throw 'Unsupported or invalid download manifest.'}
 $parts=@($manifest.parts)
 if($parts.Count -lt 1 -or $parts.Count -gt 64){throw 'Invalid number of download parts.'}
 [long]$total=0
 for($i=0;$i -lt $parts.Count;$i++){
  $part=$parts[$i];$expected=$manifest.archive+('.part{0:D3}' -f ($i+1))
  if($part.name -cne $expected -or $part.sha256 -notmatch '^[a-f0-9]{64}$' -or [long]$part.bytes -lt 1 -or [long]$part.bytes -gt 32MB){throw 'Invalid download part name, length or hash.'}
  $total+=[long]$part.bytes
 }
 if($total -ne [long]$manifest.bytes){throw 'Download part lengths do not match archive length.'}
 $cache=Join-Path $CacheDirectory ($version+'-'+$manifest.sha256.Substring(0,16))
 Assert-SafeDownloadPath $cache
 New-Item -ItemType Directory -Path $cache -Force|Out-Null
 $volume=[IO.DriveInfo]::new([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($cache)))
 if($volume.AvailableFreeSpace -lt ([long]$manifest.bytes*3+512MB)){throw 'Not enough free space in the download cache for parts, archive and extracted files.'}
 $archive=Join-Path $cache $manifest.archive
 Assert-SafeDownloadPath $archive
 if(!(Test-DownloadHash $archive ([long]$manifest.bytes) $manifest.sha256)){
  for($i=0;$i -lt $parts.Count;$i++){
   $part=$parts[$i];Write-Host ("Downloading BeastCloud part {0}/{1}..." -f ($i+1),$parts.Count)
   Get-VerifiedFile "$base/$($part.name)" (Join-Path $cache $part.name) ([long]$part.bytes) $part.sha256
  }
  $pendingArchive=$archive+'.assembling';Assert-SafeDownloadPath $pendingArchive
  $output=[IO.File]::Open($pendingArchive,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{foreach($part in $parts){$partStream=[IO.File]::OpenRead((Join-Path $cache $part.name));try{$partStream.CopyTo($output,65536)}finally{$partStream.Dispose()}};$output.Flush($true)}finally{$output.Dispose()}
  if(!(Test-DownloadHash $pendingArchive ([long]$manifest.bytes) $manifest.sha256)){Remove-Item -LiteralPath $pendingArchive -Force;throw 'Reassembled archive failed SHA-256 verification. Nothing was installed.'}
  Move-Item -LiteralPath $pendingArchive -Destination $archive -Force
 }
 Write-Host 'Archive SHA-256 verified.'
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $package=Join-Path $cache 'package';Assert-SafeDownloadPath $package
 if(!(Test-Path -LiteralPath $package)){
  $zip=[IO.Compression.ZipFile]::OpenRead($archive)
  try{
   if($zip.Entries.Count -gt 10000){throw 'Archive has too many entries.'}
   [long]$unpacked=0
   foreach($entry in $zip.Entries){
    $name=$entry.FullName.Replace('\','/')
    if([IO.Path]::IsPathRooted($name) -or $name.Contains(':') -or @($name.Split('/')|Where-Object {$_ -eq '..' -or $_ -eq '.'}).Count -gt 0 -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Archive contains an unsafe path or symbolic link.'}
    $unpacked+=$entry.Length
    if($unpacked -gt $volume.AvailableFreeSpace-64MB){throw 'Not enough space to extract the archive.'}
   }
  }finally{$zip.Dispose()}
  [IO.Compression.ZipFile]::ExtractToDirectory($archive,$package)
 }
 # Validate every executable/script against checksums from the verified archive before any package code runs.
 $checked=Test-ExtractedPackage $archive $package
 Write-Host "Verified BeastCloud $($checked.version) package: $package"
 $installer=Join-Path $package 'scripts/Install.ps1'
 $packageArgument=''
 if($manifest.installerPatch){
  $patch=$manifest.installerPatch
  if($patch.version -ne '0.1.2' -or @($patch.files).Count -ne 4){throw 'Unsupported installer patch metadata.'}
  $patchRoot=Join-Path $cache ('installer-'+$patch.version)
  Assert-SafeDownloadPath $patchRoot
  New-Item -ItemType Directory -Path $patchRoot -Force|Out-Null
  $seen=@{}
  foreach($file in @($patch.files)){
   if($file.name -cnotin @('Install.ps1','InstallerSupport.ps1','Get-BeastCloud.ps1','GITHUB-INSTALL.md') -or $seen.ContainsKey($file.name) -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or [long]$file.bytes -lt 1 -or [long]$file.bytes -gt 512KB){throw 'Invalid installer patch file.'}
   $seen[$file.name]=$true
   Get-VerifiedFile "$base/installer/$($file.name)" (Join-Path $patchRoot $file.name) ([long]$file.bytes) $file.sha256
  }
  $installer=Join-Path $patchRoot 'Install.ps1'
  $packageArgument=' -PackagePath "'+$package+'"'
  Write-Host 'Verified installer revision 0.1.2. Reusing the existing application package.'
 }
 if($DownloadOnly){Write-Host 'Download and extraction complete. No service, account, certificate or installation was changed.';return}
 $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$installer+'" -Root "'+$Root+'" -Port '+$Port
 $arguments+=$packageArgument
 if($Storage){$arguments+=' -Storage "'+$Storage+'"'}
 Write-Host 'Starting the local Windows installer. A UAC prompt may appear.'
 $process=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -NoNewWindow -Wait -PassThru
 if($process.ExitCode -ne 0){throw "Windows installer failed (exit $($process.ExitCode)). The verified package remains at $package. The detailed error and temporary setup-log path are printed above."}
 Write-Host "Installation succeeded. Open https://localhost:$Port"
}catch{Write-Error -ErrorAction Continue $_.Exception.Message;exit 1}
