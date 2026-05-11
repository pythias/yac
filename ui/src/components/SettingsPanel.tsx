import { useState } from "react";

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: "on" | "off" | "wordWrapColumn" | "bounded";
}

export interface AppSettings {
  editor: EditorSettings;
  theme: string;
  openInNewWindow: boolean;
}

interface Props {
  settings: EditorSettings;
  theme: string;
  openInNewWindow: boolean;
  onSave: (editor: EditorSettings, theme: string, openInNewWindow: boolean) => void;
  onClose: () => void;
}

const THEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "monokai", label: "Monokai" },
  { value: "solarized-dark", label: "Solarized Dark" },
];

export default function SettingsPanel({ settings, theme, openInNewWindow, onSave, onClose }: Props) {
  const [local, setLocal] = useState<EditorSettings>({ ...settings });
  const [localTheme, setLocalTheme] = useState(theme);
  const [localNewWindow, setLocalNewWindow] = useState(openInNewWindow);

  const rootEl = typeof document !== "undefined" ? document.documentElement : null;

  const handleThemePreview = (t: string) => {
    setLocalTheme(t);
    if (rootEl) rootEl.dataset.theme = t;
  };

  const handleCancel = () => {
    // Restore actual theme on cancel
    if (rootEl) rootEl.dataset.theme = theme;
    onClose();
  };

  return (
    <div
      className="quick-open-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleCancel();
      }}
    >
      <div className="settings-panel">
        <div className="settings-header">Settings</div>

        <div className="settings-section">
          <div className="settings-section-title">Appearance</div>
          <label>
            Theme
            <select
              value={localTheme}
              onChange={(e) => handleThemePreview(e.target.value)}
            >
              {THEMES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Editor</div>
          <label>
            Font Size
            <select
              value={local.fontSize}
              onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })}
            >
              {[10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((n) => (
                <option key={n} value={n}>{n}px</option>
              ))}
            </select>
          </label>
          <label>
            Tab Size
            <select
              value={local.tabSize}
              onChange={(e) => setLocal({ ...local, tabSize: Number(e.target.value) })}
            >
              {[2, 4, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Word Wrap
            <select
              value={local.wordWrap}
              onChange={(e) => setLocal({ ...local, wordWrap: e.target.value as EditorSettings["wordWrap"] })}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
              <option value="wordWrapColumn">Wrap at column</option>
              <option value="bounded">Bounded</option>
            </select>
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Window</div>
          <label className="settings-toggle">
            <span>Open files/folders in new window</span>
            <div
              className={`toggle-switch ${localNewWindow ? "on" : ""}`}
              onClick={() => setLocalNewWindow((v) => !v)}
            >
              <div className="toggle-knob" />
            </div>
          </label>
        </div>

        <div className="settings-actions">
          <button onClick={handleCancel}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              onSave(local, localTheme, localNewWindow);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}