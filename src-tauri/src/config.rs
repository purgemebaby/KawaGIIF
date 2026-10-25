/* User settings (`config.toml`) and on-disk helpers: the app data folder and the atomic file writer every module uses. */
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppResult;

/* Personal Note for me:
- std::sync::OnceLock: a value computed once, the first time it's needed, then reused forever.
*/

fn default_overlay_pool_size() -> u32 { 4 }

fn default_true() -> bool { true }

fn default_font_scale() -> f32 { 1.0 }

fn default_ui_zoom() -> f32 { 1.0 }

/** UI languages the app accepts. The first one is the default. */
pub const LANGUAGES: [&str; 2] = ["en", "es"];

fn default_language() -> String { LANGUAGES[0].to_owned() }

fn config_path() -> PathBuf { data_dir().join("config.toml") }

/** The app data folder, `%LOCALAPPDATA%\KawaGIIF`. */
pub fn data_dir() -> &'static Path {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| dirs::data_local_dir().expect("could not resolve %LOCALAPPDATA%").join("KawaGIIF"))
}

/** Writes `<path>.tmp` then renames it over the file, so a crash never leaves a truncated file. */
pub fn write_atomic(path: &Path, contents: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/** Seconds since the Unix epoch, 0 if the clock reads before it. */
pub fn now_unix() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs()) }

/** Reads `path` and parses it; a file that exists but can't be read or parsed is renamed aside first, since the next save would overwrite it and lose the user's data. */
pub fn read_or_quarantine<T: Default>(path: &Path, parse: impl FnOnce(&str) -> Option<T>) -> T {
    if !path.is_file() { return T::default(); } // no file yet is a first run, not damage
    let Some(value) = fs::read_to_string(path).ok().and_then(|contents| parse(&contents)) else {
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        let stamp = now_unix();
        let _ = fs::rename(path, path.with_file_name(format!("{name}.broken-{stamp}")));
        #[cfg(debug_assertions)]
        eprintln!("[kawagiif] {} could not be read or parsed, set aside as {name}.broken-{stamp}", path.display());
        return T::default();
    };
    value
}

pub fn load() -> AppConfig {
    read_or_quarantine(&config_path(), |s| toml::from_str(s).ok())
}

pub fn update(change: impl FnOnce(&mut AppConfig)) -> AppResult<()> {
    let mut config: AppConfig = load();
    change(&mut config);
    let contents: String = toml::to_string_pretty(&config)?;
    write_atomic(&config_path(), contents.as_bytes())
}



/** Settings stored in `config.toml`. Missing fields fall back to their defaults. */
#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default)]
    pub launch_on_startup: bool,
    #[serde(default)]
    pub start_minimized_to_tray: bool,
    #[serde(default = "default_true")]
    pub confirm_media_delete: bool,
    #[serde(default = "default_overlay_pool_size")]
    pub overlay_pool_size: u32,
    /// File name (inside the data folder) of the custom loading-screen image. `None` means the default mascot head.
    #[serde(default)]
    pub loading_indicator: Option<String>,
    /// Font family of the UI text. `None` means the system default.
    #[serde(default)]
    pub ui_font: Option<String>,
    /// Multiplier of every UI font size (1.0 = default).
    #[serde(default = "default_font_scale")]
    pub font_scale: f32,
    /// WebView2 zoom of the control window (1.0 = 100 %).
    #[serde(default = "default_ui_zoom")]
    pub ui_zoom: f32,
    /// Whether the ring menu, section sliding and editor opening animate. Off switches screens instantly.
    #[serde(default = "default_true")]
    pub nav_animations: bool,
    /// Whether the chibi mascot appears in Home, Settings, the Editor and the empty Library.
    #[serde(default = "default_true")]
    pub show_mascot: bool,
    /// UI language of the app ("en" or "es").
    #[serde(default = "default_language")]
    pub language: String,
}
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            launch_on_startup: false,
            start_minimized_to_tray: false,
            confirm_media_delete: true,
            overlay_pool_size: default_overlay_pool_size(),
            loading_indicator: None,
            ui_font: None,
            font_scale: default_font_scale(),
            ui_zoom: default_ui_zoom(),
            nav_animations: true,
            show_mascot: true,
            language: default_language(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_vec(s: &str) -> Option<Vec<u32>> { serde_json::from_str(s).ok() }

    fn temp_folder() -> PathBuf {
        // a unique folder per test, so parallel runs never touch each other's files
        let dir = std::env::temp_dir().join(format!("kawagiif-config-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_or_quarantine_missing_file_gives_default() {
        let dir = temp_folder();
        let path = dir.join("missing.json");
        assert!(read_or_quarantine(&path, parse_vec).is_empty());
        assert!(!path.exists()); // nothing is created for a file that was never there
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_or_quarantine_valid_file_is_parsed() {
        let dir = temp_folder();
        let path = dir.join("valid.json");
        fs::write(&path, "[1,2,3]").unwrap();
        assert_eq!(read_or_quarantine(&path, parse_vec), vec![1, 2, 3]);
        assert_eq!(fs::read_to_string(&path).unwrap(), "[1,2,3]"); // a good file is left untouched
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_or_quarantine_broken_file_is_set_aside() {
        let dir = temp_folder();
        let path = dir.join("broken.json");
        fs::write(&path, "not json").unwrap();
        assert!(read_or_quarantine(&path, parse_vec).is_empty());
        assert!(!path.exists()); // the original name is gone
        let siblings: Vec<String> = fs::read_dir(&dir).unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(siblings.iter().filter(|name| name.starts_with("broken.json.broken-")).count(), 1); // renamed aside, not copied
        assert_eq!(siblings.len(), 1); // nothing else appeared in the folder
        fs::remove_dir_all(&dir).unwrap();
    }
}
