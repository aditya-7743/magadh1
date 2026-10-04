# Magadh Library

Library management app with Neon PostgreSQL storage, Firebase Google sign-in and an IndexedDB offline outbox.

## Run locally

Run `python serve_local.py` from this workspace, then open http://127.0.0.1:8000/.
The frontend uses the authenticated hosted SQL API, so localhost and the online website share the same library data.

## Publish

Publish only `index.html`, `styles.css`, `modern.css`, `sw.js`, `manifest.json`, `icon.svg`, `README.md`, and the application JavaScript files in `js/`.
Never publish `server/`, `migration/`, `.private-migration/`, `.env` files, credentials, reports, or personal backups.

## Storage and backup

- Library records are stored in PostgreSQL; Firebase is used for Google authentication.
- Photos load on demand. Edits are saved in an offline outbox and sent as atomic SQL operations.
- Conflicting edits are retained for review; failed requests do not silently discard local changes.
- Settings can export a complete JSON backup including photos and archived payment history. JSON is the portable backup format, not the live database.
- Full replacement restores require a protected server import. The browser does not overwrite the live SQL database from an arbitrary backup.
- The original migration source and isolated staging schema remain separate from live records.

## Operational limits

The current compatibility layer downloads record metadata in bounded pages on first login; subsequent logins use incremental changes. It still caches the library metadata locally. Large-library server-only pagination is a separate optimisation; 20,000-student performance has not been established.

The SQL release was published without new tests or browser verification at the owner's request.
