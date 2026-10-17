/* User settings (`config.toml`) and on-disk helpers: the app data folder and the atomic file writer every module uses. */
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::error::AppResult;

/* Personal Note for me:
- std::sync::OnceLock: a value computed once, the first time it's needed, then reused forever.
*/

fn default_overlay_pool_size() -> u32 { 4 }

fn default_true() -> bool { true }

fn default_font_scale() -> f32 { 1.0 }

fn default_ui_zoom() -> f32 { 1.0 }

fn config_path() -> PathBuf { data_dir().join("config.toml") }

/** `%LOCALAPPDATA%\KawaGiif*/
pub fn data_dir() -> &'static Path {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| dirs::data_local_dir().expect("could not resolve %LOCALAPPDATA%").join("KawaGiif"))
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

pub fn load() -> AppConfig {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|contents| toml::from_str(&contents).ok())
        .unwrap_or_default()
}

pub fn update(change: impl FnOnce(&mut AppConfig)) -> AppResult<()> {
    let mut config: AppConfig = load();
    change(&mut config);
    let contents: String = toml::to_string_pretty(&config)?;
    write_atomic(&config_path(), contents.as_bytes())
}



/**Settings stored in `config.toml`; missing fields fall back to their defaults.*/
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
    /// File name (inside the data folder) of the custom loading-screen image; `None` means the default ball.
    #[serde(default)]
    pub loading_indicator: Option<String>,
    /// Font family of the UI text; `None` means the system default.
    #[serde(default)]
    pub ui_font: Option<String>,
    /// Multiplier of every UI font size (1.0 = default).
    #[serde(default = "default_font_scale")]
    pub font_scale: f32,
    /// WebView2 zoom of the control window (1.0 = 100 %).
    #[serde(default = "default_ui_zoom")]
    pub ui_zoom: f32,
    /// Whether the ring menu, section sliding and editor opening animate; off switches screens instantly.
    #[serde(default = "default_true")]
    pub nav_animations: bool,
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
        }
    }
}
