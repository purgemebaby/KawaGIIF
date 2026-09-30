import { invoke } from "../lib/ipc";
import KawaTitle from "./brand/KawaTitle";
import KawaiiBackdrop from "./brand/KawaiiBackdrop";
import { HOME_TILES, type Screen } from "./navItems";
import { t } from "../i18n/es";

interface HomeScreenProps {
  onNavigate: (screen: Screen) => void;
}

function HomeScreen({ onNavigate }: HomeScreenProps) {
  return (
    <div className="home-screen">
      <KawaiiBackdrop />

      <div className="home-header">
        <KawaTitle size="46px" />
        <p className="home-subtitle">{t.app.tagline}</p>
      </div>

      <div className="home-tiles">
        {HOME_TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className="home-tile"
            onClick={() => onNavigate(tile.id)}
          >
            <span className="home-tile-icon" aria-hidden="true">
              {tile.icon}
            </span>
            <span className="home-tile-title">{tile.label}</span>
            {/* Aparece al pasar el ratón. Se mantiene en el marcado (y no se
                monta al hacer hover) para que los lectores de pantalla lo
                anuncien. El `<span>` interior es necesario: la transición se
                hace con `grid-template-rows: 0fr → 1fr`, que necesita un hijo
                al que colapsar. */}
            <span className="home-tile-desc">
              <span>{tile.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="home-actions">
        <button
          type="button"
          className="kg-btn kg-btn--secondary"
          onClick={() => invoke("hide_control_window")}
        >
          {t.home.minimizeToTray}
        </button>
        <button
          type="button"
          className="kg-btn kg-btn--danger"
          onClick={() => invoke("kill_all_overlays")}
          title={t.home.panic.description}
        >
          {t.home.panic.button}
        </button>
      </div>
    </div>
  );
}

export default HomeScreen;
