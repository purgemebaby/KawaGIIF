/* App updates. Looks for a newer GitHub release once at startup and installs it only when the user asks from Home. */
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::{AppError, AppResult};

/** The update found at startup, kept until the user installs it. */
#[derive(Default)]
pub struct UpdateState(Mutex<Option<Update>>);
impl UpdateState {
    fn lock(&self) -> MutexGuard<'_, Option<Update>> { self.0.lock().unwrap_or_else(PoisonError::into_inner) }
}

/** Checks for a newer release without blocking the boot. Offline or a missing feed just means no notice. */
pub fn check_in_background(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = app.updater() else { return; };
        let Ok(Some(update)) = updater.check().await else { return; };
        let version = update.version.clone();
        *app.state::<UpdateState>().lock() = Some(update);
        let _ = app.emit("update-available", version);
    });
}

/// Version of the update found at startup, if any. Home asks on mount because it may have missed the event.
#[tauri::command]
pub fn get_available_update(state: State<UpdateState>) -> Option<String> {
    state.lock().as_ref().map(|update| update.version.clone())
}

/// Downloads and installs the pending update, then restarts into it. The update stays stored, so a failed try can be retried.
#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, UpdateState>) -> AppResult<()> {
    let update = state.lock().clone().ok_or(AppError::NoPendingUpdate)?;
    update.download_and_install(|_, _| {}, || {}).await?;
    app.restart();
}
