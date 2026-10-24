//! The `.aivys/` directory next to the music library: user data that cannot
//! live in audio-file tags (favorites, ratings, plays, user tags, playlists,
//! library settings). The on-disk format is specified in
//! `docs/aivys-format.md`; section numbers below refer to it.

pub(crate) mod commands;
pub(crate) mod conflicts;
pub(crate) mod device;
pub(crate) mod events;
pub(crate) mod fsio;
pub(crate) mod index;
pub(crate) mod playlists;
pub(crate) mod settings;
pub(crate) mod tags;

use serde::{Serialize, Serializer};
use std::fmt;
use std::path::{Path, PathBuf};

pub(crate) const AIVYS_DIR: &str = ".aivys";

#[derive(Debug)]
pub(crate) enum StoreError {
    Io(std::io::Error),
    Json(serde_json::Error),
    /// The document was written by a newer app version and is read-only (§6).
    NewerSchema(PathBuf),
    NotFound(String),
    Invalid(String),
    /// No library is open yet.
    NotOpen,
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::Io(err) => write!(f, "i/o error: {err}"),
            StoreError::Json(err) => write!(f, "invalid json: {err}"),
            StoreError::NewerSchema(path) => write!(
                f,
                "{} was written by a newer version of the app and is read-only",
                path.display()
            ),
            StoreError::NotFound(what) => write!(f, "not found: {what}"),
            StoreError::Invalid(why) => write!(f, "invalid request: {why}"),
            StoreError::NotOpen => write!(f, "no library is open"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<std::io::Error> for StoreError {
    fn from(err: std::io::Error) -> Self {
        StoreError::Io(err)
    }
}

impl From<serde_json::Error> for StoreError {
    fn from(err: serde_json::Error) -> Self {
        StoreError::Json(err)
    }
}

/// Commands return errors to the frontend as plain strings.
impl Serialize for StoreError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// An open library: its root, its `.aivys/` directory and this device's id.
pub(crate) struct Store {
    root: PathBuf,
    dir: PathBuf,
    app_data: PathBuf,
    device_id: String,
}

impl Store {
    /// Open (and initialize if needed) the `.aivys/` directory of the library
    /// at `root`. `app_data` is the OS app-data directory holding device-local
    /// state such as `device-id`.
    pub(crate) fn open(root: &Path, app_data: &Path) -> Result<Store, StoreError> {
        let dir = root.join(AIVYS_DIR);
        std::fs::create_dir_all(&dir)?;

        let device_id = device::load_or_create(app_data)?;
        let mut store = Store {
            root: root.to_path_buf(),
            dir,
            app_data: app_data.to_path_buf(),
            device_id,
        };

        // Merge conflict copies before anything reads the documents.
        match conflicts::resolve(&mut store) {
            Ok(report) if !report.is_empty() => log::info!("sync conflicts: {report:?}"),
            Ok(_) => {}
            Err(err) => log::warn!("conflict resolution failed: {err}"),
        }

        settings::ensure(&store)?;
        if let Err(err) = device::ensure_descriptor(&store) {
            log::warn!("cannot write device descriptor: {err}");
        }

        Ok(store)
    }

    pub(crate) fn root(&self) -> &Path {
        &self.root
    }

    /// Absolute path of a file inside `.aivys/`, given as `/`-separated
    /// relative path (e.g. `"playlists/<id>.json"`).
    pub(crate) fn path(&self, rel: &str) -> PathBuf {
        let mut path = self.dir.clone();
        path.extend(rel.split('/'));
        path
    }

    pub(crate) fn dir(&self) -> &Path {
        &self.dir
    }

    pub(crate) fn device_id(&self) -> &str {
        &self.device_id
    }

    pub(crate) fn app_data(&self) -> &Path {
        &self.app_data
    }

    pub(crate) fn set_device_id(&mut self, device_id: String) {
        self.device_id = device_id;
    }

    /// Normalize a track path to the storage key (§4): relative to the
    /// library root, `/`-separated. Accepts absolute paths under the root as
    /// well as already-relative ones.
    pub(crate) fn track_key(&self, input: &str) -> Result<String, StoreError> {
        let path = Path::new(input);
        let rel = if path.is_absolute() {
            path.strip_prefix(&self.root)
                .map_err(|_| StoreError::Invalid(format!("path is outside the library: {input}")))?
        } else {
            path
        };

        let key = rel.to_string_lossy().replace('\\', "/");
        let key = key.trim_start_matches('/');
        if key.is_empty() || key.split('/').any(|part| part == ".." || part.is_empty()) {
            return Err(StoreError::Invalid(format!("bad track path: {input}")));
        }
        Ok(key.to_owned())
    }
}

/// Validate that `id` is a UUID (used for every id that ends up in a file
/// name, so it can never escape its directory).
pub(crate) fn validate_uuid(id: &str) -> Result<(), StoreError> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| StoreError::Invalid(format!("not a uuid: {id}")))
}

pub(crate) fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::Store;
    use std::path::PathBuf;

    /// A throwaway library + app-data directory pair under the OS temp dir.
    pub(crate) struct TempLibrary {
        pub(crate) base: PathBuf,
    }

    impl TempLibrary {
        pub(crate) fn new() -> Self {
            let base = std::env::temp_dir().join(format!("aivys-test-{}", super::new_uuid()));
            std::fs::create_dir_all(base.join("library")).unwrap();
            std::fs::create_dir_all(base.join("app-data")).unwrap();
            TempLibrary { base }
        }

        pub(crate) fn open(&self) -> Store {
            Store::open(&self.base.join("library"), &self.base.join("app-data")).unwrap()
        }
    }

    impl Drop for TempLibrary {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.base);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::TempLibrary;

    #[test]
    fn track_key_normalizes_paths() {
        let lib = TempLibrary::new();
        let store = lib.open();

        let abs = store.root().join("Artist").join("01.flac");
        assert_eq!(store.track_key(&abs.to_string_lossy()).unwrap(), "Artist/01.flac");
        assert_eq!(store.track_key("Artist\\01.flac").unwrap(), "Artist/01.flac");
        assert!(store.track_key("../outside.flac").is_err());
        assert!(store.track_key("").is_err());
    }
}
