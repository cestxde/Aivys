use lofty::tag::Tag;
use std::path::Path;

/// Extract the first embedded picture from the tag, write it to `covers_dir`
/// (named by the content hash, so identical covers share one file), and return
/// the file path. Returns None if there is no picture or the write fails.
pub(crate) fn extract_cover(tag: &Tag, covers_dir: &Path) -> Option<String> {
    let picture = tag.pictures().first()?;
    let data = picture.data();
    if data.is_empty() {
        return None;
    }

    let ext = picture
        .mime_type()
        .and_then(|mime| mime.ext())
        .unwrap_or("bin");
    let hash = blake3::hash(data).to_hex();
    let file_path = covers_dir.join(format!("{hash}.{ext}"));

    // Reuse an existing cache file for identical content.
    if !file_path.exists() {
        if std::fs::create_dir_all(covers_dir).is_err() {
            return None;
        }
        if std::fs::write(&file_path, data).is_err() {
            return None;
        }
    }

    Some(file_path.to_string_lossy().into_owned())
}
