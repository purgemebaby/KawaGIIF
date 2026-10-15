/**Media library. Imports files into the app's own `media` folder, keeps the index of what is there (`library_index.json`) and manages each item's tags.*/
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



fn now_unix() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}
fn notify_library_changed(app: &AppHandle) {
    let _ = app.emit("library-changed", ());
}

fn clean_tag(raw: &str) -> Option<String> {
    let cleaned = raw
        .split_whitespace()
        .collect::<Vec<_>>().join(" ");
    (!cleaned.is_empty()).then_some(cleaned)
}

/** Cleans a list of tags and reuses the spelling that already exists.*/
fn normalize_tags(raw: Vec<String>, known: &HashMap<String, String>) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::with_capacity(raw.len());      //processed
    let mut out: Vec<String> = Vec::with_capacity(raw.len());               //output

    for tag in raw {
        let Some(cleaned) = clean_tag(&tag) else { continue; };
        let key = cleaned.to_lowercase();

        if seen.contains(&key) { continue; }
        out.push(known.get(&key).cloned().unwrap_or(cleaned));
        seen.insert(key);
    }
    out
}



/**Define extensions accepted by the app*/
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Gif, Mp4,
    Jpeg, Png,
    Webp, Svg,
}
impl MediaType {
    fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_ascii_lowercase().as_str() {
            "gif" => Some(Self::Gif), "mp4" => Some(Self::Mp4),
            "jpg" | "jpeg" => Some(Self::Jpeg), "png" => Some(Self::Png),
            "webp" => Some(Self::Webp), "svg" => Some(Self::Svg), _ => None
        }
    }
    fn extension(self) -> &'static str {
        match self {
            Self::Gif => "gif", Self::Mp4 => "mp4",
            Self::Jpeg => "jpg", Self::Png => "png",
            Self::Webp => "webp", Self::Svg => "svg",
        }
    }
}



/**Struct to define a media file with UUID, new filename and original one, metadata...*/
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
impl MediaItem {
    //Copies `source` into the media folder and builds its `MediaItem`.
    fn from_source(source: &Path) -> AppResult<Option<Self>> {
        let ext: &str = source.extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default();

        // if media type isn't supported, it will return nothing
        let Some(media_type) = MediaType::from_extension(ext) else { return Ok(None); };

        let id = Uuid::new_v4();
        let stored_file_name = format!("{id}.{}", media_type.extension());
        std::fs::copy(source, LibraryIndex::media_dir().join(&stored_file_name))?;

        Ok(Some(Self {
            id,
            stored_file_name,
            original_file_name: source
                .file_name().and_then(|n| n.to_str())
                .unwrap_or("file")
                .to_owned(),
            media_type,
            imported_at_unix: now_unix(),
            tags: Vec::new(),
        }))
    }
}



/**Struct of the local data catalogue in JSON format that stores `MediaItem`*/
#[derive(Serialize, Deserialize, Default)]
pub struct LibraryIndex {
    #[serde(default)]
    items: Vec<MediaItem>,
}
impl LibraryIndex {
    /// Returns `PathBuf` to media folder at `%LOCALAPPDATA%\KawaGIIF\media`
    fn media_dir() -> PathBuf { config::data_dir().join("media") }
    /// Returns `PathBuf` to `%LOCALAPPDATA%\KawaGIIF\library_index.json`
    fn index_path() -> PathBuf { config::data_dir().join("library_index.json") }
    // Every distinct tag in the library, keyed by its lowercase form and mapped to its canonical spelling.
    fn known_tags(&self) -> HashMap<String, String> {
        let mut known = HashMap::new();
        for tag in self.items.iter().flat_map(|item| &item.tags) {
            known.entry(tag.to_lowercase()).or_insert_with(|| tag.clone());
        }
        known
    }

    //Returns a reference to a media file indexed using its UUID.
    pub fn find(&self, id: &Uuid) -> Option<&MediaItem> {
        self.items.iter().find(|item| item.id == *id)
    }
    //Returns a mutable reference to a media file indexed using its UUID.
    fn find_mut(&mut self, id: &Uuid) -> AppResult<&mut MediaItem> {
        self.items.iter_mut().find(|item| item.id == *id).ok_or(AppError::MediaNotFound(*id))
    }

    //Serialize entire index as a JSON and write it
    fn save(&self) -> AppResult<()> {
        config::write_atomic(&Self::index_path(), &serde_json::to_vec_pretty(self)?)
    }
    //Loads the index and normalizes its tags.
    fn load() -> Self {
        let mut index: Self = std::fs::read_to_string(Self::index_path())
            .ok()
            .and_then(|contents| serde_json::from_str(&contents).ok())
            .unwrap_or_default();

        let known = index.known_tags();
        for item in &mut index.items {
            item.tags = normalize_tags(std::mem::take(&mut item.tags), &known);
        }
        index
    }
}

/**Struct to access to `LibraryIndex` with a `Mutex` to block the thread until the lock is freed*/
pub struct LibraryState(Mutex<LibraryIndex>);
impl Default for LibraryState {
    fn default() -> Self { Self(Mutex::new(LibraryIndex::load())) }
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



//Tag Commands
///Update media tags
#[tauri::command]
pub fn update_media_tags(app: AppHandle, lib: State<LibraryState>, id: Uuid, tags: Vec<String>) -> AppResult<()> {
    let mut index = lib.lock();
    let known = index.known_tags();
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

/// Renames a tag across the whole library and returns how many items changed.
#[tauri::command]
pub fn rename_tag(app: AppHandle, library: State<LibraryState>, from: String, to: String) -> AppResult<usize> {
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
            .into_iter().map(|t| { if t.to_lowercase() == from_key {
                    new_name.clone()
                } else {
                    t
                }}).collect();
        item.tags = normalize_tags(renamed, &no_known);
        touched += 1;
    }
    index.save()?;
    drop(index);

    notify_library_changed(&app);
    Ok(touched)
}

///Deletes tag from a `MediaItem` of the `LibraryIndex`
#[tauri::command]
pub fn delete_tag(app: AppHandle, lib: State<LibraryState>, name: String) -> AppResult<usize> {
    let key = name.to_lowercase();
    let mut index = lib.lock();
    let mut touched: usize = 0;

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



//Media Commands
///Deletes media items (only our copy in `media/`, never the user's original), without leaving placed animations
///pointing at them. Saves the index and the template once for the whole batch; returns how many were deleted.
#[tauri::command]
pub fn delete_media(app: AppHandle, lib: State<LibraryState>,
    editor: State<EditorState>, ids: Vec<Uuid>, force: bool,
) -> AppResult<usize> {
    let ids: HashSet<Uuid> = ids.into_iter().collect();
    let references = template::count_references_to_media(&editor, &ids);
    if references > 0 && !force {
        return Err(AppError::MediaReferenced(references));
    }

    let mut index = lib.lock();
    let (doomed, kept): (Vec<MediaItem>, Vec<MediaItem>) =
        std::mem::take(&mut index.items).into_iter().partition(|item| ids.contains(&item.id));
    index.items = kept;
    for item in &doomed {
        let _ = std::fs::remove_file(LibraryIndex::media_dir().join(&item.stored_file_name));
    }
    index.save()?;
    drop(index);

    if references > 0 {
        template::purge_media_references(&app, &editor, &ids)?;
    }

    notify_library_changed(&app);
    Ok(doomed.len())
}

///List all media saved at the moment in the `LibraryIndex`
#[tauri::command]
pub fn list_media(library: State<LibraryState>) -> Vec<MediaItem> {
    library.lock().items.clone()
}

///Absolute path of a media file, which the frontend turns into an `asset://` URL with `convertFileSrc`.
#[tauri::command]
pub fn get_media_path(library: State<LibraryState>, id: Uuid) -> AppResult<String> {
    let index = library.lock();
    let item = index.find(&id).ok_or(AppError::MediaNotFound(id))?;
    Ok(LibraryIndex::media_dir().join(&item.stored_file_name).to_string_lossy().into_owned())
}

///Import media file to the `LibraryIndex` (accept more than one file)
#[tauri::command]
pub fn import_media(app: AppHandle, lib: State<LibraryState>, paths: Vec<PathBuf>,) -> AppResult<Vec<MediaItem>> {
    std::fs::create_dir_all(LibraryIndex::media_dir())?;
    let mut imported = Vec::with_capacity(paths.len());
    for source in &paths {
        if let Some(item) = MediaItem::from_source(source)? {
            imported.push(item);
        }
    }

    let mut index = lib.lock();
    index.items.extend(imported.iter().cloned());
    index.save()?;
    drop(index);

    notify_library_changed(&app);
    Ok(imported)
}

///Obtains media file's size
#[tauri::command]
pub fn get_file_size(path: PathBuf) -> AppResult<u64> {Ok(std::fs::metadata(path)?.len())}
