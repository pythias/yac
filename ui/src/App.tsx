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
  const saved = useRef(loadState());
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(saved.current.activeFile || null);
  const [showTerminal, setShowTerminal] = useState(saved.current.showTerminal !== false);
  const [rootPath, setRootPath] = useState<string | null>(saved.current.rootPath || null);
  const terminalRef = useRef<TerminalPanelHandle>(null);

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

  const currentFile = openFiles.find((f) => f.path === activeFile) || null;

  return (
    <div className="app">
      <div className="titlebar">Yac IDE{rootPath ? ` — ${rootPath}` : ""}</div>
      <div className="main-content">
        <Sidebar
          rootPath={rootPath}
          setRootPath={setRootPath}
          onOpenFile={openFile}
          onOpenTerminal={handleOpenTerminal}
        />
        <div className="editor-area">
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
              />
            )}
            {!currentFile && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#666" }}>
                Open a file from the sidebar
              </div>
            )}
          </div>
          {showTerminal && (
            <div className="terminal-container">
              <TerminalPanel ref={terminalRef} cwd={rootPath} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
