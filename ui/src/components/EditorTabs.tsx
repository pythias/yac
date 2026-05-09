import { useState } from "react";
import { OpenFile } from "../App";
import ContextMenu, { MenuItem } from "./ContextMenu";

interface Props {
  files: OpenFile[];
  activeFile: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseRight: (path: string) => void;
}

export default function EditorTabs({ files, activeFile, onSelect, onClose, onCloseOthers, onCloseRight }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetPath: string } | null>(null);

  if (files.length === 0) return <div className="tabs" />;

  const menuItems = contextMenu
    ? [
        { label: "关闭", action: () => onClose(contextMenu.targetPath) },
        { label: "关闭其他", action: () => onCloseOthers(contextMenu.targetPath) },
        { label: "关闭右侧", action: () => onCloseRight(contextMenu.targetPath) },
      ] satisfies MenuItem[]
    : [];

  return (
    <div className="tabs">
      {files.map((f) => (
        <div
          key={f.path}
          className={`tab ${f.path === activeFile ? "active" : ""}`}
          onClick={() => onSelect(f.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, targetPath: f.path });
          }}
        >
          <span>{f.dirty ? "● " : ""}{f.name}</span>
          <span
            className="close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose(f.path);
            }}
          >
            ×
          </span>
        </div>
      ))}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
