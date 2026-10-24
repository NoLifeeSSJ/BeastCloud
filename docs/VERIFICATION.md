# Verification and Windows acceptance

The execution host is Linux x64 with .NET SDK 10.0.402 / runtime 10.0.10, Node 24.19.0, npm 11.9.0, Python 3.12.14, 5 exposed CPU slots, approximately 34 GB reported memory and a 32-GB overlay volume (about 30 GB initially free). This is a cloud development fixture, not a benchmark of the owner's Windows disks. No personal data was used. Test secrets and disposable roots are generated locally.

## Automated checks actually run

See `docs/test-results.json` for the final recorded outcome/counts. Commands:

```bash
dotnet build BeastCloud.sln
python3 tests/integration.py
dotnet test tests/BeastCloud.Tests
npm --prefix src/web run build
npm --prefix src/web test
cd src/web && npx playwright test
```

* HTTP integration exercises the real server with SQLite and filesystem data, including a server restart mid-upload (5 MiB fixture), offset recovery, duplicate commits, corrupted/out-of-order chunks, authorization, CSRF, unsafe Windows names, Unicode case collisions, missing volumes, symlink escapes, versions/trash bytes, persisted records/ICS, restricted and bearer sharing, revocation, scoped devices, search, generated PNG thumbnails, full backup/restore, encryption/tampering, byte ranges, attachment safety, session expiry/logout, upload disk-space bounds, unsupported schema failure, TOTP/recovery and rate limiting, recursive copies, ZIP bytes and folder-scoped search.
* Core tests exercise generated storage roots, Windows names, symlink refusal, nonempty restore protection, calendar rule parsing and encrypted backup integrity. Companion protocol tests use a deterministic HTTP fixture to exercise persisted offsets across restart (5 MiB fixture), repeated reconciliation without duplicate commit, local/remote conflict preservation, explicit deletion through server trash and missing-drive suspension. A mock protocol is not a real second Windows device.
* Frontend tests define the fixed-UTC recurrence contract, monthly clamping, bounded recurrence expansion, date-window/count rules, timezone conversion and byte formatting.
* Browser checks use real locally served production assets at **1440×1100** and **390×844**, perform upload/preview and note autosave, visit main screens, check horizontal overflow/theme/navigation and assert no third-party asset requests. Actual screenshots are generated under ignored `test-results` solely from these fixtures, not shipped as fabricated product demonstrations.
* Official PowerShell 7.5.4 parses all `.ps1` files without syntax errors; the local manifest checker is exercised against the release. This does **not** substitute for native Windows PowerShell 5.1/SCM/ACL/certificate execution.
* Windows x64 self-contained publish creates actual PE server/companion executables, runtime DLLs, native libraries and static web assets; manifest/ZIP validation checks all entries and their hashes. Linux diagnostic startup is separately tested. Cross-publishing is not a Windows installation test.
* NuGet/npm audits are time-specific and include transitive dependencies; final summary is in test-results.json. Build/test tools are distinct from runtime dependencies.

Observed durations are recorded by the runners rather than presented as performance promises. Representative fixtures are 5 MiB uploads, a generated tiny PNG, short text/media-range fixtures and a few dozen metadata records. No large-library or disk-throughput claims are made.

## Required Windows checks: unverified here

Use a disposable Windows 11 x64 VM or owned test machine with snapshots; never destructive-test personal files. Run native Windows PowerShell 5.1, not just PowerShell 7.

1. Check OS/build/architecture, Get-PSDrive free space, elevated identity and `Get-NetTCPConnection -State Listen -LocalPort 5443`. Extract the delivered ZIP to an ordinary local folder. Run the exact README single command. Verify exit code 0, useful log, certificate trust, `Get-Service BeastCloud`, service identity `NT SERVICE\BeastCloud`, automatic start and trusted `Invoke-RestMethod https://localhost:5443/api/health`.
2. Read config\setup.key locally, create owner and save recovery codes. From a second LAN client, verify `/api/setup` cannot claim even when given a key. Verify CSRF errors and anonymous/restricted denial for content, versions, search, thumbnails and ZIP routes. No certificate-validation bypass is permitted.
3. Upload a known file and note its SHA256, create a note/task/event, replace file content and trash/restore it. Rerun the identical installer command/arguments; log in with the same account and compare all bytes/records. Reboot. Without leaving a terminal open, verify automatic service start and data persistence. Kill the service process and observe configured crash recovery.
4. Disconnect external internet, retaining loopback/LAN. Sign in and exercise files, records, previews, search, calendar and backup. Inspect browser Network for same-origin application assets only. This test does not claim the operating system/browser itself has no unrelated traffic.
5. On a disposable small VHD/volume, interrupt a 1+ GiB resumable transfer; restart service/device and resume. Fill the staging/managed disk and detach a configured managed volume. Confirm understandable errors, no replacement root, no silent commit, no mass deletion and intact prior files. Reattach and compare checksums.
6. Pair a second Windows device using the companion and explicit folder selection. Verify DPAPI protection and user-logon task. Exercise all three directions, ignored files, pause/revoke, interruption/restart, locked files, USB disconnection, concurrent edits/conflicts and explicit deletion propagation off/on. Verify both conflict copies and local/server trash protections. Never test against drive roots.
7. Create restricted accounts and expiring/password shares, verify allowed reads/explicit <=4-MiB writes and denials outside grants, and verify revocation/expiry. Test filenames with Unicode case pairs, ADS, device/UNC paths and a controlled junction under the managed tree. Confirm no escape or unauthorized preview/snippet.
8. Create backup to a different owned disk; verify hashes/database, restore into a separate empty root and functionally start the restored server on an isolated loopback port using the preserved trust. Verify original/version bytes, note/task/calendar/export contents and revoked sessions/devices. Exercise encrypted export with correct/wrong password and corrupted chunks.
9. Update from a copied local package, verify pre-update checkpoint and data/account preservation. Simulate unsupported schema only in a disposable copy and verify failure retains database/user records. Restore its matching checkpoint before rollback. Corrupt a package file and confirm installer rejection before a service switch. Exercise interrupted installation and rerun/repair.
10. Uninstall; verify service removal and preserved configuration, database, originals and backups. Remove only the installation-specific certificate trust entry and optional sync task deliberately. Do not delete user data as part of uninstall.

Fresh-machine/reboot/second-device/private-LAN/physical-drive failure and Windows update/repair/uninstall results must remain **unverified** until these procedures are executed on Windows. The original full specification also contains the explicitly listed scope gaps in FEATURES.md; passing this portable suite does not close those gaps.

## Installer revision 0.1.1 regressions

`PWSH=/path/to/pwsh python3 tests/installer_support.py` passes 5 portable helper tests; `PWSH=/path/to/pwsh python3 tests/github_installer.py` passes 10 downloader tests. These reproduce and fix the certificate-extension string/array bug, prove early failures create diagnostics before a root installation exists, verify known-secret redaction and symlink refusal, and verify checksum-protected installer metadata without executing patch code in DownloadOnly mode. These are SHA-256 integrity checks, not a digital signature. The application ZIP and its four parts are unchanged; no backend behavior was altered. Native Windows installer execution remains a separate check.
