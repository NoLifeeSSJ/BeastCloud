# Windows selected-folder companion

The offline release includes `sync\BeastCloud.Sync.exe`, a self-contained native .NET console companion. It is separate from browser uploads and runs without a browser. It uses only your configured HTTPS BeastCloud server. Windows DPAPI CurrentUser protects its device credential; no token is stored in browser local storage. Native Android/iOS background backup is not provided.

## Pair an explicitly chosen folder

1. In Files, create a dedicated server folder. Open its details and copy its identity.
2. In Devices → Pair a device, enter its name, folder identity and direction: upload-only, download-only or two-way. Copy the one-use 10-minute pairing code.
3. On your Windows device, trust the installation's public certificate using NETWORK.md and choose an existing local folder. The companion will enumerate **only that selected folder**, not the drive.
4. Run:

```powershell
.\sync\BeastCloud.Sync.exe pair --url https://localhost:5443 --folder 'C:\Users\Me\ChosenFolder'
.\sync\BeastCloud.Sync.exe run
```

Replace the folder and, for another device, the server address with actual owned locations. Pairing prompts for the code rather than putting it on a command line. The default profile is `%LOCALAPPDATA%\BeastCloudSync\default`; use `--profile 'C:\ChosenProfile'` consistently for additional pairings. Only the selected folder receives a `.beastcloud-volume` sentinel; do not delete it. Profiles contain protected credentials, atomic reconciliation/transfer state, a process lock and protected local deletion recovery files.

To start at your user logon (not as an administrator/system task), explicitly install the optional task:

```powershell
.\scripts\SyncStartup.ps1 -Action install -Executable 'C:\Tools\BeastCloud\sync\BeastCloud.Sync.exe'
```

Use the actual extracted executable path and `-Profile` for nondefault profiles. `-Action remove` removes the task. The companion is user-session software; it does not claim to run while Windows is asleep or after user sign-out.

## Configuration, status and removal

`BeastCloud.Sync.exe status|pause|resume|once` accepts the same `--profile` option. `run` watches changes and also reconciles periodically; network failures back off from 10 seconds to 5 minutes. Server-side Pause and Revoke are available in Devices. A revocation immediately denies API calls. Multiple processes cannot reconcile the same profile simultaneously.

While paused, edit config.json in the profile to choose simple case-insensitive wildcard ignore patterns (`*`, `?`) and `PropagateDeletes`. It defaults to **false**. Do not manually edit the DPAPI token or sentinel binding. Pause on the server too if changing local configuration while a long reconciliation is in progress; configuration is reread between passes.

Uninstall/remove the startup task, revoke the device in the server UI, then deliberately remove its profile directory if desired. Neither `remove` nor task removal deletes selected files. Preserve the profile's local trash until recovery is no longer needed.

## Protocol and safety contract

The manifest carries stable item IDs, parent IDs, logical names, monotonically increasing file-content revisions, SHA-256 checksums and tombstones. Tokens are bound to a particular folder and direction. Server authorization checks the subtree for manifest content, downloads, folder creation, upload begins/commits and deletion. Pairing exchanges a hashed, expiring one-use invitation for a bearer credential whose verifier alone is persisted server-side.

Transfers use up to 4-MiB chunks, durable offsets and full-file checksums. Upload IDs persist before data transfer so restart can query offsets and resume. Downloads use range requests into sibling staging files, verify the complete checksum and rename into place. State writes are atomic. A file locked/changed during reading fails safely and retries. Deletion requires a completed local enumeration, present sentinel, successful authenticated server manifest and explicit propagation setting; absent counterpart records alone do not authorize deletion.

Two-way conflicting edits move the local content to a visible `name (conflict timestamp-id).ext`, download the remote revision, and upload the conflict copy. Conflicts persist in profile state/status. Explicit server deletion moves an unchanged local file to the profile's local trash; a changed local file is preserved as a conflict. Explicit local deletion sends a server trash operation only if the known remote revision has not changed. Server folders are not automatically physically removed from the local disk. Remote renames with a stable file identity move the matching unchanged local file. Local renames can create a new server identity; with deletion propagation off, the old server file is retained. This favors preservation over clever destructive inference.

Missing markers, reparse points, interrupted enumeration, authentication failure, disconnected drives or inaccessible folders suspend reconciliation. The client does not treat any of these as an empty folder. Ordinary Windows files are not executed. The companion refuses path escapes, alternate data streams and reserved Windows names received over the protocol.

The sync engine's upload/restart, download/conflict, explicit deletion and disconnected-volume behaviors are tested against a deterministic HTTP protocol fixture. Real Windows DPAPI, file locking, filesystem notifications, logon startup and second-device/LAN behavior require the Windows acceptance checklist. Do not interpret portable protocol tests as those device tests.
