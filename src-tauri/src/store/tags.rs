use super::fsio::{default_schema_version, now_unix, read_json_or_default, write_json, SCHEMA_VERSION};
use super::{new_uuid, Store, StoreError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;

pub(crate) const FILE: &str = "tags.json";

/// `.aivys/tags.json`: user tag definitions (§8.3). Assignments live in the
/// event journals.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TagsDoc {
    #[serde(default = "default_schema_version")]
    pub(crate) schema_version: u32,
    #[serde(default)]
    pub(crate) tags: Vec<TagDef>,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

impl Default for TagsDoc {
    fn default() -> Self {
        TagsDoc {
            schema_version: SCHEMA_VERSION,
            tags: Vec::new(),
            updated_at: 0,
            extra: Map::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TagDef {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) color: String,
    #[serde(default)]
    pub(crate) created_at: u64,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(default)]
    pub(crate) deleted_at: Option<u64>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

pub(crate) fn load(store: &Store) -> Result<TagsDoc, StoreError> {
    Ok(read_json_or_default(&store.path(FILE))?.doc)
}

/// Tags that are not deleted.
pub(crate) fn list(store: &Store) -> Result<Vec<TagDef>, StoreError> {
    Ok(load(store)?
        .tags
        .into_iter()
        .filter(|tag| tag.deleted_at.is_none())
        .collect())
}

pub(crate) fn deleted_ids(store: &Store) -> Result<HashSet<String>, StoreError> {
    Ok(load(store)?
        .tags
        .into_iter()
        .filter(|tag| tag.deleted_at.is_some())
        .map(|tag| tag.id)
        .collect())
}

/// Read the document fresh from disk, apply `change`, write it back.
fn modify<R>(store: &Store, change: impl FnOnce(&mut TagsDoc, u64) -> Result<R, StoreError>) -> Result<R, StoreError> {
    let path = store.path(FILE);
    let mut doc = read_json_or_default::<TagsDoc>(&path)?.writable(&path)?;
    let now = now_unix();
    let result = change(&mut doc, now)?;
    doc.schema_version = SCHEMA_VERSION;
    doc.updated_at = now;
    write_json(&path, &doc)?;
    Ok(result)
}

fn live_tag<'a>(doc: &'a mut TagsDoc, id: &str) -> Result<&'a mut TagDef, StoreError> {
    doc.tags
        .iter_mut()
        .find(|tag| tag.id == id && tag.deleted_at.is_none())
        .ok_or_else(|| StoreError::NotFound(format!("tag {id}")))
}

fn clean_name(name: &str) -> Result<String, StoreError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(StoreError::Invalid("tag name is empty".to_owned()));
    }
    Ok(name.to_owned())
}

/// `#RRGGBB`, normalized to lowercase.
fn clean_color(color: &str) -> Result<String, StoreError> {
    let color = color.trim();
    let valid = color.len() == 7
        && color.starts_with('#')
        && color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !valid {
        return Err(StoreError::Invalid(format!("color must be #RRGGBB: {color}")));
    }
    Ok(color.to_ascii_lowercase())
}

pub(crate) fn create(store: &Store, name: &str, color: &str) -> Result<TagDef, StoreError> {
    let name = clean_name(name)?;
    let color = clean_color(color)?;
    modify(store, |doc, now| {
        let tag = TagDef {
            id: new_uuid(),
            name,
            color,
            created_at: now,
            updated_at: now,
            deleted_at: None,
            extra: Map::new(),
        };
        doc.tags.push(tag.clone());
        Ok(tag)
    })
}

pub(crate) fn update(
    store: &Store,
    id: &str,
    name: Option<&str>,
    color: Option<&str>,
) -> Result<TagDef, StoreError> {
    let name = name.map(clean_name).transpose()?;
    let color = color.map(clean_color).transpose()?;
    modify(store, |doc, now| {
        let tag = live_tag(doc, id)?;
        if let Some(name) = name {
            tag.name = name;
        }
        if let Some(color) = color {
            tag.color = color;
        }
        tag.updated_at = now;
        Ok(tag.clone())
    })
}

/// Tombstone the tag; its assignments are ignored from now on.
pub(crate) fn delete(store: &Store, id: &str) -> Result<(), StoreError> {
    modify(store, |doc, now| {
        let tag = live_tag(doc, id)?;
        tag.deleted_at = Some(now);
        tag.updated_at = now;
        Ok(())
    })
}

/// Merge strategy: union by id; for a tag on both sides the entry with the
/// greater per-tag `updatedAt` wins as a whole.
pub(crate) fn merge(a: TagsDoc, b: TagsDoc) -> TagsDoc {
    let mut merged = TagsDoc {
        updated_at: a.updated_at.max(b.updated_at),
        ..a
    };
    for other in b.tags {
        match merged.tags.iter_mut().find(|tag| tag.id == other.id) {
            Some(tag) if other.updated_at > tag.updated_at => *tag = other,
            Some(_) => {}
            None => merged.tags.push(other),
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tag(id: &str, name: &str, updated_at: u64, deleted_at: Option<u64>) -> TagDef {
        TagDef {
            id: id.to_owned(),
            name: name.to_owned(),
            color: "#ffffff".to_owned(),
            created_at: 1,
            updated_at,
            deleted_at,
            extra: Map::new(),
        }
    }

    fn doc(tags: Vec<TagDef>) -> TagsDoc {
        TagsDoc {
            tags,
            ..TagsDoc::default()
        }
    }

    #[test]
    fn merge_keeps_newest_tag_and_tombstones() {
        let a = doc(vec![tag("1", "Chill", 10, None), tag("2", "Old", 10, None)]);
        let b = doc(vec![tag("1", "Calm", 20, None), tag("2", "Old", 30, Some(30)), tag("3", "New", 5, None)]);

        let merged = merge(a, b);
        assert_eq!(merged.tags.len(), 3);
        assert_eq!(merged.tags[0].name, "Calm");
        assert_eq!(merged.tags[1].deleted_at, Some(30));
        assert_eq!(merged.tags[2].id, "3");
    }

    #[test]
    fn color_is_validated() {
        assert_eq!(clean_color("#4F9DFF").unwrap(), "#4f9dff");
        assert!(clean_color("4f9dff").is_err());
        assert!(clean_color("#4f9dfz").is_err());
    }
}
