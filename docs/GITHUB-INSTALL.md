# Install directly from GitHub

The source and verified Windows offline bundle are stored in `NoLifeeSSJ/BeastCloud`.
The GitHub release-upload API was blocked in the cloud workspace. To deliver the already-built package without requiring another download/extraction step from chat, this version stores it under `distribution/0.1.0` as four parts below GitHub's per-file limit. `download.json` records their order, sizes, individual SHA-256 hashes and whole-archive hash. These are integrity checks, not a fabricated signing claim.

Open **64-bit Windows PowerShell** on Windows 11 or Server 2022+ and paste this one command:

```powershell
& { $ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $p=Join-Path $env:TEMP ('BeastCloud-'+[guid]::NewGuid().ToString('N')+'.ps1'); try { Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/NoLifeeSSJ/BeastCloud/v0.1.0/scripts/Get-BeastCloud.ps1' -OutFile $p; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; if($LASTEXITCODE -ne 0){throw "BeastCloud installer failed ($LASTEXITCODE)"} } finally { if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force} } }
```

It downloads the bootstrap from the version tag over trusted HTTPS, downloads and verifies each part, combines/verifies the complete ZIP, safely extracts it, checks the package manifest and invokes the existing Windows installer. A UAC prompt is expected. No Git, Node, .NET SDK, manual ZIP handling, GitHub account or token is required for the public repository download. The execution-policy setting is limited to the installer process; TLS validation remains enabled.

Default application root: `C:\BeastCloud`. Default original storage: `C:\BeastCloud\data\files`. Default backups: `C:\BeastCloud\backups`. The service binds loopback HTTPS only. After installation open `https://localhost:5443` and read the protected `C:\BeastCloud\config\setup.key` locally to create the owner. Existing unrelated directories are refused; reinstalling a marked installation preserves accounts and data.

For another explicitly chosen managed disk, save the bootstrap locally and invoke it with `-Storage 'D:\BeastCloudData'`. `-Root` and `-Port` are also available; pass the same arguments when rerunning. Changing a live storage/network binding is deliberate maintenance, not an automatic move. LAN mode is not enabled by the bootstrap.

## Interrupted downloads and verification

Verified parts/archive are cached under `%LOCALAPPDATA%\BeastCloud\Downloads\0.1.0-<archive-hash-prefix>`. Downloads retry up to three times. Rerunning reuses only entries whose size and hash match; an invalid cache path/reparse point is refused. No code in the package executes before the enclosing ZIP hash is verified. The extracted file manifest is checked again on every invocation. If extracted files have been changed or an extraction was interrupted, delete only that isolated download cache directory and rerun; never delete C:\BeastCloud to troubleshoot a download.

You can run the saved script with `-DownloadOnly` to verify/extract without installing. This works in PowerShell 7 on Linux too and is used for transport/validation testing; it does not verify Windows SCM, UAC, ACLs or certificates. For a fixed source snapshot, `-SourceRef` accepts a full commit SHA instead of the version tag.

GitHub is used to obtain the software, not to host your running cloud. After download, the local package can be copied to another owned Windows computer and installed offline using README's local installer command. No personal files, live databases, setup secrets, keys, accounts or backup contents are included in the repository. Source development caches are omitted too.

This remains the same initial 0.1.0 application. The portable application tests passed, but native Windows installation/reboot/second-device acceptance and the feature gaps in FEATURES.md remain unverified/outstanding. Providing a GitHub installer does not change that status.
