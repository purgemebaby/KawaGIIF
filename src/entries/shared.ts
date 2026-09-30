/*
 * Lo que necesitan TODAS las ventanas, sea cual sea su papel.
 *
 * Existe porque antes había un único `main.tsx` que hacía esto para todas, y
 * al repartir la app en una entrada por ventana era justo lo que se podía
 * perder por el camino sin que nada fallara de forma visible: el menú
 * contextual del navegador volvería a salir sobre las animaciones y el fondo
 * de las animaciones dejaría de ser transparente.
 */

/**
 * Suprimir el menú contextual del navegador.
 *
 * WebView2 es un motor web, así que al hacer clic derecho aparece su menú de
 * siempre ("Guardar imagen como…", "Recargar", "Copiar imagen"…), que no tiene
 * ningún sentido en una app de escritorio y delata que por debajo hay un
 * navegador.
 *
 * Nota para más adelante: el clic derecho sobre una animación va a llevar su
 * propio menú (eliminar, propiedades…), y este mismo manejador es el sitio
 * desde donde se abrirá.
 */
export function suppressBrowserContextMenu() {
  window.addEventListener("contextmenu", (e) => {
    // Vía de escape en desarrollo: con Shift pulsado sale el menú nativo, que
    // es la única forma de llegar a "Inspeccionar". En la app compilada no
    // existe, así que el menú del navegador no aparece nunca.
    if (import.meta.env.DEV && e.shiftKey) return;
    e.preventDefault();
  });
}

/**
 * Fondo transparente de verdad, para las ventanas de animación.
 *
 * Se aplica desde JavaScript y no desde CSS a propósito: el fondo depende del
 * papel de la ventana, y las hojas de estilo no pueden distinguirlo. El margen
 * del `body` sí va en CSS — ponerlo desde aquí ya falló una vez y dejó contenido corto
 * por la izquierda en su día.
 */
export function makeWindowTransparent() {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}
