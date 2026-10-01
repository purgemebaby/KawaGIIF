// Media library.
// Imports files into the app's own `media` folder, keeps the index of what
// is there (`library_index.json`) and manages each item's tags.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::config;
use crate::error::{AppError, AppResult};
use crate::template::{self, EditorState};

/* Personal Note for me:
- serde: (de)serialization framework.
    - Serialize / Deserialize: derive them to read/write the struct as JSON.
- std (the standard library):
    - collections::HashMap: key → value table with fast lookups.
    - collections::HashSet: a set of unique values with fast "is it there?" checks.
    - path::Path / PathBuf: borrowed / owned file paths.
    - sync::Mutex: a lock. Only one thread at a time can touch the data inside.
    - sync::MutexGuard: what `lock()` gives back; the lock is released when it goes out of scope.
    - sync::PoisonError: the error a Mutex returns if a thread panicked while holding it.
    - time::SystemTime / UNIX_EPOCH: the current clock time, and its zero point (1970-01-01).
- tauri: the app framework.
    - AppHandle: handle to the running app.
    - Emitter: trait that adds `.emit()` for sending events to the frontend.
    - State: gives a command access to a value registered with `.manage()`.
- uuid::Uuid: 16-byte unique IDs for each media item.
- crate::config: data folder path and the atomic file writer.
- crate::error: `AppError` and `AppResult`.
- crate::template: the placed-animation state, checked before deleting a media.
    - EditorState: the editor's shared state.
*/

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Gif,
    Mp4,
    Jpeg,
    Png,
    Webp,
}

impl MediaType {
    fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_ascii_lowercase().as_str() {
            "gif" => Some(Self::Gif),
            "mp4" => Some(Self::Mp4),
            "jpg" | "jpeg" => Some(Self::Jpeg),
            "png" => Some(Self::Png),
            "webp" => Some(Self::Webp),
            _ => None,
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Gif => "gif",
            Self::Mp4 => "mp4",
            Self::Jpeg => "jpg",
            Self::Png => "png",
            Self::Webp => "webp",
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MediaItem {
    pub id: Uuid,
    pub stored_file_name: String,
    pub original_file_name: String,
    pub media_type: MediaType,
    pub imported_at_unix: u64,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct LibraryIndex {
    #[serde(default = "schema_version")]
    schema_version: u32,
    #[serde(default)]
    items: Vec<MediaItem>,
}

fn schema_version() -> u32 {
    2
}

impl Default for LibraryIndex {
    fn default() -> Self {
        Self {
            schema_version: schema_version(),
            items: Vec::new(),
        }
    }
}

impl LibraryIndex {
    pub fn find(&self, id: &Uuid) -> Option<&MediaItem> {
        self.items.iter().find(|item| item.id == *id)
    }

    fn find_mut(&mut self, id: &Uuid) -> AppResult<&mut MediaItem> {
        self.items
            .iter_mut()
            .find(|item| item.id == *id)
            .ok_or(AppError::MediaNotFound(*id))
    }

    fn save(&self) -> AppResult<()> {
        config::write_atomic(&index_path(), &serde_json::to_vec_pretty(self)?)
    }
}

/**
 * The library index, loaded from disk once at startup and kept in memory.
 *
 * Every command used to re-read and re-parse `library_index.json`,
 * including `get_media_path`, which each overlay calls when it mounts.
 * Now reads are served from memory, and a change is written back to disk
 * right after it happens, so the file stays the source of truth across
 * restarts.
 */
pub struct LibraryState(Mutex<LibraryIndex>);

impl Default for LibraryState {
    fn default() -> Self {
        Self(Mutex::new(load_index()))
    }
}

impl LibraryState {
    pub fn lock(&self) -> MutexGuard<'_, LibraryIndex> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[derive(Serialize)]
pub struct TagCount {
    pub name: String,
    pub count: usize,
}

fn media_dir() -> PathBuf {
    config::data_dir().join("media")
}

fn index_path() -> PathBuf {
    config::data_dir().join("library_index.json")
}

fn clean_tag(raw: &str) -> Option<String> {
    let cleaned = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    (!cleaned.is_empty()).then_some(cleaned)
}

/**
 * Every distinct tag in the library, keyed by its lowercase form and
 * mapped to its canonical spelling (the first one seen).
 *
 * Built once per operation so that normalizing is a hash lookup per tag,
 * instead of lowercasing and comparing against every known tag in a nested
 * loop.
 */
fn known_tags(items: &[MediaItem]) -> HashMap<String, String> {
    let mut known = HashMap::new();
    for tag in items.iter().flat_map(|item| &item.tags) {
        known
            .entry(tag.to_lowercase())
            .or_insert_with(|| tag.clone());
    }
    known
}

/**
 * Cleans a list of tags and reuses the spelling that already exists.
 *
 * Tags are compared case-insensitively but keep the library's existing
 * spelling: if `Cat` exists and the user types `cat`, `Cat` is stored. That
 * avoids ending up with `cat`, `Cat` and `CAT` as three filters for the
 * same thing. Duplicates inside the list itself are dropped the same way.
 */
fn normalize_tags(raw: Vec<String>, known: &HashMap<String, String>) -> Vec<String> {
    let mut seen = HashSet::with_capacity(raw.len());
    let mut out = Vec::with_capacity(raw.len());
    for tag in raw {
        let Some(cleaned) = clean_tag(&tag) else {
            continue;
        };
        let key = cleaned.to_lowercase();
        if seen.contains(&key) {
            continue;
        }
        out.push(known.get(&key).cloned().unwrap_or(cleaned));
        seen.insert(key);
    }
    out
}

/**
 * Loads the index and normalizes its tags.
 *
 * Normalizing on load, and not only on write, cleans up indexes written
 * before normalization existed, without a schema migration.
 */
fn load_index() -> LibraryIndex {
    let mut index: LibraryIndex = std::fs::read_to_string(index_path())
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default();

    let known = known_tags(&index.items);
    for item in &mut index.items {
        item.tags = normalize_tags(std::mem::take(&mut item.tags), &known);
    }
    index
}

fn notify_library_changed(app: &AppHandle) {
    let _ = app.emit("library-changed", ());
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

fn copy_into_library(source: &Path) -> AppResult<Option<MediaItem>> {
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default();
    let Some(media_type) = MediaType::from_extension(ext) else {
        return Ok(None);
    };

    let id = Uuid::new_v4();
    let stored_file_name = format!("{id}.{}", media_type.extension());
    std::fs::copy(source, media_dir().join(&stored_file_name))?;

    Ok(Some(MediaItem {
        id,
        stored_file_name,
        original_file_name: source
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_owned(),
        media_type,
        imported_at_unix: now_unix(),
        tags: Vec::new(),
    }))
}

#[tauri::command]
pub fn import_media(
    app: AppHandle,
    library: State<LibraryState>,
    source_paths: Vec<PathBuf>,
) -> AppResult<Vec<MediaItem>> {
    std::fs::create_dir_all(media_dir())?;

    let mut imported = Vec::with_capacity(source_paths.len());
    for source in &source_paths {
        if let Some(item) = copy_into_library(source)? {
            imported.push(item);
        }
    }

    let mut index = library.lock();
    index.items.extend(imported.iter().cloned());
    index.save()?;
    drop(index);

    notify_library_changed(&app);
    Ok(imported)
}

#[tauri::command]
pub fn list_media(library: State<LibraryState>) -> Vec<MediaItem> {
    library.lock().items.clone()
}

#[tauri::command]
pub fn update_media_tags(
    app: AppHandle,
    library: State<LibraryState>,
    id: Uuid,
    tags: Vec<String>,
) -> AppResult<()> {
    let mut index = library.lock();
    let known = known_tags(&index.items);
    index.find_mut(&id)?.tags = normalize_tags(tags, &known);
    index.save()?;
    drop(index);

    notify_library_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn list_all_tags(library: State<LibraryState>) -> Vec<TagCount> {
    let index = library.lock();
    let mut counts: HashMap<String, TagCount> = HashMap::new();
    for tag in index.items.iter().flat_map(|item| &item.tags) {
        counts
            .entry(tag.to_lowercase())
            .or_insert_with(|| TagCount {
                name: tag.clone(),
                count: 0,
            })
            .count += 1;
    }

    let mut counts: Vec<TagCount> = counts.into_values().collect();
    counts.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    counts
}

/**
 * Renames a tag across the whole library and returns how many items changed.
 *
 * The tricky case is a collision: an item tagged `cat` and `feline` where
 * `feline` is renamed to `cat` must end up with a single `cat`. Running the
 * result through `normalize_tags` again removes that duplicate.
 */
#[tauri::command]
pub fn rename_tag(
    app: AppHandle,
    library: State<LibraryState>,
    from: String,
    to: String,
) -> AppResult<usize> {
    let new_name = clean_tag(&to).ok_or(AppError::EmptyTag)?;
    let from_key = from.to_lowercase();
    let no_known = HashMap::new();

    let mut index = library.lock();
    let mut touched = 0;
    for item in &mut index.items {
        if !item.tags.iter().any(|t| t.to_lowercase() == from_key) {
            continue;
        }
        let renamed = std::mem::take(&mut item.tags)
            .into_iter()
            .map(|t| {
                if t.to_lowercase() == from_key {
                    new_name.clone()
                } else {
                    t
                }
            })
            .collect();
        item.tags = normalize_tags(renamed, &no_known);
        touched += 1;
    }
    index.save()?;
    drop(index);

    notify_library_changed(&app);
    Ok(touched)
}

#[tauri::command]
pub fn delete_tag(app: AppHandle, library: State<LibraryState>, name: String) -> AppResult<usize> {
    let key = name.to_lowercase();

    let mut index = library.lock();
    let mut touched = 0;
    for item in &mut index.items {
        let before = item.tags.len();
        item.tags.retain(|t| t.to_lowercase() != key);
        if item.tags.len() != before {
            touched += 1;
        }
    }
    index.save()?;
    drop(index);

    notify_library_changed(&app);
    Ok(touched)
}

/**
 * Absolute path of a media file, which the frontend turns into an
 * `asset://` URL with `convertFileSrc`.
 *
 * Serving files through the asset protocol lets WebView2 stream them. The
 * earlier approach sent the file as a base64 data URL, which put a 200 MB
 * video into the JavaScript heap as a ~270 MB string. Access stays limited:
 * the asset scope in `tauri.conf.json` only allows files inside
 * `$LOCALDATA/KawaGiif/media`.
 */
#[tauri::command]
pub fn get_media_path(library: State<LibraryState>, id: Uuid) -> AppResult<String> {
    let index = library.lock();
    let item = index.find(&id).ok_or(AppError::MediaNotFound(id))?;
    Ok(media_dir()
        .join(&item.stored_file_name)
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
pub fn get_file_size(path: PathBuf) -> AppResult<u64> {
    Ok(std::fs::metadata(path)?.len())
}

/**
 * Deletes a media item, without leaving placed animations pointing at it.
 *
 * - If placed animations still use it and `force` is false, nothing is
 *   deleted and the error carries how many, so the UI can ask first.
 * - With `force`, those animations are removed from both the working and
 *   the saved template, their windows are freed, and `template.json` is
 *   rewritten.
 *
 * Returns how many placed animations were removed along with it. The
 * editor lock and the library lock are never held at the same time.
 */
#[tauri::command]
pub fn delete_media(
    app: AppHandle,
    library: State<LibraryState>,
    editor: State<EditorState>,
    id: Uuid,
    force: bool,
) -> AppResult<usize> {
    let references = template::count_references_to_media(&editor, &id);
    if references > 0 && !force {
        return Err(AppError::MediaReferenced(references));
    }

    let mut index = library.lock();
    let pos = index
        .items
        .iter()
        .position(|item| item.id == id)
        .ok_or(AppError::MediaNotFound(id))?;
    let item = index.items.remove(pos);
    let _ = std::fs::remove_file(media_dir().join(&item.stored_file_name));
    index.save()?;
    drop(index);

    if references > 0 {
        template::purge_media_references(&app, &editor, &id)?;
    }

    notify_library_changed(&app);
    Ok(references)
}
