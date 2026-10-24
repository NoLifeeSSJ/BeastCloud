# Install directly from GitHub

The source and verified Windows offline bundle are stored in `NoLifeeSSJ/BeastCloud`.
The GitHub release-upload API was blocked in the cloud workspace. To deliver the already-built package without requiring another download/extraction step from chat, this version stores it under `distribution/0.1.0` as four parts below GitHub's per-file limit. `download.json` records their order, sizes, individual SHA-256 hashes and whole-archive hash. These are integrity checks, not a fabricated signing claim.

Open **64-bit Windows PowerShell** on Windows 11 or Server 2022+ and paste this one command:

```powershell
& { $ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $p=Join-Path $env:TEMP ('BeastCloud-'+[guid]::NewGuid().ToString('N')+'.ps1'); try { Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/NoLifeeSSJ/BeastCloud/v0.1.2/scripts/Get-BeastCloud.ps1' -OutFile $p; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; if($LASTEXITCODE -ne 0){throw "BeastCloud installer failed ($LASTEXITCODE)"} } finally { if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force} } }
```

It downloads the bootstrap from the version tag over trusted HTTPS, downloads and verifies each part, combines/verifies the complete ZIP, safely extracts it, checks the package manifest and invokes the existing Windows installer. A UAC prompt is expected. No Git, Node, .NET SDK, manual ZIP handling, GitHub account or token is required for the public repository download. The execution-policy setting is limited to the installer process; TLS validation remains enabled.

Default application root: `C:\BeastCloud`. Default original storage: `C:\BeastCloud\data\files`. Default backups: `C:\BeastCloud\backups`. The service binds loopback HTTPS only. After installation open `https://localhost:5443` and read the protected `C:\BeastCloud\config\setup.key` locally to create the owner. Existing unrelated directories are refused; reinstalling a marked installation preserves accounts and data.

For another explicitly chosen managed disk, save the bootstrap locally and invoke it with `-Storage 'D:\BeastCloudData'`. `-Root` and `-Port` are also available; pass the same arguments when rerunning. Changing a live storage/network binding is deliberate maintenance, not an automatic move. LAN mode is not enabled by the bootstrap.

## Installer repair revision 0.1.2

Revision 0.1.2 reuses the original 0.1.0 archive/parts and an existing successful download. The versioned manifest lists four small installer/support files and a 179-KiB repaired server DLL with individual sizes and SHA-256 hashes. The bootstrap verifies all five before executing the corrected installer against the original verified application package. The installer stages the repaired DLL in the new application directory. The cached package and older version tags are preserved.

The certificate SAN extension is now built as one string before adding it to the extension array. The earlier comma/concatenation expression incorrectly produced separate extension values. Temporary diagnostics are created before preflight, errors include the failing stage, elevated installer failures are returned to the calling console, and the launcher keeps non-elevated output in the same window. Setup diagnostics contain operation/error messages, not password/configuration dumps. The root installation log is written in UTF-8 consistently.

Revision 0.1.2 fixes the recursive permission command that removed inherited permissions from existing files while specifying grants that Windows applied only to directories. This left files such as `scripts\Build.ps1` and `config\installation.json` with an empty DACL, denying writes even to the elevated installer. The corrected helper grants effective file rights before applying directory inheritance. It restores administrator/SYSTEM rights and the required service read/modify rights during a retry. A narrowly scoped recovery handles an administrator-owned installation marker with that exact empty-DACL condition before reading preflight metadata; unrelated nonempty roots remain refused. Existing accounts, stored files and backups are preserved.

The service stops before permission changes and the pre-update checkpoint. Explicit administrator/SYSTEM file grants are installed before inherited grants are removed. For already damaged service-owned files with a protected empty DACL, recovery takes administrator ownership of those files and restores access; it does not change their contents.

The dedicated `NT SERVICE\BeastCloud` virtual account is configured through Windows Service Control Manager without a password. This also fixes the Windows WMI provider rejecting the earlier account-change request with return code 22. Failure to open a browser after successful installation no longer marks a healthy service as failed.

Each installer process selects TLS 1.2 for Windows PowerShell 5.1, including after elevation. Readiness probes the configured `127.0.0.1` HTTPS listener directly with certificate validation enabled and reports the last connection error if startup fails.

The runtime repair disables SQLite connection pooling for backup snapshots and verification. Disposing a pooled snapshot connection had left the database file open on Windows, preventing the completed backup directory from being renamed. The repair changes no database schema. Its staged runtime creates the pre-update checkpoint so an affected older runtime can also be updated safely. The app still reports 0.1.0; the installer/runtime repair revision is 0.1.2.

To retry after an early failure, run the new command above, preferably in PowerShell as Administrator. It preserves marked installations/accounts/data and keeps the usual refusal of unrelated nonempty directories. A fresh diagnostic is printed as `%TEMP%\BeastCloud-setup-<id>.log`; this works even when C:\BeastCloud does not exist or its protected logs are not readable. If another Windows-specific issue occurs, report the `FAILED during ...` line and nearby diagnostics. Never delete an existing installation to clear a download error.

Five portable helper regressions and eleven downloader regressions cover the certificate string, early diagnostic logging, secret redaction, log symlinks, cache integrity and installer/runtime overlays, including rejection of a corrupt server DLL. The [Windows Server 2022 run](https://github.com/NoLifeeSSJ/BeastCloud/actions/runs/40108174485) passed fresh installation, recovery from the earlier empty DACLs and a normal reinstall using Windows PowerShell 5.1, the virtual service account and trusted HTTPS. The test also verifies the pre-update backup and a preserved data sentinel. Windows 11, interactive UAC, reboot and second-device acceptance remain separate checks.

## Offline installation with the repair

After running the new bootstrap with `-DownloadOnly`, copy the entire verified cache directory (or its `package` and `installer-0.1.2` folders together) to an owned offline Windows computer. From the directory containing those two folders run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\installer-0.1.2\Install.ps1" -PackagePath ".\package" -RuntimePatchPath ".\installer-0.1.2\BeastCloud.Server.dll"
```

The fixed installer checks the original package without changing its cached files. Do not run the old archive's `package\scripts\Install.ps1` directly. The app remains version 0.1.0; this is installer revision 0.1.2. Temporary setup diagnostics stay in the caller's local TEMP folder for troubleshooting and can be removed after the issue is resolved.

## Interrupted downloads and verification

Verified parts/archive are cached under `%LOCALAPPDATA%\BeastCloud\Downloads\0.1.0-<archive-hash-prefix>`. Downloads retry up to three times. Rerunning reuses only entries whose size and hash match; an invalid cache path/reparse point is refused. No code in the package executes before the enclosing ZIP hash is verified. The extracted file manifest is checked again on every invocation. If extracted files have been changed or an extraction was interrupted, delete only that isolated download cache directory and rerun; never delete C:\BeastCloud to troubleshoot a download.

You can run the saved script with `-DownloadOnly` to verify/extract without installing. This works in PowerShell 7 on Linux too and is used for transport/validation testing; it does not verify Windows SCM, UAC, ACLs or certificates. For a fixed source snapshot, `-SourceRef` accepts a full commit SHA instead of the version tag.

GitHub is used to obtain the software, not to host your running cloud. After download, the local package can be copied to another owned Windows computer and installed offline using README's local installer command. No personal files, live databases, setup secrets, keys, accounts or backup contents are included in the repository. Source development caches are omitted too.

This remains the initial 0.1.0 application with the 0.1.2 installer/runtime repair. The recorded Server 2022 checks cover installation and repair; the broader Windows 11/reboot/second-device acceptance and the feature gaps in FEATURES.md remain outstanding.
