import { useEffect, useState } from "react";
import { invoke } from "../lib/ipc";
import { t } from "../i18n/es";
import RamGauge from "./settings/RamGauge";

interface AppConfig {
  launch_on_startup: boolean;
  start_minimized_to_tray: boolean;
  confirm_media_delete: boolean;
  overlay_pool_size: number;
}

function SettingsScreen() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config").then(setConfig);
  }, []);

  if (!config) {
    return <p className="empty-state">{t.common.loading}</p>;
  }

  const update = async <K extends keyof AppConfig>(
    key: K,
    value: AppConfig[K],
    command: string,
    args: Record<string, unknown>,
  ) => {
    setConfig({ ...config, [key]: value });
    await invoke(command, args);
  };

  return (
    <div className="settings-screen">
      <h1>{t.settings.title}</h1>

      <RamGauge />

      <div className="settings-list">
      <label className="settings-row">
        <input
          type="checkbox"
          checked={config.launch_on_startup}
          onChange={(e) =>
            update("launch_on_startup", e.target.checked, "set_launch_on_startup", {
              enabled: e.target.checked,
            })
          }
        />
        <span>
          <strong>{t.settings.launchOnStartup.label}</strong>
          <small>{t.settings.launchOnStartup.hint}</small>
        </span>
      </label>

      <label className="settings-row">
        <input
          type="checkbox"
          checked={config.start_minimized_to_tray}
          onChange={(e) =>
            update(
              "start_minimized_to_tray",
              e.target.checked,
              "set_start_minimized_to_tray",
              { enabled: e.target.checked },
            )
          }
        />
        <span>
          <strong>{t.settings.startMinimized.label}</strong>
          <small>{t.settings.startMinimized.hint}</small>
        </span>
      </label>

      <label className="settings-row">
        <input
          type="checkbox"
          checked={config.confirm_media_delete}
          onChange={(e) =>
            update(
              "confirm_media_delete",
              e.target.checked,
              "set_confirm_media_delete",
              { enabled: e.target.checked },
            )
          }
        />
        <span>
          <strong>{t.settings.confirmDelete.label}</strong>
          <small>{t.settings.confirmDelete.hint}</small>
        </span>
      </label>

      <label className="settings-row settings-row-number">
        <span>
          <strong>{t.settings.poolSize.label}</strong>
          <small>{t.settings.poolSize.hint}</small>
        </span>
        <input
          type="number"
          min={1}
          max={24}
          value={config.overlay_pool_size}
          onChange={(e) =>
            update(
              "overlay_pool_size",
              Number(e.target.value),
              "set_overlay_pool_size",
              { count: Number(e.target.value) },
            )
          }
        />
      </label>

      </div>
    </div>
  );
}

export default SettingsScreen;
