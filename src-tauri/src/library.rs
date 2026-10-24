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

const MAX_NAME_CHARS: usize = 120;

/** Trims and collapses whitespace; `None` when nothing is left.*/
fn collapse_spaces(raw: &str) -> Option<String> {
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
        let Some(cleaned) = collapse_spaces(&tag) else { continue; };
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

    // Normalised path of the file this was imported from, to spot a re-import
    #[serde(default)]
    pub source_path: Option<String>,

    // set by list_media when the file is gone from the media folder; never stored as true
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub missing: bool,
}
impl MediaItem {
    //Copies `source` into the media folder and builds its `MediaItem`.
    fn from_source(source: &Path) -> AppResult<Option<Self>> {
        // if media type isn't supported, it will return nothing
        let Some(media_type) = media_type_of(source) else { return Ok(None); };

        let id = Uuid::new_v4();
        Ok(Some(Self {
            id,
            stored_file_name: copy_to_media(source, id, media_type)?,
            original_file_name: source
                .file_name().and_then(|n| n.to_str())
                .unwrap_or("file")
                .to_owned(),
            media_type,
            imported_at_unix: now_unix(),
            tags: Vec::new(),
            source_path: Some(source_key(source)),
            missing: false,
        }))
    }
}

fn media_type_of(source: &Path) -> Option<MediaType> {
    MediaType::from_extension(source.extension().and_then(|e| e.to_str()).unwrap_or_default())
}

/** Copies `source` into the media folder as `<id>.<ext>` and returns the stored file name.*/
fn copy_to_media(source: &Path, id: Uuid, media_type: MediaType) -> AppResult<String> {
    let stored_file_name = format!("{id}.{}", media_type.extension());
    std::fs::copy(source, LibraryIndex::media_dir().join(&stored_file_name))?;
    Ok(stored_file_name)
}

/** Lowercased absolute path, so the same file is recognised again (Windows paths ignore case).*/
fn source_key(source: &Path) -> String {
    std::fs::canonicalize(source)
        .unwrap_or_else(|_| source.to_path_buf())
        .to_string_lossy().to_lowercase()
}

/** Returns `name`, or `stem (n).ext` with the smallest free n >= 2 when it is taken (case-insensitive), and marks it taken.*/
fn claim_unique_name(name: &str, taken: &mut HashSet<String>) -> String {
    let path = Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| format!(".{e}")).unwrap_or_default();

    let mut candidate = name.to_owned();
    let mut n = 2;
    while taken.contains(&candidate.to_lowercase()) {
        candidate = format!("{stem} ({n}){ext}");
        n += 1;
    }
    taken.insert(candidate.to_lowercase());
    candidate
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

    // Item id of every known source path.
    fn ids_by_source(&self) -> HashMap<String, Uuid> {
        self.items.iter().filter_map(|item| Some((item.source_path.clone()?, item.id))).collect()
    }
    // Every display name in use, lowercase.
    fn taken_names(&self) -> HashSet<String> {
        self.items.iter().map(|item| item.original_file_name.to_lowercase()).collect()
    }

    //Returns a reference to a media file indexed using its UUID.
    pub fn find(&self, id: &Uuid) -> Option<&MediaItem> {
        self.items.iter().find(|item| item.id == *id)
    }
    //Returns a mutable reference to a media file indexed using its UUID.
    fn find_mut(&mut self, id: &Uuid) -> AppResult<&mut MediaItem> {
        self.items.iter_mut().find(|item| item.id == *id).ok_or(AppError::MediaNotFound(*id))
    }

    /** Whether `item`'s file is still in the media folder. */
    fn file_exists(item: &MediaItem) -> bool { Self::media_dir().join(&item.stored_file_name).is_file() }
    /** Whether media `id` exists in the index and its file is still in the media folder. */
    pub fn has_file(&self, id: &Uuid) -> bool { self.find(id).is_some_and(Self::file_exists) }

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



/** Applies `edit` to the tags of every item it selects, saves and notifies once; returns how many items changed. */
fn edit_tags(app: &AppHandle, lib: &LibraryState,
    mut edit: impl FnMut(&mut MediaItem, &HashMap<String, String>) -> bool,
) -> AppResult<usize> {
    let mut index = lib.lock();
    let known = index.known_tags();
    let mut touched = 0;

    for item in &mut index.items {
        if edit(item, &known) { touched += 1; }
    }
    index.save()?;
    drop(index);

    notify_library_changed(app);
    Ok(touched)
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

/// Adds and removes the same tags on many items in one save/notify; returns how many changed.
#[tauri::command]
pub fn update_tags_many(app: AppHandle, lib: State<LibraryState>,
    ids: Vec<Uuid>, add: Vec<String>, remove: Vec<String>,
) -> AppResult<usize> {
    let ids: HashSet<Uuid> = ids.into_iter().collect();
    let remove: HashSet<String> = remove.iter().map(|t| t.to_lowercase()).collect();

    edit_tags(&app, &lib, |item, known| {
        if !ids.contains(&item.id) { return false; }
        let before = item.tags.clone();
        item.tags.retain(|t| !remove.contains(&t.to_lowercase()));
        item.tags.extend(add.iter().cloned());
        item.tags = normalize_tags(std::mem::take(&mut item.tags), known);
        item.tags != before
    })
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
    let new_name = collapse_spaces(&to).ok_or(AppError::EmptyTag)?;
    let from_key = from.to_lowercase();
    // the new spelling must win over any existing one, so renaming normalizes without the known spellings
    let no_known = HashMap::new();

    edit_tags(&app, &library, |item, _| {
        if !item.tags.iter().any(|t| t.to_lowercase() == from_key) { return false; }
        let renamed = std::mem::take(&mut item.tags)
            .into_iter().map(|t| if t.to_lowercase() == from_key {
                new_name.clone()
            } else {
                t
            }).collect();
        item.tags = normalize_tags(renamed, &no_known);
        true
    })
}

///Deletes tag from a `MediaItem` of the `LibraryIndex`
#[tauri::command]
pub fn delete_tag(app: AppHandle, lib: State<LibraryState>, name: String) -> AppResult<usize> {
    let key = name.to_lowercase();

    edit_tags(&app, &lib, |item, _| {
        let before = item.tags.len();
        item.tags.retain(|t| t.to_lowercase() != key);
        item.tags.len() != before
    })
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

///List all media saved at the moment in the `LibraryIndex`, flagging each whose file was deleted from the media folder.
#[tauri::command]
pub fn list_media(library: State<LibraryState>) -> Vec<MediaItem> {
    let mut items = library.lock().items.clone();
    for item in &mut items { item.missing = !LibraryIndex::file_exists(item); }
    items
}

///Absolute path of a media file, which the frontend turns into an `asset://` URL with `convertFileSrc`.
#[tauri::command]
pub fn get_media_path(library: State<LibraryState>, id: Uuid) -> AppResult<String> {
    let index = library.lock();
    let item = index.find(&id).ok_or(AppError::MediaNotFound(id))?;
    Ok(LibraryIndex::media_dir().join(&item.stored_file_name).to_string_lossy().into_owned())
}

/// Paths (as given) whose file is already in the library, so the UI can ask before replacing.
#[tauri::command]
pub fn find_reimports(lib: State<LibraryState>, paths: Vec<PathBuf>) -> Vec<String> {
    let known = lib.lock().ids_by_source();
    paths.iter()
        .filter(|path| known.contains_key(&source_key(path)))
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

///Import media files to the `LibraryIndex`. A file imported before is replaced when `replace_existing`, else skipped.
///Returns the new and the replaced items.
#[tauri::command]
pub fn import_media(app: AppHandle, lib: State<LibraryState>, paths: Vec<PathBuf>, replace_existing: bool) -> AppResult<Vec<MediaItem>> {
    std::fs::create_dir_all(LibraryIndex::media_dir())?;
    let (known, mut taken) = {
        let index = lib.lock();
        (index.ids_by_source(), index.taken_names())
    };

    let mut added: Vec<MediaItem> = Vec::with_capacity(paths.len());
    let mut replacements: Vec<(Uuid, String, MediaType)> = Vec::new();
    let mut seen: HashSet<String> = HashSet::with_capacity(paths.len());
    for source in &paths {
        let key = source_key(source);
        if !seen.insert(key.clone()) { continue; }

        let Some(&id) = known.get(&key) else {
            if let Some(mut item) = MediaItem::from_source(source)? {
                item.original_file_name = claim_unique_name(&item.original_file_name, &mut taken);
                added.push(item);
            }
            continue;
        };
        if !replace_existing { continue; }
        let Some(media_type) = media_type_of(source) else { continue; };
        replacements.push((id, copy_to_media(source, Uuid::new_v4(), media_type)?, media_type));
    }

    let mut index = lib.lock();
    let mut changed: Vec<MediaItem> = Vec::with_capacity(added.len() + replacements.len());
    let mut stale: Vec<String> = Vec::with_capacity(replacements.len());
    for (id, stored_file_name, media_type) in replacements {
        // the item may have been deleted meanwhile: drop the fresh copy then
        let Ok(item) = index.find_mut(&id) else {
            stale.push(stored_file_name);
            continue;
        };
        stale.push(std::mem::replace(&mut item.stored_file_name, stored_file_name));
        item.media_type = media_type;
        changed.push(item.clone());
    }
    changed.extend(added.iter().cloned());
    index.items.extend(added);
    index.save()?;
    drop(index);

    // only once the index no longer points at them, so a failed save never leaves an item without its file
    for name in stale { let _ = std::fs::remove_file(LibraryIndex::media_dir().join(name)); }
    notify_library_changed(&app);
    Ok(changed)
}

/// Changes the name shown for a media item. The file on disk is never renamed.
#[tauri::command]
pub fn rename_media(app: AppHandle, lib: State<LibraryState>, id: Uuid, name: String) -> AppResult<()> {
    let name = collapse_spaces(&name).ok_or(AppError::EmptyName)?;
    let mut index = lib.lock();
    index.find_mut(&id)?.original_file_name = name.chars().take(MAX_NAME_CHARS).collect();
    index.save()?;
    drop(index);

    notify_library_changed(&app);
    Ok(())
}

///Obtains media file's size
#[tauri::command]
pub fn get_file_size(path: PathBuf) -> AppResult<u64> {Ok(std::fs::metadata(path)?.len())}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_names_get_the_smallest_free_number() {
        let mut taken: HashSet<String> = ["cat.gif".into(), "cat (2).gif".into()].into();
        assert_eq!(claim_unique_name("Cat.gif", &mut taken), "Cat (3).gif");
        assert_eq!(claim_unique_name("Cat.gif", &mut taken), "Cat (4).gif");
        assert_eq!(claim_unique_name("dog.gif", &mut taken), "dog.gif");
    }
}
