use windows::Win32::Foundation::{COLORREF, HWND};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMWCP_DONOTROUND, DWM_WINDOW_CORNER_PREFERENCE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_BORDER, WS_CAPTION, WS_DLGFRAME,
    WS_EX_APPWINDOW, WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_LAYERED, WS_EX_STATICEDGE,
    HWND_TOPMOST, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_WINDOWEDGE, WS_SYSMENU,
    WS_THICKFRAME,
};

/// Asegura que la ventana conserva `WS_EX_LAYERED`.
///
/// Se llama desde el reaplicado periódico de estilos porque el flag se pierde
/// por caminos que no controlamos del todo: `set_ignore_cursor_events` de Tauri
/// es uno confirmado, pero el vigilante detectó que vuelve a caerse incluso
/// después de reponerlo, así que hace falta reafirmarlo igual que el resto.
///
/// Sin él la ventana pierde la transparencia por píxel y su superficie opaca
/// asoma alrededor del medio como un marco gris.
pub fn ensure_layered(hwnd: HWND) {
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let layered = WS_EX_LAYERED.0 as isize;
        if ex & layered == 0 {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | layered);
        }
    }
}

/// Activa o desactiva el click-through **sin tocar la transparencia**.
///
/// Sustituye a `set_ignore_cursor_events` de Tauri, que en Windows quita
/// `WS_EX_TRANSPARENT` y `WS_EX_LAYERED` **juntos** al desactivarlo. Los dos
/// flags no son lo mismo:
///
/// - `WS_EX_TRANSPARENT` es lo que hace que los clics atraviesen la ventana.
/// - `WS_EX_LAYERED` es lo que le da transparencia real por píxel.
///
/// Al entrar en modo edición hay que quitar el primero (para poder arrastrar
/// la animación) pero **jamás** el segundo. Quitando los dos, la ventana se
/// volvía opaca y su superficie asomaba alrededor del medio como un marco gris
/// —se reportó como "un marco tipo Windows 7"— que aparecía al entrar al
/// editor y desaparecía al salir.
///
/// Costó tres diagnósticos fallidos porque el síntoma parece un borde AÑADIDO
/// y en realidad es un flag de transparencia QUITADO. Lo cazó el detector del
/// vigilante periódico, volcando el `EXSTYLE` crudo:
///
///   ESTILO PISADO: LAYERED=false TOOLWINDOW=true WINDOWEDGE=false CAPTION=false
///
/// es decir, todos los flags de borde correctamente limpios y la transparencia
/// perdida.
/// ⚠️ NO reimplementar el click-through a mano tocando solo
/// `WS_EX_TRANSPARENT`. Se intentó y **rompió el click-through**: escribir
/// `GWL_EXSTYLE` no basta, Windows necesita además un `SetWindowPos` con
/// `SWP_FRAMECHANGED` para recalcular el hit-testing, y sin eso las animaciones
/// se podían arrastrar fuera del modo edición. Se usa la de Tauri y se le
/// repone `WS_EX_LAYERED` con `ensure_layered`; ver
/// `window_manager::set_overlay_click_through`.


/// Deja sin pincel de fondo la CLASE de esta ventana.
///
/// Es el arreglo del marco blanco, y la prueba que lo demuestra ya se había
/// hecho sin saber leerla: al teñir de magenta este pincel, el fondo de la
/// animación parpadeaba en magenta. Eso significaba que Windows **sí** estaba
/// pintando el pincel de la clase sobre el área de la ventana.
///
/// El mecanismo: cuando algo invalida una ventana, Windows la "borra" antes de
/// repintarla, rellenándola con el pincel de su clase. El de por defecto es
/// **blanco**. En una ventana opaca da igual, porque el contenido lo tapa
/// enseguida; en una transparente, ese blanco se queda a la vista allí donde el
/// webview no llega a recomponer.
///
/// Con el pincel a nulo, borrar no pinta nada y la transparencia se mantiene.
///
/// ⚠️ Esto afecta a la CLASE, no a la ventana, así que solo es seguro porque
/// las overlays se crean con un `window_classname` propio: sin eso se le
/// quitaría el fondo también a la ventana de control.
pub fn clear_class_background(hwnd: HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{SetClassLongPtrW, GCLP_HBRBACKGROUND};

    unsafe {
        SetClassLongPtrW(hwnd, GCLP_HBRBACKGROUND, 0);
    }
}

/// El "área de trabajo" del monitor donde está la ventana: la pantalla entera
/// MENOS la barra de tareas y cualquier otra barra acoplada al escritorio.
///
/// Windows ya lleva la cuenta de esto (`MONITORINFO.rcWork` frente a
/// `rcMonitor`), así que no hay que detectar la barra de tareas a mano ni
/// asumir que está abajo: si el usuario la tiene arriba o a un lado, o la
/// oculta automáticamente, el rectángulo que devuelve Windows ya lo refleja.
///
/// Devuelve `(x, y, ancho, alto)` en píxeles físicos.
pub fn work_area_for(hwnd: HWND) -> Option<(i32, i32, i32, i32)> {
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };

    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        let w = info.rcWork;
        Some((w.left, w.top, w.right - w.left, w.bottom - w.top))
    }
}

/// ¿Ha vuelto a aparecer área no-cliente alrededor de la ventana?
///
/// En una overlay bien configurada (`decorations(false)` + `shadow(false)`) el
/// rectángulo de ventana y el de cliente son idénticos. Si dejan de serlo, es
/// que Windows ha vuelto a reservar un marco — y ese marco es lo que se ve
/// como borde.
pub fn has_nonclient_frame(hwnd: HWND) -> bool {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, GetWindowRect};

    unsafe {
        let mut win = RECT::default();
        let mut cli = RECT::default();
        if GetWindowRect(hwnd, &mut win).is_err() || GetClientRect(hwnd, &mut cli).is_err() {
            return false;
        }
        (win.right - win.left) != (cli.right - cli.left)
            || (win.bottom - win.top) != (cli.bottom - cli.top)
    }
}

/// Mide la geometría real de la ventana y de TODAS sus ventanas hijas.
///
/// Es la pregunta que lleva sin contestarse siete intentos: el borde blanco
/// alrededor de las animaciones no sale de ningún flag de estilo (medido:
/// todos correctos), ni del CSS (medido: el fondo del documento se tiñó y el
/// borde quedó fuera), ni de DWM (medido: `BORDER_COLOR=Ok(())`).
///
/// Queda una explicación que nadie ha comprobado: que el control de WebView2
/// —que es una ventana HIJA— no cubra del todo el área cliente de la ventana
/// padre, dejando un marco por el que asoma el pincel de fondo de la clase de
/// ventana, que es blanco.
///
/// Esto lo contesta con números: si `cliente` y el rectángulo del hijo no
/// coinciden, la diferencia ES el borde.
#[cfg(debug_assertions)]
pub fn describe_geometry(hwnd: HWND) -> String {
    use windows::Win32::Foundation::{LPARAM, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, GetClassNameW, GetClientRect, GetWindowRect,
    };

    unsafe extern "system" fn collect(child: HWND, param: LPARAM) -> windows::core::BOOL {
        let out = &mut *(param.0 as *mut Vec<String>);

        let mut class = [0u16; 128];
        let n = GetClassNameW(child, &mut class);
        let class = String::from_utf16_lossy(&class[..n as usize]);

        let mut r = RECT::default();
        let _ = GetWindowRect(child, &mut r);
        out.push(format!(
            "      hijo {class}: ({}, {}) {}x{}",
            r.left,
            r.top,
            r.right - r.left,
            r.bottom - r.top
        ));
        true.into()
    }

    unsafe {
        let mut win = RECT::default();
        let _ = GetWindowRect(hwnd, &mut win);
        let mut cli = RECT::default();
        let _ = GetClientRect(hwnd, &mut cli);

        let mut children: Vec<String> = Vec::new();
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(collect),
            LPARAM(&mut children as *mut Vec<String> as isize),
        );

        let mut out = format!(
            "ventana=({}, {}) {}x{} | cliente={}x{}",
            win.left,
            win.top,
            win.right - win.left,
            win.bottom - win.top,
            cli.right - cli.left,
            cli.bottom - cli.top,
        );
        for c in children {
            out.push('\n');
            out.push_str(&c);
        }
        out
    }
}

/// Resume los estilos que de verdad tiene una ventana, para diagnóstico.
///
/// Existe porque los síntomas visuales de este proyecto (marcos que aparecen,
/// animaciones que se vuelven opacas o invisibles) se han "arreglado" varias
/// veces sobre hipótesis plausibles que resultaron falsas. Con el `EXSTYLE`
/// crudo delante se distingue en un vistazo entre "perdió la transparencia"
/// (`LAYERED` ausente) y "reapareció el marco" (`WINDOWEDGE` presente), en vez
/// de deducirlo de una captura.
#[cfg(debug_assertions)]
pub fn describe_styles(hwnd: HWND) -> String {
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let st = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let has = |v: u32| ex & (v as isize) != 0;
        format!(
            "LAYERED={} TOOLWINDOW={} APPWINDOW={} WINDOWEDGE={} CLIENTEDGE={} TOPMOST={} \
             CAPTION={} THICKFRAME={}",
            has(WS_EX_LAYERED.0),
            has(WS_EX_TOOLWINDOW.0),
            has(WS_EX_APPWINDOW.0),
            has(WS_EX_WINDOWEDGE.0),
            has(WS_EX_CLIENTEDGE.0),
            has(WS_EX_TOPMOST.0),
            st & (WS_CAPTION.0 as isize) != 0,
            st & (WS_THICKFRAME.0 as isize) != 0,
        )
    }
}

/// ⚠️ Para quitar la sombra de una ventana NO se usa Win32: se usa
/// `.shadow(false)` en el `WebviewWindowBuilder`.
///
/// Aquí hubo una función `disable_window_shadow` con
/// `DWMWA_NCRENDERING_POLICY = DWMNCRP_DISABLED`. Sí quitaba la sombra, pero
/// apagando el renderizado no-cliente de DWM por completo, con tres efectos
/// colaterales que costaron varios diagnósticos: Windows caía al marco clásico
/// y dibujaba un borde estilo Windows 7 sobre cada animación, `DWMWA_BORDER_COLOR`
/// empezaba a fallar (no se puede fijar el color de un borde que DWM ya no
/// dibuja), y el error se interpretó como "esta API necesita Windows 11".

/// `skip_taskbar(true)` de Tauri no es 100% fiable en Windows (bug conocido
/// de Tauri v2), así que forzamos el extended window style directamente.
pub fn force_hide_from_taskbar(hwnd: HWND) {
    unsafe {
        let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);

        // Para "apagar" un flag hace falta AND con el complemento (!),
        // no un AND directo — error común en ejemplos encontrados online.
        let new_style = (current_style & !(WS_EX_APPWINDOW.0 as isize))
            | (WS_EX_TOOLWINDOW.0 as isize);

        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
    }
}

/// Mismo patrón que `force_hide_from_taskbar`: `decorations(false)` de Tauri
/// también se resetea en Windows (reaparecen `WS_CAPTION`/`WS_SYSMENU`, lo
/// que dibuja un botón de cerrar nativo encima de una ventana que se supone
/// sin bordes), así que forzamos el style normal directamente.
///
/// Limpia los bordes de LOS DOS sitios donde Windows los guarda. Esto último
/// es lo que faltaba y costó dos intentos fallidos: el canto fino de 1px que
/// se veía alrededor de los PNG y GIF no venía de `GWL_STYLE` sino de
/// `GWL_EXSTYLE`, donde tao deja puesto `WS_EX_WINDOWEDGE` al crear la
/// ventana. Se notaba solo en medios con transparencia porque un vídeo
/// rellena la ventana de borde a borde con píxeles opacos y lo tapa.
pub fn force_borderless(hwnd: HWND) {
    unsafe {
        // WS_CAPTION ya incluye WS_BORDER | WS_DLGFRAME, pero listarlos
        // explícitamente cuesta nada y deja claro qué se está quitando.
        let current_style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let remove_style =
            WS_CAPTION.0 | WS_SYSMENU.0 | WS_THICKFRAME.0 | WS_BORDER.0 | WS_DLGFRAME.0;
        SetWindowLongPtrW(hwnd, GWL_STYLE, current_style & !(remove_style as isize));

        // Los cuatro flags de canto del estilo extendido. `WS_EX_WINDOWEDGE`
        // es el que ponía tao y el que dibujaba el borde real.
        let current_ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let remove_ex =
            WS_EX_WINDOWEDGE.0 | WS_EX_CLIENTEDGE.0 | WS_EX_STATICEDGE.0 | WS_EX_DLGMODALFRAME.0;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current_ex & !(remove_ex as isize));

        // Cambiar los styles no repinta el frame por sí solo — hace falta
        // SWP_FRAMECHANGED para que Windows recalcule y redibuje.
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

/// Quita el contorno de acento que Windows 11 dibuja vía DWM alrededor de la
/// ventana con foco.
///
/// ⚠️ **Solo tiene efecto en Windows 11 (build 22000 o superior).**
/// `DWMWA_BORDER_COLOR` no existe antes: en Windows 10 la llamada devuelve
/// error y esta función no hace nada.
///
/// Merece la pena dejarlo escrito porque en su día se dio por bueno como
/// arreglo del marco fino sin comprobar la versión del sistema. El `let _ =`
/// se tragaba el error y parecía funcionar, cuando en Windows 10 el borde
/// real venía de `WS_EX_WINDOWEDGE` y lo cubre `force_borderless`.
pub fn disable_dwm_focus_border(hwnd: HWND) {
    unsafe {
        // El borde blanco de 1px alrededor de una ventana sin decoración y
        // transparente es comportamiento DOCUMENTADO de Tauri en Windows 11
        // ("will make the window have a 1px white border, and on Windows 11 it
        // will have rounded corners"), no un fallo de esta app. Lo pinta DWM
        // fuera del área cliente, así que ni el CSS ni los flags de
        // `GWL_EXSTYLE` pueden con él: se comprobó midiendo que todos los
        // flags estaban correctos mientras el borde se veía.
        //
        // Las dos partes se quitan con dos atributos DWM distintos, y hacen
        // falta LOS DOS: el color del borde y la preferencia de esquinas.
        let color = COLORREF(DWMWA_COLOR_NONE);
        let border = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &color as *const COLORREF as *const core::ffi::c_void,
            std::mem::size_of::<COLORREF>() as u32,
        );

        // Las esquinas redondeadas de Windows 11 dejan ver el escritorio por
        // las cuatro puntas y, sobre una animación, se leen como recorte.
        let corner = DWMWCP_DONOTROUND;
        let corners = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner as *const DWM_WINDOW_CORNER_PREFERENCE as *const core::ffi::c_void,
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );

        // Se imprime el HRESULT DE VERDAD, una sola vez. Antes esto decía
        // "no disponible (requiere Windows 11)" ante cualquier error, lo que
        // durante meses dio por buena una explicación falsa —la máquina ES
        // Windows 11— y mandó a buscar el borde a sitios equivocados. Un
        // código de error concreto no se puede malinterpretar así.
        #[cfg(debug_assertions)]
        {
            use std::sync::Once;
            static LOGGED: Once = Once::new();
            LOGGED.call_once(|| {
                println!(
                    "[kawagiif] DWM: BORDER_COLOR={:?} CORNER_PREFERENCE={:?}",
                    border, corners
                );
            });
        }
        #[cfg(not(debug_assertions))]
        {
            let _ = (border, corners);
        }
    }
}

/// Sube la ventana a lo más alto de la banda *topmost*, de verdad.
///
/// `set_always_on_top(true)` de Tauri no basta cuando la ventana YA está
/// marcada como topmost: no hay cambio de estado que aplicar y la llamada se
/// queda en nada, así que la ventana se queda donde estaba en el orden Z. Por
/// eso la barra de tareas —que también es topmost— acababa tapando las
/// animaciones fuera del modo edición, mientras que dentro del editor sí se
/// veían: ahí la ventana se activa, y activarse sí reordena.
///
/// `SetWindowPos` con `HWND_TOPMOST` reordena siempre, y con `SWP_NOACTIVATE`
/// lo hace sin robarle el foco a lo que estés usando.
pub fn raise_to_top(hwnd: HWND) {
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}
