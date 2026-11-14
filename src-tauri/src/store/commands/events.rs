use super::{record, record_at, with_library, with_store, StoreState};
use crate::store::events::{self, EventKind, HiddenLevel, TrackStats};
use crate::store::tags;
use crate::store::{Store, StoreError};
use std::collections::{HashMap, HashSet};
use tauri::State;

#[tauri::command]
pub(crate) async fn record_play(state: State<'_, StoreState>, path: String, at: Option<u64>) -> Result<(), StoreError> {
    record_at(&state, &path, EventKind::Play, None, None, at)
}

#[tauri::command]
pub(crate) async fn record_complete(state: State<'_, StoreState>, path: String, at: Option<u64>) -> Result<(), StoreError> {
    record_at(&state, &path, EventKind::Complete, None, None, at)
}

/// Append a chunk of listening time. `seconds` is wall-clock time spent playing
/// (at least 1). Optional `at` is when the chunk ended (Unix seconds).
#[tauri::command]
pub(crate) async fn record_listen(
    state: State<'_, StoreState>,
    path: String,
    seconds: u32,
    at: Option<u64>,
) -> Result<(), StoreError> {
    if seconds == 0 {
        return Ok(());
    }
    record_at(&state, &path, EventKind::Listen, Some(i64::from(seconds)), None, at)
}

/// `rating` is 1–5, or 0 to clear.
#[tauri::command]
pub(crate) async fn set_rating(state: State<'_, StoreState>, path: String, rating: u8) -> Result<(), StoreError> {
    if rating > 5 {
        return Err(StoreError::Invalid(format!("rating must be 0-5: {rating}")));
    }
    record(&state, &path, EventKind::Rating, Some(i64::from(rating)), None)
}

#[tauri::command]
pub(crate) async fn set_favorite(state: State<'_, StoreState>, path: String, favorite: bool) -> Result<(), StoreError> {
    let kind = if favorite { EventKind::Favorite } else { EventKind::Unfavorite };
    record(&state, &path, kind, None, None)
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn set_track_tag(
    state: State<'_, StoreState>,
    path: String,
    tag_id: String,
    assigned: bool,
) -> Result<(), StoreError> {
    with_store(&state, |store| {
        let key = store.track_key(&path)?;
        if !assigned {
            return events::append(store, &key, EventKind::Untag, None, Some(tag_id));
        }
        let live = tags::list(store)?;
        if !live.iter().any(|tag| tag.id == tag_id) {
            return Err(StoreError::NotFound(format!("tag {tag_id}")));
        }
        // Also assign every tag this one implies (and those imply, …).
        let mut ids = vec![tag_id.clone()];
        ids.extend(tags::implied_by(store, &tag_id)?);
        let current = events::derive(&events::read_all(store)?, &tags::deleted_ids(store)?)
            .remove(&key)
            .map(|stats| stats.tags)
            .unwrap_or_default();
        for id in ids {
            if current.iter().any(|have| have == &id) {
                continue;
            }
            events::append(store, &key, EventKind::Tag, None, Some(id))?;
        }
        Ok(())
    })
}

/// Link or unlink a track to an artist by hand (`tagId` in the journal holds
/// the artist name). Does not change file tags.
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn set_track_artist_link(
    state: State<'_, StoreState>,
    path: String,
    artist: String,
    linked: bool,
) -> Result<(), StoreError> {
    let name = artist.trim().to_owned();
    if name.is_empty() {
        return Err(StoreError::Invalid("artist name is empty".into()));
    }
    with_store(&state, |store| {
        let key = store.track_key(&path)?;
        let current = events::derive(&events::read_all(store)?, &HashSet::new())
            .remove(&key)
            .map(|stats| stats.linked_artists)
            .unwrap_or_default();
        let known = current.iter().find(|have| have.eq_ignore_ascii_case(&name));
        if linked {
            if known.is_some() {
                return Ok(());
            }
            events::append(store, &key, EventKind::ArtistLink, None, Some(name))
        } else {
            let Some(stored) = known else {
                return Ok(());
            };
            events::append(store, &key, EventKind::ArtistUnlink, None, Some(stored.clone()))
        }
    })
}

/// `level` 0 = visible, 1 = hide from library tab only, 2 = hide everywhere.
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn set_track_hidden(
    state: State<'_, StoreState>,
    path: String,
    level: u8,
) -> Result<(), StoreError> {
    if level > 2 {
        return Err(StoreError::Invalid(format!("level must be 0-2: {level}")));
    }
    with_store(&state, |store| {
        let key = store.track_key(&path)?;
        let current = events::derive(&events::read_all(store)?, &HashSet::new())
            .get(&key)
            .and_then(|stats| stats.hidden)
            .map(|hidden| match hidden {
                HiddenLevel::Library => 1,
                HiddenLevel::Everywhere => 2,
            })
            .unwrap_or(0);
        if current == level {
            return Ok(());
        }
        events::append(store, &key, EventKind::Hide, Some(i64::from(level)), None)
    })
}

/// Derived state straight from the journals; used when the index is unavailable.
fn stats_from_journals(store: &Store) -> Result<HashMap<String, TrackStats>, StoreError> {
    let deleted_tags = tags::deleted_ids(store).unwrap_or_else(|err| {
        log::warn!("cannot read tags.json: {err}");
        Default::default()
    });
    Ok(events::derive(&events::read_all(store)?, &deleted_tags))
}

/// Derived state of every track that has any, keyed by relative path.
#[tauri::command]
pub(crate) async fn get_track_stats(state: State<'_, StoreState>) -> Result<HashMap<String, TrackStats>, StoreError> {
    with_library(&state, |library| {
        if let Some(db) = library.synced_db() {
            match db.track_stats() {
                Ok(stats) => return Ok(stats),
                Err(err) => log::warn!("index query failed: {err}"),
            }
        }
        stats_from_journals(&library.store)
    })
}

/// Play counts per track since `since` (Unix seconds), or all time when omitted.
#[tauri::command]
pub(crate) async fn get_play_counts(
    state: State<'_, StoreState>,
    since: Option<u64>,
) -> Result<HashMap<String, u32>, StoreError> {
    with_library(&state, |library| {
        if let Some(db) = library.synced_db() {
            match db.play_counts_since(since) {
                Ok(counts) => return Ok(counts),
                Err(err) => log::warn!("index query failed: {err}"),
            }
        }
        play_counts_from_journals(&library.store, since)
    })
}

/// Play counts from the journals directly (when the index is unavailable).
fn play_counts_from_journals(store: &Store, since: Option<u64>) -> Result<HashMap<String, u32>, StoreError> {
    let mut counts = HashMap::new();
    for event in events::read_all(store)? {
        if event.kind != EventKind::Play {
            continue;
        }
        if since.is_some_and(|from| event.line.ts < from) {
            continue;
        }
        *counts.entry(event.line.path).or_insert(0) += 1;
    }
    Ok(counts)
}

/// Total listening seconds since `since` (Unix seconds), or all time when omitted.
#[tauri::command]
pub(crate) async fn get_listen_seconds(
    state: State<'_, StoreState>,
    since: Option<u64>,
) -> Result<u64, StoreError> {
    with_library(&state, |library| {
        if let Some(db) = library.synced_db() {
            match db.listen_seconds_since(since) {
                Ok(seconds) => return Ok(seconds),
                Err(err) => log::warn!("index query failed: {err}"),
            }
        }
        listen_seconds_from_journals(&library.store, since)
    })
}

/// Listening seconds from the journals directly (when the index is unavailable).
fn listen_seconds_from_journals(store: &Store, since: Option<u64>) -> Result<u64, StoreError> {
    let mut total: u64 = 0;
    for event in events::read_all(store)? {
        if event.kind != EventKind::Listen {
            continue;
        }
        if since.is_some_and(|from| event.line.ts < from) {
            continue;
        }
        if let Some(seconds) = event.line.value.filter(|v| *v > 0) {
            total = total.saturating_add(seconds as u64);
        }
    }
    Ok(total)
}
