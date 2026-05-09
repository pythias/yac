import { useState, useEffect, useCallback } from "react";
import ContextMenu, { MenuItem } from "./ContextMenu";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[] | null;
}

interface Props {
  rootPath: string | null;
  setRootPath: (path: string) => void;
  onOpenFile: (path: string, name: string) => void;
  onOpenTerminal?: (cwd: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
}

export default function Sidebar({ rootPath, setRootPath, onOpenFile, onOpenTerminal, width, onWidthChange }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(400, Math.max(140, startWidth + ev.clientX - startX));
      onWidthChange(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
    };
    window.addEventListener("blur", onUp);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const loadDir = async (path: string): Promise<FileEntry[]> => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<FileEntry[]>("read_dir", { path });
    } catch {
      return [];
    }
  };

  const refreshDir = useCallback(async () => {
    if (rootPath) {
      const result = await loadDir(rootPath);
      setEntries(result);
    }
  }, [rootPath]);

  useEffect(() => {
    refreshDir();
  }, [rootPath]);

  const handleOpen = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setRootPath(selected as string);
    }
  };

  const toggleDir = async (entry: FileEntry) => {
    const key = entry.path;
    if (expanded.has(key)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      const children = await loadDir(entry.path);
      entry.children = children;
      setExpanded((prev) => new Set(prev).add(key));
      setEntries([...entries]);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const getContextMenuItems = (entry: FileEntry): MenuItem[] => {
    const items: MenuItem[] = [];
    const termCwd = entry.is_dir ? entry.path : entry.path.substring(0, entry.path.lastIndexOf("/"));

    items.push({
      label: "Open in Terminal",
      action: () => onOpenTerminal?.(termCwd),
    });

    items.push({
      label: "Reveal in Finder",
      action: async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("reveal_in_finder", { path: entry.path });
      },
    });

    items.push({
      label: "Copy Path",
      separator: true,
      action: () => navigator.clipboard.writeText(entry.path),
    });

    items.push({
      label: "Copy Name",
      action: () => navigator.clipboard.writeText(entry.name),
    });

    items.push({
      label: "Rename",
      separator: true,
      action: () => setRenaming(entry.path),
    });

    items.push({
      label: "Delete",
      action: async () => {
        if (!confirm(`Delete "${entry.name}"?`)) return;
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("delete_path", { path: entry.path });
          refreshDir();
        } catch (e) {
          console.error("Delete failed:", e);
        }
      },
    });

    return items;
  };

  const handleRename = async (entry: FileEntry, newName: string) => {
    setRenaming(null);
    if (!newName || newName === entry.name) return;
    const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));
    const newPath = `${parentDir}/${newName}`;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("rename_path", { oldPath: entry.path, newPath });
      refreshDir();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  };

  const renderEntry = (entry: FileEntry, depth: number) => {
    const isExpanded = expanded.has(entry.path);
    const isRenaming = renaming === entry.path;

    return (
      <div key={entry.path}>
        <div
          className="file-tree-item"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => {
            if (entry.is_dir) {
              toggleDir(entry);
            } else {
              onOpenFile(entry.path, entry.name);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, entry)}
        >
          <span className="icon">{entry.is_dir ? (isExpanded ? "▾" : "▸") : ""}</span>
          {isRenaming ? (
            <input
              autoFocus
              defaultValue={entry.name}
              className="rename-input"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => handleRename(entry, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(entry, (e.target as HTMLInputElement).value);
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <span>{entry.name}</span>
          )}
        </div>
        {entry.is_dir && isExpanded && entry.children?.map((child) => renderEntry(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-header">
        Explorer
        <button onClick={handleOpen} style={{ marginLeft: "auto", background: "none", border: "none", color: "#0af", cursor: "pointer", fontSize: 11 }}>
          Open Folder
        </button>
      </div>
      {entries.map((e) => renderEntry(e, 0))}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.entry)}
          onClose={() => setContextMenu(null)}
        />
      )}
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  );
}
