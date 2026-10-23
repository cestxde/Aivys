use super::fsio::{atomic_write, default_schema_version, now_unix, write_json, SCHEMA_VERSION};
use super::{new_uuid, Store, StoreError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::Path;

/// File in the OS app-data directory holding this installation's id (§7).
/// Never synced.
const DEVICE_ID_FILE: &str = "device-id";

/// Return this installation's device id, generating one on first launch.
pub(crate) fn load_or_create(app_data: &Path) -> Result<String, StoreError> {
    if let Ok(text) = std::fs::read_to_string(app_data.join(DEVICE_ID_FILE)) {
        let id = text.trim().to_ascii_lowercase();
        if uuid::Uuid::parse_str(&id).is_ok() {
            return Ok(id);
        }
        log::warn!("invalid device-id file, generating a new id");
    }
    regenerate(app_data)
}

/// Replace this installation's device id with a fresh one. Used when two
/// installations turn out to share an id (copied app-data).
pub(crate) fn regenerate(app_data: &Path) -> Result<String, StoreError> {
    let id = new_uuid();
    atomic_write(&app_data.join(DEVICE_ID_FILE), id.as_bytes())?;
    Ok(id)
}

/// Optional human-readable descriptor `devices/<deviceId>.json`.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceDescriptor {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    id: String,
    name: String,
    platform: String,
    created_at: u64,
    updated_at: u64,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

fn host_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "Unknown device".to_owned())
}

/// Write this device's descriptor if it does not exist yet.
pub(crate) fn ensure_descriptor(store: &Store) -> Result<(), StoreError> {
    let path = store.path(&format!("devices/{}.json", store.device_id()));
    if path.exists() {
        return Ok(());
    }

    let now = now_unix();
    write_json(
        &path,
        &DeviceDescriptor {
            schema_version: SCHEMA_VERSION,
            id: store.device_id().to_owned(),
            name: host_name(),
            platform: std::env::consts::OS.to_owned(),
            created_at: now,
            updated_at: now,
            extra: Map::new(),
        },
    )
}
