use super::fsio::{now_unix, read_json, write_json};
use super::{device, events, index, playlists, settings, tags, Store, StoreError};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Infix of Syncthing conflict copies:
/// `<name>.sync-conflict-<YYYYMMDD>-<HHMMSS>-<deviceShortId>.<ext>`.
const MARKER: &str = ".sync-conflict-";
const ARCHIVE_DIR: &str = ".conflicts";

/// What a conflict pass did (§11), for logging and a future UI notice.
#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictReport {
    /// Conflict copies merged (or promoted) and archived.
    pub(crate) merged: Vec<String>,
    /// Conflict copies left in place, with the reason.
    pub(crate) skipped: Vec<String>,
    pub(crate) device_id_regenerated: bool,
}

impl ConflictReport {
    pub(crate) fn is_empty(&self) -> bool {
        self.merged.is_empty() && self.skipped.is_empty()
    }
}

enum Outcome {
    /// Merged into the canonical file; archive the copy.
    Merged,
    /// The canonical file was missing; the copy was renamed into its place.
    Promoted,
    /// Merged into this device's own journal: the device id is shared.
    OwnJournalMerged,
    Kept(String),
}

/// The canonical file name a conflict copy belongs to.
pub(crate) fn canonical_name(file_name: &str) -> Option<String> {
    let idx = file_name.find(MARKER)?;
    let stem = &file_name[..idx];
    let rest = &file_name[idx + MARKER.len()..];
    // The date/time/device part contains no dots, so the extension (if any)
    // starts at the first one.
    Some(match rest.find('.') {
        Some(dot) => format!("{stem}{}", &rest[dot..]),
        None => stem.to_owned(),
    })
}

fn rel_of(store: &Store, path: &Path) -> String {
    path.strip_prefix(store.dir())
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Find conflict copies in `.aivys/` and merge each into its canonical file.
pub(crate) fn resolve(store: &mut Store) -> Result<ConflictReport, StoreError> {
    let mut found: Vec<PathBuf> = WalkDir::new(store.dir())
        .into_iter()
        .filter_entry(|entry| entry.file_name() != ARCHIVE_DIR)
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| entry.file_name().to_string_lossy().contains(MARKER))
        .map(|entry| entry.into_path())
        .collect();
    found.sort();

    let mut report = ConflictReport::default();
    for conflict in found {
        let rel = rel_of(store, &conflict);
        let Some(name) = canonical_name(&conflict.file_name().unwrap_or_default().to_string_lossy()) else {
            continue;
        };
        let canonical = conflict.with_file_name(name);
        let canonical_rel = rel_of(store, &canonical);

        let outcome = resolve_one(store, &conflict, &canonical, &canonical_rel).and_then(|outcome| {
            if matches!(outcome, Outcome::Merged | Outcome::OwnJournalMerged) {
                archive(store, &conflict, &rel)?;
            }
            Ok(outcome)
        });

        match outcome {
            Ok(Outcome::Merged | Outcome::Promoted) => report.merged.push(rel),
            Ok(Outcome::OwnJournalMerged) => {
                report.merged.push(rel);
                if !report.device_id_regenerated {
                    let id = device::regenerate(store.app_data())?;
                    log::warn!("device id was shared with another installation; now {id}");
                    store.set_device_id(id);
                    report.device_id_regenerated = true;
                }
            }
            Ok(Outcome::Kept(reason)) => report.skipped.push(format!("{rel}: {reason}")),
            Err(err) => report.skipped.push(format!("{rel}: {err}")),
        }
    }
    Ok(report)
}

fn resolve_one(store: &Store, conflict: &Path, canonical: &Path, canonical_rel: &str) -> Result<Outcome, StoreError> {
    let journal_owner = canonical_rel
        .strip_prefix("events/")
        .and_then(|name| name.strip_suffix(".jsonl"))
        .filter(|name| !name.contains('/'));

    // Another device's journal is merged by that device; readers already read
    // both files and de-duplicate.
    if let Some(owner) = journal_owner {
        if owner != store.device_id() {
            return Ok(Outcome::Kept("journal of another device, merged by its owner".to_owned()));
        }
    }

    if !canonical.exists() {
        std::fs::rename(conflict, canonical)?;
        return Ok(Outcome::Promoted);
    }

    if journal_owner.is_some() {
        events::merge_journal_files(canonical, conflict)?;
        return Ok(Outcome::OwnJournalMerged);
    }

    match canonical_rel {
        "library.json" => merge_docs(canonical, conflict, settings::merge),
        "tags.json" => merge_docs(canonical, conflict, tags::merge),
        "index/added-at.json" => {
            let mut map = index::load_added_at(canonical);
            index::merge_added_at(&mut map, index::load_added_at(conflict));
            if !index::save_added_at(canonical, &map) {
                return Err(StoreError::Invalid("cannot write added-at.json".to_owned()));
            }
            Ok(Outcome::Merged)
        }
        rel if is_playlist_doc(rel) => {
            let outcome = merge_docs(canonical, conflict, playlists::merge)?;
            if matches!(outcome, Outcome::Merged) {
                if let Some(merged) = read_json::<playlists::Playlist>(canonical)? {
                    playlists::cleanup_orphan_covers(store, &merged.doc);
                }
            }
            Ok(outcome)
        }
        // Sync tools keep the newer file under the canonical name, which is
        // also the one the newer playlist document references.
        rel if rel.starts_with("playlists/covers/") => Ok(Outcome::Merged),
        // Single-writer descriptor: the copy is redundant.
        rel if rel.starts_with("devices/") => Ok(Outcome::Merged),
        _ => Ok(Outcome::Kept("unknown file".to_owned())),
    }
}

fn is_playlist_doc(rel: &str) -> bool {
    rel.strip_prefix("playlists/")
        .and_then(|name| name.strip_suffix(".json"))
        .is_some_and(|stem| uuid::Uuid::parse_str(stem).is_ok())
}

/// Merge two versions of a JSON document into `canonical`. Documents from a
/// newer schema are never merged (§6): both copies are kept.
fn merge_docs<T: DeserializeOwned + Serialize>(
    canonical: &Path,
    conflict: &Path,
    merge: impl FnOnce(T, T) -> T,
) -> Result<Outcome, StoreError> {
    let (Some(ours), Some(theirs)) = (read_json::<T>(canonical)?, read_json::<T>(conflict)?) else {
        return Err(StoreError::NotFound(canonical.display().to_string()));
    };
    if ours.read_only || theirs.read_only {
        return Ok(Outcome::Kept("written by a newer app version".to_owned()));
    }
    write_json(canonical, &merge(ours.doc, theirs.doc))?;
    Ok(Outcome::Merged)
}

/// Move a handled conflict copy to `.aivys/.conflicts/` instead of deleting it.
fn archive(store: &Store, conflict: &Path, rel: &str) -> Result<(), StoreError> {
    let dir = store.dir().join(ARCHIVE_DIR);
    std::fs::create_dir_all(&dir)?;
    let name = format!("{}_{}", now_unix(), rel.replace('/', "__"));
    std::fs::rename(conflict, dir.join(name))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_support::TempLibrary;
    use std::fs;

    #[test]
    fn canonical_names() {
        assert_eq!(
            canonical_name("3b2e.sync-conflict-20261023-120000-ABC1234.json").as_deref(),
            Some("3b2e.json")
        );
        assert_eq!(canonical_name("schema.sync-conflict-20261023-120000-ABC1234").as_deref(), Some("schema"));
        assert_eq!(canonical_name("tags.json"), None);
    }

    #[test]
    fn merges_tags_and_archives_copy() {
        let lib = TempLibrary::new();
        let mut store = lib.open();

        tags::create(&store, "Mine", "#000000", &[]).unwrap();
        let mut theirs = tags::TagsDoc::default();
        theirs.tags.push(tags::TagDef {
            id: crate::store::new_uuid(),
            name: "Theirs".into(),
            color: "#ffffff".into(),
            category_ids: Vec::new(),
            created_at: 1,
            updated_at: 1,
            deleted_at: None,
            extra: Default::default(),
        });
        let copy = store.path("tags.sync-conflict-20261023-120000-ABC1234.json");
        write_json(&copy, &theirs).unwrap();

        let report = resolve(&mut store).unwrap();
        assert_eq!(report.merged.len(), 1);
        assert!(!copy.exists());
        assert_eq!(tags::list(&store).unwrap().len(), 2);
        assert_eq!(fs::read_dir(store.dir().join(ARCHIVE_DIR)).unwrap().count(), 1);
    }

    #[test]
    fn own_journal_conflict_regenerates_device_id() {
        let lib = TempLibrary::new();
        let mut store = lib.open();
        let old_id = store.device_id().to_owned();

        events::append(&store, "a.flac", events::EventKind::Play, None, None).unwrap();
        let canonical = events::journal_path(&store, &old_id);
        let copy = canonical.with_file_name(format!("{old_id}.sync-conflict-20261023-120000-ABC1234.jsonl"));
        fs::write(
            &copy,
            format!("{{\"schemaVersion\":1,\"ts\":5,\"device\":\"{old_id}\",\"path\":\"b.flac\",\"event\":\"play\"}}\n"),
        )
        .unwrap();

        let report = resolve(&mut store).unwrap();
        assert!(report.device_id_regenerated);
        assert_ne!(store.device_id(), old_id);
        assert!(!copy.exists());
        assert_eq!(crate::store::fsio::read_complete_lines(&canonical).unwrap().len(), 2);
    }

    #[test]
    fn newer_schema_conflict_is_left_alone() {
        let lib = TempLibrary::new();
        let mut store = lib.open();
        let copy = store.path("library.sync-conflict-20261023-120000-ABC1234.json");
        fs::write(&copy, "{\"schemaVersion\":2,\"ui\":{}}").unwrap();

        let report = resolve(&mut store).unwrap();
        assert_eq!(report.skipped.len(), 1);
        assert!(copy.exists());
    }
}
