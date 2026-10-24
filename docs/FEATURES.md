# Feature and format matrix / implementation checklist

Status refers to implemented behavior, not an assertion that Windows deployment has been verified. This is an initial release with the explicit scope bounds below; it does not silently mark the entire original specification accepted.

| Area | Implemented | Bounds / outstanding work |
|---|---|---|
| Service & offline runtime | Self-contained Windows x64 ASP.NET Core, static React assets, SQLite, virtual service account, HTTPS installer, maintenance | Windows execution/reboot/SCM repair acceptance unverified on Linux |
| Owner & security | Local secret/loopback-only setup, password hashing, server sessions, CSRF, TOTP, one-use recovery codes, revocation, rate limits, headers | Full independent security audit outstanding; first-run personalization continues in Settings rather than a multipage wizard |
| Files | Folders/breadcrumbs, list/grid, name/recent/size sorting, filtering, selection, bulk trash/move, file/folder copy, rename, favourites/tags, download/details/checksums | Streamed bulk ZIP download (100 roots / 10,000 entries); no drag-and-drop directory traversal API; use the explicit folder picker |
| Transfers | Streaming 4-MiB chunks, offsets, checksums, commit retries, durable state, pause/reselect-to-resume, 48h expiration, reservation/free-space limits | Browser resume needs reselection of the same local file; browser cannot retain arbitrary filesystem access after closing |
| Recovery | Trash/restore, permanent leaf deletion, immutable file history/restore, configurable retention, ordinary folder export | Folder trash restoration is explicit parent-first; restored descendants are individually restored |
| Managed volumes | Explicit owned local managed root, configurable first-install disk, missing-volume sentinel | One managed root; simultaneous extra roots and read-only external libraries are not implemented |
| Photos | Chronological modified-date grid, albums, favourites, original download, local thumbnails, file metadata/checksum | No capture-date/EXIF editor, automatic orientation normalization, RAW/HEIC decoder or video thumbnail extraction |
| Previews | JPEG, PNG, GIF, WebP; PDF browser viewer; bounded text; MP3/WAV/OGG; MP4/WebM and range requests | Browser codec support varies. HTML/SVG/scripts/unknown formats download as attachments; no Office conversion/OCR/transcoding |
| Notes | Portable Markdown source editor, safe plain rendering, autosave status, tags, attachments by file identity, revisions and Markdown/JSON export | No rich Markdown renderer; attachment selection currently uses explicit file identities |
| Tasks | Lists, due dates, priorities, completion, text search and status filter | No collaboration/delegation or external task integrations |
| Calendar | CRUD, month/week/day views, timezone instants, UTC fixed-time daily/weekly/monthly counts (1–366), local upcoming reminders, ICS import/export | Monthly dates clamp. No BYDAY/EXDATE/UNTIL or floating/all-day/TZID imports. Unsupported import rejects the batch. Reminders require an open calendar page; recurrence is fixed UTC, not DST-wall-clock recurring rules |
| Search | Persisted FTS5 of names/tags/notes/tasks/events and text <=1 MiB, type/date/tag/folder filters, durable rebuild/status | No OCR/semantic search, binary document extraction or cross-user private-result discovery |
| Windows sync | Real CLI companion, pairing/revocation/scope, selected root, three directions, pause/ignore/state, chunks/ranges, backoff/watcher/reconciliation, conflicts, protected explicit deletions | Protocol fixtures pass; actual DPAPI/Windows devices/logon tests unverified. Local rename can preserve an old remote identity; no tray GUI |
| Sharing | Restricted local accounts, explicit file grants, revocation/expiration, read-only secret links, optional link passwords, audit | Individual files only. Authenticated write replacement capped at 4 MiB. Links need owned-network reachability/trust |
| Backups | Consistent online SQLite snapshot + immutable blobs/config, verification/history, scheduling/retention, owned destinations, separate restore, encrypted export | No in-place restore wizard. Workgroup NAS may need separately administered service identity. Physical-drive failure/reboot tests unverified |
| Operations | Durable sequential jobs, finite retries, logs separate from audit, bounded cache/staging, schema guard, local checkpointed updates | No automatic cert renewal, remote upgrade channel, or claimed signed release. Large libraries beyond view caps need pagination work |
| Interface | Responsive navigation, real empty/error/loading states, desktop/mobile checks, light/dark, labels/focus, no third-party assets | English interface; language/date preferences are stored, full translations/date-format application pending |

## Stage checklist

- [x] Inspect actual environment; preserve empty checkout and record architecture.
- [x] Implement native-service host, Windows installer, owner setup and authentication.
- [x] Implement safe immutable storage, streaming/recovery, trash and versions.
- [x] Connect the local interface, records, calendar, previews and search.
- [x] Implement optional Windows sync engine and controlled file sharing.
- [x] Implement backup verification, separate restore, encrypted export, update/repair scripts.
- [x] Build self-contained Windows server and companion; create checksum manifest and offline ZIP.
- [x] Run portable HTTP/storage/sync/browser checks; publish actual results in VERIFICATION.md.
- [ ] Execute Windows 5.1 clean-install/rerun/reboot/update/uninstall/certificate checks on owned Windows hardware.
- [ ] Execute real second-Windows-device DPAPI/LAN/offline sync and missing-drive tests.
- [ ] Finish the explicit scope gaps above before calling the complete original specification delivered.
