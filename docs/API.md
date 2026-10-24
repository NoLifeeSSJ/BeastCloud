# Local HTTP API (v0.1)

All paths are same-origin `/api/...` over trusted HTTPS in production. No CORS origins are enabled. JSON request fields use camelCase. State changes require a valid server session and the `X-CSRF` token returned by login/session, except explicit setup/login/recovery/pair/public endpoints. Cookie `beast.session` is HttpOnly, Secure in production and SameSite=Strict. Sessions have a hard 12-hour expiry; logout/revoke removes the verifier. `401` = absent/expired credential, `403` = missing permission/CSRF, `400` = invalid input, `409` = conflict/version/ordering, `503` = unavailable storage/I/O. Error JSON has `error`. Authentication and public download endpoints rate-limit by peer IP (12 per minute).

## Authentication

* `GET /bootstrap` → `{needsSetup}`.
* `POST /setup` `{key,name,password,timezone}` → session plus ten one-time recovery codes. Loopback only, valid installation-specific local key, only before the owner exists.
* `POST /login` `{name,password,code?}` → `{id,name,role,csrf}`. `code` is TOTP or a recovery code when enabled.
* `GET /session`, `POST /logout`, `POST /sessions/revoke`.
* `POST /recover` `{name,code,password}` resets password, consumes a code, clears TOTP and revokes sessions.
* `POST /totp/begin` → secret/otpauth URI; `POST /totp/confirm` `{code}` enables after verification.

## Files (owner)

* `GET /dashboard`, `GET /items?parent=&trash=false&page=0&q=`, `GET /items/{id}`. Pages contain at most 200 entries. Root parent is omitted/empty.
* `POST /folders` `{name,parent?}`.
* `PATCH /items/{id}` `{name?,parent?,favorite?,tags?,album?}`. Explicit null parent moves to root. Cycles and collisions fail.
* `POST /items/{id}/copy` `{name,parent?}` recursively copies the active tree with new identities and immutable shared blobs.
* `DELETE /items/{id}` trashes recursively; `POST /items/{id}/restore` restores one item (parent first); `DELETE /trash/{id}` permanently removes a trashed leaf and enqueues blob collection.
* `GET /items/{id}/content?preview=true` and `/thumbnail`. Downloads support Range requests. Unknown/active types always get attachment disposition.
* `GET /items/{id}/versions`; `POST /items/{id}/versions/{version}/restore` creates a new current revision while retaining the previous current version.
* `GET /archive?ids=id1,id2` streams a ZIP of up to 100 selected roots / 10,000 entries without whole-archive buffering. Duplicate paths are rejected. Owner-only authorization is applied before content selection.
* `GET /media?album=` returns up to 1,000 supported media rows ordered by modified time.

## Resumable transfer protocol

1. `POST /uploads` `{name,parent?,total,checksum?,itemId?,baseRevision?}` → `{id,offset:0,chunkSize:4194304}`. Replacement requires the current base revision. SHA-256 checksums use lowercase hexadecimal. Reservation/file limit defaults to 100 GiB, further constrained by free space.
2. `PATCH /uploads/{id}` binary request body with exact Content-Length, `Upload-Offset` and `Upload-Checksum` (SHA-256 of this chunk). At most 4 MiB per chunk. Ownership, order, size and checksum are validated before staging is appended/flushed; the response carries the new durable offset.
3. `GET /uploads/{id}` to recover an acknowledged offset or committed identity after interruption. Resend from that offset, never blindly advance on a lost response.
4. `POST /uploads/{id}/commit` verifies total/full checksum, flushes a new immutable blob and transactionally records the file/current revision and committed ID. Repeated commit returns the same file identity. Concurrent replacement revisions conflict.
5. `DELETE /uploads/{id}` cancels an uncommitted transfer. Abandoned uncommitted transfers expire after 48h. Completed records remain as idempotency receipts.

## Records and search

* `GET /records?type=note|task|event&q=` (max 1,000), `PUT /records/{32-hex-id}` `{type,title,body,revision}`, `DELETE /records/{id}`, `GET /records/{id}/versions`.
* Note body: `{text,tags,attachments}`; task body: `{text,list,due,priority,done}`.
* Event body: `{start,end,timezone,repeat,count,text}`. ISO offset/UTC instants; timezone must be a supported Windows/IANA ID. Repeat is none/daily/weekly/monthly, count 1–366. The frontend expands fixed UTC recurrence and clamps month-end. Save uses optimistic record revision to protect concurrent edits.
* `GET /records/export` JSON, `GET /calendar/export` iCalendar, `POST /calendar/import` `{text}`. Imports accept UTC DTSTART/DTEND and FREQ+COUNT for the defined recurrence subset; reject unsupported rules/properties before insertion.
* `GET /search?q=&type=&tag=&after=&location=` queries local FTS. `location` optionally scopes to a folder identity and descendants. `POST /search/rebuild` queues a durable rebuild.

## Accounts, sharing and devices

* Owner `GET/POST /users` (new name/password restricted account), `DELETE /users/{id}` (restricted only).
* Owner `GET/POST /shares` `{itemId,userId?,password?,expires?,write?}`. Individual files; token verifier persisted. A new bearer token is shown once; password requires 12+ chars. Expiration is UTC-normalized. Bearer writes are prohibited.
* Owner `DELETE /shares/{id}`; restricted account `GET /shared`, `GET /shared/{shareId}/content`. An explicit write grant enables `PUT /shared/{shareId}/content`, max 4 MiB and `Upload-Checksum`, using the same versioned storage pipeline.
* `POST /public/download` `{token,password?}` returns the file attachment. Browser links put the secret in a URL **fragment**, and submit it in the POST body so it does not become a request URL/access-log token. Download is revoked/expired/password-checked on every call.
* Owner `GET/POST /devices` `{name,folder,mode}` → one-use code; `PATCH /devices/{id}` `{paused}`, `DELETE /devices/{id}`. `POST /pair` `{code}` → device token, identity, folder and mode.
* Companion endpoints use `Authorization: Bearer <device-token>` instead of a browser cookie: `/sync/manifest`, `/sync/content/{id}`, `/sync/folders`, `/sync/uploads[/{id}[/commit]]`, `DELETE /sync/items/{id}`. Same upload fields/headers, device ownership and folder/direction checks. Only file deletions, always to server trash. Revocation removes access immediately.

## Administration

Owner `GET/PUT /settings`, `GET /activity?page=`, `GET /jobs`, `POST /jobs/{id}/retry`, `GET/POST /backups`, and `POST /export` `{destination}`. Paths are owner-local configuration, never exposed through a share. Restore/encrypted-export operations are deliberate local CLI operations, documented in RECOVERY.md. `GET /health` is minimal unauthenticated readiness/version only; it does not disclose configuration.
