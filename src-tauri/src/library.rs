/** Media library. Imports files into the app's own `media` folder, keeps the index of what is there (`library_index.json`) and manages each item's tags. */
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{AppHandle, Emitter, State, WebviewWindow};
use uuid::Uuid;

use crate::config;
use crate::error::{AppError, AppResult};
use crate::media_compress;
use crate::template::{self, EditorState};
use crate::window_manager;



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
    /// Builds the `MediaItem` of `source`, already copied into the media folder as `stored_file_name`.
    fn from_source(source: &Path, id: Uuid, media_type: MediaType, stored_file_name: String) -> Self {
        Self {
            id,
            stored_file_name,
            original_file_name: source
                .file_stem().and_then(|n| n.to_str())
                .unwrap_or("file")
                .to_owned(),
            media_type,
            imported_at_unix: config::now_unix(),
            tags: Vec::new(),
            source_path: Some(source_key(source)),
            missing: false,
        }
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

/** Copies `source` into the media folder as `<id>.<ext>` and checks the copy again, since the source may have changed
 since it was checked. A refused copy is deleted. Returns the stored file name. */
fn copy_checked(source: &Path, id: Uuid, media_type: MediaType) -> AppResult<Result<String, Refusal>> {
    let stored_file_name = format!("{id}.{}", media_type.extension());
    let stored = LibraryIndex::media_dir().join(&stored_file_name);
    std::fs::copy(source, &stored)?;
    if let Err(refusal) = check_import(&stored, media_type) {
        remove_media_file(&stored_file_name);
        return Ok(Err(refusal));
    }
    Ok(Ok(stored_file_name))
}

/** Deletes one file of the media folder. A name that is not a bare file name is ignored, so a tampered index can't
 reach outside the folder. */
fn remove_media_file(stored_file_name: &str) {
    if !is_bare_file_name(stored_file_name) { return; }
    let _ = std::fs::remove_file(LibraryIndex::media_dir().join(stored_file_name));
}

/** A single plain file name: no folder, drive, `.` or `..`. */
fn is_bare_file_name(name: &str) -> bool {
    let path = Path::new(name);
    path.components().count() == 1 && path.file_name() == Some(name.as_ref())
}

/** The name an import reports a refused file by. */
fn display_name(source: &Path) -> String {
    source.file_name().map_or_else(|| source.to_string_lossy().into_owned(), |n| n.to_string_lossy().into_owned())
}



// Import Limits
const MAX_SIDE_PX: u32 = 16_384; // WebView2 refuses to draw a bigger image anyway
const MAX_PIXELS: u64 = 100_000_000;
const GIF_DECODED_BUDGET: u64 = 1536 * 1024 * 1024; // the overlay decodes every GIF frame to RGBA
const MIB: u64 = 1024 * 1024;

/** Why an import was turned away. */
#[derive(Debug, PartialEq)]
enum Refusal { Mismatch, TooLarge }

fn max_bytes(media_type: MediaType) -> u64 {
    match media_type {
        MediaType::Mp4 => 1024 * MIB, MediaType::Gif => 300 * MIB, MediaType::Svg => 10 * MIB,
        MediaType::Jpeg | MediaType::Png | MediaType::Webp => 100 * MIB,
    }
}

/** Checks a file before it joins the library: its content must match `media_type`, and its size, dimensions and (for
 a GIF) decoded frames must stay small enough not to run the overlay out of memory. Only headers are read. */
fn check_import(path: &Path, media_type: MediaType) -> Result<(), Refusal> {
    if sniff_type(path) != Some(media_type) { return Err(Refusal::Mismatch); }
    let len = std::fs::metadata(path).map_err(|_| Refusal::Mismatch)?.len();
    if len > max_bytes(media_type) { return Err(Refusal::TooLarge); }
    match media_type {
        MediaType::Gif => {
            let (width, height, frames) = gif_shape(path).ok_or(Refusal::Mismatch)?;
            fits_canvas(width, height)?;
            if !gif_fits_budget(width, height, frames) { return Err(Refusal::TooLarge); }
        }
        MediaType::Png | MediaType::Jpeg | MediaType::Webp => {
            let (width, height) = image::ImageReader::open(path).ok()
                .and_then(|reader| reader.with_guessed_format().ok())
                .and_then(|reader| reader.into_dimensions().ok())
                .ok_or(Refusal::Mismatch)?;
            fits_canvas(width, height)?;
        }
        MediaType::Mp4 | MediaType::Svg => {}
    }
    Ok(())
}

fn fits_canvas(width: u32, height: u32) -> Result<(), Refusal> {
    let too_big = width.max(height) > MAX_SIDE_PX || u64::from(width) * u64::from(height) > MAX_PIXELS;
    if too_big { Err(Refusal::TooLarge) } else { Ok(()) }
}

fn gif_fits_budget(width: u32, height: u32, frames: u64) -> bool {
    (u64::from(width) * u64::from(height) * 4).saturating_mul(frames) <= GIF_DECODED_BUDGET
}

/** Width, height and frame count of a GIF, walking its frames without decoding their pixels. */
fn gif_shape(path: &Path) -> Option<(u32, u32, u64)> {
    let mut options = gif::DecodeOptions::new();
    options.skip_frame_decoding(true);
    let mut decoder = options.read_info(std::io::BufReader::new(std::fs::File::open(path).ok()?)).ok()?;
    let (width, height) = (u32::from(decoder.width()), u32::from(decoder.height()));
    let mut frames = 0;
    while decoder.next_frame_info().ok()?.is_some() { frames += 1; }
    Some((width, height, frames))
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
        let mut index: Self = config::read_or_quarantine(&Self::index_path(), |s| serde_json::from_str(s).ok());

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

/** What an import did: the items added or replaced, the file names whose content was rejected, and the ones too
 big to show safely.*/
#[derive(Serialize)]
pub struct ImportResult {
    pub items: Vec<MediaItem>,
    pub rejected: Vec<String>,
    pub too_large: Vec<String>,
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
pub fn delete_media(app: AppHandle, window: WebviewWindow, lib: State<LibraryState>,
    editor: State<EditorState>, ids: Vec<Uuid>, force: bool,
) -> AppResult<usize> {
    // overlays only show media: deleting it is the control window's job
    if window.label() != window_manager::CONTROL_LABEL { return Err(AppError::DeleteOutsideControl); }
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
        remove_media_file(&item.stored_file_name);
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
    let mut too_large: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::with_capacity(paths.len());
    for source in &paths {
        let key = source_key(source);
        if !seen.insert(key.clone()) { continue; }
        // unsupported extensions skip silently
        let Some(media_type) = media_type_of(source) else { continue; };
        let existing = known.get(&key).copied();
        if existing.is_some() && !replace_existing { continue; }

        // checked on the source first, so a refused file is never copied, and again on the copy, which is what stays
        let id = Uuid::new_v4();
        let stored = match check_import(source, media_type) {
            Ok(()) => copy_checked(source, id, media_type)?,
            Err(refusal) => Err(refusal),
        };
        let stored_file_name = match stored {
            Ok(name) => name,
            Err(Refusal::Mismatch) => { rejected.push(display_name(source)); continue; }
            Err(Refusal::TooLarge) => { too_large.push(display_name(source)); continue; }
        };
        match existing {
            Some(existing_id) => replacements.push((existing_id, stored_file_name, media_type)),
            None => {
                let mut item = MediaItem::from_source(source, id, media_type, stored_file_name);
                item.original_file_name = claim_unique_name(&item.original_file_name, &mut taken);
                added.push(item);
            }
        }
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
    for name in stale { remove_media_file(&name); }
    shrink_in_background(&changed);
    notify_library_changed(&app);
    Ok(ImportResult { items: changed, rejected, too_large })
}

/** Shrinks the oversized still images just imported, off the main thread: a big PNG takes seconds to re-encode. The
 file keeps its name, so the index needs no update. A file the UI is reading can't be replaced and simply stays. */
fn shrink_in_background(items: &[MediaItem]) {
    let files: Vec<(PathBuf, MediaType)> = items.iter()
        .filter(|item| matches!(item.media_type, MediaType::Png | MediaType::Jpeg | MediaType::Webp))
        .map(|item| (LibraryIndex::media_dir().join(&item.stored_file_name), item.media_type))
        .collect();
    if files.is_empty() { return; }
    std::thread::spawn(move || {
        for (path, media_type) in files { let _ = media_compress::shrink_still_image(&path, media_type); }
    });
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

/// Size of each file in bytes, 0 for one that can't be read (the import refuses it later anyway).
#[tauri::command]
pub fn get_file_sizes(paths: Vec<PathBuf>) -> Vec<u64> {
    paths.iter().map(|path| std::fs::metadata(path).map_or(0, |meta| meta.len())).collect()
}


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
    fn only_bare_file_names_are_deleted() {
        assert!(is_bare_file_name("abc.png"));
        assert!(!is_bare_file_name("../x.png"));
        assert!(!is_bare_file_name("a/b.png"));
        assert!(!is_bare_file_name("a\\b.png"));
        assert!(!is_bare_file_name("C:\\x.png"));
        assert!(!is_bare_file_name("C:x.png"));
        assert!(!is_bare_file_name(".."));
        assert!(!is_bare_file_name("."));
        assert!(!is_bare_file_name(""));
    }

    #[test]
    fn gif_budget_counts_every_rgba_frame() {
        assert!(gif_fits_budget(500, 500, 1000)); // ~0.93 GiB
        assert!(!gif_fits_budget(1000, 1000, 500)); // ~1.86 GiB
        assert!(!gif_fits_budget(16_384, 16_384, u64::MAX)); // saturates instead of wrapping
    }

    #[test]
    fn gif_shape_counts_frames_without_decoding() {
        let path = std::env::temp_dir().join("kg_library_three_frames.gif");
        {
            let mut encoder = gif::Encoder::new(std::fs::File::create(&path).unwrap(), 4, 3, &[0, 0, 0, 255, 255, 255]).unwrap();
            for _ in 0..3 { encoder.write_frame(&gif::Frame::from_indexed_pixels(4, 3, vec![1; 12], None)).unwrap(); }
        }
        let shape = gif_shape(&path);
        let check = check_import(&path, MediaType::Gif);
        let _ = std::fs::remove_file(&path);
        assert_eq!(shape, Some((4, 3, 3)));
        assert_eq!(check, Ok(()));
    }

    #[test]
    fn canvas_limits_side_and_area() {
        assert_eq!(fits_canvas(16_384, 6_000), Ok(()));
        assert_eq!(fits_canvas(16_385, 10), Err(Refusal::TooLarge));
        assert_eq!(fits_canvas(12_000, 9_000), Err(Refusal::TooLarge));
    }

    #[test]
    fn png_bytes_under_a_jpg_name_mismatch() {
        // PNG content sniffs as Png, but a `.jpg` name maps to Jpeg, so import_media would reject it.
        let png = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(sniff_bytes(png), Some(MediaType::Png));
        assert_ne!(sniff_bytes(png), MediaType::from_extension("jpg"));
    }
}
