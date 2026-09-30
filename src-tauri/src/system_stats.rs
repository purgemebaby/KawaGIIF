use serde::Serialize;
use std::collections::HashSet;
use std::sync::Mutex;
use sysinfo::{Pid, ProcessesToUpdate, System};

/// Estado gestionado con el muestreador de sistema.
///
/// Se guarda entre llamadas a propósito: construir un `System` recorre todo el
/// sistema y es caro, así que crear uno nuevo en cada refresco del medidor
/// costaría más que el dato que devuelve.
pub struct SysState(pub Mutex<System>);

impl Default for SysState {
    fn default() -> Self {
        Self(Mutex::new(System::new()))
    }
}

#[derive(Serialize)]
pub struct SystemStats {
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub available_ram_mb: u64,
    /// Estimación de lo que consume KawaGIIF. Ver la nota de `app_ram_mb`.
    pub app_ram_mb: u64,
}

const BYTES_PER_MB: u64 = 1024 * 1024;

/// Suma la memoria del proceso propio y la de TODOS sus descendientes.
///
/// Hace falta recorrer el árbol porque el motor web arranca varios procesos
/// aparte (el del navegador, el de GPU y uno de render por grupo aislado), y
/// mirar solo el PID de la app daría un número ridículamente bajo.
///
/// **Es una estimación, no una medida exacta**, y así hay que presentarla en
/// la interfaz: la memoria compartida entre procesos se cuenta más de una vez,
/// y el motor crea y destruye procesos por su cuenta, así que el número se
/// mueve solo. Sirve para el orden de magnitud, no para cuadrar cuentas.
fn app_ram_mb(sys: &System) -> u64 {
    process_family(sys)
        .iter()
        .filter_map(|pid| sys.process(*pid))
        .map(|p| p.memory())
        .sum::<u64>()
        / BYTES_PER_MB
}

/// El PID propio más el de todos sus descendientes.
///
/// Se recorre por niveles: se parte del PID propio y se van añadiendo los
/// procesos cuyo padre ya esté en el conjunto, hasta que no se añada ninguno
/// más.
fn process_family(sys: &System) -> HashSet<Pid> {
    let mut family: HashSet<Pid> = HashSet::from([Pid::from_u32(std::process::id())]);
    loop {
        let before = family.len();
        for (pid, process) in sys.processes() {
            if let Some(parent) = process.parent() {
                if family.contains(&parent) {
                    family.insert(*pid);
                }
            }
        }
        if family.len() == before {
            break;
        }
    }
    family
}

/// Informe del entorno, al arrancar y en desarrollo.
///
/// Existe por una lección cara. Durante meses el plan del proyecto daba por
/// hecho que esta máquina era Windows 10, un dato que nadie llegó a comprobar.
/// Sobre esa premisa falsa se descartó `DWMWA_BORDER_COLOR` como "no
/// disponible en este sistema", y el borde blanco de las animaciones se
/// persiguió durante seis intentos por sitios equivocados.
///
/// La versión del sistema y la del motor web son los dos datos de los que
/// depende medio comportamiento nativo de esta app. Imprimirlos cuesta nada y
/// convierte una suposición en un hecho verificable en cada arranque.
pub fn log_environment() {
    let sys_name = System::name().unwrap_or_else(|| "?".into());
    let os = System::os_version().unwrap_or_else(|| "?".into());
    let kernel = System::kernel_version().unwrap_or_else(|| "?".into());
    let webview = tauri::webview_version().unwrap_or_else(|_| "?".into());

    println!("[kawagiif] entorno: {sys_name} {os} (kernel {kernel}) | WebView2 {webview}");
}

/// Desglose por proceso, para diagnóstico.
///
/// La suma de `app_ram_mb` dice CUÁNTO, pero no DÓNDE, y la pregunta que
/// decide si merece la pena optimizar es precisamente dónde: si el motor web
/// crea un proceso de render por ventana overlay, el techo de la arquitectura
/// actual es ese; si agrupa varias ventanas del mismo origen en un mismo
/// proceso, el coste por ventana es mucho menor de lo que parece y el margen
/// está en otro sitio.
///
/// Es la clase de cosa que no se puede deducir mirando el código: hay que
/// contar los procesos con animaciones colocadas y sin ellas.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn debug_memory_breakdown(state: tauri::State<SysState>) -> String {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let family = process_family(&sys);
    let mut rows: Vec<(String, u32, u32, u64)> = family
        .iter()
        .filter_map(|pid| sys.process(*pid).map(|p| (pid, p)))
        .map(|(pid, p)| {
            (
                p.name().to_string_lossy().to_string(),
                pid.as_u32(),
                p.parent().map(|x| x.as_u32()).unwrap_or(0),
                p.memory() / BYTES_PER_MB,
            )
        })
        .collect();
    // De mayor a menor: el primero de la lista es siempre lo que hay que mirar.
    rows.sort_by(|a, b| b.3.cmp(&a.3));

    let total: u64 = rows.iter().map(|r| r.3).sum();
    let webview_count = rows.iter().filter(|r| r.0.contains("webview")).count();

    let mut out = format!(
        "DESGLOSE DE MEMORIA — {} procesos, {total} MB en total ({webview_count} del motor web)\n",
        rows.len()
    );
    for (name, pid, parent, mb) in &rows {
        out.push_str(&format!("  {mb:>6} MB  pid={pid:<7} padre={parent:<7} {name}\n"));
    }
    out
}

#[tauri::command]
pub fn get_system_stats(state: tauri::State<SysState>) -> SystemStats {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    SystemStats {
        total_ram_mb: sys.total_memory() / BYTES_PER_MB,
        used_ram_mb: sys.used_memory() / BYTES_PER_MB,
        available_ram_mb: sys.available_memory() / BYTES_PER_MB,
        app_ram_mb: app_ram_mb(&sys),
    }
}
