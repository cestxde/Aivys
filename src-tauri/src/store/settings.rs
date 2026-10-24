use super::fsio::{default_schema_version, now_unix, read_json_or_default, write_json, SCHEMA_VERSION};
use super::{Store, StoreError};
use crate::artists::ArtistRules;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

const FILE: &str = "library.json";

/// Ids of the virtual system playlists (§8.6).
pub(crate) const SYSTEM_PLAYLISTS: [&str; 4] =
    ["favorites", "recentlyPlayed", "mostPlayed", "recentlyAdded"];

/// `.aivys/library.json`: library-scoped view preferences (§8.1).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LibrarySettings {
    #[serde(default = "default_schema_version")]
    pub(crate) schema_version: u32,
    #[serde(default)]
    pub(crate) ui: UiSettings,
    /// How artist tags are split into artists.
    #[serde(default)]
    pub(crate) artists: ArtistRules,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UiSettings {
    #[serde(default = "default_visible_system_playlists")]
    pub(crate) visible_system_playlists: Vec<String>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

fn default_visible_system_playlists() -> Vec<String> {
    SYSTEM_PLAYLISTS.iter().map(|id| (*id).to_owned()).collect()
}

impl Default for UiSettings {
    fn default() -> Self {
        UiSettings {
            visible_system_playlists: default_visible_system_playlists(),
            extra: Map::new(),
        }
    }
}

impl Default for LibrarySettings {
    fn default() -> Self {
        LibrarySettings {
            schema_version: SCHEMA_VERSION,
            ui: UiSettings::default(),
            artists: ArtistRules::default(),
            updated_at: 0,
            extra: Map::new(),
        }
    }
}

pub(crate) fn load(store: &Store) -> Result<LibrarySettings, StoreError> {
    Ok(read_json_or_default(&store.path(FILE))?.doc)
}

/// Create `library.json` with defaults on first run (§13).
pub(crate) fn ensure(store: &Store) -> Result<(), StoreError> {
    let path = store.path(FILE);
    if path.exists() {
        return Ok(());
    }
    let settings = LibrarySettings {
        updated_at: now_unix(),
        ..LibrarySettings::default()
    };
    write_json(&path, &settings)
}

pub(crate) fn set_visible_system_playlists(
    store: &Store,
    ids: Vec<String>,
) -> Result<LibrarySettings, StoreError> {
    let mut visible = Vec::new();
    for id in ids {
        if !SYSTEM_PLAYLISTS.contains(&id.as_str()) {
            return Err(StoreError::Invalid(format!("unknown system playlist: {id}")));
        }
        if !visible.contains(&id) {
            visible.push(id);
        }
    }

    let path = store.path(FILE);
    let mut settings = read_json_or_default::<LibrarySettings>(&path)?.writable(&path)?;
    settings.schema_version = SCHEMA_VERSION;
    settings.ui.visible_system_playlists = visible;
    settings.updated_at = now_unix();
    write_json(&path, &settings)?;
    Ok(settings)
}

pub(crate) fn set_artist_rules(store: &Store, rules: ArtistRules) -> Result<LibrarySettings, StoreError> {
    let path = store.path(FILE);
    let mut settings = read_json_or_default::<LibrarySettings>(&path)?.writable(&path)?;
    settings.schema_version = SCHEMA_VERSION;
    settings.artists = rules.normalized();
    settings.updated_at = now_unix();
    write_json(&path, &settings)?;
    Ok(settings)
}

/// Merge strategy: last-write-wins by `updatedAt`, whole file.
pub(crate) fn merge(a: LibrarySettings, b: LibrarySettings) -> LibrarySettings {
    if b.updated_at > a.updated_at {
        b
    } else {
        a
    }
}
