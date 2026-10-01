// System and app memory readings.
// Feeds the RAM gauge in Settings, and in dev builds prints the environment
// and a per-process memory breakdown.

use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, PoisonError};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::State;

/* Personal Note for me:
- serde::Serialize: derive it so the struct can be sent to the frontend as JSON.
- std (the standard library):
    - collections::HashSet: a set of unique values; holds the app's process IDs.
    - sync::Mutex / MutexGuard / PoisonError: a lock around the sampler, what `lock()`
      returns, and the error after a panic while it was held.
- sysinfo: cross-platform system information (memory, processes, OS version).
    - System: the sampler; it caches readings and refreshes them on request.
    - Pid: a process ID.
    - ProcessesToUpdate: which processes to refresh (here, all of them).
    - ProcessRefreshKind: which process details to refresh (here, only memory).
- tauri::State: gives a command access to a value registered with `.manage()`.
*/

const BYTES_PER_MB: u64 = 1024 * 1024;

/**
 * The system sampler, kept between calls. Building a `System` walks the
 * whole system, so creating one per gauge refresh would cost more than the
 * reading it returns.
 */
pub struct SysState(Mutex<System>);

impl Default for SysState {
    fn default() -> Self {
        Self(Mutex::new(System::new()))
    }
}

impl SysState {
    fn lock(&self) -> MutexGuard<'_, System> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[derive(Serialize)]
pub struct SystemStats {
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub available_ram_mb: u64,
    pub app_ram_mb: u64,
}

fn refresh_process_memory(sys: &mut System) {
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_memory(),
    );
}

/**
 * This process plus all of its descendants.
 *
 * WebView2 runs as several child processes (browser, GPU, one renderer per
 * window), so the app's own PID alone would give a tiny, misleading number.
 * The tree is walked level by level: start from our PID and keep adding
 * processes whose parent is already in the set, until nothing new is added.
 */
fn process_family(sys: &System) -> HashSet<Pid> {
    let mut family = HashSet::from([Pid::from_u32(std::process::id())]);
    loop {
        let before = family.len();
        for (pid, process) in sys.processes() {
            if process
                .parent()
                .is_some_and(|parent| family.contains(&parent))
            {
                family.insert(*pid);
            }
        }
        if family.len() == before {
            return family;
        }
    }
}

/**
 * An estimate of the app's total memory. Memory shared between processes
 * is counted more than once, and WebView2 starts and stops processes on its
 * own, so it's an order of magnitude, and the UI labels it as such.
 */
fn app_ram_mb(sys: &System) -> u64 {
    process_family(sys)
        .iter()
        .filter_map(|pid| sys.process(*pid))
        .map(sysinfo::Process::memory)
        .sum::<u64>()
        / BYTES_PER_MB
}

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

/**
 * Prints the Windows and WebView2 versions on every dev start. Half of the
 * native behaviour in this app depends on both, and assuming the OS version
 * instead of checking it once sent a bug hunt in the wrong direction.
 */
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

/**
 * Per-process memory of the app, largest first. The total says how much;
 * this says where, which is what decides whether an optimization is worth
 * it (for example, whether WebView2 shares one renderer between windows or
 * starts one per overlay).
 */
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
            (
                p.name().to_string_lossy().into_owned(),
                pid.as_u32(),
                p.parent().map_or(0, Pid::as_u32),
                p.memory() / BYTES_PER_MB,
            )
        })
        .collect();
    rows.sort_by_key(|row| std::cmp::Reverse(row.3));

    let total: u64 = rows.iter().map(|r| r.3).sum();
    let webview = rows.iter().filter(|r| r.0.contains("webview")).count();
    let mut out = format!(
        "MEMORY BREAKDOWN: {} processes, {total} MB total ({webview} from the web engine)\n",
        rows.len()
    );
    for (name, pid, parent, mb) in &rows {
        let _ = writeln!(out, "  {mb:>6} MB  pid={pid:<7} parent={parent:<7} {name}");
    }
    out
}
