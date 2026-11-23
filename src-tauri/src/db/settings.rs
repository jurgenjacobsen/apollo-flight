use rusqlite::{params, Connection, Result};
use super::*;

pub fn get_user_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM user_settings WHERE key = ?1")?;
    let mut rows = stmt.query([key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_user_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO user_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        [key, value, &now],
    )?;
    Ok(())
}

pub fn get_all_user_settings(conn: &Connection) -> Result<std::collections::HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM user_settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        if let Ok((k, v)) = row {
            map.insert(k, v);
        }
    }
    Ok(map)
}

pub fn get_all_document_metadata(conn: &Connection) -> Result<std::collections::HashMap<String, DocumentMetadata>> {
    let mut stmt = conn.prepare("SELECT file_path, title, last_seen, tags FROM document_metadata")?;
    let rows = stmt.query_map([], |row| {
        let tags_raw: Option<String> = row.get(3)?;
        let tags: Vec<String> = tags_raw
            .map(|t| t.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
            .unwrap_or_default();
        Ok(DocumentMetadata {
            file_path: row.get(0)?,
            title: row.get(1)?,
            last_seen: row.get(2)?,
            tags,
        })
    })?;
    let mut map = std::collections::HashMap::new();
    for r in rows.flatten() {
        map.insert(r.file_path.clone(), r);
    }
    Ok(map)
}

pub fn save_document_metadata(
    conn: &Connection,
    file_path: &str,
    title: Option<&str>,
    tags: &[String],
) -> Result<()> {
    let tags_str = tags.join(",");
    conn.execute(
        "INSERT INTO document_metadata (file_path, title, tags)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(file_path) DO UPDATE SET
            title = COALESCE(?2, title),
            tags = ?3",
        params![file_path, title, tags_str],
    )?;
    Ok(())
}

pub fn record_document_opened(conn: &Connection, file_path: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO document_metadata (file_path, last_seen)
         VALUES (?1, ?2)
         ON CONFLICT(file_path) DO UPDATE SET
            last_seen = ?2",
        params![file_path, now],
    )?;
    Ok(())
}

