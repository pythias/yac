import { useState, useCallback, useEffect, useRef } from "react";
import Sidebar from "./components/Sidebar";
import EditorTabs from "./components/EditorTabs";
import MonacoEditor from "./components/MonacoEditor";
import TerminalPanel, { TerminalPanelHandle } from "./components/TerminalPanel";
import QuickOpen from "./components/QuickOpen";
import SettingsPanel, { EditorSettings } from "./components/SettingsPanel";

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

interface SavedState {
  rootPath: string | null;
  openFiles: { path: string; name: string }[];
  activeFile: string | null;
  showTerminal: boolean;
}

const STATE_KEY = "yac-ide-state";

function loadState(): Partial<SavedState> {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveState(state: SavedState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

export default function App() {
  // Initialize data-theme immediately to avoid flash on first render
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme =
      localStorage.getItem("yac-theme") || "dark";
  }

  const saved = useRef(loadState());
  
  // Use rootPath from initial data if available (passed from new window spawn)
  const getInitialPath = () => {
    // Check URL params first (standard way to pass data to new windows)
    const params = new URLSearchParams(window.location.search);
    const paramPath = params.get("rootPath");
    if (paramPath) return paramPath;

    // Fallback to metadata
    const windowArgs = (window as any).__TAURI_METADATA__?.__args;
    if (windowArgs?.rootPath) return windowArgs.rootPath;

    return saved.current.rootPath || null;
  };

  const initialRootPath = getInitialPath();
  const isNewWindowWithPath = initialRootPath !== (saved.current.rootPath || null);

  const [openFiles, setOpenFiles] = useState<OpenFile[]>(() =>
    isNewWindowWithPath ? [] : ((saved.current.openFiles || []) as OpenFile[])
  );
  const [activeFile, setActiveFile] = useState<string | null>(() =>
    isNewWindowWithPath ? null : (saved.current.activeFile || null)
  );
  const [showTerminal, setShowTerminal] = useState(saved.current.showTerminal !== false);
  const [rootPath, setRootPath] = useState<string | null>(initialRootPath);
  const terminalRef = useRef<TerminalPanelHandle>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

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
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => {
    try {
      const raw = localStorage.getItem("yac-editor-settings");
      if (raw) return JSON.parse(raw);
    } catch {}
    return { fontSize: 14, tabSize: 4, wordWrap: "off" };
  });

  const [openInNewWindow, setOpenInNewWindow] = useState(
    () => localStorage.getItem("yac-open-new-window") === "true"
  );

  const handleSaveSettings = useCallback((editor: EditorSettings, newTheme: string, newWindow: boolean) => {
    setEditorSettings(editor);
    setTheme(newTheme);
    setOpenInNewWindow(newWindow);
    localStorage.setItem("yac-editor-settings", JSON.stringify(editor));
    localStorage.setItem("yac-theme", newTheme);
    localStorage.setItem("yac-open-new-window", String(newWindow));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("yac-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("yac-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

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
          const content = await invoke<string>("read_file", { path: f.path });
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
  }, []);

  // 持久化状态
  useEffect(() => {
    const state: SavedState = {
      rootPath,
      openFiles: openFiles.map((f) => ({ path: f.path, name: f.name })),
      activeFile,
      showTerminal,
    };
    saveState(state);
  }, [rootPath, openFiles, activeFile, showTerminal]);

  const openFile = useCallback(async (path: string, name: string) => {
    if (openFiles.find((f) => f.path === path)) {
      setActiveFile(path);
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const content = await invoke<string>("read_file", { path });
      const file: OpenFile = { path, name, content, dirty: false };
      setOpenFiles((prev) => [...prev, file]);
      setActiveFile(path);
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  }, [openFiles]);

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
      await invoke("write_file", { path, content: file.content });
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === path ? { ...f, dirty: false } : f))
      );
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }, [openFiles]);

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
      if (mod && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        setShowQuickOpen((v) => !v);
      }
      if (mod && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setShowSearchPanel((v) => !v);
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        setShowSettings((v) => !v);
      }
      if (mod && e.key === "w") {
        e.preventDefault();
        if (openFiles.length === 0) {
          if (window.confirm("Close window?")) {
            (async () => {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              getCurrentWindow().close();
            })();
          }
        } else if (activeFile) {
          closeFile(activeFile);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeFile, activeFile, openFiles]);

  return (
    <div className="app">
      <div className="titlebar">
        <span>Yac IDE{rootPath ? ` — ${rootPath}` : ""}</span>
        <button
          className="titlebar-settings-btn"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <i className="fa-solid fa-gear"></i>
        </button>
      </div>
      <div className="main-content" ref={mainContentRef}>
        <Sidebar
          rootPath={rootPath}
          setRootPath={setRootPath}
          onOpenFile={openFile}
          onOpenTerminal={handleOpenTerminal}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          showSearch={showSearchPanel}
          onToggleSearch={() => setShowSearchPanel((v) => !v)}
        />
        <div
          className="editor-area"
          style={{ flexDirection: terminalPosition === "right" ? "row" : "column" }}
        >
          <div
            className={terminalPosition === "right" ? "editor-main" : undefined}
            style={
              terminalPosition === "bottom"
                ? { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }
                : { position: "relative" }
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
                  onChange={(val) => updateFileContent(currentFile.path, val)}
                  onSave={() => saveFile(currentFile.path)}
                  onReload={reloadFile}
                  settings={editorSettings}
                  theme={theme}
                />
              )}
              {!currentFile && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#666" }}>
                  Open a file from the sidebar
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
      </div>
      {showQuickOpen && (
        <QuickOpen
          rootPath={rootPath}
          onOpenFile={openFile}
          onClose={() => setShowQuickOpen(false)}
        />
      )}
      {showSettings && (
        <SettingsPanel
          settings={editorSettings}
          theme={theme}
          openInNewWindow={openInNewWindow}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
