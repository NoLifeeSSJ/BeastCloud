# Backup, restore, export and account recovery

## Back up

Backups are local directories with a SQLite backup-API snapshot, every referenced original/version/trash blob, necessary configuration and TLS keys, and a SHA-256 file manifest. Files are immutable, and the write gate is held across database snapshot and file enumeration/copy so the recovery set is consistent. A verified job is recorded only after manifest hashes and SQLite integrity checks succeed. Interrupted `.partial` directories are never reported as completed backups.

Use Backups → Back up now, or elevated `Maintain.ps1 -Action backup`. The maintenance command stops the service before invoking its exclusive backup mode, then restarts it. UI backups remain online but serialize mutations for their duration. Transfers can pause while a large backup runs. Choose an existing owned external disk/NAS folder and an interval in Settings; grant only the service's required permissions. A virtual service account uses the machine identity for domain NAS authentication; workgroup NAS accounts may require a separately administered least-privilege service identity. Do not put credentials in scripts or chat. This installer does not request a NAS password.

Default interval 0 = manual; default 14 verified backups retained (0 = no automatic removal). Scheduling runs while the service is awake; failures appear under Backups and Activity. Disconnected backup targets fail instead of falling back to the system disk. The default C: backup folder does not protect against C: disk failure. Keep another owned, preferably offline/offsite copy where appropriate.

## Verify and restore to a different location

```powershell
C:\BeastCloud\scripts\Maintain.ps1 -Action verify -Source 'E:\Backups\20261024-120000-12345678'
C:\BeastCloud\scripts\Maintain.ps1 -Action restore -Source 'E:\Backups\20261024-120000-12345678' -Destination 'D:\BeastCloud-Restore-Test'
```

These example snapshot names must be replaced by an actual directory listed in Backups. Restore requires an empty/new destination. Checksums and SQLite integrity are checked before copying, path escapes and symlinks are rejected, and restored sessions/devices are revoked. Regenerated caches are optional. The restored database contains accounts, notes, tasks, events, shares and file-version/trash references. Configuration TLS paths are rewritten and the LAN endpoint removed for validation. PFX trust/hostnames must be checked on a different computer. Storage is rebound to the new destination's data\files.

To functionally verify, stop any process using the destination root; in elevated PowerShell set `$env:BEAST_ROOT='D:\BeastCloud-Restore-Test'` and launch the trusted packaged server with `--contentRoot` set to its server folder. The restored production config uses localhost TLS on its configured port; stop the original service or deliberately configure another loopback HTTPS port. Log in, download and hash a representative original, restore a version and inspect notes/tasks/calendar. To replace the active installation, preserve the original, deliberately relocate the verified restore, update the protected storage/TLS paths and service environment/ACLs, and run repair with the matching package. Never copy a restored database over a running service. No in-place destructive restore button is offered.

A full generated-fixture restore and checksum comparison are automated on Linux. A separate Windows restore/repair procedure remains unverified until run on Windows.

## Encrypted backup export

```powershell
C:\BeastCloud\scripts\Maintain.ps1 -Action encrypt -Source 'E:\Backups\actual-snapshot' -Destination 'E:\Protected\snapshot.beast'
C:\BeastCloud\scripts\Maintain.ps1 -Action decrypt -Source 'E:\Protected\snapshot.beast' -Destination 'D:\Decrypted-Backup'
```

Enter a unique passphrase of at least 16 characters when prompted; it is not placed on the command line or logged. Encryption uses the maintained .NET cryptography implementation: PBKDF2-HMAC-SHA256 (600,000 iterations, random 32-byte salt), AES-256-GCM, random per-chunk nonces, authenticated chunk ordering and authenticated end marker. This is a documented BeastCloud format, not claimed compatibility with another backup tool. Wrong passwords, modified chunks, truncation and trailing content fail validation. Keep the passphrase in a separate owned recovery location. Losing it makes that export unrecoverable. The original unencrypted local backup still needs restricted filesystem access. Encrypted export stages a temporary unencrypted ZIP on the local OS temporary volume and removes it afterward; use disk encryption if residual media access is a concern.

## Ordinary-file export

Settings → Export all data asks for a **new absolute destination folder** under an existing separate parent. The job copies active original files into their normal logical folder structure, with Markdown notes, JSON records and an iCalendar file under `.beastcloud-records`. It does not destroy source files. Review progress/failures in Activity. This makes active files readable without BeastCloud. Use a full backup, not export, to preserve accounts, revisions, trash and settings.

## Account and key recovery

Use the sign-in page's recovery flow with the local account name, one unused recovery code and a new 12+ character password. It consumes the code, clears TOTP and invalidates existing sessions. No external provider/email participates. If all codes and the password are lost, restore a known protected backup; there is deliberately no unauthenticated reset endpoint. Keep codes and a verified backup outside the server disk.

Server secrets are protected by installation ACLs, not advertised as end-to-end encryption. TLS PFX password/config and account records must remain together in a protected recovery set. Device bearer credentials are protected by Windows DPAPI for the logged-in user and do not migrate as raw tokens: revoke and re-pair on a different Windows account/computer. Restored servers invalidate device credentials intentionally. BitLocker can protect powered-off disks, but enabling it and managing its recovery keys are the owner's separate responsibility; BeastCloud never enables it automatically.
