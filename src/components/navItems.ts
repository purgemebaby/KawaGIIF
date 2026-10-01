import { t } from "../i18n/en";

export type Screen = "home" | "storage" | "editor" | "settings";

interface NavItem {
  id: Screen;
  label: string;
  icon: string;
  desc: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: t.nav.home, icon: "⌂", desc: t.home.tiles.home },
  { id: "storage", label: t.nav.storage, icon: "▤", desc: t.home.tiles.storage },
  { id: "editor", label: t.nav.editor, icon: "✎", desc: t.home.tiles.editor },
  { id: "settings", label: t.nav.settings, icon: "⚙", desc: t.home.tiles.settings },
];

export const HOME_TILES = NAV_ITEMS.filter((item) => item.id !== "home");
