# Installation, repair and updates

Supported package target: Windows 11 x64 and Server 2022+ x64, native Windows PowerShell 5.1. Windows 10 is not a supported new-install target. Runtime is self-contained .NET 10.0.10; no runtime installer, Docker, Node, WSL or IIS is needed. Allow at least 2 GiB free on the installation and managed volumes, plus the actual files, staging, versions, and backup space you need. Port 5443 is checked before service changes. The installer inspects OS build, architecture, free space, root safety, existing markers, service ownership of occupied ports and elevation on the target machine.

Extract the local package outside C:\BeastCloud. Run the one command in README from that extracted folder. It refuses unrelated nonempty roots and managed-storage directories. It never scans entire disks. UAC restarts only the installer with correctly quoted arguments. Installation records a marker before provisioning so failed attempts can be diagnosed/retried without deleting data. The installer logs operational outcomes, not setup secrets or PFX passwords. Read the local setup key from the protected config folder; the key is deleted after owner creation.

## Windows-managed resources

* Service `BeastCloud`, automatic startup, virtual account `NT SERVICE\BeastCloud`, service SID and restart-after-crash policy.
* Service environment registry entry `HKLM\SYSTEM\CurrentControlSet\Services\BeastCloud\Environment`, containing the installation root (no user password).
* A specifically named installation certificate in the machine trusted-root store. Its private key is held only in the ACL-protected PFX after installation.
* Optional `BeastCloud Sync <profile>` per-user scheduled task, only if SyncStartup.ps1 is explicitly invoked.
* No firewall rule unless the owner explicitly follows NETWORK.md. No router changes.

Code folders grant the service read/execute; mutable data/config/log/backup folders grant Modify. Administrators and SYSTEM retain full access. External managed storage gets the same restricted ACL. Configuration requires service Modify for its instance lock and first-run secret; do not grant ordinary local users access. A hostile local administrator can access or change this application and its secrets. The program cannot prevent that.

## Status and troubleshooting

Run `scripts\Maintain.ps1 -Action status` elevated. Confirm the service account, marker availability, version and trusted HTTPS health response. Installation logs are under logs\install-*.log; application warnings are under logs\operations-*.log; service startup failures also appear in Windows Event Viewer. Configuration parsing, schema-version and missing-drive failures abort rather than initialize a new empty cloud. Check the configured drive before repair. Never edit or delete beast.db to fix a startup problem.

## Local package update

Keep your previous package. Run:

```powershell
C:\BeastCloud\scripts\Maintain.ps1 -Action update -Package 'D:\Packages\BeastCloud-0.1.0-win-x64'
```

This checks the new local manifest, stops the existing service, creates a verified recovery snapshot, installs executables to a fresh version directory, preserves mutable paths/accounts, updates the service and verifies HTTPS. On failure it attempts to return the service executable to its previous path; it does not overwrite or reset data. Failures before service switching leave the existing version intact. Old binaries remain under app for investigation. `-Action repair` uses the same validated local-package path and recovery process.

There are no destructive schema migrations in version 1. For future versions, changing the schema requires a tested migration and matching restore plan. Do not simply run older binaries against a newer schema: restore the matching checkpoint into a new location first. A simulated unsupported schema is tested to fail safely without deleting accounts. Windows SCM rollback and rerun behavior remain subject to target-machine acceptance tests.

## Uninstall

`Maintain.ps1 -Action uninstall` stops and deletes the service; it preserves code, config, all originals, metadata and backups. To reinstall, run the same package/arguments; retain the installation marker. Data deletion is a separate manual action after verified export/backup. Revoke device credentials, remove optional sync tasks and remove only the installation's certificate trust entry if you no longer need them.
