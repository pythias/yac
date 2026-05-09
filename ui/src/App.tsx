import { useState, useCallback, useEffect, useRef } from "react";
import Sidebar from "./components/Sidebar";
import EditorTabs from "./components/EditorTabs";
import MonacoEditor from "./components/MonacoEditor";
import TerminalPanel, { TerminalPanelHandle } from "./components/TerminalPanel";

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
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(saved.current.activeFile || null);
  const [showTerminal, setShowTerminal] = useState(saved.current.showTerminal !== false);
  const [rootPath, setRootPath] = useState<string | null>(saved.current.rootPath || null);
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

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const remaining = prev.filter((f) => f.path !== path);
      if (activeFile === path) {
        setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
      }
      return remaining;
    });
  }, [activeFile]);

  const closeOthers = useCallback((path: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path === path));
    setActiveFile(path);
  }, []);

  const closeRight = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === path);
      if (idx === -1) return prev;
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
  }, [terminalPosition]);

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
  }, []);

  const currentFile = openFiles.find((f) => f.path === activeFile) || null;

  return (
    <div className="app">
      <div className="titlebar">
        <span>Yac IDE{rootPath ? ` — ${rootPath}` : ""}</span>
        <select
          className="theme-selector"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="monokai">Monokai</option>
          <option value="solarized-dark">Solarized Dark</option>
        </select>
      </div>
      <div className="main-content" ref={mainContentRef}>
        <Sidebar
          rootPath={rootPath}
          setRootPath={setRootPath}
          onOpenFile={openFile}
          onOpenTerminal={handleOpenTerminal}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
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
    </div>
  );
}
