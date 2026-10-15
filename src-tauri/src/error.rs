/* Error type shared by every command. Fails in the backend ends up as an `AppError`, and the frontend receives it as text messages. */
use serde::{Serialize, Serializer};
use uuid::Uuid;

/* Personal Note for me:
Rust force to return `Result<T,E>` if a function can fail. Then, the function can only returns 1 type of error 
and we can't use ? to hadle it automatically if that it's not fulfilled. 

In order to be able to return several types of error and handle them with ?, we have to unify them in a enum. 
The macro only automatizes the behaviour of the errors (display, ?)
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

    #[error("No media with id {0}")]
    MediaNotFound(Uuid),

    #[error("{0} placed animation(s) still show this media")]
    MediaReferenced(usize),

    #[error("New tag name cannot be empty")]
    EmptyTag,

    #[error("All {0} animation slots are in use")]
    PoolFull(usize),

    #[error("No overlay window for slot {0}")]
    MissingSlotWindow(usize),

    #[error("Monitor {0} is not connected")]
    MonitorNotFound(usize),

    #[error("Only GIF, PNG or JPEG images are allowed")]
    UnsupportedImage,
}



// Rust communicates with the GUI thorugh JSON messages. Tauri needs that the AppError impl Serialize, so we need to do it manually
/**Serialize with `serde::Serializer` the `AppError` enum*/
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
