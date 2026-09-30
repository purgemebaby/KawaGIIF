import { t } from "../i18n/es";
import { NAV_ITEMS, type Screen } from "./navItems";

export type { Screen };

interface NavSidebarProps {
  active: Screen;
  collapsed: boolean;
  onNavigate: (screen: Screen) => void;
}

/**
 * Navegación lateral, plegable al estilo del explorador de Obsidian.
 *
 * Plegada es `width: 0` en vez de `display: none`, para que el ancho pueda
 * animarse. El botón que la abre no vive aquí sino en la cabecera del
 * contenido: si estuviera dentro, al plegarse desaparecería con ella y no
 * habría forma de volver a abrirla.
 */
function NavSidebar({ active, collapsed, onNavigate }: NavSidebarProps) {
  return (
    <nav
      className={collapsed ? "nav-sidebar collapsed" : "nav-sidebar"}
      aria-hidden={collapsed}
      // `inert` saca del tabulador y del árbol de accesibilidad lo que está
      // plegado. Sin esto se podría llegar con el tabulador a botones que no
      // se ven, que es una forma clásica de perder el foco en la nada.
      inert={collapsed}
      aria-label={t.nav.title}
    >
      <div className="nav-inner">
        <div className="nav-brand">{t.app.name}</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? "nav-item active" : "nav-item"}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-item-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="nav-item-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export default NavSidebar;