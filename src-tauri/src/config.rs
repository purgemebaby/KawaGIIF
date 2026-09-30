use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default)]
    pub launch_on_startup: bool,
    #[serde(default)]
    pub start_minimized_to_tray: bool,

    #[serde(default = "default_true")]
    pub confirm_media_delete: bool,
    /// Cuántas ventanas overlay se reservan al arrancar, y por tanto cuántas
    /// animaciones caben a la vez. Ver `window_manager::pool_size` para el
    /// porqué de reservarlas y de que haga falta reiniciar para cambiarlo.
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

pub fn data_dir() -> PathBuf {
    dirs::data_local_dir()
        .expect("no se pudo resolver %LOCALAPPDATA%")
        .join("KawaGiif")
}

fn config_path() -> PathBuf {
    data_dir().join("config.toml")
}

pub fn load() -> AppConfig {
    let path = config_path();
    match std::fs::read_to_string(&path) {
        Ok(contents) => toml::from_str(&contents).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}


pub fn save(config: &AppConfig) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let contents = toml::to_string_pretty(config).map_err(|e| e.to_string())?;

    let final_path = config_path();
    let tmp_path = final_path.with_extension("toml.tmp");
    std::fs::write(&tmp_path, contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())
}
