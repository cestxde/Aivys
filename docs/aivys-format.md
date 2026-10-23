# `.aivys/` Data Format Specification

Status: **Draft (v1)** — Iteration 0.
Scope: on-disk format of the `.aivys/` directory that lives next to the music
library, and the sync/merge contract for devices that replicate it (e.g. via
Syncthing).

This document is the source of truth for file layout and JSON shapes. Any
feature that persists user data (playlists, tags, statistics, settings) MUST
conform to this spec. Changes to a shipped field are a `schemaVersion` bump.

---

## 1. Goals and non-goals

### Goals

- A **file-first** data model that survives multi-device replication with a
  file sync tool (Syncthing, Dropbox-like tools) without a central server.
- A stable, explicit format that **future features build on without
  migrations** (playlists, custom tags, statistics, grouping tabs, search).
- Deterministic conflict handling per file (union / last-write-wins / journal).

### Non-goals (for Iteration 0)

- No query engine, no SQLite, no index (see Iteration 1).
- No UI.
- No networking / no custom sync protocol. Replication is done by the user's
  file sync tool, not by the app.
- Smart-playlist **evaluation** is out of scope; only the persisted *rules
  format* is defined here.

---

## 2. Design principles

1. **Tags of audio files are the source of truth for musical metadata.**
   Title/artist/album/genre/year etc. live in the audio file tags and are
   edited through the metadata editor. `.aivys/` MUST NOT duplicate them as a
   primary source; it may cache them in an index (Iteration 1) that is rebuilt
   from files.
2. **User data that cannot live in tags lives in `.aivys/`.**
   Favorites, ratings, play counts, playlists, custom tags, settings.
3. **Per-entity files are preferred over one big file.**
   One playlist = one file. A conflict then affects one entity, not the whole
   collection.
4. **Relative paths only.** Everything stored in `.aivys/` refers to files by
   paths **relative to the library root**, using `/` separators. Absolute paths
   are never persisted.
5. **Idempotent, atomic writes.** Write to a temp file then `rename` into
   place, so a sync tool never observes a half-written file.
6. **Schema is versioned.** Every self-describing JSON document carries
   `schemaVersion`. See §6.
7. **State vs. events.** Append-only event logs are used where per-device
   increments matter (play statistics), because event logs merge better than
   last-write-wins snapshots.

---

## 3. Directory layout

```
<library-root>/
  <music files...>
  .aivys/
    schema                      # optional; top-level format version (see §6)
    library.json                # synced per-library settings (see §8.1)
    favorites.json              # set of favorite tracks
    tags.json                   # user-defined colored tags
    stats/
      plays.jsonl               # append-only play-event log
    playlists/
      <uuid>.json               # one file per manual or smart playlist
      covers/
        <uuid>.<ext>            # optional playlist cover image (see §8.5.4)
    index/
      added-at.json             # existing: relative path -> first-seen unix ts
```

Notes:

- **Per-device state is NOT in `.aivys/`.** Things like player volume, shuffle,
  repeat mode, last played track and recent folders are device-local and live in
  the OS app-data directory (see §8.1). They are never synced.
- `index/` holds **rebuildable** data. In particular `added-at.json` already
  exists today (see `src-tauri/src/library.rs`). It is user-meaningful ("date
  added") and must be preserved, but it is derivable if lost (seeds from file
  mtime on first scan).
- Cover **cache** (extracted/thumbnailed art) lives in the OS app-data
  directory, NOT in `.aivys/`, and is never synced.
- Track cover art itself is embedded in the audio-file tags (see §9); there is
  no per-track cover override. **Playlist** covers, which have nowhere to live
  in a track's tags, are stored under `.aivys/playlists/covers/`.
- `deviceId` (see §7) is stored in the OS app-data directory, NOT in
  `.aivys/`, because it is per-device identity.

---

## 4. Path conventions

- **Key format:** relative to library root, forward slashes, no leading `/`.
  Example: `Artist/Album/01 - Track.flac`.
- **Resolving:** `absolute = library_root.join(relative)` (adjust separators on
  Windows).
- **Track identity:** a track is identified by its relative path. If a file is
  renamed/moved outside the app, its path changes; statistics and playlist
  entries referencing the old path become stale (see §8 "Stale entries"). A
  future version MAY add content-hash-based identity; out of scope for v1.
- **Case sensitivity:** paths are compared case-sensitively in storage, but
  consumers MUST tolerate case-only differences across platforms (Windows is
  case-insensitive). Do not use path as a primary key in a way that breaks on
  case-insensitive filesystems without a normalization step.

---

## 5. Common object conventions

- **Encoding:** UTF-8, no BOM.
- **Timestamps:** Unix seconds (integer), UTC.
- **IDs:** UUID v4 strings (lowercase, hyphenated).
- **JSON:** pretty-printed is acceptable for small files; producers must be
  able to read both pretty and compact.
- **`schemaVersion`:** integer, present in every top-level document (see §6).
- Unknown fields MUST be preserved on read-modify-write **where practical**;
  when that is not possible, unknown fields MAY be dropped, but a major bump of
  `schemaVersion` should accompany such a change.

---

## 6. Schema versioning & compatibility

Two options are permitted; this spec uses **per-document `schemaVersion`** as
the primary mechanism.

- Each document includes `"schemaVersion": <int>`.
- The optional `.aivys/schema` file, if present, contains the minimum format
  version the library expects (as plain text integer). It is advisory.

### Compatibility rules

- **Read:** if a document's `schemaVersion` is **greater** than the app's
  supported version, the app MUST treat that document as **read-only** and
  surface a warning. It MUST NOT overwrite it (a newer peer produced it).
- **Read:** if `schemaVersion` is **less**, the app upgrades it in memory and
  rewrites it with the current version on next write.
- **Missing** `schemaVersion` is treated as version `1`.
- **Never silently discard** data from a newer version. Prefer refusing to
  write.

Rationale: multiple devices may run different app versions simultaneously and
are connected only via file sync. Silent overwrite would corrupt data on the
newer device.

---

## 7. Device identity (`deviceId`)

- Generated once per installation, stored in the app-data dir as
  `device-id` (plain text UUID), **not synced**.
- Used to attribute events (statistics) and to interpret conflict resolution.
- If copied to another device by mistake, it is non-fatal but degrades event
  attribution; users should not copy it.

---

## 8. File specifications

### 8.1 Settings — split into device-local and library-synced

Settings are split by **scope**, deliberately:

- **Device-local (not synced).** Player volume, shuffle, repeat mode, last
  played track, recent library folders. These are per-device by nature (a
  phone's volume must not overwrite a desktop's, "last played" differs per
  device, etc.). Stored in the OS app-data directory (e.g.
  `app-data/player-state.json`), **never** in `.aivys/`. On first run they may
  be seeded from the existing frontend `PlayerSettings` (`src/types.ts`).
- **Library-synced.** Library-level view preferences that belong to the
  collection itself, stored in `.aivys/library.json`:

```json
{
  "schemaVersion": 1,
  "ui": {
    "visibleSystemPlaylists": ["favorites", "recentlyPlayed", "mostPlayed", "recentlyAdded"]
  },
  "updatedAt": 1730000000
}
```

Notes:

- **Per-playlist sort order is NOT stored here** — it lives in each playlist's
  own file (see §8.5), so a conflict only affects that playlist.
- `library.json` starts minimal on purpose. Application-wide preferences that
  are clearly not per-library may be added here later (or kept device-local).
  For v1, keep it to view-level toggles only.
- **Merge strategy (library.json):** last-write-wins by `updatedAt` (whole
  file).

> Deferred: broader "app settings" (theme, defaults, etc.). Not needed for v1;
> those can be device-local and added without touching the library format.

### 8.2 `favorites.json`

Set of favorite track paths. Backing store for the "Favorites" system playlist.

```json
{
  "schemaVersion": 1,
  "items": [
    { "path": "Artist/Album/01.flac", "addedAt": 1730000000 }
  ],
  "updatedAt": 1730000000
}
```

- `addedAt` enables "recently favorited" ordering.
- **Merge strategy:** **union** by `path`; on collision keep the smaller
  `addedAt` (earliest favorite wins).

### 8.3 `tags.json`

User-defined colored tags (distinct from audio-file tags/genres).

```json
{
  "schemaVersion": 1,
  "tags": [
    { "id": "8f1c...uuid", "name": "Chill", "color": "#4f9dff", "createdAt": 1730000000 }
  ],
  "assignments": [
    { "tagId": "8f1c...uuid", "path": "Artist/Album/01.flac" }
  ],
  "updatedAt": 1730000000
}
```

- A tag's `id` is stable; `name`/`color` are mutable.
- `assignments` is the many-to-many link between tags and tracks.
- `color` is a CSS hex string (`#RRGGBB`).
- **Merge strategy:** union of `tags` by `id` (LWW on `name`/`color` by
  document `updatedAt`), union of `assignments` by `(tagId, path)`. On tag-id
  collision with different names, keep the one from the document with the
  greater `updatedAt`; still union assignments.

### 8.4 `stats/plays.jsonl`

Append-only play-event log. One JSON object per line.

```json
{"schemaVersion":1,"ts":1730000000,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"play"}
{"schemaVersion":1,"ts":1730000123,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"complete"}
{"schemaVersion":1,"ts":1730000456,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"rating","value":4}
```

- `event` values (v1): `play`, `complete`, `rating`.
- `play` = playback started; `complete` = played to (near) end; `rating` =
  explicit user rating change (`value` is 0–5; 0 clears).
- Derived values are **computed**, not stored: `playCount`, `lastPlayedAt`,
  current `rating` (latest `rating` event per path wins by `ts`).
- **Merge strategy:** append-only **union**. Because lines are appended, a file
  sync tool merges additions well. Duplicated events (same `device`+`ts`+`path`
  +`event`) are de-duplicated on read.
- **Growth & compaction.** The log grows unbounded. A `play` event line is very
  small (~100 bytes); even tens of thousands of plays is only a few MB, so v1
  accepts unbounded growth. Compaction (rewriting the log as a per-device
  summary) is **deferred**: it reintroduces merge hazards, so if done later it
  must be per-device files (`plays.<deviceId>.jsonl`) that are compacted
  independently. For v1: **append only, never rewrite.**

> Why events and not a `stats.json` snapshot: two devices playing tracks
> concurrently produce independent increments that last-write-wins would lose.
> Append-only logs preserve both.

### 8.5 `playlists/<uuid>.json`

One file per playlist. There are **three playlist kinds**; only two are
persisted here. System playlists are virtual (see §8.6).

Every playlist file has `type` ∈ `{ "manual", "smart" }`.

#### 8.5.1 Manual playlist (`type: "manual"`)

```json
{
  "schemaVersion": 1,
  "id": "3b2e...uuid",
  "name": "Evening",
  "type": "manual",
  "sort": { "field": "manual", "dir": "asc" },
  "cover": null,
  "items": [
    { "id": "a1...uuid", "path": "Artist/Album/01.flac", "addedAt": 1730000000, "contentHash": null }
  ],
  "createdAt": 1730000000,
  "updatedAt": 1730000000
}
```

- `id` (playlist) matches the filename `<uuid>.json`.
- Each `items[].id` is a stable element id (so reordering/merging is well
  defined even for duplicate paths).
- Order in `items` is the playlist order. Duplicates are allowed unless the UI
  forbids them.
- `sort` is the **view sort** for this playlist, synced per-playlist (not in
  `library.json`). For a manual playlist `field: "manual"` means "use `items`
  order"; any other `field` renders a sorted view without changing the stored
  order. `dir` ∈ `{ "asc", "desc" }`. Default: `{ "field": "manual", "dir": "asc" }`.
- `cover` is an optional playlist-cover reference (`null` = none); see §8.5.4.
- `items[].contentHash` is **reserved for v1**: always `null` now. It exists so
  a future version can recover playlist membership after a file rename/move by
  matching content, without a schema break. Do not populate in v1.
- **Merge strategy:** union of items by `items[].id`. For items on both sides,
  the document with the greater `updatedAt` decides order/position. Name, `sort`
  and `cover` are LWW by `updatedAt`.

#### 8.5.2 Smart playlist (`type: "smart"`)

```json
{
  "schemaVersion": 1,
  "id": "7c4d...uuid",
  "name": "Rock 2000+",
  "type": "smart",
  "cover": null,
  "rules": {
    "match": "all",
    "conditions": [
      { "field": "genre", "op": "contains", "value": "Rock" },
      { "field": "year", "op": "gte", "value": 2000 },
      { "field": "rating", "op": "gte", "value": 4 }
    ],
    "sort": { "field": "addedAt", "dir": "desc" },
    "limit": 100
  },
  "createdAt": 1730000000,
  "updatedAt": 1730000000
}
```

- `rules.match`: `"all"` (AND) or `"any"` (OR).
- `rules.sort.field` / `.dir`: `dir` ∈ `{ "asc", "desc" }`. If omitted,
  defaults to `{ "field": "addedAt", "dir": "desc" }` so results are
  deterministic.
- `rules.limit`: **maximum number of tracks returned by the playlist**, applied
  *after* filtering and sorting (equivalent to SQL `WHERE … ORDER BY … LIMIT N`).
  It is NOT a limit on the number of conditions/rules. Omitted or `null` =
  unlimited. Its purpose is to cap huge results (e.g. a "most played" view)
  so the UI stays fast and loads more on demand.
- `cover` is an optional playlist-cover reference (`null` = none); see §8.5.4.
- Smart playlists contain **no `items`**; membership is computed at read time
  from the index/metadata. Editing rules does not change track files.
- **Merge strategy:** last-write-wins by `updatedAt` (whole file).

#### 8.5.3 Rule vocabulary (v1)

Fixed vocabulary so rules can later be translated to queries over the index.

**Fields** (map to `Track`/tags + derived stats):

| field        | type    | source |
|--------------|---------|--------|
| `title`      | string  | tag |
| `artist`     | string  | tag (matches any artist) |
| `album`      | string  | tag |
| `albumArtist`| string  | tag |
| `genre`      | string  | tag (matches any genre) |
| `year`       | number  | tag |
| `duration`   | number  | technical (seconds) |
| `format`     | string  | technical (e.g. `flac`) |
| `addedAt`    | number  | `added-at.json` |
| `rating`     | number  | latest `rating` event |
| `playCount`  | number  | count of `play` events |
| `lastPlayedAt` | number | latest `play`/`complete` ts |
| `favorite`   | boolean | membership in `favorites.json` |
| `tag`        | string  | user tag id or name (membership) |

**Operators:**

| op         | applies to | meaning |
|------------|-----------|---------|
| `eq`       | string/number/boolean | equals |
| `neq`      | same | not equals |
| `contains` | string | substring / any-of (for list-valued fields like artists/genres) |
| `in`       | string/number | value in array (`value` is an array) |
| `gt`,`gte`,`lt`,`lte` | number | comparisons |

Unknown `field`/`op` MUST be treated as "condition does not match" and
reported in a warning, never crash.

#### 8.5.4 Playlist cover (`cover` field)

Track cover art lives in the audio-file tags (see §9). A **playlist** has no
file tag to embed into, so its cover is stored separately:

- Image file: `.aivys/playlists/covers/<playlist-id>.<ext>` (ext ∈ `jpg`, `png`,
  `webp`). Named by the playlist `id` so it moves with the playlist and syncs
  cleanly (no path-derived naming needed).
- The playlist document references it via `"cover": "covers/<playlist-id>.jpg"`
  (relative to `.aivys/playlists/`), or `null` when there is no custom cover.
- When `cover` is `null`, the UI may show a generated fallback (e.g. a mosaic
  of member tracks' embedded art); that fallback is a view concern and is not
  persisted.
- **Merge strategy:** the `cover` reference merges as LWW with the playlist
  document (`updatedAt`). If two devices set different images, the newer
  document's image file wins; the older image file is orphaned and may be
  removed.

### 8.6 System playlists (virtual)

System playlists are **not files**. They are computed views:

| id              | definition |
|-----------------|------------|
| `favorites`     | entries of `favorites.json` |
| `recentlyPlayed`| tracks ordered by `lastPlayedAt` desc, limited |
| `mostPlayed`    | tracks ordered by `playCount` desc, limited |
| `recentlyAdded` | tracks ordered by `addedAt` desc |

- Visibility/order configured in `library.json` → `ui.visibleSystemPlaylists`.
- Statistics windows: for v1, `mostPlayed` and `lastPlayedAt` are computed over
  **all time**. "Most/least" style lists are capped to a **display limit** (e.g.
  top 100) with more loaded on demand — the cap is a UI concern, not stored
  data. The event log (§8.4) keeps the raw history, so the window (all-time vs.
  rolling N days) can be changed later without a format change.
- Do not persist separate aggregates; always derive from `plays.jsonl`.

---

## 9. Covers

- **Track covers** come from the audio-file tags (embedded art), read via
  metadata. The **extracted cache** (decoded art + thumbnails) is stored in the
  OS app-data directory and **never synced** — it is rebuildable from the files.
  There is no per-track cover override; to change a track's art, the metadata
  (tags) is edited.
- **Playlist covers** have no track tag to live in, so they are stored as real
  files in `.aivys/playlists/covers/<playlist-id>.<ext>` and referenced by the
  playlist's `cover` field (§8.5.4). These **are** synced with the library.
- A generated fallback cover for playlists (e.g. a mosaic of embedded art) is
  computed at view time and not persisted.

---

## 10. Atomic write & durability

- All writes: write `<name>.tmp` in the same directory, `fsync` if practical,
  then `rename` over the target. (See existing `save_added_at` in
  `library.rs` for the pattern.)
- Append-only logs (`plays.jsonl`) are opened in append mode; a single line is
  one write. Partial last lines (from a crash) are discarded on read.
- Never hold a file open longer than a write; file sync tools replace files.

---

## 11. Sync conflicts (`.sync-conflict-*`)

File sync tools produce conflict copies on concurrent edits (e.g.
`Evening.sync-conflict-20261023-120000-ABC123.json`). The app handles them at
startup:

1. **Detect** files matching `*.sync-conflict-*` (and the tool-specific
   patterns for supported tools) inside `.aivys/`.
2. **Merge per entity type** using the strategies in §8:
   - `library.json` → LWW by `updatedAt`.
   - `favorites.json` → union by path.
   - `tags.json` → union by id/assignment.
   - `playlists/*.json` (manual) → union items by id.
   - smart playlist → LWW by `updatedAt`.
   - playlist covers → follow the playlist's `cover`/`updatedAt`.
   - `plays.jsonl` → union + de-dup.
3. **Write the merged result** to the canonical filename (atomic rename).
4. **Archive** the conflict file (e.g. move to `.aivys/.conflicts/` with a
   timestamp) rather than deleting, so nothing is lost silently.
5. **Notify** the user that conflicts were found and merged (UI: Iteration ≥ 1).

If a conflict cannot be safely merged (e.g. `schemaVersion` from a newer
version), leave the file untouched, keep both copies, and surface a clear
error instead of guessing.

---

## 12. Stale entries & garbage

- Playlist items / tag assignments / favorites referencing non-existent files
  are **kept** (the file may return; e.g. removable drive or not-yet-synced
  device). UIs show them as "missing" but MUST NOT auto-delete them.
- Statistics for missing files are retained.
- A future "cleanup" action (out of scope for v1) may remove stale entries
  explicitly on user request.

---

## 13. Migration from current state

Current reality (as of 0.4.0):

- `PlayerSettings` (`volume`, `isShuffle`, `repeatMode`, `lastPath`,
  `recentPaths`) live in frontend storage (`src/types.ts`) and are
  **device-local**. They stay device-local (app-data), just moved from webview
  storage into a native `player-state.json` (or kept where they are initially).
  They are **not** written to `.aivys/`.
- `added-at.json` already exists at `.aivys/index/added-at.json`. Keep the
  path and format unchanged (map: relative path → unix ts).
- Covers cache is already in app-data. Leave it there.
- `.aivys/library.json` is created with defaults on first run (it only holds
  library-scoped view preferences).

---

## 14. Resolved decisions & remaining open questions

Decisions taken (v1):

1. **Track identity on rename — deferred.** v1 identifies tracks by relative
   path. Each playlist item **reserves a nullable `contentHash` field** (not
   populated in v1) so content-hash-based recovery can be added later **without
   a schema break**. Not implemented now.
2. **`smart.rules.limit`** = max tracks returned, applied after filter+sort
   (SQL `LIMIT`). Default sort when omitted: `addedAt desc`.
3. **Statistics** are computed over **all time**. Large lists are capped by a
   **display limit** (e.g. top 100, load more on demand) — a UI concern, not
   stored. The `plays.jsonl` log preserves raw history; windows can change
   later. Unbounded log growth is acceptable; compaction deferred (see §8.4).
4. **Settings scope — split.** Device-local (volume/shuffle/repeat/last
   track/recent folders) in app-data, not synced. Library-scoped view toggles
   in `.aivys/library.json`. **Per-playlist sort order lives in the playlist
   file**, not in `library.json`. Broad "app settings" deferred.
5. **Covers.** Track art from tag metadata (cache not synced). **Playlist
   covers** stored at `.aivys/playlists/covers/<id>.<ext>` and referenced by
   the playlist `cover` field. No per-track cover override.

Still open (to settle before Iteration 1, non-blocking):

- **A. Content-hash algorithm.** If we later populate `contentHash`, which
  algorithm/slice (`blake3` of first N bytes of the decoded stream) and when is
  it computed (scan time vs. on demand)? Deferred until rename recovery is
  actually built.
- **B. `mostPlayed` display limit default.** Top 100? Configurable in
  `library.json` later?
- **C. Smart-playlist field vocabulary additions.** Candidate extra fields the
  UI may want: `composer`, `comment`, `bitrate`, `sampleRate`, `isMissing`.
  Adding them is a backward-compatible extension (unknown fields already
  handled safely), so this can be done when the smart-playlist UI is built.

---

## 15. Change log

- **v1 (draft, rev 2)** — incorporated decisions:
  - Settings split into **device-local** (app-data, not synced) vs
    **library-synced** (`.aivys/library.json`, view toggles only).
  - Per-playlist **sort** stored in the playlist file; added playlist
    **`cover`** field and `.aivys/playlists/covers/`.
  - `smart.rules.limit` clarified (track cap after filter+sort), default sort
    `addedAt desc`; `mostPlayed`/`recentlyPlayed` = all-time + display cap.
  - Reserved nullable `contentHash` on playlist items for future rename
    recovery (not implemented in v1).
  - Covers: track art from tags (cache not synced); playlist covers are synced
    files. Removed per-track cover override.
  - Append-only `plays.jsonl`, compaction deferred.
- **v1 (draft, rev 1)** — initial specification for Iteration 0. Defines
  layout, versioning, three playlist kinds, event-based statistics, and merge
  strategies.
