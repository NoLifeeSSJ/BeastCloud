# Architecture, storage, and decisions

Inspected environment: Linux x64 cloud workspace, initially empty Git repository (unborn `work` branch), Node 24.19.0 / npm 11.9.0, Python 3.12.14, approximately 30 GiB initially free and 5 available processors. C:\BeastCloud and the user's Windows version, volumes, permissions, ports and prior installations are not accessible from here. The installer checks those on the actual target. No user data was present or imported.

## One service, three boundaries

* ASP.NET Core 10 serves a compiled React/TypeScript application and a same-origin JSON/streaming HTTP API. Production enforces HTTPS. No browser authentication secrets are put in local storage.
* SQLite is the authoritative metadata store, with WAL, foreign-key checks, parameterized queries, a schema-version guard and FTS5. An unsupported schema aborts startup rather than creating a replacement database. Version 1 is the initial migration, in `Database.Initialize`; later schema migrations must be explicit and transactional.
* A consistent `Storage` layer gives immutable blobs random identities, checks volume availability, Windows names, local roots, symlink/reparse points and free space. Logical user names never become physical blob paths. Directory structure lives in the database. Service ACLs protect the physical tree from unprivileged mutation.

Immutable blob commits make filesystem/database failure boundaries recoverable: a complete blob is flushed before a metadata transaction points to it. Offset metadata is advanced only after a chunk is flushed. Retry truncates any unacknowledged bytes back to the last durable offset. Commit IDs persist and are idempotent. A crash before metadata commit can leave an unreferenced blob, which is safe to collect later; it cannot silently replace a referenced original. Copy operations reuse immutable bytes. Replacements save previous blob references and revisions. Trash retains metadata and bytes. Permanent deletion and configured retention enqueue reference-aware collection.

A single in-process write gate serializes transfers, tree mutations, record revisions, workers, garbage collection and backup snapshots. A separate exclusive instance lock prevents another server or maintenance backup process from using the same root. All live data must remain on supported local NTFS/ReFS (or a local Linux filesystem for development); network live databases are rejected by the Windows storage policy. A NAS is a backup destination, not the live database location.

## Directories under C:\BeastCloud

| Directory | Contents / recovery role |
|---|---|
| `src` | Source when building from source; not required to run a package |
| `app/<version-timestamp>` | Immutable installed executables and bundled web assets |
| `config` | TLS PFX, protected server configuration, volume binding, installation marker, local setup key before registration, instance lock |
| `data/db` | SQLite metadata, sessions (hashed), accounts, records, revisions, FTS, audit, jobs, transfers |
| `data/files` or chosen local volume | Original immutable blobs and `.beastcloud-volume` sentinel |
| `data/versions`, `data/trash` | Reserved physical separation; this implementation stores versions/trash as database references to immutable managed blobs |
| `data/thumbnails` | Rebuildable local JPEG cache; default limit 512 MiB |
| `data/search` | Reserved extraction workspace; FTS index is in SQLite |
| `data/temp` | Upload staging and one bounded chunk per active write; abandoned transfers expire after 48 hours |
| `logs` | Separate operational logs (7-day / 10-MiB rotation) and installer logs; security audit remains in SQLite |
| `backups` | Default consistent recovery snapshots; move to an owned separate disk for disk-failure protection |
| `releases`, `scripts`, `docs` | Local packages and operator tools/documentation |

Back up via the backup feature: it includes the database (records and metadata), every referenced current/trash/version blob, and required TLS/config files. It excludes live locks, completed-install paths, staging and caches. The manifest checks each file. Restores revoke sessions and device credentials, create a fresh storage binding, and rewrite TLS paths. Do not copy only beast.db while its WAL is live.

The volume sentinel must already exist for a configured installation. A missing drive does not trigger directory creation, fallback to C:, reindexing as empty, or mass deletion. Reconnect and investigate. Do not remove or change the marker to conceal a mount problem.

Jobs persist pending/running/completed/failed state in SQLite. One worker bounds thumbnail memory (40 MP / 50 MiB source), indexes UTF-8 text up to 1 MiB, snapshots backups and performs exports. Interrupted running jobs return to pending; failures retry up to three attempts and can be retried by the owner. Jobs run only while the server is awake. Backup schedules catch up after wake rather than requiring a separate scheduler.

Versions and trash default to indefinite retention. Setting retention days explicitly permits removal of older versions and trashed records; garbage collection removes only blobs no remaining item/version references. Backup retention defaults to 14 verified snapshots (0 keeps indefinitely). Existing backups with invalid manifests are not silently deleted.

## Intentional bounds

This initial implementation supports one managed original-file root, not multiple simultaneous managed volumes or external read-only libraries. File lists paginate at 200; media/record views cap at 1,000 and search at 100. Folder/file copies and moves preserve immutable bytes; historical versions are associated with the original identity. Exports produce ordinary logical folder trees, Markdown note files, JSON structured records and iCalendar. Large-library pagination and additional volume libraries are follow-up work, listed in the feature matrix rather than represented by nonfunctional controls.
