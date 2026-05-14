import { useState, useEffect, useCallback } from "react";
import ContextMenu, { MenuItem } from "./ContextMenu";
import SearchPanel from "./SearchPanel";
import {
  isPathUnderWorkspaceRoot,
  pathBasename,
  pathDirname,
  pathJoin,
} from "../pathUtils";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[] | null;
}

interface Props {
  workspaceFolders: string[];
  onAddFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onOpenFile: (path: string, name: string) => void;
  onOpenTerminal?: (cwd: string) => void;
  activeFile: string | null;
  dirtyFilePaths: string[];
  width: number;
  onWidthChange: (w: number) => void;
  showSearch: boolean;
  onToggleSearch: () => void;
}

interface FileVisual {
  icon: string;
  color: string;
}

const FILE_VISUALS: Record<string, FileVisual> = {
  rs: { icon: "gear", color: "#dea584" },
  go: { icon: "file-code", color: "#00add8" },
  py: { icon: "file-code", color: "#3776ab" },
  js: { icon: "file-code", color: "#f7df1e" },
  jsx: { icon: "file-code", color: "#61dafb" },
  ts: { icon: "file-code", color: "#3178c6" },
  tsx: { icon: "file-code", color: "#61dafb" },
  json: { icon: "code", color: "#f0db4f" },
  toml: { icon: "sliders", color: "#9c6f44" },
  yaml: { icon: "sliders", color: "#cb171e" },
  yml: { icon: "sliders", color: "#cb171e" },
  md: { icon: "file-lines", color: "#8ab4f8" },
  html: { icon: "code", color: "#e34f26" },
  css: { icon: "file-code", color: "#1572b6" },
  sh: { icon: "terminal", color: "#89e051" },
  bash: { icon: "terminal", color: "#89e051" },
  zsh: { icon: "terminal", color: "#89e051" },
  sql: { icon: "database", color: "#4db6ac" },
  xml: { icon: "code", color: "#ff9800" },
  svg: { icon: "bezier-curve", color: "#ffb13b" },
  png: { icon: "image", color: "#a78bfa" },
  jpg: { icon: "image", color: "#a78bfa" },
  jpeg: { icon: "image", color: "#a78bfa" },
  gif: { icon: "image", color: "#a78bfa" },
  webp: { icon: "image", color: "#a78bfa" },
  dockerfile: { icon: "cube", color: "#2496ed" },
};

function fileVisual(entry: FileEntry, isExpanded: boolean, isWorkspaceRoot: boolean): FileVisual {
  if (isWorkspaceRoot) return { icon: "boxes-stacked", color: "#0af" };
  if (entry.is_dir) return { icon: isExpanded ? "folder-open" : "folder", color: "#dcb67a" };
  const lower = entry.name.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop() || "" : lower;
  return FILE_VISUALS[ext] || { icon: "file-lines", color: "#8b949e" };
}

export default function Sidebar({ workspaceFolders, onAddFolder, onRemoveFolder, onOpenFile, onOpenTerminal, activeFile, dirtyFilePaths, width, onWidthChange, showSearch, onToggleSearch }: Props) {
  const [entriesByRoot, setEntriesByRoot] = useState<Record<string, FileEntry[]>>({});

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const min = window.innerWidth * 0.1;
    const max = window.innerWidth * 0.9;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(max, Math.max(min, startWidth + ev.clientX - startX));
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

  const getWorkspaceRootForPath = useCallback((path: string): string | null => {
    let best: string | null = null;
    for (const folder of workspaceFolders) {
      if (isPathUnderWorkspaceRoot(folder, path) && (!best || folder.length > best.length)) {
        best = folder;
      }
    }
    return best;
  }, [workspaceFolders]);

  const loadDir = async (path: string): Promise<FileEntry[]> => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<FileEntry[]>("read_dir", { path, workspaceRoot: getWorkspaceRootForPath(path) });
    } catch {
      return [];
    }
  };

  const refreshDir = useCallback(async () => {
    const next: Record<string, FileEntry[]> = {};
    for (const folder of workspaceFolders) {
      next[folder] = await loadDir(folder);
    }
    setEntriesByRoot(next);
  }, [workspaceFolders, getWorkspaceRootForPath]);

  useEffect(() => {
    refreshDir();
  }, [refreshDir]);

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const folder of workspaceFolders) next.add(folder);
      return next;
    });
  }, [workspaceFolders]);

  const handleOpen = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: true });
    if (selected) {
      const folders = Array.isArray(selected) ? selected : [selected];
      folders.forEach((folder) => onAddFolder(folder));
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
      setEntriesByRoot((prev) => ({ ...prev }));
    }
  };

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const getContextMenuItems = (entry: FileEntry): MenuItem[] => {
    const items: MenuItem[] = [];
    const termCwd = entry.is_dir ? entry.path : pathDirname(entry.path);
    const parentDir = entry.is_dir ? entry.path : pathDirname(entry.path);
    const workspaceRoot = getWorkspaceRootForPath(entry.path);
    const isWorkspaceRoot = workspaceFolders.includes(entry.path);

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

    if (entry.is_dir) {
      items.push({
        label: "New File",
        separator: true,
        action: async () => {
          const name = prompt("File name:");
          if (!name) return;
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("create_file", { path: pathJoin(parentDir, name), workspaceRoot });
            refreshDir();
          } catch (e) {
            console.error("Create file failed:", e);
          }
        },
      });
      items.push({
        label: "New Folder",
        action: async () => {
          const name = prompt("Folder name:");
          if (!name) return;
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("create_dir", { path: pathJoin(parentDir, name), workspaceRoot });
            refreshDir();
          } catch (e) {
            console.error("Create folder failed:", e);
          }
        },
      });
    }

    items.push({
      label: "Copy Path",
      separator: true,
      action: () => navigator.clipboard.writeText(entry.path),
    });

    items.push({
      label: "Copy Name",
      action: () => navigator.clipboard.writeText(entry.name),
    });

    if (isWorkspaceRoot) {
      items.push({
        label: "Remove Folder from Workspace",
        separator: true,
        action: () => onRemoveFolder(entry.path),
      });
      return items;
    }

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
          await invoke("delete_path", { path: entry.path, workspaceRoot });
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
    const parentDir = pathDirname(entry.path);
    const newPath = pathJoin(parentDir, newName);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("rename_path", { oldPath: entry.path, newPath, workspaceRoot: getWorkspaceRootForPath(entry.path) });
      refreshDir();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  };

  const renderEntry = (entry: FileEntry, depth: number) => {
    const isExpanded = expanded.has(entry.path);
    const isRenaming = renaming === entry.path;
    const isWorkspaceRoot = workspaceFolders.includes(entry.path);
    const isActive = activeFile === entry.path;
    const isDirty = dirtyFilePaths.includes(entry.path);
    const visual = fileVisual(entry, isExpanded, isWorkspaceRoot);

    return (
      <div key={entry.path}>
        <div
          className={`file-tree-item ${isActive ? "active" : ""} ${isDirty ? "dirty" : ""} ${isWorkspaceRoot ? "workspace-root" : ""}`}
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
          <span className="tree-chevron">{entry.is_dir ? (isExpanded ? "▾" : "▸") : ""}</span>
          <i className={`tree-file-icon fa-solid fa-${visual.icon}`} style={{ color: visual.color }}></i>
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
            <>
              <span className="file-tree-name">{entry.name}</span>
              {isDirty && <span className="file-tree-dirty-dot" title="Modified"></span>}
            </>
          )}
        </div>
        {entry.is_dir && isExpanded && entry.children?.map((child) => renderEntry(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-view-tabs">
        <button
          className={`sidebar-view-tab ${!showSearch ? "active" : ""}`}
          onClick={() => { if (showSearch) onToggleSearch(); }}
          title="Explorer"
        >
          <i className="fa-regular fa-folder"></i>
        </button>
        <button
          className={`sidebar-view-tab ${showSearch ? "active" : ""}`}
          onClick={() => { if (!showSearch) onToggleSearch(); }}
          title="Search"
        >
          <i className="fa-solid fa-magnifying-glass"></i>
        </button>
      </div>
      {showSearch ? (
        <SearchPanel
          rootPaths={workspaceFolders}
          onOpenFile={onOpenFile}
          onClose={() => onToggleSearch()}
        />
      ) : (
        <>
          <div className="sidebar-header">
            Explorer
            <button onClick={handleOpen} style={{ marginLeft: "auto", background: "none", border: "none", color: "#0af", cursor: "pointer", fontSize: 11 }}>
              Add Folder
            </button>
          </div>
          {workspaceFolders.map((folder) => {
            const rootEntry: FileEntry = {
              name: pathBasename(folder),
              path: folder,
              is_dir: true,
              children: entriesByRoot[folder] || [],
            };
            return renderEntry(rootEntry, 0);
          })}
        </>
      )}
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
