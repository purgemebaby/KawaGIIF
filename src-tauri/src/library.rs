use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::config;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Gif,
    Mp4,
    Jpeg,
    Png,
    /// WEBP puede ser estático o animado. WebView2 reproduce el animado de
    /// forma nativa en un `<img>`, igual que el GIF, así que se trata como
    /// animación a todos los efectos.
    Webp,
}

impl MediaType {
    fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "gif" => Some(MediaType::Gif),
            "mp4" => Some(MediaType::Mp4),
            "jpg" | "jpeg" => Some(MediaType::Jpeg),
            "png" => Some(MediaType::Png),
            "webp" => Some(MediaType::Webp),
            _ => None,
        }
    }

    fn extension(&self) -> &'static str {
        match self {
            MediaType::Gif => "gif",
            MediaType::Mp4 => "mp4",
            MediaType::Jpeg => "jpg",
            MediaType::Png => "png",
            MediaType::Webp => "webp",
        }
    }

    /// Ya no lo usa nadie desde que el frontend carga los archivos por el
    /// protocolo de assets (WebView2 deduce el tipo solo). Se conserva porque
    /// es la referencia de qué formatos soporta la app.
    #[allow(dead_code)]
    fn mime(&self) -> &'static str {
        match self {
            MediaType::Gif => "image/gif",
            MediaType::Mp4 => "video/mp4",
            MediaType::Jpeg => "image/jpeg",
            MediaType::Png => "image/png",
            MediaType::Webp => "image/webp",
        }
    }

    /// JPEG y PNG son imágenes estáticas: un control de velocidad sobre
    /// ellas no significa nada.
    ///
    /// Hoy quien decide si mostrar el slider de velocidad es el frontend;
    /// esto existe como espejo de esa regla para cuando la comprobación se
    /// haga también en Rust (M8, al validar `set_item_playback_rate`).
    #[allow(dead_code)]
    pub fn supports_speed(&self) -> bool {
        !matches!(self, MediaType::Jpeg | MediaType::Png)
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MediaItem {
    pub id: String,
    pub stored_file_name: String,
    pub original_file_name: String,
    pub media_type: MediaType,
    pub imported_at_unix: u64,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct LibraryIndex {
    #[serde(default = "schema_version")]
    schema_version: u32,
    #[serde(default)]
    items: Vec<MediaItem>,
}

fn schema_version() -> u32 {
    2
}

/// Normaliza un tag suelto: recorta los extremos y colapsa los espacios
/// interiores. Devuelve `None` si no queda nada, para poder descartarlo.
fn clean_tag(raw: &str) -> Option<String> {
    let cleaned = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

/// Normaliza una lista de tags contra los que ya existen en la biblioteca.
///
/// La regla clave: la comparación es SIN distinguir mayúsculas, pero se
/// conserva la grafía que ya existía. Si en la biblioteca hay `Gato` y el
/// usuario escribe `gato`, se guarda `Gato` — así no acabas con `gato`,
/// `Gato` y `GATO` como tres etiquetas distintas que hay que filtrar por
/// separado. Dentro de la propia lista también se deduplica igual.
fn normalize_tags(raw: Vec<String>, known: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();

    for tag in raw {
        let Some(cleaned) = clean_tag(&tag) else {
            continue;
        };
        let lower = cleaned.to_lowercase();

        // ¿Ya lo hemos añadido en esta misma pasada?
        if out.iter().any(|t| t.to_lowercase() == lower) {
            continue;
        }

        // ¿Existe ya en la biblioteca con otra grafía? Reutilizamos la suya.
        let canonical = known
            .iter()
            .find(|t| t.to_lowercase() == lower)
            .cloned()
            .unwrap_or(cleaned);

        out.push(canonical);
    }

    out
}

/// Todos los tags distintos que existen hoy en la biblioteca, con su grafía
/// canónica (la primera que aparece).
fn known_tags(index: &LibraryIndex) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in &index.items {
        for tag in &item.tags {
            if !out.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
                out.push(tag.clone());
            }
        }
    }
    out
}

#[derive(Serialize)]
pub struct TagCount {
    pub name: String,
    pub count: usize,
}

impl Default for LibraryIndex {
    fn default() -> Self {
        Self {
            schema_version: schema_version(),
            items: Vec::new(),
        }
    }
}

fn media_dir() -> PathBuf {
    config::data_dir().join("media")
}

fn index_path() -> PathBuf {
    config::data_dir().join("library_index.json")
}

/// Lee el índice y normaliza los tags de paso. Hacerlo al LEER (y no solo
/// al escribir) hace que los índices antiguos, escritos antes de que
/// existiera la normalización, se vean ya limpios sin necesidad de una
/// migración explícita ni de subir el `schema_version` por ello.
fn load_index() -> LibraryIndex {
    let mut index: LibraryIndex = match std::fs::read_to_string(index_path()) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => LibraryIndex::default(),
    };

    let known = known_tags(&index);
    for item in &mut index.items {
        item.tags = normalize_tags(std::mem::take(&mut item.tags), &known);
    }
    index
}

/// Escritura atómica (`.tmp` + `rename`), igual que `template.rs`: si la app
/// muere a mitad, el índice anterior sigue entero en vez de quedar truncado
/// y llevarse por delante toda la biblioteca.
fn save_index(index: &LibraryIndex) -> Result<(), String> {
    std::fs::create_dir_all(config::data_dir()).map_err(|e| e.to_string())?;
    let contents = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;

    let final_path = index_path();
    let tmp_path = final_path.with_extension("json.tmp");
    std::fs::write(&tmp_path, contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())
}

/// Avisa a toda la app de que la biblioteca cambió, para que las rejillas,
/// las pills de tags y el panel del editor se refresquen solos en vez de
/// tener que acordarse cada uno de recargar.
fn notify_library_changed(app: &AppHandle) {
    let _ = app.emit("library-changed", ());
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn import_media(app: AppHandle, source_paths: Vec<String>) -> Result<Vec<MediaItem>, String> {
    std::fs::create_dir_all(media_dir()).map_err(|e| e.to_string())?;
    let mut index = load_index();
    let mut imported = Vec::new();

    for source_path in source_paths {
        let path = PathBuf::from(&source_path);
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default();
        let Some(media_type) = MediaType::from_extension(ext) else {
            continue;
        };

        let id = Uuid::new_v4().to_string();
        let stored_file_name = format!("{id}.{}", media_type.extension());
        std::fs::copy(&path, media_dir().join(&stored_file_name)).map_err(|e| e.to_string())?;

        let item = MediaItem {
            id,
            stored_file_name,
            original_file_name: path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("archivo")
                .to_string(),
            media_type,
            imported_at_unix: now_unix(),
            tags: Vec::new(),
        };
        index.items.push(item.clone());
        imported.push(item);
    }

    save_index(&index)?;
    notify_library_changed(&app);
    Ok(imported)
}

#[tauri::command]
pub fn list_media() -> Vec<MediaItem> {
    load_index().items
}

#[tauri::command]
pub fn update_media_tags(app: AppHandle, id: String, tags: Vec<String>) -> Result<(), String> {
    let mut index = load_index();
    let known = known_tags(&index);
    let normalized = normalize_tags(tags, &known);

    let item = index
        .items
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| format!("no existe media con id {id}"))?;
    item.tags = normalized;

    save_index(&index)?;
    notify_library_changed(&app);
    Ok(())
}

/// Todos los tags de la biblioteca con cuántas medias los usan, de más usado
/// a menos. Alimenta a la vez las pills de filtro y el autocompletado del
/// popover, así la UI hace una llamada en vez de recorrerse la biblioteca.
#[tauri::command]
pub fn list_all_tags() -> Vec<TagCount> {
    let index = load_index();
    let mut counts: Vec<TagCount> = Vec::new();

    for item in &index.items {
        for tag in &item.tags {
            match counts
                .iter_mut()
                .find(|c| c.name.to_lowercase() == tag.to_lowercase())
            {
                Some(existing) => existing.count += 1,
                None => counts.push(TagCount {
                    name: tag.clone(),
                    count: 1,
                }),
            }
        }
    }

    counts.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    counts
}

/// Renombra un tag en TODA la biblioteca de una vez. Devuelve cuántas medias
/// se han tocado.
///
/// El caso interesante es la colisión: si una media tenía `gato` y `felino` y
/// renombras `felino` a `gato`, hay que quedarse con uno solo. Por eso se
/// vuelve a pasar por `normalize_tags`, que ya deduplica.
#[tauri::command]
pub fn rename_tag(app: AppHandle, from: String, to: String) -> Result<usize, String> {
    let Some(new_name) = clean_tag(&to) else {
        return Err("el nombre nuevo no puede estar vacío".to_string());
    };
    let from_lower = from.to_lowercase();

    let mut index = load_index();
    let mut touched = 0usize;

    for item in &mut index.items {
        if !item.tags.iter().any(|t| t.to_lowercase() == from_lower) {
            continue;
        }
        let renamed: Vec<String> = item
            .tags
            .iter()
            .map(|t| {
                if t.to_lowercase() == from_lower {
                    new_name.clone()
                } else {
                    t.clone()
                }
            })
            .collect();
        item.tags = normalize_tags(renamed, &[]);
        touched += 1;
    }

    save_index(&index)?;
    notify_library_changed(&app);
    Ok(touched)
}

/// Quita un tag de todas las medias que lo tengan. Devuelve cuántas se han
/// tocado. No borra ninguna media, solo la etiqueta.
#[tauri::command]
pub fn delete_tag(app: AppHandle, name: String) -> Result<usize, String> {
    let lower = name.to_lowercase();
    let mut index = load_index();
    let mut touched = 0usize;

    for item in &mut index.items {
        let before = item.tags.len();
        item.tags.retain(|t| t.to_lowercase() != lower);
        if item.tags.len() != before {
            touched += 1;
        }
    }

    save_index(&index)?;
    notify_library_changed(&app);
    Ok(touched)
}

/// Ruta absoluta del archivo, para que el frontend la convierta con
/// `convertFileSrc` y el webview lo cargue por el protocolo de assets.
///
/// Esto sustituye al antiguo `get_media_data_url`, que leía el archivo entero
/// y lo codificaba en base64 dentro del heap de JavaScript. Un vídeo de
/// 200 MB se convertía en un *string* de ~270 MB, y ahí es donde la app
/// petaba. Con el protocolo de assets WebView2 transmite el archivo en
/// streaming: reproducir un vídeo largo cuesta unos pocos MB.
///
/// El acceso sigue estando acotado: el scope declarado en `tauri.conf.json`
/// solo permite `$LOCALDATA/KawaGiif/media/**`, así que el webview no puede
/// pedir un archivo arbitrario del disco.
#[tauri::command]
pub fn get_media_path(id: String) -> Result<String, String> {
    let index = load_index();
    let item = index
        .items
        .iter()
        .find(|item| item.id == id)
        .ok_or_else(|| format!("no existe media con id {id}"))?;

    Ok(media_dir()
        .join(&item.stored_file_name)
        .to_string_lossy()
        .to_string())
}

/// Tamaño en bytes de un archivo antes de importarlo, para poder avisar de
/// los muy grandes.
#[tauri::command]
pub fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}

/// Borra una media de la biblioteca.
///
/// Antes esto dejaba `media_id` colgantes: si la media estaba colocada en el
/// escritorio, la plantilla seguía apuntando a un archivo que ya no existía
/// y la overlay quedaba en blanco para siempre. Ahora:
///
/// - Se cuenta cuántos elementos colocados la referencian.
/// - Si hay alguno y no se fuerza, se devuelve `Err` con el número para que
///   la UI pueda avisar antes de hacer nada irreversible.
/// - Si se fuerza, se quitan también esos elementos de la plantilla (working
///   y saved), se liberan sus slots y se regraba `template.json`.
///
/// Devuelve cuántos elementos colocados se han eliminado de paso.
#[tauri::command]
pub fn delete_media(
    app: AppHandle,
    state: State<crate::template::EditorState>,
    id: String,
    force: bool,
) -> Result<usize, String> {
    let references = crate::template::count_references_to_media(&state, &id);

    if references > 0 && !force {
        return Err(format!("REFERENCED:{references}"));
    }

    let mut index = load_index();
    let Some(pos) = index.items.iter().position(|item| item.id == id) else {
        return Err(format!("no existe media con id {id}"));
    };
    let item = index.items.remove(pos);

    // El archivo puede haber desaparecido por fuera de la app; que eso no
    // impida limpiar la entrada del índice.
    let _ = std::fs::remove_file(media_dir().join(&item.stored_file_name));
    save_index(&index)?;

    if references > 0 {
        crate::template::purge_media_references(&app, &state, &id)?;
    }

    notify_library_changed(&app);
    Ok(references)
}
