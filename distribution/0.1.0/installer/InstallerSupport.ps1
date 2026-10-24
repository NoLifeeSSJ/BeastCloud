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
