use super::StoreError;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// The `schemaVersion` this build reads and writes.
pub(crate) const SCHEMA_VERSION: u32 = 1;

/// Serde default for documents written before `schemaVersion` existed.
pub(crate) fn default_schema_version() -> u32 {
    1
}

pub(crate) fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Write `bytes` to `<path>.tmp` next to the target, then rename it into
/// place, so a sync tool never observes a half-written file.
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut tmp_name = path.file_name().unwrap_or_default().to_os_string();
    tmp_name.push(".tmp");
    let tmp = path.with_file_name(tmp_name);

    {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        // Best effort: not every filesystem supports it.
        let _ = file.sync_all();
    }
    fs::rename(&tmp, path)
}

pub(crate) fn write_json<T: Serialize>(path: &Path, doc: &T) -> Result<(), StoreError> {
    let json = serde_json::to_string_pretty(doc)?;
    atomic_write(path, json.as_bytes())?;
    Ok(())
}

/// A document read from disk. `read_only` is set when a newer app version
/// produced it: such a document must never be overwritten.
pub(crate) struct Loaded<T> {
    pub(crate) doc: T,
    pub(crate) read_only: bool,
}

impl<T> Loaded<T> {
    /// Refuse to modify a document from a newer schema.
    pub(crate) fn writable(self, path: &Path) -> Result<T, StoreError> {
        if self.read_only {
            return Err(StoreError::NewerSchema(path.to_path_buf()));
        }
        Ok(self.doc)
    }
}

pub(crate) fn schema_version_of(value: &Value) -> u32 {
    value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .map(|v| v as u32)
        .unwrap_or(1)
}

/// Read a JSON document. Returns `Ok(None)` if the file does not exist.
pub(crate) fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<Loaded<T>>, StoreError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.into()),
    };
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);

    let value: Value = serde_json::from_str(text)?;
    let read_only = schema_version_of(&value) > SCHEMA_VERSION;
    let doc = serde_json::from_value(value)?;
    Ok(Some(Loaded { doc, read_only }))
}

/// Like [`read_json`], but a missing file yields the type's default.
pub(crate) fn read_json_or_default<T: DeserializeOwned + Default>(
    path: &Path,
) -> Result<Loaded<T>, StoreError> {
    Ok(read_json(path)?.unwrap_or_else(|| Loaded {
        doc: T::default(),
        read_only: false,
    }))
}

/// Read the complete lines of a journal. The segment after the last `\n` is
/// either empty or a partial line from an interrupted write; it is dropped.
pub(crate) fn read_complete_lines(path: &Path) -> io::Result<Vec<String>> {
    let bytes = fs::read(path)?;
    let text = String::from_utf8_lossy(&bytes);
    let mut lines: Vec<&str> = text.split('\n').collect();
    lines.pop();
    Ok(lines
        .into_iter()
        .map(|line| line.trim_end_matches('\r'))
        .filter(|line| !line.trim().is_empty())
        .map(str::to_owned)
        .collect())
}
