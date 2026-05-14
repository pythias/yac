import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Sidebar from "./components/Sidebar";
import EditorTabs from "./components/EditorTabs";
import MonacoEditor from "./components/MonacoEditor";
import TerminalPanel, { TerminalPanelHandle } from "./components/TerminalPanel";
import QuickOpen, { QuickCommand } from "./components/QuickOpen";
import StatusBar from "./components/StatusBar";
import { AiCliShortcuts } from "./components/AiCliShortcuts";
import { EditorSettings, THEMES } from "./settings";
import {
  isPathUnderWorkspaceRoot,
  pathBasename,
  pathDirname,
  pathJoin,
} from "./pathUtils";

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

interface SavedState {
  rootPath?: string | null;
  workspaceFolders?: string[];
  openFiles: { path: string; name: string }[];
  activeFile: string | null;
  showTerminal: boolean;
}

const BASE_STATE_KEY = "yac-ide-state";
const MAX_RECENT_FILES = 10;
const RECENT_FILES_KEY = "yac-recent-files";
export const UNTITLED_PREFIX = "untitled:";

export function isUntitledPath(path: string): boolean {
  return path.startsWith(UNTITLED_PREFIX);
}

function loadRecentPaths(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function saveRecentPaths(paths: string[]): void {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(paths.slice(0, MAX_RECENT_FILES)));
  } catch {}
}

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: "off",
  minimapEnabled: true,
};
const MIN_EDITOR_FONT_SIZE = 10;
const MAX_EDITOR_FONT_SIZE = 24;

function normalizeFolders(folders: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const folder of folders) {
    if (!folder || seen.has(folder)) continue;
    seen.add(folder);
    result.push(folder);
  }
  return result;
}

function resolveWorkspacePath(baseDir: string, value: string): string {
  if (value.startsWith("file://")) {
    return decodeURIComponent(value.replace(/^file:\/\//, ""));
  }
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    return value;
  }
  let cur = baseDir.replace(/[/\\]+$/, "");
  for (const part of value.split(/[/\\]+/)) {
    if (!part || part === ".") continue;
    if (part === "..") cur = pathDirname(cur);
    else cur = pathJoin(cur, part);
  }
  return cur;
}

async function openWorkspaceWindow(folders: string[]) {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const label = `win_${Date.now()}`;
  const url = `index.html?workspaceFolders=${encodeURIComponent(JSON.stringify(folders))}`;
  const title =
    folders.length === 1
      ? `Yac IDE - ${folders[0]}`
      : `Yac IDE - ${folders.length} Folders`;

  return new WebviewWindow(label, {
    title,
    width: 1200,
    height: 800,
    url,
  });
}

function getWinLabel(): string {
  // @ts-ignore
  return window.__TAURI_INTERNALS__?.metadata?.label || "main";
}

function getStateKey(): string {
  return `${BASE_STATE_KEY}-${getWinLabel()}`;
}

function loadState(): Partial<SavedState> {
  try {
    const raw = localStorage.getItem(getStateKey());
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveState(state: SavedState) {
  try {
    localStorage.setItem(getStateKey(), JSON.stringify(state));
  } catch {}
}

function normalizeEditorSettings(settings: Partial<EditorSettings> | null | undefined): EditorSettings {
  return { ...DEFAULT_EDITOR_SETTINGS, ...(settings || {}) };
}

export default function App() {
  // Initialize data-theme immediately to avoid flash on first render
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme =
      localStorage.getItem("yac-theme") || "dark";
  }

  const saved = useRef(loadState());
  
  // Use rootPath from initial data if available (passed from new window spawn)
  const getInitialFolders = () => {
    // Check URL params first (standard way to pass data to new windows)
    const params = new URLSearchParams(window.location.search);
    const paramFolders = params.get("workspaceFolders");
    if (paramFolders) {
      try {
        const folders = JSON.parse(paramFolders);
        if (Array.isArray(folders)) return normalizeFolders(folders);
      } catch {}
    }
    const paramPath = params.get("rootPath");
    if (paramPath) return [paramPath];

    // Fallback to metadata
    const windowArgs = (window as any).__TAURI_METADATA__?.__args;
    if (windowArgs?.rootPath) return [windowArgs.rootPath];

    return normalizeFolders([
      ...(saved.current.workspaceFolders || []),
      saved.current.rootPath || null,
    ]);
  };

  const initialWorkspaceFolders = getInitialFolders();
  const isNewWindowWithPath =
    initialWorkspaceFolders.length > 0 &&
    initialWorkspaceFolders.join("\n") !== normalizeFolders([
      ...(saved.current.workspaceFolders || []),
      saved.current.rootPath || null,
    ]).join("\n");

  const [openFiles, setOpenFiles] = useState<OpenFile[]>(() =>
    isNewWindowWithPath ? [] : ((saved.current.openFiles || []) as OpenFile[])
  );
  const [activeFile, setActiveFile] = useState<string | null>(() =>
    isNewWindowWithPath ? null : (saved.current.activeFile || null)
  );
  const [showTerminal, setShowTerminal] = useState(saved.current.showTerminal !== false);
  const [workspaceFolders, setWorkspaceFolders] = useState<string[]>(initialWorkspaceFolders);
  const rootPath = workspaceFolders[0] || null;
  const terminalRef = useRef<TerminalPanelHandle>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  const runCliLineInTerminal = useCallback((line: string) => {
    setShowTerminal(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void terminalRef.current?.runLineInNewTerminal(line);
      });
    });
  }, []);

  const [sidebarWidth, setSidebarWidth] = useState<number>(
    () => Number(localStorage.getItem("yac-sidebar-width")) || 220
  );
  const [terminalPosition, setTerminalPosition] = useState<"bottom" | "right">(
    () => (localStorage.getItem("yac-terminal-position") as "bottom" | "right") || "bottom"
  );
  const [terminalSize, setTerminalSize] = useState<number>(
    () => Number(localStorage.getItem("yac-terminal-size")) || 250
  );

  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("yac-theme") || "dark"
  );
  const [showSidebar, setShowSidebar] = useState(
    () => localStorage.getItem("yac-show-sidebar") !== "false"
  );
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const closeConfirmedRef = useRef(false);
  const closePromptOpenRef = useRef(false);
  const untitledCounterRef = useRef(0);

  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => {
    try {
      const raw = localStorage.getItem("yac-editor-settings");
      if (raw) return normalizeEditorSettings(JSON.parse(raw));
    } catch {}
    return DEFAULT_EDITOR_SETTINGS;
  });

  const [openInNewWindow, setOpenInNewWindow] = useState(
    () => localStorage.getItem("yac-open-new-window") === "true"
  );

  const updateEditorSettings = useCallback((patch: Partial<EditorSettings>) => {
    setEditorSettings((prev) => {
      const next = normalizeEditorSettings({ ...prev, ...patch });
      localStorage.setItem("yac-editor-settings", JSON.stringify(next));
      return next;
    });
  }, []);

  const changeEditorFontSize = useCallback((delta: number) => {
    setEditorSettings((prev) => {
      const next = normalizeEditorSettings({
        ...prev,
        fontSize: Math.min(
          MAX_EDITOR_FONT_SIZE,
          Math.max(MIN_EDITOR_FONT_SIZE, prev.fontSize + delta)
        ),
      });
      localStorage.setItem("yac-editor-settings", JSON.stringify(next));
      return next;
    });
  }, []);

  const resetEditorFontSize = useCallback(() => {
    updateEditorSettings({ fontSize: DEFAULT_EDITOR_SETTINGS.fontSize });
  }, [updateEditorSettings]);

  const updateTheme = useCallback((newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("yac-theme", newTheme);
  }, []);

  const updateOpenInNewWindow = useCallback((newWindow: boolean) => {
    setOpenInNewWindow(newWindow);
    localStorage.setItem("yac-open-new-window", String(newWindow));
  }, []);

  const getWorkspaceRootForPath = useCallback((path: string): string | null => {
    let best: string | null = null;
    for (const folder of workspaceFolders) {
      if (isPathUnderWorkspaceRoot(folder, path) && (!best || folder.length > best.length)) {
        best = folder;
      }
    }
    return best || rootPath;
  }, [rootPath, workspaceFolders]);

  const addWorkspaceFolder = useCallback((path: string) => {
    setWorkspaceFolders((prev) => normalizeFolders([...prev, path]));
  }, []);

  const removeWorkspaceFolder = useCallback((path: string) => {
    setWorkspaceFolders((prev) => prev.filter((folder) => folder !== path));
    setOpenFiles((prev) => {
      const next = prev.filter((file) => !isPathUnderWorkspaceRoot(path, file.path));
      setActiveFile((active) => {
        if (active && next.some((file) => file.path === active)) return active;
        return next[next.length - 1]?.path || null;
      });
      return next;
    });
  }, []);

  const readCodeWorkspaceFolders = useCallback(async (path: string): Promise<string[]> => {
    const { invoke } = await import("@tauri-apps/api/core");
    const text = await invoke<string>("read_file", { path, workspaceRoot: null });
    const workspace = JSON.parse(text) as { folders?: Array<{ path?: string; uri?: string }> };
    const baseDir = pathDirname(path);
    return normalizeFolders(
      (workspace.folders || [])
        .map((folder) => folder.path || folder.uri || "")
        .filter(Boolean)
        .map((value) => resolveWorkspacePath(baseDir, value))
    );
  }, []);

  const openCodeWorkspace = useCallback(async (path: string) => {
    const folders = await readCodeWorkspaceFolders(path);
    if (folders.length > 0) {
      if (openInNewWindow && workspaceFolders.length > 0) {
        const webview = await openWorkspaceWindow(folders);
        webview.once("tauri://error", (event) => {
          console.error("Failed to open workspace in new window:", event);
          setWorkspaceFolders(folders);
        });
      } else {
        setWorkspaceFolders(folders);
      }
    }
  }, [openInNewWindow, readCodeWorkspaceFolders, workspaceFolders.length]);

  const openWorkspaceFile = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "Workspace", extensions: ["code-workspace"] }],
    });
    if (selected) {
      await openCodeWorkspace(selected as string);
    }
  }, [openCodeWorkspace]);

  const openFolders = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: true });
    if (!selected) return;
    const folders = Array.isArray(selected) ? selected : [selected];
    setWorkspaceFolders((prev) => normalizeFolders([...prev, ...folders]));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("yac-theme", theme);
  }, [theme]);

  useEffect(() => {
    const syncMenu = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("sync_view_menu_state", {
          state: {
            sidebarVisible: showSidebar,
            terminalVisible: showTerminal,
            minimapEnabled: editorSettings.minimapEnabled ?? true,
            wordWrapEnabled: editorSettings.wordWrap !== "off",
            openInNewWindow,
            theme,
          },
        });
      } catch {}
    };
    syncMenu();
  }, [editorSettings.minimapEnabled, editorSettings.wordWrap, openInNewWindow, showSidebar, showTerminal, theme]);

  useEffect(() => {
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("sync_recent_files_menu", { paths: loadRecentPaths() });
      } catch {}
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem("yac-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("yac-show-sidebar", String(showSidebar));
  }, [showSidebar]);

  useEffect(() => {
    localStorage.setItem("yac-terminal-position", terminalPosition);
  }, [terminalPosition]);

  useEffect(() => {
    localStorage.setItem("yac-terminal-size", String(terminalSize));
  }, [terminalSize]);

  // 恢复之前打开的文件
  useEffect(() => {
    const restore = async () => {
      if (!saved.current.openFiles?.length) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const files: OpenFile[] = [];
      for (const f of saved.current.openFiles) {
        try {
          const content = await invoke<string>("read_file", { path: f.path, workspaceRoot: getWorkspaceRootForPath(f.path) });
          files.push({ path: f.path, name: f.name, content, dirty: false });
        } catch {}
      }
      if (files.length > 0) {
        setOpenFiles(files);
        if (saved.current.activeFile && files.find((fl) => fl.path === saved.current.activeFile)) {
          setActiveFile(saved.current.activeFile);
        } else {
          setActiveFile(files[0].path);
        }
      }
    };
    restore();
  }, [getWorkspaceRootForPath]);

  // 持久化状态（不持久化未命名缓冲区）
  useEffect(() => {
    const diskFiles = openFiles.filter((f) => !isUntitledPath(f.path));
    const activePersist =
      activeFile && !isUntitledPath(activeFile)
        ? activeFile
        : diskFiles[diskFiles.length - 1]?.path ?? null;
    const state: SavedState = {
      workspaceFolders,
      rootPath,
      openFiles: diskFiles.map((f) => ({ path: f.path, name: f.name })),
      activeFile: activePersist,
      showTerminal,
    };
    saveState(state);
  }, [workspaceFolders, rootPath, openFiles, activeFile, showTerminal]);

  const pushRecentPath = useCallback(async (path: string) => {
    if (isUntitledPath(path)) return;
    const prev = loadRecentPaths();
    const next = [path, ...prev.filter((p) => p !== path)].slice(0, MAX_RECENT_FILES);
    saveRecentPaths(next);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("sync_recent_files_menu", { paths: next });
    } catch {}
  }, []);

  const openFile = useCallback(async (path: string, name: string) => {
    const existing = openFiles.find((f) => f.path === path);
    if (existing) {
      setActiveFile(path);
      await pushRecentPath(path);
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const content = await invoke<string>("read_file", { path, workspaceRoot: getWorkspaceRootForPath(path) });
      const file: OpenFile = { path, name, content, dirty: false };
      setOpenFiles((prev) => [...prev, file]);
      setActiveFile(path);
      await pushRecentPath(path);
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  }, [getWorkspaceRootForPath, openFiles, pushRecentPath]);

  const confirmDiscard = (files: OpenFile[]) => {
    const dirty = files.filter((f) => f.dirty);
    if (dirty.length === 0) return true;
    const names = dirty.map((f) => f.name).join(", ");
    return window.confirm(`Save changes before closing?\n\n${names}`);
  };

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const file = prev.find((f) => f.path === path);
      if (file?.dirty && !confirmDiscard([file])) return prev;
      const remaining = prev.filter((f) => f.path !== path);
      if (activeFile === path) {
        setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
      }
      return remaining;
    });
  }, [activeFile]);

  const closeOthers = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const others = prev.filter((f) => f.path !== path);
      if (!confirmDiscard(others)) return prev;
      return prev.filter((f) => f.path === path);
    });
    setActiveFile(path);
  }, []);

  const closeRight = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === path);
      if (idx === -1) return prev;
      const right = prev.slice(idx + 1);
      if (!confirmDiscard(right)) return prev;
      const next = prev.slice(0, idx + 1);
      setActiveFile((active) =>
        next.find((f) => f.path === active) ? active : path
      );
      return next;
    });
  }, []);

  const destroyCurrentWindow = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().destroy();
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    setOpenFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, content, dirty: true } : f))
    );
  }, []);

  const saveFile = useCallback(async (path: string) => {
    const file = openFiles.find((f) => f.path === path);
    if (!file) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (isUntitledPath(path)) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const suggested = rootPath
          ? pathJoin(rootPath.replace(/[/\\]+$/, ""), "Untitled.txt")
          : undefined;
        const dest = await save(suggested ? { defaultPath: suggested } : {});
        if (!dest || typeof dest !== "string") return;
        const wsRoot = getWorkspaceRootForPath(dest);
        await invoke("write_file", { path: dest, content: file.content, workspaceRoot: wsRoot });
        const newName = pathBasename(dest);
        setOpenFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, path: dest, name: newName, dirty: false } : f))
        );
        setActiveFile(dest);
        await pushRecentPath(dest);
      } else {
        await invoke("write_file", {
          path,
          content: file.content,
          workspaceRoot: getWorkspaceRootForPath(path),
        });
        setOpenFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, dirty: false } : f))
        );
      }
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }, [getWorkspaceRootForPath, openFiles, pushRecentPath, rootPath]);

  const openSingleFileDialog = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: false, multiple: false });
    if (selected == null || Array.isArray(selected)) return;
    const name = selected.split("/").pop() || selected;
    await openFile(selected, name);
  }, [openFile]);

  const openFolderReplace = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (selected == null || Array.isArray(selected)) return;
    setWorkspaceFolders([selected]);
  }, []);

  const spawnNewWindow = useCallback(async () => {
    await openWorkspaceWindow([]);
  }, []);

  const newBlankTextFile = useCallback(() => {
    untitledCounterRef.current += 1;
    const n = untitledCounterRef.current;
    const path = `${UNTITLED_PREFIX}${n}`;
    const name = `Untitled-${n}`;
    setOpenFiles((prev) => [...prev, { path, name, content: "", dirty: false }]);
    setActiveFile(path);
  }, []);

  const clearRecentFiles = useCallback(async () => {
    saveRecentPaths([]);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("sync_recent_files_menu", { paths: [] as string[] });
    } catch {}
  }, []);

  const openRecentByIndex = useCallback(
    async (index: number) => {
      const paths = loadRecentPaths();
      const targetPath = paths[index];
      if (!targetPath) return;
      const name = targetPath.split("/").pop() || targetPath;
      await openFile(targetPath, name);
    },
    [openFile]
  );

  const handleOpenTerminal = useCallback((cwd: string) => {
    setShowTerminal(true);
    // 延迟一帧确保 panel 已渲染
    setTimeout(() => {
      terminalRef.current?.createTerminalWithCwd(cwd);
    }, 0);
  }, []);

  const reloadFile = useCallback((path: string, content: string) => {
    setOpenFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, content, dirty: false } : f))
    );
  }, []);

  const handleToggleTerminalPosition = useCallback(() => {
    setTerminalPosition((prev) => (prev === "bottom" ? "right" : "bottom"));
    setTimeout(() => terminalRef.current?.fitAll(), 50);
  }, []);

  const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const isBottom = terminalPosition === "bottom";
    const startPos = isBottom ? e.clientY : e.clientX;
    const startSize = terminalSize;
    const container = mainContentRef.current;
    const onMove = (ev: MouseEvent) => {
      const total = isBottom
        ? (container?.clientHeight ?? window.innerHeight)
        : (container?.clientWidth ?? window.innerWidth);
      const min = total * 0.1;
      const max = total * 0.9;
      const delta = isBottom ? startPos - ev.clientY : startPos - ev.clientX;
      const next = Math.min(max, Math.max(min, startSize + delta));
      setTerminalSize(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
      setTimeout(() => terminalRef.current?.fitAll(), 50);
    };
    window.addEventListener("blur", onUp);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [terminalPosition, terminalSize]);

  const handleEditorRightDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startPos = e.clientX;
    const startSize = terminalSize;
    const container = mainContentRef.current;
    const onMove = (ev: MouseEvent) => {
      const total = container?.clientWidth ?? window.innerWidth;
      const min = total * 0.1;
      const max = total * 0.9;
      const delta = startPos - ev.clientX;
      const next = Math.min(max, Math.max(min, startSize + delta));
      setTerminalSize(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
      setTimeout(() => terminalRef.current?.fitAll(), 50);
    };
    window.addEventListener("blur", onUp);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [terminalSize]);

  const currentFile = openFiles.find((f) => f.path === activeFile) || null;

  useEffect(() => {
    setCursorPosition({ line: 1, column: 1 });
  }, [activeFile]);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (!mod) return;

      if (key === "p") {
        e.preventDefault();
        setShowQuickOpen((v) => !v);
        return;
      }

      if (key === "o") {
        e.preventDefault();
        if (e.altKey) {
          openWorkspaceFile();
        } else if (e.shiftKey) {
          openFolderReplace();
        } else {
          void openSingleFileDialog();
        }
        return;
      }

      if (key === "a" && e.shiftKey && !e.altKey) {
        e.preventDefault();
        void openFolders();
        return;
      }

      if (key === "n") {
        e.preventDefault();
        if (e.shiftKey) {
          void spawnNewWindow();
        } else {
          newBlankTextFile();
        }
        return;
      }

      if (key === "b" && !e.shiftKey) {
        e.preventDefault();
        setShowSidebar((v) => !v);
        return;
      }

      if (key === "j" && !e.shiftKey) {
        e.preventDefault();
        setShowTerminal((v) => !v);
        return;
      }

      if (e.shiftKey && key === "f") {
        e.preventDefault();
        setShowSearchPanel((v) => !v);
        return;
      }

      if (key === "=" || key === "+") {
        e.preventDefault();
        changeEditorFontSize(1);
        return;
      }

      if (key === "-") {
        e.preventDefault();
        changeEditorFontSize(-1);
        return;
      }

      if (key === "0") {
        e.preventDefault();
        resetEditorFontSize();
        return;
      }

      if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        if (activeFile) saveFile(activeFile);
        return;
      }

      if (e.shiftKey && e.code === "BracketLeft" && openFiles.length > 1) {
        e.preventDefault();
        const index = openFiles.findIndex((f) => f.path === activeFile);
        const next = openFiles[(index - 1 + openFiles.length) % openFiles.length];
        setActiveFile(next.path);
        return;
      }

      if (e.shiftKey && e.code === "BracketRight" && openFiles.length > 1) {
        e.preventDefault();
        const index = openFiles.findIndex((f) => f.path === activeFile);
        const next = openFiles[(index + 1) % openFiles.length];
        setActiveFile(next.path);
        return;
      }

      if (key === "w") {
        e.preventDefault();
        if (openFiles.length === 0) {
          if (window.confirm("Close window?")) {
            closeConfirmedRef.current = true;
            destroyCurrentWindow();
          }
        } else if (activeFile) {
          closeFile(activeFile);
        }
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeFile,
    changeEditorFontSize,
    closeFile,
    destroyCurrentWindow,
    newBlankTextFile,
    openFiles,
    openFolderReplace,
    openFolders,
    openSingleFileDialog,
    openWorkspaceFile,
    resetEditorFontSize,
    saveFile,
    spawnNewWindow,
  ]);

  // Listen for menu events from Rust
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setupMenuListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<string>("menu-event", (event) => {
        switch (event.payload) {
          case "open-file":
            void openSingleFileDialog();
            break;
          case "open-folder-replace":
            void openFolderReplace();
            break;
          case "add-folder-to-workspace":
            openFolders();
            break;
          case "open-workspace":
            openWorkspaceFile();
            break;
          case "clear-recent-files":
            void clearRecentFiles();
            break;
          case "new-window":
            void spawnNewWindow();
            break;
          case "new-text-file":
            newBlankTextFile();
            break;
          case "toggle-sidebar":
            setShowSidebar((v) => !v);
            break;
          case "toggle-terminal":
            setShowTerminal((v) => !v);
            break;
          case "toggle-minimap":
            updateEditorSettings({ minimapEnabled: !editorSettings.minimapEnabled });
            break;
          case "toggle-word-wrap":
            updateEditorSettings({ wordWrap: editorSettings.wordWrap === "off" ? "on" : "off" });
            break;
          case "toggle-open-new-window":
            updateOpenInNewWindow(!openInNewWindow);
            break;
          case "theme-dark":
            updateTheme("dark");
            break;
          case "theme-light":
            updateTheme("light");
            break;
          case "theme-monokai":
            updateTheme("monokai");
            break;
          case "theme-solarized-dark":
            updateTheme("solarized-dark");
            break;
          case "increase-font-size":
            changeEditorFontSize(1);
            break;
          case "decrease-font-size":
            changeEditorFontSize(-1);
            break;
        }
      });
    };
    setupMenuListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [
    changeEditorFontSize,
    clearRecentFiles,
    editorSettings.minimapEnabled,
    editorSettings.wordWrap,
    newBlankTextFile,
    openFolderReplace,
    openFolders,
    openSingleFileDialog,
    openWorkspaceFile,
    openInNewWindow,
    spawnNewWindow,
    updateEditorSettings,
    updateOpenInNewWindow,
    updateTheme,
  ]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setupRecentListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<number>("open-recent-file", (event) => {
        void openRecentByIndex(event.payload);
      });
    };
    void setupRecentListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [openRecentByIndex]);

  const quickCommands: QuickCommand[] = useMemo(() => [
    {
      id: "open-file",
      title: "File: Open File",
      subtitle: "Cmd/Ctrl+O",
      run: openSingleFileDialog,
    },
    {
      id: "open-folder-replace",
      title: "File: Open Folder",
      subtitle: "Cmd/Ctrl+Shift+O",
      run: openFolderReplace,
    },
    {
      id: "add-folder",
      title: "File: Add Folder to Workspace",
      subtitle: "Cmd/Ctrl+Shift+A",
      run: openFolders,
    },
    {
      id: "open-workspace",
      title: "File: Open Workspace",
      subtitle: "Cmd/Ctrl+Alt+O",
      run: openWorkspaceFile,
    },
    {
      id: "new-text-file",
      title: "File: New Text File",
      subtitle: "Cmd/Ctrl+N",
      run: newBlankTextFile,
    },
    {
      id: "new-window",
      title: "File: New Window",
      subtitle: "Cmd/Ctrl+Shift+N",
      run: spawnNewWindow,
    },
    {
      id: "toggle-sidebar",
      title: "View: Toggle Sidebar",
      subtitle: `Cmd/Ctrl+B - ${showSidebar ? "Visible" : "Hidden"}`,
      run: () => setShowSidebar((v) => !v),
    },
    {
      id: "toggle-minimap",
      title: "View: Toggle Minimap",
      subtitle: editorSettings.minimapEnabled ? "On" : "Off",
      run: () => updateEditorSettings({ minimapEnabled: !editorSettings.minimapEnabled }),
    },
    {
      id: "toggle-word-wrap",
      title: "View: Toggle Word Wrap",
      subtitle: editorSettings.wordWrap === "off" ? "Off" : "On",
      run: () => updateEditorSettings({ wordWrap: editorSettings.wordWrap === "off" ? "on" : "off" }),
    },
    {
      id: "toggle-terminal",
      title: "View: Toggle Terminal",
      subtitle: `Cmd/Ctrl+J - ${showTerminal ? "Visible" : "Hidden"}`,
      run: () => setShowTerminal((v) => !v),
    },
    {
      id: "toggle-open-new-window",
      title: "View: Open Files/Folders in New Window",
      subtitle: openInNewWindow ? "On" : "Off",
      run: () => updateOpenInNewWindow(!openInNewWindow),
    },
    {
      id: "increase-font-size",
      title: "View: Increase Font Size",
      subtitle: `Cmd/Ctrl+= - ${editorSettings.fontSize}px`,
      run: () => changeEditorFontSize(1),
    },
    {
      id: "decrease-font-size",
      title: "View: Decrease Font Size",
      subtitle: `Cmd/Ctrl+- - ${editorSettings.fontSize}px`,
      run: () => changeEditorFontSize(-1),
    },
    {
      id: "reset-font-size",
      title: "View: Reset Font Size",
      subtitle: "Cmd/Ctrl+0",
      run: resetEditorFontSize,
    },
    ...THEMES.map((t) => ({
      id: `theme-${t.value}`,
      title: `View: Theme: ${t.label}`,
      subtitle: theme === t.value ? "Current" : "Theme",
      run: () => updateTheme(t.value),
    })),
  ], [
    changeEditorFontSize,
    editorSettings.fontSize,
    editorSettings.minimapEnabled,
    editorSettings.wordWrap,
    newBlankTextFile,
    openFolderReplace,
    openFolders,
    openInNewWindow,
    openSingleFileDialog,
    openWorkspaceFile,
    resetEditorFontSize,
    showSidebar,
    showTerminal,
    spawnNewWindow,
    theme,
    workspaceFolders.length,
    updateEditorSettings,
    updateOpenInNewWindow,
    updateTheme,
  ]);

  // Intercept window close to show confirmation
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupCloseInterceptor = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const appWindow = getCurrentWindow();

      unlisten = await appWindow.onCloseRequested(async (event) => {
        if (closeConfirmedRef.current) return;
        event.preventDefault();
        if (closePromptOpenRef.current) return;
        closePromptOpenRef.current = true;

        const dirtyFiles = openFiles.filter(f => f.dirty);
        
        let message = "Are you sure you want to exit?";
        if (dirtyFiles.length > 0) {
          const names = dirtyFiles.map(f => f.name).join(", ");
          message = `You have unsaved changes in: ${names}.\n\nDo you want to discard them and exit?`;
        }

        try {
          const confirmed = await ask(message, {
            title: "Confirm Exit",
            kind: "warning",
          });

          if (confirmed) {
            closeConfirmedRef.current = true;
            await appWindow.destroy();
          }
        } finally {
          closePromptOpenRef.current = false;
        }
      });
    };

    setupCloseInterceptor();
    return () => {
      if (unlisten) unlisten();
    };
  }, [openFiles]);

  return (
    <div className="app">
      <div className="titlebar">
        <span>
          Yac IDE{workspaceFolders.length > 0 ? ` — ${workspaceFolders.map((p) => p.split("/").pop() || p).join(", ")}` : ""}
        </span>
      </div>
      <div className="main-content" ref={mainContentRef}>
        {workspaceFolders.length > 0 ? (
          <>
            {showSidebar && (
              <Sidebar
                workspaceFolders={workspaceFolders}
                onAddFolder={addWorkspaceFolder}
                onRemoveFolder={removeWorkspaceFolder}
                onOpenFile={openFile}
                onOpenTerminal={handleOpenTerminal}
                activeFile={activeFile}
                dirtyFilePaths={openFiles.filter((file) => file.dirty).map((file) => file.path)}
                width={sidebarWidth}
                onWidthChange={setSidebarWidth}
                showSearch={showSearchPanel}
                onToggleSearch={() => setShowSearchPanel((v) => !v)}
              />
            )}
            <div
              className="editor-area"
              style={{ flexDirection: terminalPosition === "right" ? "row" : "column" }}
            >
              <div
                className={terminalPosition === "right" ? "editor-main" : undefined}
                style={
                  terminalPosition === "bottom"
                    ? { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }
                    : { position: "relative", minWidth: 0, minHeight: 0 }
                }
              >
                <EditorTabs
                  files={openFiles}
                  activeFile={activeFile}
                  onSelect={setActiveFile}
                  onClose={closeFile}
                  onCloseOthers={closeOthers}
                  onCloseRight={closeRight}
                />
                <div className="editor-container">
                  {currentFile && (
                    <MonacoEditor
                      key={currentFile.path}
                      file={currentFile}
                      rootPath={getWorkspaceRootForPath(currentFile.path)}
                      onChange={(val) => updateFileContent(currentFile.path, val)}
                      onSave={() => saveFile(currentFile.path)}
                      onReload={reloadFile}
                      onCursorChange={setCursorPosition}
                      settings={editorSettings}
                      theme={theme}
                    />
                  )}
                  {!currentFile && (
                    <div className="empty-state">
                      <i className="fa-regular fa-file-code"></i>
                      <p>Select a file to start editing</p>
                      <div className="shortcuts-hint">
                        <div><span>⌘ P</span> Quick Open</div>
                        <div><span>⌘ O</span> Add Folder</div>
                        <div><span>⌘ ⇧ F</span> Search in Files</div>
                      </div>
                    </div>
                  )}
                </div>
                {terminalPosition === "right" && showTerminal && (
                  <div
                    className="terminal-drag-handle-v"
                    style={{ position: "absolute", right: 0, top: 0, height: "100%", zIndex: 10, width: 4 }}
                    onMouseDown={handleEditorRightDragStart}
                  />
                )}
              </div>

              {showTerminal && (
                <div
                  className={`terminal-container${terminalPosition === "right" ? " right" : ""}`}
                  style={
                    terminalPosition === "bottom"
                      ? { height: terminalSize }
                      : { width: terminalSize }
                  }
                >
                  {terminalPosition === "bottom" ? (
                    <div
                      className="terminal-drag-handle-h"
                      onMouseDown={handleTerminalDragStart}
                    />
                  ) : (
                    <div
                      className="terminal-drag-handle-v"
                      onMouseDown={handleTerminalDragStart}
                    />
                  )}
                  <TerminalPanel
                    ref={terminalRef}
                    cwd={rootPath}
                    position={terminalPosition}
                    onTogglePosition={handleToggleTerminalPosition}
                    theme={theme}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="welcome-screen">
            <div className="welcome-content">
              <h1>Yac IDE</h1>
              <p>A minimal, high-performance code editor</p>
              <div className="welcome-actions">
                <button className="primary-btn" onClick={openFolders}>
                  <i className="fa-regular fa-folder-open"></i> Open Folder
                </button>
                <button className="primary-btn" onClick={openWorkspaceFile}>
                  <i className="fa-regular fa-window-restore"></i> Open Workspace
                </button>
              </div>
              <div className="welcome-shortcuts">
                <div className="shortcut-item">
                  <span className="label">Quick Open</span>
                  <span className="key">⌘ P</span>
                </div>
                <div className="shortcut-item">
                  <span className="label">Add Folder</span>
                  <span className="key">⌘ O</span>
                </div>
                <div className="shortcut-item">
                  <span className="label">Open Workspace</span>
                  <span className="key">⌘ ⇧ O</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <StatusBar
        workspaceFolders={workspaceFolders}
        file={currentFile}
        cursor={cursorPosition}
        settings={editorSettings}
        theme={theme}
        onToggleTerminal={() => setShowTerminal((v) => !v)}
        aiCliShortcuts={
          workspaceFolders.length > 0 ? (
            <AiCliShortcuts runPreparedCommand={runCliLineInTerminal} />
          ) : undefined
        }
      />
      {showQuickOpen && (
        <QuickOpen
          rootPaths={workspaceFolders}
          onOpenFile={openFile}
          commands={quickCommands}
          onClose={() => setShowQuickOpen(false)}
        />
      )}
    </div>
  );
}
