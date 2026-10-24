# BeastCloud

Your files, memories, and everyday plans, on hardware you own. BeastCloud is a local ASP.NET Core 10 / React / SQLite personal cloud with a native Windows service and optional selected-folder Windows sync companion. No hosted database, login provider, relay, analytics, CDN assets, API key, subscription, Docker, WSL, IIS, or Node runtime is required by the installed application.

**Release 0.1.0 is a working initial implementation, not a claim of production certification or complete acceptance on Windows.** The portable server and browser workflows have been exercised on Linux. Windows service installation, reboot recovery, certificate-store changes, Windows PowerShell 5.1 execution, and actual Windows-to-Windows DPAPI pairing still require the Windows acceptance procedure. Read [the feature matrix](docs/FEATURES.md) and [verification report](docs/VERIFICATION.md) before trusting it with your only copy of important data.

## Install directly from GitHub (no manual download or extraction)

Use the single Windows PowerShell command in [the GitHub installation guide](docs/GITHUB-INSTALL.md). It automatically downloads, verifies, combines and extracts the versioned Windows package, then runs the local installer. A UAC prompt is expected. No development tools or GitHub login are needed for this public download. Installer revision **0.1.1** fixes certificate generation and preserves visible setup diagnostics; it reuses the original verified application package.

## Install from the delivered offline package

For the **original v0.1.0 archive already uploaded to GitHub**, use the corrected GitHub installer above or copy the verified download cache's `package` and `installer-0.1.1` folders to the offline computer and follow the offline repair command in [GITHUB-INSTALL.md](docs/GITHUB-INSTALL.md). The original archive is preserved unchanged; its old installer has the certificate bug. Fresh builds from the current source include the corrected installer.

The generated local package is `releases/BeastCloud-0.1.0-win-x64.zip`. Its SHA-256 is in the adjacent `.zip.sha256`; the extracted package contains a per-file checksum manifest. These are integrity checks, **not a digital signature or independent proof of authenticity**. Obtain the package from a source you trust and compare the archive hash separately. There is no fabricated release/download URL.

Copy the ZIP to a Windows 11 x64 or Windows Server 2022+ x64 computer, extract it to an ordinary local folder (for example Downloads), open Windows PowerShell **in that extracted folder**, and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\Install.ps1"
```

This execution-policy setting applies to that process only. It does not change machine-wide policy. A UAC prompt is expected. The installer defaults to **C:\BeastCloud**, refuses unrelated nonempty directories, installs a self-contained service, creates a unique local TLS certificate, trusts that specific certificate on this computer, and checks HTTPS readiness. It opens **https://localhost:5443**. Read `C:\BeastCloud\config\setup.key` locally as an administrator and enter it in the setup page to create your owner account. Choose a 12+ character password; save the one-time recovery codes outside this computer. No email account is required.

Default original-file storage: **C:\BeastCloud\data\files**. Default backups: **C:\BeastCloud\backups**. The latter is a convenience recovery destination, not protection from failure of the same physical disk. Use Settings to choose an existing owned external drive or NAS backup folder and an interval. Backups need service-account permissions on that destination. See [backup and recovery](docs/RECOVERY.md).

To explicitly place managed originals on another local disk at first installation:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\Install.ps1" -Storage "D:\BeastCloudData"
```

Keep those same arguments when rerunning installation. Reruns preserve accounts and data and checkpoint an initialized installation. Data is not imported by scanning your drive. Existing content is copied through file/folder upload or the explicitly selected sync companion folder.

## Run and maintain

```powershell
C:\BeastCloud\scripts\Maintain.ps1 -Action status
C:\BeastCloud\scripts\Maintain.ps1 -Action restart
C:\BeastCloud\scripts\Maintain.ps1 -Action backup
C:\BeastCloud\scripts\Maintain.ps1 -Action update -Package "D:\Packages\BeastCloud-0.1.0-win-x64"
C:\BeastCloud\scripts\Maintain.ps1 -Action uninstall
```

Run service maintenance from elevated Windows PowerShell. Uninstall removes service registration and **preserves all files and accounts**. Data removal and removal of the specific certificate trust entry are separate deliberate actions. Review [installation](docs/INSTALLATION.md), [networking](docs/NETWORK.md), [sync](docs/SYNC.md), [storage](docs/ARCHITECTURE.md), [API](docs/API.md), and [security](docs/SECURITY.md).

## Reproduce the build

Build-time tools: .NET SDK **10.0.402** (`global.json`), Node **24.19.0**, npm **11.9.0**; Python 3.12+ for the Linux package builder/tests. .NET 10 is the LTS baseline; runtime packages are pinned to 10.0.10. NuGet and npm dependency locks are checked in. Package restoration and publishing download official NuGet/npm packages and .NET runtime packs. Runtime uses only owned storage and your configured BeastCloud server. Application telemetry and automatic update checks do not exist; unrelated Windows/browser network activity is outside application control.

On Windows with these development tools:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Build.ps1
```

On Linux: `bash scripts/build.sh` (publishes Windows and Linux diagnostic packages). Never run build/restore as part of normal installed operation.

For development, use the existing isolated checkout; do not create a worktree. Build the frontend (`npm --prefix src/web ci && npm --prefix src/web run build`), then:

```bash
export BEAST_ROOT="$PWD/.local/dev"
export ASPNETCORE_ENVIRONMENT=Development
export ASPNETCORE_URLS=http://127.0.0.1:5080
dotnet run --project src/BeastCloud.Server --no-launch-profile
```

The explicit Development environment permits loopback HTTP for disposable development only. Production rejects non-HTTPS requests. Never use Development on a network listener. The installed static frontend is served by the same server; a Vite development server is optional.

Tests: `dotnet test tests/BeastCloud.Tests`, `python3 tests/integration.py`, `npm --prefix src/web test`, and `cd src/web && npx playwright test`. Browser tests accept `CHROME_PATH` for an installed Chromium/Chrome executable. All fixtures and credentials are generated test data. See the verification report for exact results and Windows procedures.
