use super::fsio::{default_schema_version, now_unix, read_complete_lines, SCHEMA_VERSION};
use super::{Store, StoreError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

const EVENTS_DIR: &str = "events";

/// Event vocabulary (§8.2.1).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum EventKind {
    Play,
    Complete,
    Rating,
    Favorite,
    Unfavorite,
    Tag,
    Untag,
}

impl EventKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            EventKind::Play => "play",
            EventKind::Complete => "complete",
            EventKind::Rating => "rating",
            EventKind::Favorite => "favorite",
            EventKind::Unfavorite => "unfavorite",
            EventKind::Tag => "tag",
            EventKind::Untag => "untag",
        }
    }

    pub(crate) fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "play" => EventKind::Play,
            "complete" => EventKind::Complete,
            "rating" => EventKind::Rating,
            "favorite" => EventKind::Favorite,
            "unfavorite" => EventKind::Unfavorite,
            "tag" => EventKind::Tag,
            "untag" => EventKind::Untag,
            _ => return None,
        })
    }
}

/// One line of a journal. `event` stays a string so lines with an unknown
/// event survive a rewrite untouched.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EventLine {
    #[serde(default = "default_schema_version")]
    pub(crate) schema_version: u32,
    pub(crate) ts: u64,
    pub(crate) device: String,
    pub(crate) path: String,
    pub(crate) event: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) value: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) tag_id: Option<String>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

/// Identity used to collapse duplicate lines (§8.2.4).
pub(crate) type DedupKey = (String, u64, String, String, Option<i64>, Option<String>);

impl EventLine {
    pub(crate) fn dedup_key(&self) -> DedupKey {
        (
            self.device.clone(),
            self.ts,
            self.path.clone(),
            self.event.clone(),
            self.value,
            self.tag_id.clone(),
        )
    }
}

/// Collapses duplicate lines across journal files (§8.2.4) with maximum
/// multiplicity: identical lines repeated within one file are distinct events
/// (e.g. two plays of a track within one second), while the same line in a
/// conflict copy of that file is a duplicate. Each file's lines must be fed
/// in that file's order; files may be interleaved.
pub(crate) struct Dedup<F> {
    kept: HashMap<DedupKey, usize>,
    per_file: HashMap<(F, DedupKey), usize>,
}

impl<F: std::hash::Hash + Eq> Dedup<F> {
    pub(crate) fn new() -> Self {
        Dedup {
            kept: HashMap::new(),
            per_file: HashMap::new(),
        }
    }

    /// Whether this occurrence of `key` in `file` is a new event.
    pub(crate) fn keep(&mut self, file: F, key: DedupKey) -> bool {
        let seen_in_file = self.per_file.entry((file, key.clone())).or_insert(0);
        *seen_in_file += 1;
        let kept = self.kept.entry(key).or_insert(0);
        if *seen_in_file > *kept {
            *kept = *seen_in_file;
            true
        } else {
            false
        }
    }
}

/// An event with a known kind, in the merged total order (§8.2.2).
pub(crate) struct Event {
    pub(crate) line: EventLine,
    pub(crate) kind: EventKind,
}

pub(crate) fn journal_path(store: &Store, device_id: &str) -> PathBuf {
    store.path(&format!("{EVENTS_DIR}/{device_id}.jsonl"))
}

/// Append one event to this device's journal.
pub(crate) fn append(
    store: &Store,
    path: &str,
    kind: EventKind,
    value: Option<i64>,
    tag_id: Option<String>,
) -> Result<(), StoreError> {
    let line = EventLine {
        schema_version: SCHEMA_VERSION,
        ts: now_unix(),
        device: store.device_id().to_owned(),
        path: path.to_owned(),
        event: kind.as_str().to_owned(),
        value,
        tag_id,
        extra: Map::new(),
    };
    let mut text = serde_json::to_string(&line)?;
    text.push('\n');

    append_line(&journal_path(store, store.device_id()), text)?;
    Ok(())
}

fn append_line(path: &Path, mut text: String) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .read(true)
        .append(true)
        .open(path)?;

    // A crash can leave a partial last line; start on a fresh line so the new
    // event is not glued onto it.
    if file.metadata()?.len() > 0 {
        file.seek(SeekFrom::End(-1))?;
        let mut last = [0u8; 1];
        file.read_exact(&mut last)?;
        if last[0] != b'\n' {
            text.insert(0, '\n');
        }
    }

    // One write per line, so a sync tool sees whole lines.
    file.write_all(text.as_bytes())
}

/// All journal files in `events/`, including conflict copies (they hold
/// events too; duplicates are collapsed on read).
pub(crate) fn journal_files(store: &Store) -> Result<Vec<PathBuf>, StoreError> {
    let entries = match fs::read_dir(store.path(EVENTS_DIR)) {
        Ok(entries) => entries,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err.into()),
    };

    let mut files: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect();
    // Canonical `<id>.jsonl` sorts before `<id>.sync-conflict-*.jsonl`.
    files.sort();
    Ok(files)
}

/// Parse a journal line into an event, or explain why it is skipped.
pub(crate) fn parse_line(raw: &str) -> Result<Event, String> {
    let line: EventLine = serde_json::from_str(raw).map_err(|err| format!("bad line: {err}"))?;
    if line.schema_version > SCHEMA_VERSION {
        return Err(format!("newer schemaVersion {}", line.schema_version));
    }
    let kind = EventKind::parse(&line.event).ok_or_else(|| format!("unknown event {:?}", line.event))?;
    Ok(Event { line, kind })
}

/// Read every device's journal and return the known events in total order:
/// `ts`, then `device`, then position within the journal (§8.2.2).
pub(crate) fn read_all(store: &Store) -> Result<Vec<Event>, StoreError> {
    let mut dedup = Dedup::new();
    let mut ordered = Vec::new();

    for (file_idx, file) in journal_files(store)?.iter().enumerate() {
        let lines = match read_complete_lines(file) {
            Ok(lines) => lines,
            Err(err) => {
                log::warn!("cannot read {}: {err}", file.display());
                continue;
            }
        };
        for (line_idx, raw) in lines.iter().enumerate() {
            match parse_line(raw) {
                Ok(event) => {
                    if dedup.keep(file_idx, event.line.dedup_key()) {
                        ordered.push((file_idx, line_idx, event));
                    }
                }
                Err(why) => log::warn!("{}:{}: skipped ({why})", file.display(), line_idx + 1),
            }
        }
    }

    ordered.sort_by(|(fa, la, a), (fb, lb, b)| {
        a.line
            .ts
            .cmp(&b.line.ts)
            .then_with(|| a.line.device.cmp(&b.line.device))
            .then(fa.cmp(fb))
            .then(la.cmp(lb))
    });
    Ok(ordered.into_iter().map(|(_, _, event)| event).collect())
}

/// Per-track state derived from events (§8.2.3). Never stored.
#[derive(Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrackStats {
    pub(crate) play_count: u32,
    pub(crate) last_played_at: Option<u64>,
    pub(crate) rating: Option<u8>,
    pub(crate) favorite: bool,
    pub(crate) favorited_at: Option<u64>,
    /// Assigned user tag ids, in order of first assignment.
    pub(crate) tags: Vec<String>,
}

impl TrackStats {
    fn is_empty(&self) -> bool {
        self.play_count == 0
            && self.last_played_at.is_none()
            && self.rating.is_none()
            && !self.favorite
            && self.tags.is_empty()
    }
}

/// Fold ordered events into per-track state, keyed by track path. Tags in
/// `deleted_tags` are dropped from the result.
pub(crate) fn derive(events: &[Event], deleted_tags: &HashSet<String>) -> HashMap<String, TrackStats> {
    let mut stats: HashMap<String, TrackStats> = HashMap::new();
    // Per track: (tagId, assigned) in order of first appearance.
    let mut tag_state: HashMap<String, Vec<(String, bool)>> = HashMap::new();

    for Event { line, kind } in events {
        let entry = stats.entry(line.path.clone()).or_default();
        match kind {
            EventKind::Play => {
                entry.play_count += 1;
                entry.last_played_at = entry.last_played_at.max(Some(line.ts));
            }
            EventKind::Complete => {
                entry.last_played_at = entry.last_played_at.max(Some(line.ts));
            }
            EventKind::Rating => match line.value {
                Some(0) => entry.rating = None,
                Some(value @ 1..=5) => entry.rating = Some(value as u8),
                other => log::warn!("rating event with bad value {other:?} for {}", line.path),
            },
            EventKind::Favorite => {
                entry.favorite = true;
                entry.favorited_at = Some(line.ts);
            }
            EventKind::Unfavorite => {
                entry.favorite = false;
                entry.favorited_at = None;
            }
            EventKind::Tag | EventKind::Untag => {
                let Some(tag_id) = &line.tag_id else {
                    log::warn!("{} event without tagId for {}", line.event, line.path);
                    continue;
                };
                let assigned = *kind == EventKind::Tag;
                let state = tag_state.entry(line.path.clone()).or_default();
                match state.iter_mut().find(|(id, _)| id == tag_id) {
                    Some(slot) => slot.1 = assigned,
                    None => state.push((tag_id.clone(), assigned)),
                }
            }
        }
    }

    for (path, state) in tag_state {
        if let Some(entry) = stats.get_mut(&path) {
            entry.tags = state
                .into_iter()
                .filter(|(id, assigned)| *assigned && !deleted_tags.contains(id))
                .map(|(id, _)| id)
                .collect();
        }
    }

    stats.retain(|_, entry| !entry.is_empty());
    stats
}

/// Rewrite a journal as the union of its lines and a conflict copy's lines,
/// de-duplicated and in event order (§11). Lines that cannot be parsed are
/// kept as-is at the end: they may come from a newer app version.
pub(crate) fn merge_journal_files(canonical: &Path, conflict: &Path) -> Result<(), StoreError> {
    let files = [read_complete_lines(canonical)?, read_complete_lines(conflict)?];

    let mut dedup = Dedup::new();
    let mut seen_raw = HashSet::new();
    let mut parsed = Vec::new();
    let mut unparsed = Vec::new();

    for (file_idx, lines) in files.into_iter().enumerate() {
        for raw in lines {
            match serde_json::from_str::<EventLine>(&raw) {
                Ok(line) => {
                    if dedup.keep(file_idx, line.dedup_key()) {
                        parsed.push((line.ts, line.device, raw));
                    }
                }
                Err(_) => {
                    if seen_raw.insert(raw.clone()) {
                        unparsed.push(raw);
                    }
                }
            }
        }
    }

    // Stable sort keeps the journal's own order for equal (ts, device).
    parsed.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    let mut text = String::new();
    for raw in parsed.into_iter().map(|(_, _, raw)| raw).chain(unparsed) {
        text.push_str(&raw);
        text.push('\n');
    }
    super::fsio::atomic_write(canonical, text.as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_support::TempLibrary;

    fn line(ts: u64, device: &str, path: &str, event: &str, value: Option<i64>, tag: Option<&str>) -> String {
        let line = EventLine {
            schema_version: 1,
            ts,
            device: device.to_owned(),
            path: path.to_owned(),
            event: event.to_owned(),
            value,
            tag_id: tag.map(str::to_owned),
            extra: Map::new(),
        };
        serde_json::to_string(&line).unwrap() + "\n"
    }

    fn write_journal(store: &Store, device: &str, lines: &[String]) {
        let path = journal_path(store, device);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, lines.concat()).unwrap();
    }

    #[test]
    fn merges_journals_of_all_devices() {
        let lib = TempLibrary::new();
        let store = lib.open();
        let tag = "11111111-1111-4111-8111-111111111111";

        write_journal(
            &store,
            "aaaaaaaa-0000-4000-8000-000000000000",
            &[
                line(100, "aaaaaaaa-0000-4000-8000-000000000000", "a.flac", "play", None, None),
                line(110, "aaaaaaaa-0000-4000-8000-000000000000", "a.flac", "favorite", None, None),
                line(120, "aaaaaaaa-0000-4000-8000-000000000000", "a.flac", "rating", Some(4), None),
                line(130, "aaaaaaaa-0000-4000-8000-000000000000", "a.flac", "tag", None, Some(tag)),
            ],
        );
        write_journal(
            &store,
            "bbbbbbbb-0000-4000-8000-000000000000",
            &[
                line(105, "bbbbbbbb-0000-4000-8000-000000000000", "a.flac", "play", None, None),
                // Removal on another device wins over the earlier favorite.
                line(200, "bbbbbbbb-0000-4000-8000-000000000000", "a.flac", "unfavorite", None, None),
                line(210, "bbbbbbbb-0000-4000-8000-000000000000", "a.flac", "complete", None, None),
                line(220, "bbbbbbbb-0000-4000-8000-000000000000", "b.flac", "unknownEvent", None, None),
            ],
        );

        let events = read_all(&store).unwrap();
        let stats = derive(&events, &HashSet::new());
        let a = &stats["a.flac"];
        assert_eq!(a.play_count, 2);
        assert_eq!(a.last_played_at, Some(210));
        assert_eq!(a.rating, Some(4));
        assert!(!a.favorite);
        assert_eq!(a.tags, vec![tag.to_owned()]);
        assert!(!stats.contains_key("b.flac"));

        let deleted: HashSet<String> = [tag.to_owned()].into();
        assert!(derive(&events, &deleted)["a.flac"].tags.is_empty());
    }

    #[test]
    fn partial_last_line_is_ignored_and_append_starts_fresh_line() {
        let lib = TempLibrary::new();
        let store = lib.open();
        let device = store.device_id().to_owned();

        let mut text = line(1, &device, "a.flac", "play", None, None);
        text.push_str("{\"schemaVersion\":1,\"ts\":2,\"dev");
        let path = journal_path(&store, &device);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, text).unwrap();

        assert_eq!(derive(&read_all(&store).unwrap(), &HashSet::new())["a.flac"].play_count, 1);

        append(&store, "a.flac", EventKind::Play, None, None).unwrap();
        let events = read_all(&store).unwrap();
        assert_eq!(derive(&events, &HashSet::new())["a.flac"].play_count, 2);
    }

    #[test]
    fn repeats_within_one_journal_are_distinct_events() {
        let lib = TempLibrary::new();
        let store = lib.open();
        let device = store.device_id().to_owned();
        write_journal(
            &store,
            &device,
            &[
                line(1, &device, "a.flac", "play", None, None),
                line(1, &device, "a.flac", "play", None, None),
                line(2, &device, "a.flac", "favorite", None, None),
                line(2, &device, "a.flac", "unfavorite", None, None),
                line(2, &device, "a.flac", "favorite", None, None),
            ],
        );
        let stats = derive(&read_all(&store).unwrap(), &HashSet::new());
        assert_eq!(stats["a.flac"].play_count, 2);
        assert!(stats["a.flac"].favorite);
    }

    #[test]
    fn duplicate_lines_from_conflict_copy_are_collapsed() {
        let lib = TempLibrary::new();
        let store = lib.open();
        let device = store.device_id().to_owned();
        let lines = [
            line(1, &device, "a.flac", "play", None, None),
            line(2, &device, "a.flac", "play", None, None),
        ];
        write_journal(&store, &device, &lines);
        fs::write(
            store.path(&format!("events/{device}.sync-conflict-20261023-120000-ABC1234.jsonl")),
            [lines[1].clone(), line(3, &device, "a.flac", "play", None, None)].concat(),
        )
        .unwrap();

        let stats = derive(&read_all(&store).unwrap(), &HashSet::new());
        assert_eq!(stats["a.flac"].play_count, 3);
    }
}
