/** Media library. Imports files into the app's own `media` folder, keeps the index of what is there (`library_index.json`) and manages each item's tags. */
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
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

/** Trims and collapses whitespace. `None` when nothing is left. */
fn collapse_spaces(raw: &str) -> Option<String> {
    let cleaned = raw
        .split_whitespace()
        .collect::<Vec<_>>().join(" ");
    (!cleaned.is_empty()).then_some(cleaned)
}

/** Cleans a list of tags and reuses the spelling that already exists.*/
fn normalize_tags(raw: Vec<String>, known: &HashMap<String, String>) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::with_capacity(raw.len());
    let mut out: Vec<String> = Vec::with_capacity(raw.len());

    for tag in raw {
        let Some(cleaned) = collapse_spaces(&tag) else { continue; };
        let key = cleaned.to_lowercase();

        if seen.contains(&key) { continue; }
        out.push(known.get(&key).cloned().unwrap_or(cleaned));
        seen.insert(key);
    }
    out
}



/** The extensions the app accepts. */
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
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



/** One media file and its metadata. */
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

    // set by list_media when the file is gone from the media folder. Never stored as true
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub missing: bool,
}
impl MediaItem {
    /// Copies `source` into the media folder and builds its `MediaItem`.
    fn from_source(source: &Path) -> AppResult<Option<Self>> {
        // if media type isn't supported, it will return nothing
        let Some(media_type) = media_type_of(source) else { return Ok(None); };

        let id = Uuid::new_v4();
        Ok(Some(Self {
            id,
            stored_file_name: copy_to_media(source, id, media_type)?,
            original_file_name: source
                .file_stem().and_then(|n| n.to_str())
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

/** Reads up to 512 bytes of `path` and sniffs its real media type from their content.*/
fn sniff_type(path: &Path) -> Option<MediaType> {
    let mut buf = [0u8; 512];
    let n = std::fs::File::open(path).ok()?.read(&mut buf).ok()?;
    sniff_bytes(&buf[..n])
}

/** Detects the media type from raw bytes: signatures for PNG/JPEG/GIF/WEBP/MP4, `<svg` for SVG.*/
fn sniff_bytes(bytes: &[u8]) -> Option<MediaType> {
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return Some(MediaType::Png); }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) { return Some(MediaType::Jpeg); }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") { return Some(MediaType::Gif); }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") { return Some(MediaType::Webp); }
    if bytes.get(4..8) == Some(b"ftyp") { return Some(MediaType::Mp4); }
    looks_like_svg(bytes).then_some(MediaType::Svg)
}

/** Whether `bytes` hold an SVG document (a `<svg` tag after optional BOM/whitespace).*/
fn looks_like_svg(bytes: &[u8]) -> bool {
    String::from_utf8_lossy(bytes)
        .trim_start_matches('\u{feff}')
        .trim_start()
        .to_ascii_lowercase()
        .contains("<svg")
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

/** Returns `name`, or `name (n)` with the smallest free n >= 2 when it is taken (case-insensitive), and marks it taken.*/
fn claim_unique_name(name: &str, taken: &mut HashSet<String>) -> String {
    let mut candidate = name.to_owned();
    let mut n = 2;
    while taken.contains(&candidate.to_lowercase()) {
        candidate = format!("{name} ({n})");
        n += 1;
    }
    taken.insert(candidate.to_lowercase());
    candidate
}

/** Strips a trailing known extension from a legacy display name (case-insensitive). `None` otherwise. */
fn strip_known_extension(name: &str) -> Option<&str> {
    const EXTS: [&str; 7] = ["gif", "mp4", "jpg", "jpeg", "png", "webp", "svg"];
    let lower = name.to_lowercase();
    EXTS.iter().find_map(|ext| {
        lower.strip_suffix(&format!(".{ext}")).map(|stem| &name[..stem.len()])
    })
}



/** The on-disk catalogue of `MediaItem`s, saved as `library_index.json`. */
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
    /// Every distinct tag in the library, keyed by its lowercase form and mapped to its canonical spelling.
    fn known_tags(&self) -> HashMap<String, String> {
        let mut known = HashMap::new();
        for tag in self.items.iter().flat_map(|item| &item.tags) {
            known.entry(tag.to_lowercase()).or_insert_with(|| tag.clone());
        }
        known
    }

    /// Item id of every known source path.
    fn ids_by_source(&self) -> HashMap<String, Uuid> {
        self.items.iter().filter_map(|item| Some((item.source_path.clone()?, item.id))).collect()
    }
    /// Every display name in use, lowercase.
    fn taken_names(&self) -> HashSet<String> {
        self.items.iter().map(|item| item.original_file_name.to_lowercase()).collect()
    }

    /// Media item by id.
    pub fn find(&self, id: &Uuid) -> Option<&MediaItem> {
        self.items.iter().find(|item| item.id == *id)
    }
    /// Media item by id, mutable.
    fn find_mut(&mut self, id: &Uuid) -> AppResult<&mut MediaItem> {
        self.items.iter_mut().find(|item| item.id == *id).ok_or(AppError::MediaNotFound(*id))
    }

    /** Whether `item`'s file is still in the media folder. */
    fn file_exists(item: &MediaItem) -> bool { Self::media_dir().join(&item.stored_file_name).is_file() }
    /** Whether media `id` exists in the index and its file is still in the media folder. */
    pub fn has_file(&self, id: &Uuid) -> bool { self.find(id).is_some_and(Self::file_exists) }

    /// Writes the index to disk.
    fn save(&self) -> AppResult<()> {
        config::write_atomic(&Self::index_path(), &serde_json::to_vec_pretty(self)?)
    }
    /// Loads the index, normalizing tags and stripping legacy extensions.
    fn load() -> Self {
        let mut index: Self = std::fs::read_to_string(Self::index_path())
            .ok()
            .and_then(|contents| serde_json::from_str(&contents).ok())
            .unwrap_or_default();

        let known = index.known_tags();
        for item in &mut index.items {
            item.tags = normalize_tags(std::mem::take(&mut item.tags), &known);
        }

        // Migrate names that still carry their extension, re-claiming collisions.
        let mut taken = index.taken_names();
        let mut changed = false;
        for item in &mut index.items {
            let Some(stem) = strip_known_extension(&item.original_file_name) else { continue; };
            let stem = stem.to_owned();
            taken.remove(&item.original_file_name.to_lowercase());
            item.original_file_name = claim_unique_name(&stem, &mut taken);
            changed = true;
        }
        if changed { let _ = index.save(); }
        index
    }
}

/** `LibraryIndex` behind a mutex, shared across commands. */
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

/** What an import did: the items added or replaced, and the file names whose content was rejected.*/
#[derive(Serialize)]
pub struct ImportResult {
    pub items: Vec<MediaItem>,
    pub rejected: Vec<String>,
}



/** Applies `edit` to the tags of every item it selects, saves and notifies once. Returns how many items changed. */
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



// Tag Commands
/// Replaces one item's tags, normalized against the known spellings.
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

/// Adds and removes the same tags on many items in one save/notify. Returns how many changed.
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

/// Removes a tag from every item that has it.
#[tauri::command]
pub fn delete_tag(app: AppHandle, lib: State<LibraryState>, name: String) -> AppResult<usize> {
    let key = name.to_lowercase();

    edit_tags(&app, &lib, |item, _| {
        let before = item.tags.len();
        item.tags.retain(|t| t.to_lowercase() != key);
        item.tags.len() != before
    })
}



// Media Commands
/// Deletes media items (only our copy in `media/`, never the user's original) without leaving placed animations
/// pointing at them. Saves the index and the template once for the whole batch. Returns how many were deleted.
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

/// Lists all media, flagging each whose file was deleted from the media folder.
#[tauri::command]
pub fn list_media(library: State<LibraryState>) -> Vec<MediaItem> {
    let mut items = library.lock().items.clone();
    for item in &mut items { item.missing = !LibraryIndex::file_exists(item); }
    items
}

/// Absolute path of a media file, which the frontend turns into an `asset://` URL with `convertFileSrc`.
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

/// Imports media files. A file imported before is replaced when `replace_existing`, else skipped.
/// Returns the new and the replaced items, plus the file names whose content did not match their extension.
#[tauri::command]
pub fn import_media(app: AppHandle, lib: State<LibraryState>, paths: Vec<PathBuf>, replace_existing: bool) -> AppResult<ImportResult> {
    std::fs::create_dir_all(LibraryIndex::media_dir())?;
    let (known, mut taken) = {
        let index = lib.lock();
        (index.ids_by_source(), index.taken_names())
    };

    let mut added: Vec<MediaItem> = Vec::with_capacity(paths.len());
    let mut replacements: Vec<(Uuid, String, MediaType)> = Vec::new();
    let mut rejected: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::with_capacity(paths.len());
    for source in &paths {
        let key = source_key(source);
        if !seen.insert(key.clone()) { continue; }

        // Reject files whose content does not match their extension. Unsupported extensions skip silently.
        if let Some(ext_type) = media_type_of(source) {
            if sniff_type(source) != Some(ext_type) {
                rejected.push(source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| source.to_string_lossy().into_owned()));
                continue;
            }
        }

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
    Ok(ImportResult { items: changed, rejected })
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

/// Size of a media file in bytes.
#[tauri::command]
pub fn get_file_size(path: PathBuf) -> AppResult<u64> {Ok(std::fs::metadata(path)?.len())}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_names_get_the_smallest_free_number() {
        let mut taken: HashSet<String> = ["cat".into(), "cat (2)".into()].into();
        assert_eq!(claim_unique_name("Cat", &mut taken), "Cat (3)");
        assert_eq!(claim_unique_name("Cat", &mut taken), "Cat (4)");
        assert_eq!(claim_unique_name("dog", &mut taken), "dog");
    }

    #[test]
    fn stem_with_dots_stays_whole() {
        let mut taken: HashSet<String> = HashSet::new();
        assert_eq!(claim_unique_name("my.photo", &mut taken), "my.photo");
        assert_eq!(claim_unique_name("my.photo", &mut taken), "my.photo (2)");
    }

    #[test]
    fn sniffs_each_format() {
        assert_eq!(sniff_bytes(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Some(MediaType::Png));
        assert_eq!(sniff_bytes(&[0xFF, 0xD8, 0xFF, 0xE0]), Some(MediaType::Jpeg));
        assert_eq!(sniff_bytes(b"GIF89a...."), Some(MediaType::Gif));
        assert_eq!(sniff_bytes(b"GIF87a...."), Some(MediaType::Gif));
        assert_eq!(sniff_bytes(b"RIFF\x00\x00\x00\x00WEBPVP8 "), Some(MediaType::Webp));
        assert_eq!(sniff_bytes(b"\x00\x00\x00\x18ftypisom"), Some(MediaType::Mp4));
        assert_eq!(sniff_bytes(b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"), Some(MediaType::Svg));
        assert_eq!(sniff_bytes(b"\xEF\xBB\xBF  <svg></svg>"), Some(MediaType::Svg));
        assert_eq!(sniff_bytes(b"not a known file"), None);
    }

    #[test]
    fn png_bytes_under_a_jpg_name_mismatch() {
        // PNG content sniffs as Png, but a `.jpg` name maps to Jpeg, so import_media would reject it.
        let png = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(sniff_bytes(png), Some(MediaType::Png));
        assert_ne!(sniff_bytes(png), MediaType::from_extension("jpg"));
    }
}
