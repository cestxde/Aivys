use super::events::TrackStats;
use super::index::{added_at_path, load_added_at};
use super::{Store, StoreError};
use std::cmp::Reverse;
use std::collections::HashMap;

/// Track paths of a virtual system playlist (§8.6), in display order.
/// `limit` is the UI's display cap.
pub(crate) fn paths(
    store: &Store,
    id: &str,
    stats: &HashMap<String, TrackStats>,
    limit: Option<usize>,
) -> Result<Vec<String>, StoreError> {
    let mut ranked: Vec<(&String, (u64, u64))> = match id {
        "favorites" => stats
            .iter()
            .filter(|(_, s)| s.favorite)
            .map(|(path, s)| (path, (s.favorited_at.unwrap_or(0), 0)))
            .collect(),
        "recentlyPlayed" => stats
            .iter()
            .filter_map(|(path, s)| s.last_played_at.map(|ts| (path, (ts, 0))))
            .collect(),
        "mostPlayed" => stats
            .iter()
            .filter(|(_, s)| s.play_count > 0)
            .map(|(path, s)| (path, (u64::from(s.play_count), s.last_played_at.unwrap_or(0))))
            .collect(),
        "recentlyAdded" => {
            let added_at = load_added_at(&added_at_path(store.root()));
            let mut ranked: Vec<(String, u64)> = added_at.into_iter().collect();
            ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            return Ok(take(ranked.into_iter().map(|(path, _)| path), limit));
        }
        _ => return Err(StoreError::NotFound(format!("system playlist {id}"))),
    };

    // Highest rank first; ties by path for a stable order.
    ranked.sort_by(|a, b| Reverse(a.1).cmp(&Reverse(b.1)).then_with(|| a.0.cmp(b.0)));
    Ok(take(ranked.into_iter().map(|(path, _)| path.clone()), limit))
}

fn take(paths: impl Iterator<Item = String>, limit: Option<usize>) -> Vec<String> {
    match limit {
        Some(limit) => paths.take(limit).collect(),
        None => paths.collect(),
    }
}
