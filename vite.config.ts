import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [react()],

  /*
   * Una entrada por clase de ventana.
   *
   * Antes todas las ventanas (control y las del pool de overlays)
   * cargaban el mismo `index.html`, cuya entrada importaba las tres apps de
   * forma estática — así que todas acababan en el mismo chunk y cada ventana
   * parseaba y ejecutaba el editor, la biblioteca y los ajustes aunque solo
   * fuera a pintar un GIF.
   *
   * Se midió que el motor web crea un proceso de render POR VENTANA (~50 MB
   * cada uno, 894 MB en 17 procesos con solo dos animaciones a la vista), así
   * que ese desperdicio se pagaba multiplicado por el tamaño del pool.
   *
   * Con entradas separadas, Rollup reparte el código por lo que cada página
   * importa de verdad. Los HTML están en la raíz porque es donde Vite espera
   * las entradas.
   */
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        overlay: "overlay.html",
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // prevent Vite from obscuring rust errors
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
