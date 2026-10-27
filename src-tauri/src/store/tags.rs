use super::fsio::{default_schema_version, now_unix, read_json_or_default, write_json, SCHEMA_VERSION};
use super::events::{self, EventKind};
use super::{new_uuid, pins, playlists, Store, StoreError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;

pub(crate) const FILE: &str = "tags.json";

/// `.aivys/tags.json`: user tag definitions and the categories that group
/// them (§8.3). Assignments live in the event journals.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TagsDoc {
    #[serde(default = "default_schema_version")]
    pub(crate) schema_version: u32,
    #[serde(default)]
    pub(crate) tags: Vec<TagDef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) categories: Vec<CategoryDef>,
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
            categories: Vec::new(),
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
    /// Categories the tag is shown in; none for "no category".
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) category_ids: Vec<String>,
    #[serde(default)]
    pub(crate) created_at: u64,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(default)]
    pub(crate) deleted_at: Option<u64>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

/// A named group of tags ("Genre", "Mood"), in the user's order.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CategoryDef {
    pub(crate) id: String,
    pub(crate) name: String,
    /// Place among the categories, ascending.
    #[serde(default)]
    pub(crate) position: i64,
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

fn live_category_ids(doc: &TagsDoc) -> HashSet<String> {
    doc.categories
        .iter()
        .filter(|category| category.deleted_at.is_none())
        .map(|category| category.id.clone())
        .collect()
}

/// Tags that are not deleted, with only the categories that are not either.
pub(crate) fn list(store: &Store) -> Result<Vec<TagDef>, StoreError> {
    let doc = load(store)?;
    let categories = live_category_ids(&doc);
    Ok(doc
        .tags
        .into_iter()
        .filter(|tag| tag.deleted_at.is_none())
        .map(|mut tag| {
            tag.category_ids.retain(|id| categories.contains(id));
            tag
        })
        .collect())
}

/// Categories that are not deleted, in order.
pub(crate) fn list_categories(store: &Store) -> Result<Vec<CategoryDef>, StoreError> {
    let mut categories: Vec<CategoryDef> = load(store)?
        .categories
        .into_iter()
        .filter(|category| category.deleted_at.is_none())
        .collect();
    // Two devices may have given the same place: the name decides then.
    categories.sort_by(|a, b| a.position.cmp(&b.position).then_with(|| a.name.cmp(&b.name)));
    Ok(categories)
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

fn live_category<'a>(doc: &'a mut TagsDoc, id: &str) -> Result<&'a mut CategoryDef, StoreError> {
    doc.categories
        .iter_mut()
        .find(|category| category.id == id && category.deleted_at.is_none())
        .ok_or_else(|| StoreError::NotFound(format!("tag category {id}")))
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

/// `ids` without repeats, each a category that exists.
fn clean_category_ids(doc: &TagsDoc, ids: &[String]) -> Result<Vec<String>, StoreError> {
    let live = live_category_ids(doc);
    let mut seen = HashSet::new();
    let mut clean = Vec::new();
    for id in ids {
        if !live.contains(id) {
            return Err(StoreError::NotFound(format!("tag category {id}")));
        }
        if seen.insert(id) {
            clean.push(id.clone());
        }
    }
    Ok(clean)
}

pub(crate) fn create(store: &Store, name: &str, color: &str, category_ids: &[String]) -> Result<TagDef, StoreError> {
    let name = clean_name(name)?;
    let color = clean_color(color)?;
    modify(store, |doc, now| {
        let tag = TagDef {
            id: new_uuid(),
            name,
            color,
            category_ids: clean_category_ids(doc, category_ids)?,
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
    category_ids: Option<&[String]>,
) -> Result<TagDef, StoreError> {
    let name = name.map(clean_name).transpose()?;
    let color = color.map(clean_color).transpose()?;
    modify(store, |doc, now| {
        let category_ids = category_ids.map(|ids| clean_category_ids(doc, ids)).transpose()?;
        let tag = live_tag(doc, id)?;
        if let Some(name) = name {
            tag.name = name;
        }
        if let Some(color) = color {
            tag.color = color;
        }
        if let Some(ids) = category_ids {
            tag.category_ids = ids;
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

/// A new category, after the others.
pub(crate) fn create_category(store: &Store, name: &str) -> Result<CategoryDef, StoreError> {
    let name = clean_name(name)?;
    modify(store, |doc, now| {
        let position = doc
            .categories
            .iter()
            .filter(|category| category.deleted_at.is_none())
            .map(|category| category.position + 1)
            .max()
            .unwrap_or(0);
        let category = CategoryDef {
            id: new_uuid(),
            name,
            position,
            created_at: now,
            updated_at: now,
            deleted_at: None,
            extra: Map::new(),
        };
        doc.categories.push(category.clone());
        Ok(category)
    })
}

pub(crate) fn rename_category(store: &Store, id: &str, name: &str) -> Result<CategoryDef, StoreError> {
    let name = clean_name(name)?;
    modify(store, |doc, now| {
        let category = live_category(doc, id)?;
        category.name = name;
        category.updated_at = now;
        Ok(category.clone())
    })
}

/// Tombstone the category; its tags stay, in their other categories or in
/// none (a tag's ids of deleted categories are ignored).
pub(crate) fn delete_category(store: &Store, id: &str) -> Result<(), StoreError> {
    modify(store, |doc, now| {
        let category = live_category(doc, id)?;
        category.deleted_at = Some(now);
        category.updated_at = now;
        Ok(())
    })
}

/// Put the categories in the order of `ids`; ones not listed keep their place
/// after them.
pub(crate) fn reorder_categories(store: &Store, ids: &[String]) -> Result<Vec<CategoryDef>, StoreError> {
    modify(store, |doc, now| {
        let rank = |id: &str| ids.iter().position(|other| other == id).unwrap_or(ids.len());
        let mut live: Vec<&mut CategoryDef> = doc
            .categories
            .iter_mut()
            .filter(|category| category.deleted_at.is_none())
            .collect();
        live.sort_by_key(|category| (rank(&category.id), category.position));
        for (position, category) in live.into_iter().enumerate() {
            let position = position as i64;
            if category.position != position {
                category.position = position;
                category.updated_at = now;
            }
        }
        Ok(())
    })?;
    list_categories(store)
}

/// Points a smart-playlist rule value naming tag `from` (by id or name) at
/// `into` instead; returns whether it changed.
fn retarget(value: &mut Value, from: &TagDef, into: &str) -> bool {
    match value {
        Value::String(text) if *text == from.id || text.to_lowercase() == from.name.to_lowercase() => {
            *text = into.to_owned();
            true
        }
        Value::Array(items) => items.iter_mut().fold(false, |changed, item| retarget(item, from, into) || changed),
        _ => false,
    }
}

/// Merge tag `from` into `into`: every track with `from` gets `into`, which
/// also takes over its categories, its pin and its smart-playlist rules;
/// then `from` is deleted. Returns `into` as it is then.
pub(crate) fn merge_into(store: &Store, from: &str, into: &str) -> Result<TagDef, StoreError> {
    if from == into {
        return Err(StoreError::Invalid("a tag cannot be merged into itself".to_owned()));
    }
    let live = list(store)?;
    let find = |id: &str| live.iter().find(|tag| tag.id == id).cloned().ok_or_else(|| StoreError::NotFound(format!("tag {id}")));
    let (source, target) = (find(from)?, find(into)?);

    let stats = events::derive(&events::read_all(store)?, &deleted_ids(store)?);
    for (path, track) in &stats {
        if track.tags.iter().any(|id| id == from) && !track.tags.iter().any(|id| id == into) {
            events::append(store, path, EventKind::Tag, None, Some(into.to_owned()))?;
        }
    }

    let mut category_ids = target.category_ids.clone();
    category_ids.extend(source.category_ids.iter().filter(|id| !target.category_ids.contains(id)).cloned());
    let merged = update(store, into, None, None, Some(&category_ids))?;

    if pins::list(store)?.iter().any(|pin| pin.kind == "tag" && pin.key == from) {
        pins::set(store, "tag", into, true)?;
        pins::set(store, "tag", from, false)?;
    }

    for view in playlists::list(store)? {
        let Some(mut rules) = view.playlist.rules.clone() else { continue };
        if view.read_only {
            continue;
        }
        let changed = rules
            .conditions
            .iter_mut()
            .filter(|condition| condition.field == "tag")
            .fold(false, |changed, condition| retarget(&mut condition.value, &source, into) || changed);
        if changed {
            playlists::set_rules(store, &view.playlist.id, rules)?;
        }
    }

    delete(store, from)?;
    Ok(merged)
}

/// Merge strategy: union by id; for a tag (or category) on both sides the
/// entry with the greater per-entry `updatedAt` wins as a whole.
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
    for other in b.categories {
        match merged.categories.iter_mut().find(|category| category.id == other.id) {
            Some(category) if other.updated_at > category.updated_at => *category = other,
            Some(_) => {}
            None => merged.categories.push(other),
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_support::TempLibrary;

    fn tag(id: &str, name: &str, updated_at: u64, deleted_at: Option<u64>) -> TagDef {
        TagDef {
            id: id.to_owned(),
            name: name.to_owned(),
            color: "#ffffff".to_owned(),
            category_ids: Vec::new(),
            created_at: 1,
            updated_at,
            deleted_at,
            extra: Map::new(),
        }
    }

    fn category(id: &str, name: &str, updated_at: u64) -> CategoryDef {
        CategoryDef {
            id: id.to_owned(),
            name: name.to_owned(),
            position: 0,
            created_at: 1,
            updated_at,
            deleted_at: None,
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
    fn merge_keeps_newest_category() {
        let a = TagsDoc { categories: vec![category("g", "Genre", 10)], ..TagsDoc::default() };
        let b = TagsDoc { categories: vec![category("g", "Genres", 20), category("m", "Mood", 5)], ..TagsDoc::default() };
        let merged = merge(a, b);
        assert_eq!(merged.categories.len(), 2);
        assert_eq!(merged.categories[0].name, "Genres");
    }

    #[test]
    fn color_is_validated() {
        assert_eq!(clean_color("#4F9DFF").unwrap(), "#4f9dff");
        assert!(clean_color("4f9dff").is_err());
        assert!(clean_color("#4f9dfz").is_err());
    }

    #[test]
    fn categories_order_membership_and_deletion() {
        let lib = TempLibrary::new();
        let store = lib.open();
        let genre = create_category(&store, "Genre").unwrap();
        let mood = create_category(&store, "Mood").unwrap();
        assert_eq!((genre.position, mood.position), (0, 1));

        let rock = create(&store, "Rock", "#ff0000", &[genre.id.clone(), genre.id.clone()]).unwrap();
        assert_eq!(rock.category_ids, vec![genre.id.clone()], "repeats are dropped");
        assert!(create(&store, "Bad", "#ff0000", &["nope".to_owned()]).is_err());
        update(&store, &rock.id, None, None, Some(&[genre.id.clone(), mood.id.clone()])).unwrap();

        let order = reorder_categories(&store, &[mood.id.clone(), genre.id.clone()]).unwrap();
        assert_eq!(order.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["Mood", "Genre"]);

        delete_category(&store, &mood.id).unwrap();
        assert_eq!(list_categories(&store).unwrap().len(), 1);
        let listed = list(&store).unwrap();
        assert_eq!(listed[0].category_ids, vec![genre.id.clone()], "a deleted category is not listed on its tags");
        // The file still has it: an undeleted copy from another device can merge back.
        assert_eq!(load(&store).unwrap().tags[0].category_ids.len(), 2);
    }

    #[test]
    fn a_file_without_categories_reads_and_stays_without() {
        let lib = TempLibrary::new();
        let store = lib.open();
        create(&store, "Chill", "#00ff00", &[]).unwrap();
        let text = std::fs::read_to_string(store.path(FILE)).unwrap();
        assert!(!text.contains("categor"), "{text}");
        assert!(list(&store).unwrap()[0].category_ids.is_empty());
    }

    #[test]
    fn merging_moves_tracks_categories_pin_and_rules() {
        let lib = TempLibrary::new();
        let store = lib.open();
        let mood = create_category(&store, "Mood").unwrap();
        let genre = create_category(&store, "Genre").unwrap();
        let from = create(&store, "Rock music", "#ff0000", &[mood.id.clone()]).unwrap();
        let into = create(&store, "Rock", "#00ff00", &[genre.id.clone()]).unwrap();
        for path in ["a.mp3", "b.mp3"] {
            events::append(&store, path, EventKind::Tag, None, Some(from.id.clone())).unwrap();
        }
        // b already has both: it gets no second assignment.
        events::append(&store, "b.mp3", EventKind::Tag, None, Some(into.id.clone())).unwrap();
        pins::set(&store, "tag", &from.id, true).unwrap();
        let rules: playlists::SmartRules = serde_json::from_value(serde_json::json!({
            "match": "any",
            "conditions": [
                { "field": "tag", "op": "eq", "value": "rock MUSIC" },
                { "field": "tag", "op": "in", "value": [from.id, "other"] },
            ],
        }))
        .unwrap();
        let smart = playlists::create_smart(&store, "Loud", rules).unwrap();

        let merged = merge_into(&store, &from.id, &into.id).unwrap();
        assert_eq!(merged.category_ids, vec![genre.id.clone(), mood.id.clone()]);

        let stats = events::derive(&events::read_all(&store).unwrap(), &deleted_ids(&store).unwrap());
        assert_eq!(stats["a.mp3"].tags, vec![into.id.clone()], "the deleted tag no longer counts");
        assert_eq!(stats["b.mp3"].tags, vec![into.id.clone()]);
        let tagged_b = events::read_all(&store).unwrap().iter()
            .filter(|e| e.line.path == "b.mp3" && e.line.tag_id.as_deref() == Some(into.id.as_str()))
            .count();
        assert_eq!(tagged_b, 1);

        assert!(list(&store).unwrap().iter().all(|tag| tag.id != from.id));
        let pinned = pins::list(&store).unwrap();
        assert_eq!((pinned.len(), pinned[0].key.as_str()), (1, into.id.as_str()));

        let view = playlists::list(&store).unwrap().into_iter().find(|v| v.playlist.id == smart.playlist.id).unwrap();
        let values: Vec<Value> = view.playlist.rules.unwrap().conditions.into_iter().map(|c| c.value).collect();
        assert_eq!(values, vec![serde_json::json!(into.id), serde_json::json!([into.id, "other"])]);

        assert!(merge_into(&store, &into.id, &into.id).is_err());
        assert!(merge_into(&store, &from.id, &into.id).is_err(), "a deleted tag cannot be merged");
    }
}
