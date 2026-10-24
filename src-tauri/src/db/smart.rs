//! Evaluating smart-playlist rules (§8.4.2–8.4.3) as SQL over the index:
//! `WHERE <conditions> ORDER BY <sort> LIMIT <limit>`.

use super::LibraryDb;
use crate::store::playlists::{Condition, MatchMode, SmartRules, SortDir};
use rusqlite::functions::FunctionFlags;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params_from_iter, Connection};
use serde_json::Value;

/// SQL helpers the queries rely on.
pub(crate) fn register_functions(conn: &Connection) -> rusqlite::Result<()> {
    // Unicode-aware case folding: SQLite's lower() only folds ASCII, which
    // would make Cyrillic titles case-sensitive.
    conn.create_scalar_function(
        "fold",
        1,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| Ok(ctx.get::<Option<String>>(0)?.map(|text| text.to_lowercase())),
    )
}

/// Rule fields (§8.4.3) and the SQL they read. `t` is `tracks`, `s` is
/// `track_state` (LEFT JOINed: tracks without events have no row).
enum Field {
    Text(&'static str),
    Number(&'static str),
    Bool(&'static str),
    /// Multi-value field stored in a side table (`track_id`, `position`, `name`).
    List(&'static str),
    Tag,
}

fn field(name: &str) -> Option<Field> {
    Some(match name {
        "title" => Field::Text("t.title"),
        "album" => Field::Text("t.album"),
        "albumArtist" => Field::Text("t.album_artist"),
        "format" => Field::Text("t.format"),
        "year" => Field::Number("t.year"),
        "duration" => Field::Number("t.duration"),
        "addedAt" => Field::Number("t.added_at"),
        "rating" => Field::Number("IFNULL(s.rating, 0)"),
        "playCount" => Field::Number("IFNULL(s.play_count, 0)"),
        "lastPlayedAt" => Field::Number("s.last_played_at"),
        "favorite" => Field::Bool("IFNULL(s.favorite, 0)"),
        "artist" => Field::List("track_artists"),
        "genre" => Field::List("track_genres"),
        "tag" => Field::Tag,
        _ => return None,
    })
}

fn folded(value: &Value) -> Option<SqlValue> {
    Some(SqlValue::Text(value.as_str()?.to_lowercase()))
}

fn placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}

/// Text comparison, case-insensitive. `expr` may be NULL.
fn text_condition(expr: &str, op: &str, value: &Value, params: &mut Vec<SqlValue>) -> Option<String> {
    match op {
        "eq" => {
            params.push(folded(value)?);
            Some(format!("fold({expr}) = ?"))
        }
        "neq" => {
            params.push(folded(value)?);
            Some(format!("IFNULL(fold({expr}), '') <> ?"))
        }
        "contains" => {
            params.push(folded(value)?);
            Some(format!("instr(fold({expr}), ?) > 0"))
        }
        "in" => {
            let items = value.as_array()?;
            for item in items {
                params.push(folded(item)?);
            }
            Some(format!("fold({expr}) IN ({})", placeholders(items.len())))
        }
        _ => None,
    }
}

fn number_condition(expr: &str, op: &str, value: &Value, params: &mut Vec<SqlValue>) -> Option<String> {
    let number = |value: &Value| value.as_f64().map(SqlValue::Real);
    let sql_op = match op {
        "eq" => "=",
        "gt" => ">",
        "gte" => ">=",
        "lt" => "<",
        "lte" => "<=",
        "neq" => {
            params.push(number(value)?);
            // A missing value (e.g. no year) is "not equal" too.
            return Some(format!("({expr} IS NULL OR {expr} <> ?)"));
        }
        "in" => {
            let items = value.as_array()?;
            for item in items {
                params.push(number(item)?);
            }
            return Some(format!("{expr} IN ({})", placeholders(items.len())));
        }
        _ => return None,
    };
    params.push(number(value)?);
    Some(format!("{expr} {sql_op} ?"))
}

fn bool_condition(expr: &str, op: &str, value: &Value, params: &mut Vec<SqlValue>) -> Option<String> {
    let sql_op = match op {
        "eq" => "=",
        "neq" => "<>",
        _ => return None,
    };
    params.push(SqlValue::Integer(i64::from(value.as_bool()?)));
    Some(format!("{expr} {sql_op} ?"))
}

/// List fields match when any element matches; `neq` means no element equals.
fn list_condition(table: &str, op: &str, value: &Value, params: &mut Vec<SqlValue>) -> Option<String> {
    let (inner_op, negate) = if op == "neq" { ("eq", true) } else { (op, false) };
    let inner = text_condition("x.name", inner_op, value, params)?;
    let exists = format!("EXISTS (SELECT 1 FROM {table} x WHERE x.track_id = t.id AND {inner})");
    Some(if negate { format!("NOT {exists}") } else { exists })
}

/// Tag membership by tag id or name; deleted tags never match.
fn tag_condition(op: &str, value: &Value, params: &mut Vec<SqlValue>) -> Option<String> {
    let (values, negate) = match op {
        "eq" => (vec![value], false),
        "neq" => (vec![value], true),
        "in" => (value.as_array()?.iter().collect(), false),
        _ => return None,
    };

    let mut matches = Vec::new();
    for value in values {
        params.push(SqlValue::Text(value.as_str()?.to_owned()));
        params.push(folded(value)?);
        matches.push("(u.id = ? OR fold(u.name) = ?)");
    }
    if matches.is_empty() {
        matches.push("0");
    }

    let exists = format!(
        "EXISTS (SELECT 1 FROM track_tags tt JOIN user_tags u ON u.id = tt.tag_id AND u.deleted = 0
                 WHERE tt.rel_path = t.rel_path AND ({}))",
        matches.join(" OR ")
    );
    Some(if negate { format!("NOT {exists}") } else { exists })
}

/// SQL for one condition. Unknown fields/ops and values of the wrong type
/// make the condition not match (§8.4.3), with a warning.
fn condition_sql(condition: &Condition, params: &mut Vec<SqlValue>) -> String {
    let mut own = Vec::new();
    let op = condition.op.as_str();
    let value = &condition.value;
    let sql = field(&condition.field).and_then(|field| match field {
        Field::Text(expr) => text_condition(expr, op, value, &mut own),
        Field::Number(expr) => number_condition(expr, op, value, &mut own),
        Field::Bool(expr) => bool_condition(expr, op, value, &mut own),
        Field::List(table) => list_condition(table, op, value, &mut own),
        Field::Tag => tag_condition(op, value, &mut own),
    });

    match sql {
        Some(sql) => {
            params.extend(own);
            format!("({sql})")
        }
        None => {
            log::warn!(
                "smart playlist condition never matches: {} {} {}",
                condition.field,
                condition.op,
                condition.value
            );
            "0".to_owned()
        }
    }
}

fn sort_sql(field_name: &str) -> Option<String> {
    Some(match field(field_name)? {
        Field::Text(expr) => format!("fold({expr})"),
        Field::Number(expr) | Field::Bool(expr) => expr.to_owned(),
        Field::List(table) => {
            format!("(SELECT fold(x.name) FROM {table} x WHERE x.track_id = t.id ORDER BY x.position LIMIT 1)")
        }
        Field::Tag => return None,
    })
}

/// Build the query for `rules` and its parameters.
fn build_query(rules: &SmartRules) -> (String, Vec<SqlValue>) {
    let mut params = Vec::new();

    let conditions: Vec<String> = rules
        .conditions
        .iter()
        .map(|condition| condition_sql(condition, &mut params))
        .collect();
    // No conditions: every track.
    let filter = if conditions.is_empty() {
        "1".to_owned()
    } else {
        let joiner = match rules.match_mode {
            MatchMode::All => " AND ",
            MatchMode::Any => " OR ",
        };
        conditions.join(joiner)
    };

    // Default when omitted (or unsortable): addedAt desc.
    let (sort, dir) = rules
        .sort
        .as_ref()
        .and_then(|sort| match sort_sql(&sort.field) {
            Some(sql) => Some((sql, sort.dir)),
            None => {
                log::warn!("smart playlist cannot sort by {}, using addedAt", sort.field);
                None
            }
        })
        .unwrap_or_else(|| ("t.added_at".to_owned(), SortDir::Desc));
    let dir = match dir {
        SortDir::Asc => "ASC",
        SortDir::Desc => "DESC",
    };

    // A negative LIMIT means "no limit" in SQLite.
    params.push(SqlValue::Integer(rules.limit.map_or(-1, i64::from)));

    let query = format!(
        "SELECT t.rel_path FROM tracks t
         LEFT JOIN track_state s ON s.rel_path = t.rel_path
         WHERE {filter}
         ORDER BY {sort} {dir}, t.rel_path
         LIMIT ?"
    );
    (query, params)
}

impl LibraryDb {
    /// Relative paths of the tracks matching `rules`, sorted and limited.
    pub(crate) fn smart_playlist(&self, rules: &SmartRules) -> rusqlite::Result<Vec<String>> {
        let (query, params) = build_query(rules);
        let mut stmt = self.conn.prepare(&query)?;
        let rows = stmt.query_map(params_from_iter(params), |row| row.get(0))?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::ScannedTrack;
    use crate::store::events::{append, EventKind};
    use crate::store::playlists::SortSpec;
    use crate::store::test_support::TempLibrary;
    use crate::store::{tags, Store};
    use crate::track::Track;
    use serde_json::json;

    fn track(rel_path: &str, title: &str, artists: &[&str], genres: &[&str], year: Option<u32>, added_at: u64) -> ScannedTrack {
        ScannedTrack {
            track: Track {
                name: rel_path.to_owned(),
                path: String::new(),
                rel_path: rel_path.to_owned(),
                duration: 200,
                title: Some(title.to_owned()),
                artists: artists.iter().map(|a| (*a).to_owned()).collect(),
                album: None,
                album_artist: None,
                track_number: None,
                disc_number: None,
                year,
                genre: genres.iter().map(|g| (*g).to_owned()).collect(),
                bitrate: None,
                sample_rate: None,
                format: Some("flac".to_owned()),
                cover_path: None,
                date_created: added_at,
                file_mtime: 0,
                metadata_modified_at: 0,
                file_size: 0,
                artist_line: String::new(),
                artist_tags: artists.iter().map(|a| (*a).to_owned()).collect(),
            },
            mtime_ns: 0,
            size: 0,
        }
    }

    fn setup(lib: &TempLibrary) -> (Store, LibraryDb, String) {
        let store = lib.open();
        let mut db = LibraryDb::open(&lib.base.join("app-data"), store.root()).unwrap();
        db.apply_scan(
            &[
                track("a.flac", "Кино — Группа крови", &["Кино"], &["Rock"], Some(1988), 10),
                track("b.flac", "Numb", &["Linkin Park"], &["Alternative Rock", "Nu Metal"], Some(2003), 30),
                track("c.flac", "Clair de Lune", &["Debussy"], &["Classical"], None, 20),
            ],
            &[],
            &[],
        )
        .unwrap();

        let tag = tags::create(&store, "Chill", "#000000").unwrap();
        append(&store, "b.flac", EventKind::Rating, Some(5), None).unwrap();
        append(&store, "b.flac", EventKind::Play, None, None).unwrap();
        append(&store, "a.flac", EventKind::Favorite, None, None).unwrap();
        append(&store, "c.flac", EventKind::Tag, None, Some(tag.id.clone())).unwrap();
        db.sync_events(&store).unwrap();
        (store, db, tag.id)
    }

    fn rules(match_mode: MatchMode, conditions: Value) -> SmartRules {
        let mut rules: SmartRules = serde_json::from_value(json!({ "conditions": conditions })).unwrap();
        rules.match_mode = match_mode;
        rules
    }

    #[test]
    fn evaluates_conditions() {
        let lib = TempLibrary::new();
        let (_store, db, tag_id) = setup(&lib);
        let run = |r: SmartRules| db.smart_playlist(&r).unwrap();

        // Default sort is addedAt desc.
        assert_eq!(run(rules(MatchMode::All, json!([]))), vec!["b.flac", "c.flac", "a.flac"]);

        let rock = json!([{ "field": "genre", "op": "contains", "value": "rock" }]);
        assert_eq!(run(rules(MatchMode::All, rock)), vec!["b.flac", "a.flac"]);

        let cyrillic = json!([{ "field": "title", "op": "contains", "value": "ГРУППА" }]);
        assert_eq!(run(rules(MatchMode::All, cyrillic)), vec!["a.flac"]);

        let both = json!([
            { "field": "year", "op": "gte", "value": 2000 },
            { "field": "rating", "op": "gte", "value": 4 }
        ]);
        assert_eq!(run(rules(MatchMode::All, both)), vec!["b.flac"]);

        let either = json!([
            { "field": "favorite", "op": "eq", "value": true },
            { "field": "tag", "op": "eq", "value": "chill" }
        ]);
        assert_eq!(run(rules(MatchMode::Any, either)), vec!["c.flac", "a.flac"]);

        let by_id = json!([{ "field": "tag", "op": "in", "value": [tag_id] }]);
        assert_eq!(run(rules(MatchMode::All, by_id)), vec!["c.flac"]);

        let no_year = json!([{ "field": "year", "op": "neq", "value": 1988 }]);
        assert_eq!(run(rules(MatchMode::All, no_year)), vec!["b.flac", "c.flac"]);

        let not_artist = json!([{ "field": "artist", "op": "neq", "value": "кино" }]);
        assert_eq!(run(rules(MatchMode::All, not_artist)), vec!["b.flac", "c.flac"]);
    }

    #[test]
    fn unknown_conditions_never_match() {
        let lib = TempLibrary::new();
        let (_store, db, _) = setup(&lib);

        let unknown = json!([
            { "field": "composer", "op": "eq", "value": "x" },
            { "field": "year", "op": "gte", "value": "not a number" }
        ]);
        assert!(db.smart_playlist(&rules(MatchMode::Any, unknown.clone())).unwrap().is_empty());

        let mixed = json!([
            { "field": "composer", "op": "eq", "value": "x" },
            { "field": "format", "op": "eq", "value": "FLAC" }
        ]);
        assert_eq!(db.smart_playlist(&rules(MatchMode::Any, mixed)).unwrap().len(), 3);
    }

    #[test]
    fn sorts_and_limits() {
        let lib = TempLibrary::new();
        let (_store, db, _) = setup(&lib);

        let mut r = rules(MatchMode::All, json!([]));
        r.sort = Some(SortSpec {
            field: "artist".to_owned(),
            dir: SortDir::Asc,
        });
        assert_eq!(db.smart_playlist(&r).unwrap(), vec!["c.flac", "b.flac", "a.flac"]);

        r.sort = Some(SortSpec {
            field: "playCount".to_owned(),
            dir: SortDir::Desc,
        });
        r.limit = Some(1);
        assert_eq!(db.smart_playlist(&r).unwrap(), vec!["b.flac"]);
    }
}
