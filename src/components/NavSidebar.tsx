import { t } from "../i18n/en";
import { NAV_ITEMS, type Screen } from "./navItems";

export type { Screen };

interface NavSidebarProps {
  active: Screen;
  collapsed: boolean;
  onNavigate: (screen: Screen) => void;
}

function NavSidebar({ active, collapsed, onNavigate }: NavSidebarProps) {
  return (
    <nav
      className={collapsed ? "nav-sidebar collapsed" : "nav-sidebar"}
      aria-hidden={collapsed}
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
