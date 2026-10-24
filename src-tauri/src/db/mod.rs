//! Local SQLite index of the library, kept in the OS app-data directory and
//! never synced. It is a cache: audio-file tags and `.aivys/` stay the source
//! of truth, and the database can be deleted at any time to be rebuilt.
//!
//! It caches scan results, so a rescan only reads tags of files that are new
//! or changed since the last scan, and the per-track state derived from the
//! `.aivys/events` journals (see [`state`]).

pub(crate) mod search;
pub(crate) mod smart;
pub(crate) mod state;

use crate::artists::{credit_library, display_line, ArtistRules, Segment, Splitter};
use crate::track::Track;
use rusqlite::{params, Connection, Transaction};
use std::collections::HashMap;
use std::path::{Path, PathBuf, MAIN_SEPARATOR_STR};

/// Artists left out of the artist list (lowercase), by the library-wide
/// grouping. Additive: created in existing indexes too, without a rebuild.
const UNLISTED_ARTISTS: &str = "CREATE TABLE IF NOT EXISTS unlisted_artists (name TEXT PRIMARY KEY);";

/// Bump on any schema change. A database with another version is deleted and
/// rebuilt from scratch: it only holds rebuildable data, so no migrations.
/// Also bump when the event vocabulary changes, so journals are re-ingested,
/// or when reading tags changes, so files are read again (7: the album's track
/// total; 6: raw artist tags kept, artists derived from them by the library's
/// rules; 4 and 5 were development builds).
const SCHEMA_VERSION: i32 = 7;

const SCHEMA: &str = "
CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    rel_path TEXT NOT NULL UNIQUE,
    -- Change detection: a file is re-read when either differs.
    mtime_ns INTEGER NOT NULL,
    size INTEGER NOT NULL,

    name TEXT NOT NULL,
    duration INTEGER NOT NULL,
    title TEXT,
    album TEXT,
    album_artist TEXT,
    track_number INTEGER,
    track_total INTEGER,
    disc_number INTEGER,
    year INTEGER,
    bitrate INTEGER,
    sample_rate INTEGER,
    format TEXT,
    cover_path TEXT,
    added_at INTEGER NOT NULL,
    file_mtime INTEGER NOT NULL
);

-- Artist tag values as read; `track_artists` is derived from them by the
-- library's splitting rules (meta `artistRules` holds the rules applied).
CREATE TABLE track_artist_tags (
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (track_id, position)
);

CREATE TABLE track_artists (
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (track_id, position)
);
CREATE INDEX track_artists_name ON track_artists(name);

CREATE TABLE track_genres (
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (track_id, position)
);
CREATE INDEX track_genres_name ON track_genres(name);

-- How much of each journal file has been ingested.
CREATE TABLE journals (
    file TEXT PRIMARY KEY,
    -- Bytes ingested, always at a line boundary.
    offset INTEGER NOT NULL,
    -- blake3 of those bytes, to notice a journal that was rewritten.
    prefix_hash TEXT NOT NULL
);

-- Every journal line with a known event; duplicates across files are
-- collapsed when deriving state (see store::events::Dedup).
CREATE TABLE events (
    file TEXT NOT NULL,
    -- Byte offset of the line in its file: the in-journal order.
    seq INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    device TEXT NOT NULL,
    path TEXT NOT NULL,
    event TEXT NOT NULL,
    value INTEGER,
    tag_id TEXT,
    PRIMARY KEY (file, seq)
);
CREATE INDEX events_path ON events(path);

-- Derived per-track state (keyed by path: events may outlive their file).
CREATE TABLE track_state (
    rel_path TEXT PRIMARY KEY,
    play_count INTEGER NOT NULL,
    last_played_at INTEGER,
    rating INTEGER,
    favorite INTEGER NOT NULL,
    favorited_at INTEGER
);

-- Assigned user tags, including tags since deleted (filtered via user_tags).
CREATE TABLE track_tags (
    rel_path TEXT NOT NULL,
    position INTEGER NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (rel_path, position)
);
CREATE INDEX track_tags_tag ON track_tags(tag_id);

-- Copy of tags.json definitions, refreshed on every sync.
CREATE TABLE user_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    deleted INTEGER NOT NULL
);

-- Full-text search over tracks (rowid = tracks.id). The *_latin columns hold
-- loose Latin keys of the same text, for transliterated queries (see search).
CREATE VIRTUAL TABLE search USING fts5(
    title, artist, album, title_latin, artist_latin, album_latin,
    tokenize = 'unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE search_vocab USING fts5vocab(search, col);
";

/// What the index remembers about a file to decide whether to re-read it.
pub(crate) struct CachedFile {
    pub(crate) mtime_ns: i64,
    pub(crate) size: i64,
    pub(crate) added_at: u64,
    pub(crate) cover_path: Option<String>,
}

/// A freshly read track plus the change-detection values of its file.
pub(crate) struct ScannedTrack {
    pub(crate) track: Track,
    pub(crate) mtime_ns: i64,
    pub(crate) size: i64,
}

pub(crate) struct LibraryDb {
    conn: Connection,
    /// Latin-key vocabulary for typo correction, with the `data_version` it
    /// was read at (the scan writes through another connection).
    vocab: std::cell::RefCell<Option<(i64, search::Vocab)>>,
}

/// One database per library: `<app-data>/index/<hash of the library root>.sqlite`.
pub(crate) fn db_path(app_data: &Path, library_root: &Path) -> PathBuf {
    let root = std::fs::canonicalize(library_root).unwrap_or_else(|_| library_root.to_path_buf());
    let hash = blake3::hash(root.to_string_lossy().as_bytes()).to_hex();
    app_data.join("index").join(format!("{}.sqlite", &hash[..16]))
}

fn remove_db_files(path: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let mut name = path.as_os_str().to_os_string();
        name.push(suffix);
        let _ = std::fs::remove_file(PathBuf::from(name));
    }
}

fn connect(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    // The scan and the store each hold a connection; wait for the other's
    // write to finish instead of failing with "database is locked".
    conn.busy_timeout(std::time::Duration::from_secs(10))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    smart::register_functions(&conn)?;
    conn.execute_batch(UNLISTED_ARTISTS)?;
    Ok(conn)
}

impl LibraryDb {
    /// Open the index for `library_root`, (re)creating it when it is missing,
    /// from another schema version or unreadable.
    pub(crate) fn open(app_data: &Path, library_root: &Path) -> Result<LibraryDb, Box<dyn std::error::Error>> {
        let path = db_path(app_data, library_root);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let version = connect(&path).and_then(|conn| {
            conn.pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
                .map(|version| (conn, version))
        });
        let conn = match version {
            Ok((conn, SCHEMA_VERSION)) => conn,
            Ok((conn, found)) => {
                if found != 0 {
                    log::info!("index schema {found} != {SCHEMA_VERSION}, rebuilding");
                }
                drop(conn);
                remove_db_files(&path);
                Self::create(&path, library_root)?
            }
            Err(err) => {
                log::warn!("index unreadable ({err}), rebuilding");
                remove_db_files(&path);
                Self::create(&path, library_root)?
            }
        };
        Ok(LibraryDb {
            conn,
            vocab: Default::default(),
        })
    }

    fn create(path: &Path, library_root: &Path) -> rusqlite::Result<Connection> {
        let conn = connect(path)?;
        conn.execute_batch(SCHEMA)?;
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('libraryRoot', ?1)",
            [library_root.to_string_lossy()],
        )?;
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        Ok(conn)
    }

    /// Change-detection data of every indexed file, keyed by relative path.
    pub(crate) fn cached_files(&self) -> rusqlite::Result<HashMap<String, CachedFile>> {
        let mut stmt = self
            .conn
            .prepare("SELECT rel_path, mtime_ns, size, added_at, cover_path FROM tracks")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                CachedFile {
                    mtime_ns: row.get(1)?,
                    size: row.get(2)?,
                    added_at: row.get(3)?,
                    cover_path: row.get(4)?,
                },
            ))
        })?;
        rows.collect()
    }

    /// Apply one scan's result in a single transaction: insert or replace
    /// re-read tracks, update moved "date added" values, drop vanished files.
    pub(crate) fn apply_scan(
        &mut self,
        upserts: &[ScannedTrack],
        added_at_updates: &[(String, u64)],
        removed: &[String],
    ) -> rusqlite::Result<()> {
        let tx = self.conn.transaction()?;
        for scanned in upserts {
            upsert_track(&tx, scanned)?;
        }
        {
            let mut stmt = tx.prepare("UPDATE tracks SET added_at = ?2 WHERE rel_path = ?1")?;
            for (rel_path, added_at) in added_at_updates {
                stmt.execute(params![rel_path, added_at])?;
            }
            let mut unindex =
                tx.prepare("DELETE FROM search WHERE rowid = (SELECT id FROM tracks WHERE rel_path = ?1)")?;
            let mut stmt = tx.prepare("DELETE FROM tracks WHERE rel_path = ?1")?;
            for rel_path in removed {
                unindex.execute([rel_path])?;
                stmt.execute([rel_path])?;
            }
        }
        tx.commit()?;
        self.invalidate_vocab();
        Ok(())
    }

    /// Derive every track's artists from its tag values by `rules`, looking
    /// at the whole library (see [`credit_library`]). Skipped when neither the
    /// rules nor the library changed since the last time. Returns whether it ran.
    pub(crate) fn derive_artists(&mut self, rules: &ArtistRules, library_changed: bool) -> rusqlite::Result<bool> {
        let fingerprint = rules.fingerprint();
        let applied: Option<String> = self
            .conn
            .query_row("SELECT value FROM meta WHERE key = 'artistRules'", [], |row| row.get(0))
            .ok();
        if !library_changed && applied.as_deref() == Some(fingerprint.as_str()) {
            return Ok(false);
        }

        let tags = self.load_names("track_artist_tags")?;
        let ids: Vec<i64> = {
            let mut stmt = self.conn.prepare("SELECT id FROM tracks")?;
            let ids = stmt.query_map([], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?;
            ids
        };
        let splitter = Splitter::new(rules);
        let segments: Vec<Vec<Segment>> = ids
            .iter()
            .map(|id| tags.get(id).map(|values| splitter.segments(values)).unwrap_or_default())
            .collect();
        let credits = credit_library(&segments, rules);

        let tx = self.conn.transaction()?;
        {
            tx.execute("DELETE FROM track_artists", [])?;
            tx.execute("DELETE FROM unlisted_artists", [])?;
            let mut insert = tx.prepare("INSERT INTO track_artists (track_id, position, name) VALUES (?1, ?2, ?3)")?;
            let mut unlist = tx.prepare("INSERT OR IGNORE INTO unlisted_artists (name) VALUES (?1)")?;
            for (id, credit) in ids.iter().zip(&credits) {
                for (position, name) in credit.artists.iter().enumerate() {
                    insert.execute(params![id, position as i64, name])?;
                }
                for name in &credit.unlisted {
                    unlist.execute([name.to_lowercase()])?;
                }
            }
        }
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('artistRules', ?1)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            [&fingerprint],
        )?;
        tx.commit()?;
        log::info!("derived the artists of {} tracks", ids.len());
        Ok(true)
    }

    /// Every indexed track, with absolute paths resolved against `root`.
    pub(crate) fn load_tracks(&self, root: &Path) -> rusqlite::Result<Vec<Track>> {
        let artists = self.load_names("track_artists")?;
        let artist_tags = self.load_names("track_artist_tags")?;
        let unlisted: std::collections::HashSet<String> = {
            let mut stmt = self.conn.prepare("SELECT name FROM unlisted_artists")?;
            let names = stmt.query_map([], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?;
            names
        };
        let genres = self.load_names("track_genres")?;

        let mut stmt = self.conn.prepare(
            "SELECT id, rel_path, name, duration, title, album, album_artist, track_number,
                    disc_number, year, bitrate, sample_rate, format, cover_path, added_at,
                    file_mtime, size, track_total
             FROM tracks
             ORDER BY rel_path COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let rel_path: String = row.get(1)?;
            let track_artists = artists.get(&id).cloned().unwrap_or_default();
            let unlisted_artists = track_artists
                .iter()
                .filter(|name| unlisted.contains(&name.to_lowercase()))
                .cloned()
                .collect();
            Ok(Track {
                name: row.get(2)?,
                path: root
                    .join(rel_path.replace('/', MAIN_SEPARATOR_STR))
                    .to_string_lossy()
                    .into_owned(),
                rel_path,
                duration: row.get(3)?,
                title: row.get(4)?,
                artists: track_artists,
                album: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                track_total: row.get(17)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: genres.get(&id).cloned().unwrap_or_default(),
                bitrate: row.get(10)?,
                sample_rate: row.get(11)?,
                format: row.get(12)?,
                cover_path: row.get(13)?,
                date_created: row.get(14)?,
                file_mtime: row.get(15)?,
                metadata_modified_at: 0,
                file_size: row.get::<_, i64>(16)?.max(0) as u64,
                artist_line: artist_tags.get(&id).map(|values| display_line(values)).unwrap_or_default(),
                unlisted_artists,
                // Only the index needs the tag values.
                artist_tags: Vec::new(),
            })
        })?;
        rows.collect()
    }

    /// `track_id -> names` in stored order, for a multi-value table.
    fn load_names(&self, table: &str) -> rusqlite::Result<HashMap<i64, Vec<String>>> {
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT track_id, name FROM {table} ORDER BY track_id, position"))?;
        let mut names: HashMap<i64, Vec<String>> = HashMap::new();
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            names.entry(row.get(0)?).or_default().push(row.get(1)?);
        }
        Ok(names)
    }
}

fn upsert_track(tx: &Transaction, scanned: &ScannedTrack) -> rusqlite::Result<()> {
    let track = &scanned.track;
    let id: i64 = tx
        .query_row(
            "INSERT INTO tracks (rel_path, mtime_ns, size, name, duration, title, album,
                                 album_artist, track_number, disc_number, year, bitrate,
                                 sample_rate, format, cover_path, added_at, file_mtime, track_total)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
             ON CONFLICT (rel_path) DO UPDATE SET
                 mtime_ns = excluded.mtime_ns, size = excluded.size, name = excluded.name,
                 duration = excluded.duration, title = excluded.title, album = excluded.album,
                 album_artist = excluded.album_artist, track_number = excluded.track_number,
                 disc_number = excluded.disc_number, year = excluded.year,
                 bitrate = excluded.bitrate, sample_rate = excluded.sample_rate,
                 format = excluded.format, cover_path = excluded.cover_path,
                 added_at = excluded.added_at, file_mtime = excluded.file_mtime,
                 track_total = excluded.track_total
             RETURNING id",
            params![
                track.rel_path,
                scanned.mtime_ns,
                scanned.size,
                track.name,
                track.duration,
                track.title,
                track.album,
                track.album_artist,
                track.track_number,
                track.disc_number,
                track.year,
                track.bitrate,
                track.sample_rate,
                track.format,
                track.cover_path,
                track.date_created,
                track.file_mtime,
                track.track_total,
            ],
            |row| row.get(0),
        )?;

    for (table, names) in [
        ("track_artist_tags", &track.artist_tags),
        ("track_artists", &track.artists),
        ("track_genres", &track.genre),
    ] {
        tx.execute(&format!("DELETE FROM {table} WHERE track_id = ?1"), [id])?;
        let mut stmt = tx.prepare_cached(&format!(
            "INSERT INTO {table} (track_id, position, name) VALUES (?1, ?2, ?3)"
        ))?;
        for (position, name) in names.iter().enumerate() {
            stmt.execute(params![id, position as i64, name])?;
        }
    }

    search::index_track(tx, id, track)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(rel_path: &str, title: &str) -> ScannedTrack {
        ScannedTrack {
            track: Track {
                name: rel_path.rsplit('/').next().unwrap().to_owned(),
                path: String::new(),
                rel_path: rel_path.to_owned(),
                duration: 180,
                title: Some(title.to_owned()),
                artists: vec!["A".into(), "B".into()],
                album: None,
                album_artist: None,
                track_number: Some(1),
                track_total: None,
                disc_number: None,
                year: Some(2001),
                genre: vec!["Rock".into()],
                bitrate: Some(320),
                sample_rate: Some(44100),
                format: Some("flac".into()),
                cover_path: None,
                date_created: 10,
                file_mtime: 20,
                metadata_modified_at: 0,
                file_size: 0,
                artist_line: String::new(),
                unlisted_artists: Vec::new(),
                artist_tags: vec!["A".into(), "B".into()],
            },
            mtime_ns: 1,
            size: 2,
        }
    }

    #[test]
    fn scan_results_round_trip() {
        let base = std::env::temp_dir().join(format!("aivys-db-test-{}", crate::store::new_uuid()));
        let root = base.join("library");
        std::fs::create_dir_all(&root).unwrap();

        let mut db = LibraryDb::open(&base, &root).unwrap();
        db.apply_scan(&[track("b/2.flac", "Two"), track("a/1.flac", "One")], &[], &[])
            .unwrap();

        // Re-reading a track replaces its multi-value rows instead of appending.
        let mut changed = track("a/1.flac", "One (edit)");
        changed.track.artists = vec!["C".into()];
        db.apply_scan(&[changed], &[("b/2.flac".into(), 5)], &[]).unwrap();
        drop(db);

        let db = LibraryDb::open(&base, &root).unwrap();
        let tracks = db.load_tracks(&root).unwrap();
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].rel_path, "a/1.flac");
        assert_eq!(tracks[0].title.as_deref(), Some("One (edit)"));
        assert_eq!(tracks[0].artists, vec!["C".to_owned()]);
        assert_eq!(tracks[1].artists, vec!["A".to_owned(), "B".to_owned()]);
        assert_eq!(tracks[1].date_created, 5);
        assert!(tracks[0].path.ends_with(&format!("a{MAIN_SEPARATOR_STR}1.flac")));

        let mut db = db;
        db.apply_scan(&[], &[], &["b/2.flac".into()]).unwrap();
        assert_eq!(db.cached_files().unwrap().len(), 1);

        drop(db);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn new_artist_rules_rederive_artists() {
        let base = std::env::temp_dir().join(format!("aivys-db-test-{}", crate::store::new_uuid()));
        let root = base.join("library");
        std::fs::create_dir_all(&root).unwrap();

        let mut db = LibraryDb::open(&base, &root).unwrap();
        let mut scanned = track("a/1.flac", "One");
        scanned.track.artist_tags = vec!["A & B".into()];
        scanned.track.artists = vec!["A".into(), "B".into()];
        db.apply_scan(&[scanned], &[], &[]).unwrap();

        // The same rules again change nothing; new ones apply without a re-read.
        let split = ArtistRules { smart_grouping: false, ..ArtistRules::default() };
        assert!(db.derive_artists(&split, false).unwrap());
        assert!(!db.derive_artists(&split, false).unwrap());
        assert_eq!(db.load_tracks(&root).unwrap()[0].artists, vec!["A".to_owned(), "B".to_owned()]);
        let keep = ArtistRules { keep_whole: vec!["A & B".into()], ..split };
        assert!(db.derive_artists(&keep, false).unwrap());
        assert_eq!(db.load_tracks(&root).unwrap()[0].artists, vec!["A & B".to_owned()]);
        // A changed library is looked at again even with the same rules.
        assert!(db.derive_artists(&keep, true).unwrap());

        drop(db);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn other_schema_version_is_rebuilt() {
        let base = std::env::temp_dir().join(format!("aivys-db-test-{}", crate::store::new_uuid()));
        let root = base.join("library");
        std::fs::create_dir_all(&root).unwrap();

        let mut db = LibraryDb::open(&base, &root).unwrap();
        db.apply_scan(&[track("a/1.flac", "One")], &[], &[]).unwrap();
        db.conn.pragma_update(None, "user_version", 999).unwrap();
        drop(db);

        let db = LibraryDb::open(&base, &root).unwrap();
        assert!(db.cached_files().unwrap().is_empty());

        drop(db);
        let _ = std::fs::remove_dir_all(&base);
    }
}
