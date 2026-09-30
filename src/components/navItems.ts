import { t } from "../i18n/es";

export type Screen = "home" | "storage" | "editor" | "settings";

export interface NavItem {
  id: Screen;
  label: string;
  /** Glifo del icono. Sin librería: son cuatro y no compensa la dependencia. */
  icon: string;
  /** Qué hace esa pantalla. Se muestra en los botones de Inicio. */
  desc: string;
}

/**
 * Definición única de las pantallas de la app.
 *
 * La consumen la barra lateral y los botones de Inicio. Antes cada una tenía
 * su propia lista, así que añadir una pantalla o cambiar un icono obligaba a
 * tocar los dos sitios y era fácil que se desincronizaran.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: t.nav.home, icon: "⌂", desc: t.home.tiles.home },
  { id: "storage", label: t.nav.storage, icon: "▤", desc: t.home.tiles.storage },
  { id: "editor", label: t.nav.editor, icon: "✎", desc: t.home.tiles.editor },
  { id: "settings", label: t.nav.settings, icon: "⚙", desc: t.home.tiles.settings },
];

/** Las que se ofrecen como destino desde Inicio (todas menos la propia). */
export const HOME_TILES = NAV_ITEMS.filter((item) => item.id !== "home");