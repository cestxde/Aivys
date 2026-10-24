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
- Deterministic conflict handling per file (single-writer journals, union,
  last-write-wins), including **deletions** (no resurrection of removed data).

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
3. **Per-track user actions are events in per-device journals.**
   Plays, ratings, favorites and tag assignments are appended as events to a
   journal file **owned by exactly one device** (§8.2). A file with a single
   writer never produces sync conflicts; the app merges all journals at read
   time. Current state (play count, rating, "is favorite", assigned tags) is
   always *derived*, never stored.
4. **Shared editable entities are per-entity files.**
   Playlists and tag definitions are edited from any device. One playlist =
   one file, so a conflict affects one entity, not the whole collection.
   Deletions are recorded as tombstones (§5).
5. **Relative paths only.** Everything stored in `.aivys/` refers to files by
   paths **relative to the library root**, using `/` separators. Absolute paths
   are never persisted.
6. **Idempotent, atomic writes.** Write to a temp file then `rename` into
   place, so a sync tool never observes a half-written file.
7. **Schema is versioned.** Every self-describing JSON document carries
   `schemaVersion`. See §6.

---

## 3. Directory layout

```
<library-root>/
  <music files...>
  .aivys/
    schema                      # optional; top-level format version (see §6)
    library.json                # synced per-library settings (see §8.1)
    events/
      <deviceId>.jsonl          # per-device append-only event journal (§8.2)
    devices/
      <deviceId>.json           # optional per-device descriptor (§7)
    tags.json                   # user-defined colored tag definitions (§8.3)
    playlists/
      <uuid>.json               # one file per manual or smart playlist (§8.4)
      covers/
        <uuid>.<ext>            # optional playlist cover image (§8.4.4)
    index/
      added-at.json             # existing: relative path -> first-seen unix ts
    .conflicts/                 # archived sync-conflict copies (§11)
```

Notes:

- **Per-device state is NOT in `.aivys/`.** Things like player volume, shuffle,
  repeat mode, last played track and recent folders are device-local and live in
  the OS app-data directory (see §8.1). They are never synced.
- `events/` and `devices/` contain one file **per device**, named by
  `deviceId`. Each device writes only its own files and reads everyone's.
- `index/` holds **rebuildable** data. In particular `added-at.json` already
  exists today (see `src-tauri/src/library.rs`). It is user-meaningful ("date
  added") and must be preserved, but it is derivable if lost (seeds from file
  mtime on first scan). It is shared by all devices; see §8.5 for its merge
  rule.
- Cover **cache** (extracted/thumbnailed art) lives in the OS app-data
  directory, NOT in `.aivys/`, and is never synced.
- Track cover art itself is embedded in the audio-file tags (see §9); there is
  no per-track cover override. **Playlist** covers, which have nowhere to live
  in a track's tags, are stored under `.aivys/playlists/covers/`.
- The `deviceId` itself (see §7) is stored in the OS app-data directory, NOT
  in `.aivys/`, because it is per-device identity.

---

## 4. Path conventions

- **Key format:** relative to library root, forward slashes, no leading `/`.
  Example: `Artist/Album/01 - Track.flac`.
- **Resolving:** `absolute = library_root.join(relative)` (adjust separators on
  Windows).
- **Track identity:** a track is identified by its relative path. If a file is
  renamed/moved outside the app, its path changes; events and playlist entries
  referencing the old path become stale (see §12). A future version MAY add
  content-hash-based identity; out of scope for v1.
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
- **Tombstones.** Shared entities (playlists, playlist items, tag definitions)
  are never physically removed when the user deletes them. Instead they get a
  `deletedAt` / `removedAt` timestamp and are hidden by consumers. This lets
  merges distinguish "deleted on device A" from "not yet seen on device A", so
  a merge with an older copy never resurrects deleted data. v1 never prunes
  tombstones (see §14, open question D).
- **Clocks.** Last-write-wins and "latest event wins" rely on device clocks.
  Skewed clocks can make an older edit win. This is an accepted limitation of
  v1; there is no logical clock.

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
- **Event lines** (§8.2) carry `schemaVersion` per line. A line with a newer
  version or an unknown `event` is **skipped with a warning** when deriving
  state; it is never removed from the journal.

Rationale: multiple devices may run different app versions simultaneously and
are connected only via file sync. Silent overwrite would corrupt data on the
newer device.

---

## 7. Device identity (`deviceId`)

- **Generated by the app** on first launch: a UUID v4, stored in the OS
  app-data dir as `device-id` (plain text). It is **not synced** and the user
  never has to set it.
- Used to name the device's journal (`events/<deviceId>.jsonl`), to attribute
  events, and as a deterministic tie-breaker in merges.
- **Reinstall / wiped app-data** → a new `deviceId` is generated and a new
  journal is started. The old journal stays in `events/` and its events keep
  counting. Nothing is lost.
- **Copied app-data** (two devices with the same `deviceId`) → both write the
  same journal, which can yield a sync-conflict copy of it. The app handles
  this (§11): it merges the copy, then **regenerates its own `deviceId`** and
  continues in a new journal, so the shared-writer situation ends.
- **Optional descriptor** `.aivys/devices/<deviceId>.json` gives the device a
  human-readable name for the UI (e.g. "where were these plays from"). Single
  writer, so no conflicts. Not required for v1.

```json
{
  "schemaVersion": 1,
  "id": "d3a1...uuid",
  "name": "Desktop",
  "platform": "windows",
  "createdAt": 1730000000,
  "updatedAt": 1730000000
}
```

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
  "artists": {
    "enabled": true,
    "splitOn": ["feat.", "ft.", "&", "/", ",", "x"],
    "keepWhole": ["AC/DC", "Simon & Garfunkel"],
    "smartGrouping": true,
    "minTracks": 2
  },
  "updatedAt": 1730000000
}
```

Notes:

- `artists` — how artist tag values are split into separate artists (for
  artist pages and smart-playlist rules; tracks display, and search matches,
  the tag as written, and the tags in the files are never changed). `enabled: false`
  keeps every tag value whole. `splitOn` lists the separators, matched
  ignoring case: a word (letters, maybe a final dot: `feat.`, `x`) splits only
  as a separate word, after a space or an opening bracket ("A (feat. B)"),
  anything else (`&`, `/`, `,`) wherever it appears — except `&` before
  "the" ("Kool & the Gang"). `keepWhole` lists names never split, matched
  ignoring case, also inside a longer value. `feat.`, `feat`, `ft.`, `ft`
  and `featuring` introduce guests; the other separators join the members of
  a group. With `smartGrouping` the split is decided by the whole library: a
  group none of whose members appears on its own (a solo track, or at least
  `minTracks` tracks while met alone or in more than one group) stays one
  artist ("Joey Valence & Brae"); an artist that leads no track and is on
  fewer than `minTracks` tracks gets a page but no place in the artist list.
  A missing field takes the app's defaults (splitting on, the built-in
  separator and name lists, smart grouping on, `minTracks` 2).
- **Per-playlist sort order is NOT stored here** — it lives in each playlist's
  own file (see §8.4), so a conflict only affects that playlist.
- `library.json` starts minimal on purpose. Application-wide preferences that
  are clearly not per-library may be added here later (or kept device-local).
  For v1, keep it to view-level toggles only.
- **Merge strategy (library.json):** last-write-wins by `updatedAt` (whole
  file).

> Deferred: broader "app settings" (theme, defaults, etc.). Not needed for v1;
> those can be device-local and added without touching the library format.

### 8.2 `events/<deviceId>.jsonl` — per-device event journal

Append-only journal of per-track user actions. One JSON object per line. Each
device appends **only to its own file**; all devices read **all** files in
`events/` and merge them in memory.

```json
{"schemaVersion":1,"ts":1730000000,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"play"}
{"schemaVersion":1,"ts":1730000190,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"complete"}
{"schemaVersion":1,"ts":1730000200,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"rating","value":4}
{"schemaVersion":1,"ts":1730000210,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"favorite"}
{"schemaVersion":1,"ts":1730000300,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"tag","tagId":"8f1c...uuid"}
{"schemaVersion":1,"ts":1730000400,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"untag","tagId":"8f1c...uuid"}
{"schemaVersion":1,"ts":1730000500,"device":"<deviceId>","path":"Artist/Album/01.flac","event":"unfavorite"}
```

#### 8.2.1 Event vocabulary (v1)

| event        | extra fields | meaning |
|--------------|-------------|---------|
| `play`       | —           | playback started |
| `complete`   | —           | played to (near) end |
| `rating`     | `value` (0–5) | explicit rating change; `0` clears |
| `favorite`   | —           | track added to favorites |
| `unfavorite` | —           | track removed from favorites |
| `tag`        | `tagId`     | user tag assigned to track |
| `untag`      | `tagId`     | user tag removed from track |

`device` MUST equal the journal's filename `deviceId` (it makes a line
self-describing when copied around, e.g. inside a conflict copy).

#### 8.2.2 Event ordering

Events from all journals are put in a single **total order**:

1. by `ts` ascending;
2. then by `device` (lexicographic) for equal `ts`;
3. then by line position within the journal.

"Latest" below always means "last in this order". Within one device the line
order is authoritative, so quick toggles within the same second resolve
correctly.

#### 8.2.3 Derived state

Computed at read time from the merged, ordered events; **never stored**:

| derived value | rule |
|---------------|------|
| `playCount`   | number of `play` events for the path |
| `lastPlayedAt`| `ts` of the latest `play`/`complete` for the path |
| `rating`      | `value` of the latest `rating` event for the path (`0`/none = unrated) |
| `favorite`    | the latest of `favorite`/`unfavorite` for the path is `favorite` |
| `favoritedAt` | `ts` of that latest `favorite` event (for "recently favorited") |
| assigned tags | for each `(path, tagId)`, the latest of `tag`/`untag` is `tag`, and the tag is not deleted in `tags.json` |

Deletions are therefore just events: `unfavorite` / `untag` win over earlier
`favorite` / `tag` regardless of which device produced which, and nothing is
resurrected by a merge.

#### 8.2.4 Merge, duplicates, growth

- **Merge strategy:** none needed in the normal case — every journal has a
  single writer, so the sync tool only ever copies files. The app reads
  `events/*.jsonl` and merges in memory.
- **De-duplication:** duplicates only arise from conflict copies of a journal
  (§11). Two lines are identical when `device`+`ts`+`path`+`event`+`value`
  +`tagId` match. Identical lines **within one file** are distinct events
  (e.g. two plays of a track within the same second, or favorite → unfavorite
  → favorite in one second) and are all kept. Across files, a line is kept as
  many times as it occurs in the file where it occurs most often (union with
  maximum multiplicity), so a conflict copy never doubles events.
- **Growth & compaction.** A line is ~100–150 bytes; tens of thousands of
  events are only a few MB, so v1 accepts unbounded growth: **append only,
  never rewrite** (the only exception is merging a conflict copy of the
  device's own journal, §11). Later compaction, if needed, is safe because a
  device compacts **only its own** journal (e.g. into a summary file it alone
  owns); it is deferred.

> Why per-device journals and not a shared snapshot or a shared log: file sync
> tools replicate whole files and do not merge concurrent appends to one file.
> A shared file would produce conflict copies on every concurrent use;
> single-writer files never do, and the event model preserves every device's
> increments and deletions.

### 8.3 `tags.json` — tag definitions

User-defined colored tags (distinct from audio-file tags/genres). This file
holds only **definitions**; which track has which tag lives in the event
journals (`tag`/`untag`, §8.2).

```json
{
  "schemaVersion": 1,
  "tags": [
    {
      "id": "8f1c...uuid",
      "name": "Chill",
      "color": "#4f9dff",
      "createdAt": 1730000000,
      "updatedAt": 1730000000,
      "deletedAt": null
    }
  ],
  "updatedAt": 1730000000
}
```

- A tag's `id` is stable; `name`/`color` are mutable.
- `color` is a CSS hex string (`#RRGGBB`).
- Deleting a tag sets `deletedAt` (tombstone) and `updatedAt`. Assignments to a
  deleted tag are ignored when deriving state; the journal is not touched.
- **Merge strategy:** union of `tags` by `id`. For a tag present on both
  sides, the entry with the greater **per-tag** `updatedAt` wins as a whole
  (including `deletedAt`). Document `updatedAt` is informational.

### 8.4 `playlists/<uuid>.json`

One file per playlist. There are **three playlist kinds**; only two are
persisted here. System playlists are virtual (see §8.6).

Every playlist file has `type` ∈ `{ "manual", "smart" }`.

**Deleting a playlist** does not remove the file: it sets `deletedAt` and
`updatedAt` (tombstone). The file MAY be reduced to the minimal tombstone
shape:

```json
{ "schemaVersion": 1, "id": "3b2e...uuid", "type": "manual", "deletedAt": 1730000900, "updatedAt": 1730000900 }
```

Merging a tombstone with a live copy follows normal LWW by `updatedAt`: the
deletion wins unless the other side was edited later (in which case the
playlist comes back, which is the intended "edit after delete" behavior).
The playlist's cover file (§8.4.4) may be removed once the tombstone is
written.

#### 8.4.1 Manual playlist (`type: "manual"`)

```json
{
  "schemaVersion": 1,
  "id": "3b2e...uuid",
  "name": "Evening",
  "type": "manual",
  "sort": { "field": "manual", "dir": "asc" },
  "cover": null,
  "items": [
    { "id": "a1...uuid", "path": "Artist/Album/01.flac", "addedAt": 1730000000, "removedAt": null, "contentHash": null }
  ],
  "createdAt": 1730000000,
  "updatedAt": 1730000000,
  "deletedAt": null
}
```

- `id` (playlist) matches the filename `<uuid>.json`.
- Each `items[].id` is a stable element id (so reordering/merging is well
  defined even for duplicate paths). Re-adding a track creates a **new** item
  id.
- Order in `items` is the playlist order. Duplicates are allowed unless the UI
  forbids them.
- **Removing an item** sets its `removedAt` (tombstone); the entry stays in
  `items` and is hidden by consumers.
- `sort` is the **view sort** for this playlist, synced per-playlist (not in
  `library.json`). For a manual playlist `field: "manual"` means "use `items`
  order"; any other `field` renders a sorted view without changing the stored
  order. `dir` ∈ `{ "asc", "desc" }`; `manual` with `desc` shows the `items`
  order reversed. Default: `{ "field": "manual", "dir": "asc" }`.
  Sortable fields use the smart-playlist names (§8.4.3): `addedAt`, `title`,
  `artist`, `album`, `duration`, `year`. Readers also accept the pre-release
  names `name` (= `title`) and `date` (= `addedAt`); an unknown field falls
  back to `manual`. Tracks without a value for the field sort last in both
  directions.
- `cover` is an optional playlist-cover reference (`null` = none); see §8.4.4.
- `items[].contentHash` is **reserved for v1**: always `null` now. It exists so
  a future version can recover playlist membership after a file rename/move by
  matching content, without a schema break. Do not populate in v1.
- **Merge strategy:**
  - `items`: union by `items[].id`.
  - An item is removed if **either** side has `removedAt` set (removal wins;
    safe because item ids are never reused). Keep the smaller `removedAt`.
  - Order: the document with the greater `updatedAt` decides the order of the
    items it contains; items known only to the other document are appended
    after them, in their relative order from that document.
  - `name`, `sort`, `cover`, `deletedAt`: LWW by `updatedAt`.

#### 8.4.2 Smart playlist (`type: "smart"`)

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
  "updatedAt": 1730000000,
  "deletedAt": null
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
- `cover` is an optional playlist-cover reference (`null` = none); see §8.4.4.
- Smart playlists contain **no `items`**; membership is computed at read time
  from the index/metadata/events. Editing rules does not change track files.
- **Merge strategy:** last-write-wins by `updatedAt` (whole file, including
  `deletedAt`).

#### 8.4.3 Rule vocabulary (v1)

Fixed vocabulary so rules can later be translated to queries over the index.

**Fields** (map to `Track`/tags + derived state):

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
| `rating`     | number  | derived from events (§8.2.3) |
| `playCount`  | number  | derived from events |
| `lastPlayedAt` | number | derived from events |
| `favorite`   | boolean | derived from events |
| `tag`        | string  | user tag id or name (derived assignment) |

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

#### 8.4.4 Playlist cover (`cover` field)

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

### 8.5 `index/added-at.json`

Existing file, format unchanged: a JSON object mapping relative path → unix
seconds of first sighting.

- Shared by all devices (every device's scan may add new paths).
- **Merge strategy:** union of keys; on collision keep the **smaller** value
  (earliest sighting wins).
- Rebuildable if lost (seeded from file mtime on scan).

### 8.6 System playlists (virtual)

System playlists are **not files**. They are computed views:

| id              | definition |
|-----------------|------------|
| `favorites`     | tracks whose derived `favorite` is true, ordered by `favoritedAt` desc |
| `recentlyPlayed`| tracks ordered by `lastPlayedAt` desc, limited |
| `mostPlayed`    | tracks ordered by `playCount` desc, limited |
| `recentlyAdded` | tracks ordered by `addedAt` desc |

- Visibility/order configured in `library.json` → `ui.visibleSystemPlaylists`.
- Statistics are computed across **all devices' journals** and over **all
  time**. "Most/least" style lists are capped to a **display limit** (e.g. top
  100) with more loaded on demand — the cap is a UI concern, not stored data.
  The journals keep the raw history, so the window (all-time vs. rolling N
  days, or per-device views) can be changed later without a format change.
- Do not persist separate aggregates; always derive from `events/`.

---

## 9. Covers

- **Track covers** come from the audio-file tags (embedded art), read via
  metadata. The **extracted cache** (decoded art + thumbnails) is stored in the
  OS app-data directory and **never synced** — it is rebuildable from the files.
  There is no per-track cover override; to change a track's art, the metadata
  (tags) is edited.
- **Playlist covers** have no track tag to live in, so they are stored as real
  files in `.aivys/playlists/covers/<playlist-id>.<ext>` and referenced by the
  playlist's `cover` field (§8.4.4). These **are** synced with the library.
- A generated fallback cover for playlists (e.g. a mosaic of embedded art) is
  computed at view time and not persisted.

---

## 10. Atomic write & durability

- All document writes: write `<name>.tmp` in the same directory, `fsync` if
  practical, then `rename` over the target. (See existing `save_added_at` in
  `library.rs` for the pattern.)
- **Read-modify-write of shared files** (`library.json`, `tags.json`,
  playlists, `added-at.json`) MUST re-read the file from disk immediately
  before writing and apply the change to that fresh copy, because the sync
  tool may have replaced it while the app was running.
- Event journals are opened in append mode; a single line is one write. A
  partial last line (from a crash or a sync mid-transfer) is ignored on read
  and is not counted; the next append starts on a new line.
- Never hold a file open longer than a write; file sync tools replace files.

---

## 11. Sync conflicts (`.sync-conflict-*`)

File sync tools produce conflict copies on concurrent edits. Syncthing's
pattern is `<name>.sync-conflict-<YYYYMMDD>-<HHMMSS>-<deviceShortId>.<ext>`,
e.g. `3b2e….sync-conflict-20261023-120000-ABC1234.json` next to
`3b2e….json`.

With per-device journals, conflicts are expected only for the shared files
(`library.json`, `tags.json`, playlists, `added-at.json`), and rarely.

The app handles them **at startup and whenever it notices a change in
`.aivys/`** (file watcher, or a rescan before a write):

1. **Detect** files matching `*.sync-conflict-*` (and the tool-specific
   patterns for supported tools) inside `.aivys/`.
2. **Merge per entity type** using the strategies in §8:
   - `library.json` → LWW by `updatedAt`.
   - `tags.json` → union by tag id, per-tag LWW by `updatedAt`.
   - `playlists/*.json` (manual) → union items by id, removal wins, order from
     the newer document.
   - `playlists/*.json` (smart) and playlist tombstones → LWW by `updatedAt`.
   - playlist covers → follow the playlist's `cover`/`updatedAt`.
   - `index/added-at.json` → union, earliest value wins.
   - `events/<deviceId>.jsonl` → union of lines + de-dup, rewritten in event
     order. This means two installations share a `deviceId` (§7); after
     merging **its own** journal, the app regenerates its `deviceId`. A
     conflict copy of **another** device's journal is merged by that device;
     until then readers simply read both files (de-dup makes this safe).
3. **Write the merged result** to the canonical filename (atomic rename).
4. **Archive** the conflict file (move to `.aivys/.conflicts/` with a
   timestamp) rather than deleting, so nothing is lost silently.
5. **Notify** the user that conflicts were found and merged (UI: Iteration ≥ 1).

If a conflict cannot be safely merged (e.g. `schemaVersion` from a newer
version), leave the file untouched, keep both copies, and surface a clear
error instead of guessing.

---

## 12. Stale entries & garbage

- Playlist items and events referencing non-existent files are **kept** (the
  file may return; e.g. removable drive or not-yet-synced device). UIs show
  them as "missing" but MUST NOT auto-delete them.
- Statistics for missing files are retained.
- Tombstones (`deletedAt`, `removedAt`) are retained in v1.
- A future "cleanup" action (out of scope for v1) may remove stale entries and
  old tombstones explicitly on user request.

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
- No favorites, ratings, plays, tags or playlists are persisted yet, so there
  is nothing else to migrate. `device-id` is generated on the first launch of
  the version that introduces journals.

---

## 14. Resolved decisions & remaining open questions

Decisions taken (v1):

1. **Track identity on rename — deferred.** v1 identifies tracks by relative
   path. Each playlist item **reserves a nullable `contentHash` field** (not
   populated in v1) so content-hash-based recovery can be added later **without
   a schema break**. Not implemented now.
2. **`smart.rules.limit`** = max tracks returned, applied after filter+sort
   (SQL `LIMIT`). Default sort when omitted: `addedAt desc`.
3. **Statistics** are computed across all devices over **all time**. Large
   lists are capped by a **display limit** (e.g. top 100, load more on demand)
   — a UI concern, not stored. Unbounded journal growth is acceptable;
   compaction deferred (see §8.2.4).
4. **Settings scope — split.** Device-local (volume/shuffle/repeat/last
   track/recent folders) in app-data, not synced. Library-scoped view toggles
   in `.aivys/library.json`. **Per-playlist sort order lives in the playlist
   file**, not in `library.json`. Broad "app settings" deferred.
5. **Covers.** Track art from tag metadata (cache not synced). **Playlist
   covers** stored at `.aivys/playlists/covers/<id>.<ext>` and referenced by
   the playlist `cover` field. No per-track cover override.
6. **Per-device event journals.** Plays, ratings, favorites and tag
   assignments are events in `events/<deviceId>.jsonl`, one writer per file,
   merged at read time. Replaces `favorites.json`, `tags.json#assignments` and
   the shared `stats/plays.jsonl`.
7. **Deletions are explicit.** Events (`unfavorite`, `untag`) for per-track
   state; tombstones (`deletedAt`, `removedAt`) for shared entities.
8. **`deviceId` is app-generated** (UUID v4 in app-data), regenerated
   automatically when a shared-`deviceId` conflict is detected.

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
- **D. Tombstone pruning.** When (if ever) can old tombstones be dropped
  safely, given devices that stay offline for a long time? v1 keeps them.

---

## 15. Change log

- **v1 (draft, rev 4)** — de-duplication of journal lines is a union with
  maximum multiplicity across files; identical lines within one journal are
  distinct events (§8.2.4).
- **v1 (draft, rev 3)** — sync model for multi-device statistics:
  - Per-device append-only journals `events/<deviceId>.jsonl` for `play`,
    `complete`, `rating`, `favorite`/`unfavorite`, `tag`/`untag`; total event
    order and derived-state rules (§8.2). Removed `favorites.json`,
    `tags.json#assignments` and `stats/plays.jsonl`.
  - Tombstones: `deletedAt` on playlists and tag definitions, `removedAt` on
    manual playlist items; per-tag `updatedAt`; "removal wins" for items.
  - `deviceId` generated by the app; regeneration on shared-id conflict;
    optional `devices/<deviceId>.json` descriptor.
  - Merge rule for `index/added-at.json` (earliest wins).
  - Conflict handling also at runtime; re-read before read-modify-write;
    corrected Syncthing conflict filename example; `.conflicts/` in layout.
  - Documented clock-skew limitation.
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
