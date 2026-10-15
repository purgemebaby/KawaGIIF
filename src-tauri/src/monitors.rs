/* Monitors. Lists the screens for the editor and finds where to put an animation on one of them. */
use serde::Serialize;
use tauri::{AppHandle, Monitor};
use crate::error::{AppError, AppResult};

#[derive(Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: Option<String>,
    pub x: i32, pub y: i32,
    pub width: u32, pub height: u32,
    pub primary: bool,
}

/** Monitor at `index` of `available_monitors()`. */
pub fn monitor_at(app: &AppHandle, index: usize) -> AppResult<Monitor> {
    app.available_monitors()?.
        into_iter().nth(index).
        ok_or(AppError::MonitorNotFound(index))
}


pub fn centered_in(monitor: &Monitor, width: u32, height: u32) -> (i32, i32) {
    let area = monitor.work_area();
    let x = area.position.x + (area.size.width as i32 - width as i32) / 2;
    let y = area.position.y + (area.size.height as i32 - height as i32) / 2;
    (x, y)
}

/// Every monitor, in the order the indices of `spawn_placed_media` and `move_overlay_to_monitor` use.
#[tauri::command]
pub fn list_monitors(app: AppHandle) -> AppResult<Vec<MonitorInfo>> {
    let primary = app.primary_monitor()?.map(|m| *m.position());
    let monitors = app.available_monitors()?;
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| {
            let area = monitor.work_area();
            MonitorInfo {
                index,
                name: monitor.name().cloned(),
                x: area.position.x, y: area.position.y,
                width: area.size.width, height: area.size.height,
                primary: primary == Some(*monitor.position()),
            }
        })
        .collect())
}
