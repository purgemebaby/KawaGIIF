// User settings and on-disk storage helpers.
// Reads and writes `config.toml`, and owns the app data folder
// (`%LOCALAPPDATA%\KawaGiif`) plus the safe file-writing routine every
// other module uses to save its files.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::error::AppResult;

/* Personal Note for me:
- serde: (de)serialization framework.
    - Serialize / Deserialize: derive them and the struct can be written to / read from TOML.
- std (the standard library):
    - fs: file system functions (read, write, rename, create folders).
    - path::Path: a borrowed file path, like `&str` is to `String`.
    - path::PathBuf: an owned file path you can build with `.join()`.
    - sync::OnceLock: a value computed once, the first time it's needed, then reused forever.
- crate::error::AppResult: our `Result<T, AppError>` shortcut.
*/

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
}

fn default_overlay_pool_size() -> u32 {
    8
}

fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            launch_on_startup: false,
            start_minimized_to_tray: false,
            confirm_media_delete: true,
            overlay_pool_size: default_overlay_pool_size(),
        }
    }
}

/**
 * The app data folder, `%LOCALAPPDATA%\KawaGiif`.
 *
 * Local rather than roaming (`%APPDATA%`) on purpose: the media library can
 * grow to hundreds of MB, and roaming profiles are synced across machines.
 * The path is resolved once and cached, since every load and save asks for it.
 */
pub fn data_dir() -> &'static Path {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        dirs::data_local_dir()
            .expect("could not resolve %LOCALAPPDATA%")
            .join("KawaGiif")
    })
}

/**
 * Writes a file so that it is never left half-written.
 *
 * The contents go to `<path>.tmp` first and are then renamed over the real
 * file. A rename on the same volume is atomic, so if the app dies mid-write
 * the previous version is still intact instead of a truncated file that
 * would wipe the whole library or template on the next start.
 */
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

fn config_path() -> PathBuf {
    data_dir().join("config.toml")
}

pub fn load() -> AppConfig {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|contents| toml::from_str(&contents).ok())
        .unwrap_or_default()
}

pub fn update(change: impl FnOnce(&mut AppConfig)) -> AppResult<()> {
    let mut config = load();
    change(&mut config);
    let contents = toml::to_string_pretty(&config)?;
    write_atomic(&config_path(), contents.as_bytes())
}
