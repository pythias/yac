import { useState } from "react";

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: "on" | "off" | "wordWrapColumn" | "bounded";
}

interface Props {
  settings: EditorSettings;
  onSave: (s: EditorSettings) => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onSave, onClose }: Props) {
  const [local, setLocal] = useState<EditorSettings>({ ...settings });

  return (
    <div
      className="quick-open-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-panel">
        <div className="settings-header">Editor Settings</div>
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
        <div className="settings-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              onSave(local);
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