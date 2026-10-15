/* System and app memory readings. Feeds the RAM gauge in Settings */
use tauri::State;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, PoisonError};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

const BYTES_PER_MB: u64 = 1024 * 1024;

/// Update RAM usage metrics from OS processes
fn refresh_process_memory(sys: &mut System) {
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true, //
        ProcessRefreshKind::nothing().with_memory());
}

/** Return a `HashSet<Pid>`of processes that includes this process and its descendants */
fn process_family(sys: &System) -> HashSet<Pid> {
    let mut family: HashSet<Pid> = HashSet::from([Pid::from_u32(std::process::id())]);
    loop {
        let before: usize = family.len();
        for (pid, process) in sys.processes() {
            if process.parent().is_some_and(|parent| family.contains(&parent)) {
                family.insert(*pid);
            }
        }
        if family.len() == before { return family; }
    }
}

/** An estimated way to calculate RAM usage of the app (including spawned windows*/
fn app_ram_mb(sys: &System) -> u64 {
    process_family(sys).iter().filter_map(|pid| sys.process(*pid)).map(sysinfo::Process::memory).sum::<u64>() / BYTES_PER_MB
}


#[derive(Serialize)]
pub struct SystemStats {
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub available_ram_mb: u64,
    pub app_ram_mb: u64,
}

pub struct SysState(Mutex<System>);
impl Default for SysState {
    fn default() -> Self { Self(Mutex::new(System::new())) }
}
impl SysState {
    fn lock(&self) -> MutexGuard<'_, System> { self.0.lock().unwrap_or_else(PoisonError::into_inner) }
}


// Stats commands
#[tauri::command]
pub fn get_system_stats(state: State<SysState>) -> SystemStats {
    let mut sys = state.lock();
    sys.refresh_memory();
    refresh_process_memory(&mut sys);

    SystemStats {
        total_ram_mb: sys.total_memory() / BYTES_PER_MB,
        used_ram_mb: sys.used_memory() / BYTES_PER_MB,
        available_ram_mb: sys.available_memory() / BYTES_PER_MB,
        app_ram_mb: app_ram_mb(&sys),
    }
}


// Debugging
/** Prints the Windows and WebView2 versions on every dev start*/
#[cfg(debug_assertions)]
pub fn log_environment() {
    let unknown = || "?".to_owned();
    println!(
        "[kawagiif] environment: {} {} (kernel {}) | WebView2 {}",
        System::name().unwrap_or_else(unknown),
        System::os_version().unwrap_or_else(unknown),
        System::kernel_version().unwrap_or_else(unknown),
        tauri::webview_version().unwrap_or_else(|_| unknown()),
    );
}

/// Per-process memory of the app
#[cfg(debug_assertions)]
#[tauri::command]
pub fn debug_memory_breakdown(state: State<SysState>) -> String {
    use std::fmt::Write;

    let mut sys = state.lock();
    refresh_process_memory(&mut sys);

    let mut rows: Vec<(String, u32, u32, u64)> = process_family(&sys)
        .iter()
        .filter_map(|pid| sys.process(*pid).map(|p| (pid, p)))
        .map(|(pid, p)| {
            (p.name().to_string_lossy().into_owned(), pid.as_u32(), p.parent().map_or(0, Pid::as_u32), p.memory() / BYTES_PER_MB)
        })
        .collect();
    rows.sort_by_key(|row| std::cmp::Reverse(row.3));

    let total: u64 = rows.iter().map(|r| r.3).sum();
    let webview: usize = rows.iter().filter(|r| r.0.contains("webview")).count();
    let mut out: String = format!("MEMORY BREAKDOWN: {} processes, {total} MB total ({webview} from the web engine)\n", rows.len());
    for (name, pid, parent, mb) in &rows {
        let _ = writeln!(out, "  {mb:>6} MB  pid={pid:<7} parent={parent:<7} {name}");
    }
    out
}
