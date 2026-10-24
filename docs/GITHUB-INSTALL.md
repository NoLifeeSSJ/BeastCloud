# Install directly from GitHub

The source and verified Windows offline bundle are stored in `NoLifeeSSJ/BeastCloud`.
The GitHub release-upload API was blocked in the cloud workspace. To deliver the already-built package without requiring another download/extraction step from chat, this version stores it under `distribution/0.1.0` as four parts below GitHub's per-file limit. `download.json` records their order, sizes, individual SHA-256 hashes and whole-archive hash. These are integrity checks, not a fabricated signing claim.

Open **64-bit Windows PowerShell** on Windows 11 or Server 2022+ and paste this one command:

```powershell
& { $ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $p=Join-Path $env:TEMP ('BeastCloud-'+[guid]::NewGuid().ToString('N')+'.ps1'); try { Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/NoLifeeSSJ/BeastCloud/v0.1.1/scripts/Get-BeastCloud.ps1' -OutFile $p; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; if($LASTEXITCODE -ne 0){throw "BeastCloud installer failed ($LASTEXITCODE)"} } finally { if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force} } }
```

It downloads the bootstrap from the version tag over trusted HTTPS, downloads and verifies each part, combines/verifies the complete ZIP, safely extracts it, checks the package manifest and invokes the existing Windows installer. A UAC prompt is expected. No Git, Node, .NET SDK, manual ZIP handling, GitHub account or token is required for the public repository download. The execution-policy setting is limited to the installer process; TLS validation remains enabled.

Default application root: `C:\BeastCloud`. Default original storage: `C:\BeastCloud\data\files`. Default backups: `C:\BeastCloud\backups`. The service binds loopback HTTPS only. After installation open `https://localhost:5443` and read the protected `C:\BeastCloud\config\setup.key` locally to create the owner. Existing unrelated directories are refused; reinstalling a marked installation preserves accounts and data.

For another explicitly chosen managed disk, save the bootstrap locally and invoke it with `-Storage 'D:\BeastCloudData'`. `-Root` and `-Port` are also available; pass the same arguments when rerunning. Changing a live storage/network binding is deliberate maintenance, not an automatic move. LAN mode is not enabled by the bootstrap.

## Installer repair revision 0.1.1

Revision 0.1.1 keeps application 0.1.0 and the original archive/parts unchanged, so an existing successful download is reused. The versioned download manifest also lists four small installer/support files with individual sizes and SHA-256 hashes. The bootstrap verifies them before executing the corrected installer against the verified original application package. No files in the immutable cached package are patched in place, and v0.1.0's tag is not replaced.

The certificate SAN extension is now built as one string before adding it to the extension array. The earlier comma/concatenation expression incorrectly produced separate extension values. Temporary diagnostics are created before preflight, errors include the failing stage, elevated installer failures are returned to the calling console, and the launcher keeps non-elevated output in the same window. Setup diagnostics contain operation/error messages, not password/configuration dumps. The root installation log is written in UTF-8 consistently.

To retry after an early failure, run the new command above, preferably in PowerShell as Administrator. It preserves marked installations/accounts/data and keeps the usual refusal of unrelated nonempty directories. A fresh diagnostic is printed as `%TEMP%\BeastCloud-setup-<id>.log`; this works even when C:\BeastCloud does not exist or its protected logs are not readable. If another Windows-specific issue occurs, report the `FAILED during ...` line and nearby diagnostics. Never delete an existing installation to clear a download error.

Five portable helper regressions and ten downloader regressions cover the certificate string, early diagnostic logging, secret redaction, log symlinks, download/cache integrity and verified installer overlays. Windows SCM/certificate creation itself still requires a Windows execution test.

## Offline installation with the repair

After running the new bootstrap with `-DownloadOnly`, copy the entire verified cache directory (or its `package` and `installer-0.1.1` folders together) to an owned offline Windows computer. From the directory containing those two folders run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\installer-0.1.1\Install.ps1" -PackagePath ".\package"
```

The fixed installer checks the original package without changing its cached files. Do not run the old archive's `package\scripts\Install.ps1` directly. The app remains version 0.1.0; this is installer revision 0.1.1. Temporary setup diagnostics stay in the caller's local TEMP folder for troubleshooting and can be removed after the issue is resolved.

## Interrupted downloads and verification

Verified parts/archive are cached under `%LOCALAPPDATA%\BeastCloud\Downloads\0.1.0-<archive-hash-prefix>`. Downloads retry up to three times. Rerunning reuses only entries whose size and hash match; an invalid cache path/reparse point is refused. No code in the package executes before the enclosing ZIP hash is verified. The extracted file manifest is checked again on every invocation. If extracted files have been changed or an extraction was interrupted, delete only that isolated download cache directory and rerun; never delete C:\BeastCloud to troubleshoot a download.

You can run the saved script with `-DownloadOnly` to verify/extract without installing. This works in PowerShell 7 on Linux too and is used for transport/validation testing; it does not verify Windows SCM, UAC, ACLs or certificates. For a fixed source snapshot, `-SourceRef` accepts a full commit SHA instead of the version tag.

GitHub is used to obtain the software, not to host your running cloud. After download, the local package can be copied to another owned Windows computer and installed offline using README's local installer command. No personal files, live databases, setup secrets, keys, accounts or backup contents are included in the repository. Source development caches are omitted too.

This remains the same initial 0.1.0 application. The portable application tests passed, but native Windows installation/reboot/second-device acceptance and the feature gaps in FEATURES.md remain unverified/outstanding. Providing a GitHub installer does not change that status.
