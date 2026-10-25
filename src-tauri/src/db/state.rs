//! Ingesting the `.aivys/events` journals into the index and serving the
//! derived per-track state from it.
//!
//! Journals are append-only, so normally only the bytes after the last
//! ingested offset are parsed. When a journal vanished or was rewritten (a
//! merged conflict copy), everything is re-ingested from scratch: this is rare.
//! Every line is stored; duplicates across files are collapsed when state is
//! derived, exactly like reading the journals directly.
//!
//! Most commands sync through [`LibraryDb::sync_events_if_changed`], which
//! does not read the journals at all while none of them changed.

use super::LibraryDb;
use crate::store::events::{self, Dedup, Event, EventKind, EventLine, TrackStats};
use crate::store::{tags, Store};
use rusqlite::{params, Transaction};
use serde_json::Map;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::UNIX_EPOCH;

struct Journal {
    name: String,
    bytes: Vec<u8>,
}

/// A journal as it looks on disk: size and modification time, enough to tell
/// that it did not change (journals only grow).
fn file_fingerprint(path: &Path) -> String {
    let Ok(meta) = std::fs::metadata(path) else { return "missing".to_owned() };
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |time| time.as_nanos());
    format!("{}:{modified}", meta.len())
}

/// Everything a sync reads, fingerprinted: each journal by size and
/// modification time, tags.json by its content (it is small and rewritten in
/// place, so a same-size rewrite within a coarse clock tick is possible).
fn fingerprints(store: &Store) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
    let mut result = HashMap::new();
    for path in events::journal_files(store)? {
        let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
        result.insert(name, file_fingerprint(&path));
    }
    let tags = match std::fs::read(store.path(tags::FILE)) {
        Ok(bytes) => blake3::hash(&bytes).to_hex().to_string(),
        Err(_) => "missing".to_owned(),
    };
    // Not a journal name: those end in ".jsonl".
    result.insert(tags::FILE.to_owned(), tags);
    Ok(result)
}

impl LibraryDb {
    /// [`Self::sync_events`], unless no journal and not tags.json changed since
    /// the last sync (by their fingerprints): then nothing is read. Opening
    /// the library syncs in full, which corrects a change this missed.
    pub(crate) fn sync_events_if_changed(&mut self, store: &Store) -> Result<usize, Box<dyn std::error::Error>> {
        let known: HashMap<String, String> = {
            let mut stmt = self.conn.prepare("SELECT name, fingerprint FROM sync_fingerprints")?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
            rows.collect::<rusqlite::Result<_>>()?
        };
        if !known.is_empty() && fingerprints(store)? == known {
            return Ok(0);
        }
        self.sync_events(store)
    }

    /// Bring the index up to date with the journals on disk. Returns the
    /// number of newly ingested lines.
    pub(crate) fn sync_events(&mut self, store: &Store) -> Result<usize, Box<dyn std::error::Error>> {
        // Taken before reading: a journal growing meanwhile shows as changed
        // next time instead of being skipped.
        let seen = fingerprints(store)?;
        let mut journals = Vec::new();
        for path in events::journal_files(store)? {
            let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
            journals.push(Journal {
                name,
                bytes: std::fs::read(&path)?,
            });
        }

        let known: HashMap<String, (usize, String)> = {
            let mut stmt = self.conn.prepare("SELECT file, offset, prefix_hash FROM journals")?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, (row.get(1)?, row.get(2)?))))?;
            rows.collect::<rusqlite::Result<_>>()?
        };

        let names: HashSet<&str> = journals.iter().map(|j| j.name.as_str()).collect();
        let rewritten = journals.iter().any(|journal| {
            known.get(&journal.name).is_some_and(|(offset, hash)| {
                journal.bytes.len() < *offset
                    || blake3::hash(&journal.bytes[..*offset]).to_hex().as_str() != hash
            })
        });
        let full = rewritten || known.keys().any(|file| !names.contains(file.as_str()));

        let tx = self.conn.transaction()?;
        if full {
            log::info!("journals changed underneath the index, re-ingesting");
            tx.execute_batch(
                "DELETE FROM events; DELETE FROM journals;
                 DELETE FROM track_state; DELETE FROM track_tags;",
            )?;
        }

        let mut affected = HashSet::new();
        let mut ingested = 0;
        for journal in &journals {
            let start = if full {
                0
            } else {
                known.get(&journal.name).map_or(0, |(offset, _)| *offset)
            };
            // Only complete lines; a partial last line is picked up once finished.
            let end = journal.bytes[start..]
                .iter()
                .rposition(|byte| *byte == b'\n')
                .map_or(start, |pos| start + pos + 1);
            if end == start {
                continue;
            }

            ingested += ingest(&tx, journal, start, end, &mut affected)?;
            tx.execute(
                "INSERT INTO journals (file, offset, prefix_hash) VALUES (?1, ?2, ?3)
                 ON CONFLICT (file) DO UPDATE SET offset = excluded.offset,
                                                 prefix_hash = excluded.prefix_hash",
                params![
                    journal.name,
                    end as i64,
                    blake3::hash(&journal.bytes[..end]).to_hex().as_str()
                ],
            )?;
        }

        recompute(&tx, &affected)?;
        refresh_user_tags(&tx, store)?;
        tx.execute("DELETE FROM sync_fingerprints", [])?;
        {
            let mut insert = tx.prepare("INSERT INTO sync_fingerprints (name, fingerprint) VALUES (?1, ?2)")?;
            for (name, fingerprint) in &seen {
                insert.execute(params![name, fingerprint])?;
            }
        }
        tx.commit()?;
        Ok(ingested)
    }

    /// Derived state of every track that has any, keyed by relative path.
    /// Tags deleted in `tags.json` are left out.
    pub(crate) fn track_stats(&self) -> rusqlite::Result<HashMap<String, TrackStats>> {
        let mut stats = HashMap::new();
        let mut stmt = self.conn.prepare(
            "SELECT rel_path, play_count, last_played_at, rating, favorite, favorited_at
             FROM track_state",
        )?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            stats.insert(
                row.get::<_, String>(0)?,
                TrackStats {
                    play_count: row.get(1)?,
                    last_played_at: row.get(2)?,
                    rating: row.get(3)?,
                    favorite: row.get(4)?,
                    favorited_at: row.get(5)?,
                    tags: Vec::new(),
                },
            );
        }

        let mut stmt = self.conn.prepare(
            "SELECT rel_path, tag_id FROM track_tags
             WHERE tag_id NOT IN (SELECT id FROM user_tags WHERE deleted = 1)
             ORDER BY rel_path, position",
        )?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let path: String = row.get(0)?;
            stats.entry(path).or_default().tags.push(row.get(1)?);
        }
        Ok(stats)
    }
}

/// Parse and insert the complete lines in `bytes[start..end]`. Returns the
/// number of events inserted.
fn ingest(
    tx: &Transaction,
    journal: &Journal,
    start: usize,
    end: usize,
    affected: &mut HashSet<String>,
) -> rusqlite::Result<usize> {
    let mut insert = tx.prepare_cached(
        "INSERT INTO events (file, seq, ts, device, path, event, value, tag_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )?;

    let mut inserted = 0;
    let mut seq = start;
    for line in journal.bytes[start..end].split_inclusive(|byte| *byte == b'\n') {
        let line_start = seq;
        seq += line.len();

        let raw = String::from_utf8_lossy(line);
        let raw = raw.trim_end_matches(['\n', '\r']);
        if raw.trim().is_empty() {
            continue;
        }
        match events::parse_line(raw) {
            Ok(Event { line, .. }) => {
                insert.execute(params![
                    journal.name,
                    line_start as i64,
                    line.ts,
                    line.device,
                    line.path,
                    line.event,
                    line.value,
                    line.tag_id,
                ])?;
                inserted += 1;
                affected.insert(line.path);
            }
            Err(why) => log::warn!("{} @{line_start}: skipped ({why})", journal.name),
        }
    }
    Ok(inserted)
}

/// Re-derive `track_state` / `track_tags` of the given paths from their events.
fn recompute(tx: &Transaction, paths: &HashSet<String>) -> rusqlite::Result<()> {
    let mut select = tx.prepare(
        "SELECT ts, device, event, value, tag_id, file FROM events WHERE path = ?1
         ORDER BY ts, device, file, seq",
    )?;
    let mut insert_state = tx.prepare(
        "INSERT INTO track_state (rel_path, play_count, last_played_at, rating, favorite, favorited_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;
    let mut insert_tag = tx.prepare("INSERT INTO track_tags (rel_path, position, tag_id) VALUES (?1, ?2, ?3)")?;

    for path in paths {
        let rows = select.query_map([path], |row| {
            let file: String = row.get(5)?;
            let line = EventLine {
                schema_version: 1,
                ts: row.get(0)?,
                device: row.get(1)?,
                path: path.clone(),
                event: row.get(2)?,
                value: row.get(3)?,
                tag_id: row.get(4)?,
                extra: Map::new(),
            };
            Ok((file, line))
        })?;
        // Same-key lines of one file come out in file order (same ts and
        // device, then seq), as Dedup requires.
        let mut dedup = Dedup::new();
        let mut ordered = Vec::new();
        for row in rows {
            let (file, line) = row?;
            // Only known events are ever inserted.
            let Some(kind) = EventKind::parse(&line.event) else {
                continue;
            };
            if dedup.keep(file, line.dedup_key()) {
                ordered.push(Event { line, kind });
            }
        }

        tx.execute("DELETE FROM track_state WHERE rel_path = ?1", [path])?;
        tx.execute("DELETE FROM track_tags WHERE rel_path = ?1", [path])?;

        // Deleted tags are filtered at query time: tags.json changes on its own.
        let Some(stats) = events::derive(&ordered, &HashSet::new()).remove(path) else {
            continue;
        };
        insert_state.execute(params![
            path,
            stats.play_count,
            stats.last_played_at,
            stats.rating,
            stats.favorite,
            stats.favorited_at,
        ])?;
        for (position, tag_id) in stats.tags.iter().enumerate() {
            insert_tag.execute(params![path, position as i64, tag_id])?;
        }
    }
    Ok(())
}

/// Mirror `tags.json` into `user_tags`. Keeps the old copy if it is unreadable.
fn refresh_user_tags(tx: &Transaction, store: &Store) -> rusqlite::Result<()> {
    let doc = match tags::load(store) {
        Ok(doc) => doc,
        Err(err) => {
            log::warn!("cannot read tags.json: {err}");
            return Ok(());
        }
    };
    tx.execute("DELETE FROM user_tags", [])?;
    let mut insert = tx.prepare("INSERT OR REPLACE INTO user_tags (id, name, deleted) VALUES (?1, ?2, ?3)")?;
    for tag in doc.tags {
        insert.execute(params![tag.id, tag.name, tag.deleted_at.is_some()])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::events::{append, journal_path};
    use crate::store::test_support::TempLibrary;
    use std::fs;

    fn open(lib: &TempLibrary) -> (Store, LibraryDb) {
        let store = lib.open();
        let db = LibraryDb::open(&lib.base.join("app-data"), store.root()).unwrap();
        (store, db)
    }

    #[test]
    fn ingests_incrementally_and_matches_direct_derivation() {
        let lib = TempLibrary::new();
        let (store, mut db) = open(&lib);

        append(&store, "a.flac", EventKind::Play, None, None).unwrap();
        append(&store, "a.flac", EventKind::Favorite, None, None).unwrap();
        assert_eq!(db.sync_events(&store).unwrap(), 2);
        assert_eq!(db.sync_events(&store).unwrap(), 0);

        let tag = tags::create(&store, "Chill", "#000000").unwrap();
        append(&store, "a.flac", EventKind::Play, None, None).unwrap();
        append(&store, "a.flac", EventKind::Rating, Some(5), None).unwrap();
        append(&store, "b.flac", EventKind::Tag, None, Some(tag.id.clone())).unwrap();
        assert_eq!(db.sync_events(&store).unwrap(), 3);

        let direct = events::derive(&events::read_all(&store).unwrap(), &HashSet::new());
        assert_eq!(db.track_stats().unwrap(), direct);
        assert_eq!(db.track_stats().unwrap()["a.flac"].play_count, 2);

        // A deleted tag disappears without any new event.
        tags::delete(&store, &tag.id).unwrap();
        db.sync_events(&store).unwrap();
        assert!(db.track_stats().unwrap()["b.flac"].tags.is_empty());
    }

    #[test]
    fn rewritten_or_removed_journal_triggers_full_reingest() {
        let lib = TempLibrary::new();
        let (store, mut db) = open(&lib);
        let device = store.device_id().to_owned();
        let line = |ts: u64| {
            format!("{{\"schemaVersion\":1,\"ts\":{ts},\"device\":\"{device}\",\"path\":\"a.flac\",\"event\":\"play\"}}\n")
        };

        let path = journal_path(&store, &device);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, line(1) + &line(3)).unwrap();
        // A conflict copy with one duplicate and one new event.
        let copy = path.with_file_name(format!("{device}.sync-conflict-20261023-120000-ABC1234.jsonl"));
        fs::write(&copy, line(3) + &line(2)).unwrap();
        db.sync_events(&store).unwrap();
        assert_eq!(db.track_stats().unwrap()["a.flac"].play_count, 3);

        // Merge: the canonical file is rewritten in order, the copy goes away.
        fs::write(&path, line(1) + &line(2) + &line(3)).unwrap();
        fs::remove_file(&copy).unwrap();
        db.sync_events(&store).unwrap();
        assert_eq!(db.track_stats().unwrap()["a.flac"].play_count, 3);

        // A partial line is not ingested until it is complete.
        let mut text = fs::read_to_string(&path).unwrap();
        let next = line(4);
        text.push_str(&next[..20]);
        fs::write(&path, &text).unwrap();
        assert_eq!(db.sync_events(&store).unwrap(), 0);
        text.push_str(&next[20..]);
        fs::write(&path, &text).unwrap();
        assert_eq!(db.sync_events(&store).unwrap(), 1);
        assert_eq!(db.track_stats().unwrap()["a.flac"].play_count, 4);
    }

    #[test]
    fn quick_sync_reads_only_after_a_change() {
        let lib = TempLibrary::new();
        let (store, mut db) = open(&lib);
        append(&store, "a.flac", EventKind::Play, None, None).unwrap();
        assert_eq!(db.sync_events_if_changed(&store).unwrap(), 1);
        assert_eq!(db.sync_events_if_changed(&store).unwrap(), 0);

        // An append (own, or synced in) is seen.
        append(&store, "a.flac", EventKind::Favorite, None, None).unwrap();
        assert_eq!(db.sync_events_if_changed(&store).unwrap(), 1);
        assert!(db.track_stats().unwrap()["a.flac"].favorite);

        // A deleted tag goes from the tracks without any journal change.
        let tag = tags::create(&store, "Chill", "#000000").unwrap();
        append(&store, "a.flac", EventKind::Tag, None, Some(tag.id.clone())).unwrap();
        db.sync_events_if_changed(&store).unwrap();
        assert_eq!(db.track_stats().unwrap()["a.flac"].tags, vec![tag.id.clone()]);
        tags::delete(&store, &tag.id).unwrap();
        db.sync_events_if_changed(&store).unwrap();
        assert!(db.track_stats().unwrap()["a.flac"].tags.is_empty());

        // A new journal (another device's) is seen.
        let device = "00000000-0000-4000-8000-000000000001";
        let line = format!(r#"{{"schemaVersion":1,"ts":5,"device":"{device}","path":"a.flac","event":"play"}}"#);
        fs::write(journal_path(&store, device), line + "\n").unwrap();
        assert_eq!(db.sync_events_if_changed(&store).unwrap(), 1);
        assert_eq!(db.track_stats().unwrap()["a.flac"].play_count, 2);

        // The one case it misses: a same-size rewrite keeping the time. The
        // full sync (on opening the library) corrects it.
        let own = journal_path(&store, store.device_id());
        let before = fs::metadata(&own).unwrap();
        let text = fs::read_to_string(&own).unwrap().replacen(r#""event":"favorite""#, r#""event":"complete""#, 1);
        assert_eq!(text.len() as u64, before.len());
        fs::write(&own, &text).unwrap();
        fs::File::options().write(true).open(&own).unwrap().set_modified(before.modified().unwrap()).unwrap();
        assert_eq!(db.sync_events_if_changed(&store).unwrap(), 0);
        assert!(db.track_stats().unwrap()["a.flac"].favorite);
        db.sync_events(&store).unwrap();
        assert!(!db.track_stats().unwrap()["a.flac"].favorite);
    }
}
