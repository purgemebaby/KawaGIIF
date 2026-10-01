// Error type shared by every command.
// Anything that can fail in the backend ends up as an `AppError`, and the
// frontend receives it as a plain text message.

use serde::{Serialize, Serializer};
use uuid::Uuid;

/* Personal Note for me:
- serde: the standard (de)serialization framework of Rust.
    - Serialize: trait for "can be turned into JSON/TOML/...". Tauri needs it on every command error.
    - Serializer: the target format writer that `Serialize::serialize` receives.
- uuid: 128-bit unique identifiers.
    - Uuid: the ID type itself, 16 bytes, cheap to copy.
- thiserror (used through `#[derive(thiserror::Error)]`): generates the boring
  `Display` + `std::error::Error` impls from the `#[error("...")]` attributes.
*/

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Toml(#[from] toml::ser::Error),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error(transparent)]
    Autostart(#[from] tauri_plugin_autostart::Error),
    #[error("no media with id {0}")]
    MediaNotFound(Uuid),
    #[error("REFERENCED:{0}")]
    MediaReferenced(usize),
    #[error("the new tag name cannot be empty")]
    EmptyTag,
    #[error("all {0} animation slots are in use")]
    PoolFull(usize),
    #[error("no overlay window for slot {0}")]
    MissingSlotWindow(usize),
}

/**
 * Tauri sends command errors to JavaScript as serialized values, so the
 * error is serialized as its `Display` text. This keeps the contract the
 * frontend already relies on: a rejected `invoke` carries a plain string,
 * and `MediaReferenced` keeps the exact `REFERENCED:<n>` form that
 * `LibraryProvider` parses to ask for confirmation before deleting.
 */
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
