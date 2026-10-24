#requires -Version 5.1
# Shared installer helpers. This file never reads or prints application configuration.
function Write-BeastSetupLog {
 param([string]$Path,[string]$Message,[string[]]$Secrets=@())
 foreach($secret in $Secrets){if(![string]::IsNullOrEmpty($secret)){$Message=$Message.Replace($secret,'[redacted]')}}
 if(Test-Path -LiteralPath $Path){$item=Get-Item -LiteralPath $Path -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing a reparse-point setup log.'}}
 $line=[DateTimeOffset]::UtcNow.ToString('O')+' '+$Message+[Environment]::NewLine
 [IO.File]::AppendAllText($Path,$line,[Text.UTF8Encoding]::new($false))
}
function New-BeastCertificateParameters {
 param([string]$ComputerName,[string]$LanAddress='', [switch]$Lan)
 if([string]::IsNullOrWhiteSpace($ComputerName)){$ComputerName=[Environment]::MachineName}
 # Build SAN as a scalar first: PowerShell's comma/+ precedence otherwise splits it.
 $san='2.5.29.17={text}DNS=localhost&DNS='+$ComputerName+'&IPAddress=127.0.0.1'
 if($Lan){$san+='&IPAddress='+$LanAddress}
 return @{
  Type='Custom';Subject='CN=BeastCloud local server';HashAlgorithm='SHA256'
  KeyUsage=@('DigitalSignature','KeyEncipherment');CertStoreLocation='Cert:\LocalMachine\My'
  KeyExportPolicy='Exportable';NotAfter=(Get-Date).AddYears(2);FriendlyName='BeastCloud local TLS'
  KeyAlgorithm='RSA';KeyLength=3072
  TextExtension=@('2.5.29.37={text}1.3.6.1.5.5.7.3.1',$san)
 }
}
function Grant-BeastTreeAccess {
 param([string]$Path,[string[]]$Identities,[ValidateSet('F','RX','M')][string]$Rights,[switch]$Protect,[string]$LogPath='')
 # icacls ignores directory inheritance flags on files. Combining those flags
 # with /inheritance:r /T left existing files with an empty DACL on Windows.
 # First grant effective rights to every object, then add propagation on directories.
 $arguments=@($Path)
 $arguments+='/grant:r'
 foreach($identity in $Identities){$arguments+=($identity+':'+$Rights)}
 $arguments+=@('/T','/C','/L')
 $result=& icacls.exe @arguments
 $exitCode=$LASTEXITCODE
 if($LogPath){$result|Out-File -LiteralPath $LogPath -Encoding UTF8 -Append}
 if($exitCode -ne 0){throw "Unable to grant $Rights access to $Path (icacls exit $exitCode)."}
 if($Protect){
  # Install explicit file grants BEFORE removing inheritance. Service-created
  # files otherwise lose the administrator's WRITE_DAC during the same command.
  # Already broken files owned by the virtual account need targeted ownership
  # recovery; icacls can silently skip their empty DACLs during tree traversal.
  foreach($file in Get-ChildItem -LiteralPath $Path -File -Recurse -Force){
   if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Reparse point refused: $($file.FullName)"}
   $acl=Get-Acl -LiteralPath $file.FullName
   if($acl.AreAccessRulesProtected -and @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])).Count -eq 0){
    $result=& takeown.exe /F $file.FullName /A
    $exitCode=$LASTEXITCODE
    if($LogPath){$result|Out-File -LiteralPath $LogPath -Encoding UTF8 -Append}
    if($exitCode -ne 0){throw "Unable to recover administrative ownership of $($file.FullName)."}
    $repair=@($file.FullName,'/grant:r')
    foreach($identity in $Identities){$repair+=($identity+':'+$Rights)}
    $repair+='/L'
    $result=& icacls.exe @repair
    $exitCode=$LASTEXITCODE
    if($LogPath){$result|Out-File -LiteralPath $LogPath -Encoding UTF8 -Append}
    if($exitCode -ne 0){throw "Unable to recover file permissions for $($file.FullName)."}
   }
  }
  $result=& icacls.exe $Path /inheritance:r /T /C /L
  $exitCode=$LASTEXITCODE
  if($LogPath){$result|Out-File -LiteralPath $LogPath -Encoding UTF8 -Append}
  if($exitCode -ne 0){throw "Unable to protect inherited permissions for $Path."}
 }
 $directories=@((Get-Item -LiteralPath $Path -Force))+@(Get-ChildItem -LiteralPath $Path -Directory -Recurse -Force)
 foreach($directory in $directories){
  if($directory.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Reparse point refused: $($directory.FullName)"}
  $arguments=@($directory.FullName,'/grant:r')
  foreach($identity in $Identities){$arguments+=($identity+':(OI)(CI)'+$Rights)}
  $arguments+='/L'
  $result=& icacls.exe @arguments
  $exitCode=$LASTEXITCODE
  if($LogPath){$result|Out-File -LiteralPath $LogPath -Encoding UTF8 -Append}
  if($exitCode -ne 0){throw "Unable to grant inherited $Rights access to $($directory.FullName) (icacls exit $exitCode)."}
 }
}
function Repair-BeastInstallationMarkerAccess {
 param([string]$Path,[string]$SetupLogPath)
 # A previous installer could remove every ACE from this marker before failing.
 # Recover only that exact, locally owned, protected empty-DACL file so preflight
 # can read it. Ordinary/unmarked directories are still refused before tree repair.
 $parent=Split-Path $Path -Parent
 if(!(Test-Path -LiteralPath $parent -PathType Container)){return}
 $item=Get-ChildItem -LiteralPath $parent -Force|Where-Object {$_.Name -ceq 'installation.json'}|Select-Object -First 1
 if(!$item){return}
 if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe installation marker.'}
 $acl=Get-Acl -LiteralPath $Path
 $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
 $current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if($acl.AreAccessRulesProtected -and @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])).Count -eq 0 -and $owner -in @('S-1-5-32-544',$current)){
  $result=& icacls.exe $Path /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' /L
  if($LASTEXITCODE -ne 0){throw 'Unable to recover administrator access to the installation marker.'}
  Write-BeastSetupLog -Path $SetupLogPath -Message 'Recovered the installation marker permissions left by an earlier installer.'
 }
}
