import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, memo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
// import { WebglAddon } from "@xterm/addon-webgl"; // Often causes flickering or artifacts in some environments
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import ContextMenu from "./ContextMenu";
import { pathBasename } from "../pathUtils";

interface TermTab {
  id: number;
  ptyId: number;
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  containerEl: HTMLDivElement;
  title: string;
  color?: string;
  icon?: string;
}

const PRESET_COLORS = [
  { label: "默认", value: "#0af" },
  { label: "黑",   value: "#333" },
  { label: "白",   value: "#eee" },
  { label: "蓝",   value: "#4fc3f7" },
  { label: "绿",   value: "#81c784" },
  { label: "红",   value: "#e57373" },
  { label: "黄",   value: "#ffd54f" },
  { label: "紫",   value: "#ce93d8" },
  { label: "橙",   value: "#ffb74d" },
];

const PRESET_ICONS = [
  "terminal",      "code",          "bolt",          "bug",
  "server",        "database",      "code-branch",   "cube",
  "rocket",        "gear",          "flask",         "fire",
  "layer-group",   "network-wired", "microchip",     "folder",
  "play",          "key",           "cloud",         "leaf",
];

function expandHex(hex: string): string {
  const h = hex.replace("#", "");
  return h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
}

function iconColor(bgColor: string): string {
  const hex = expandHex(bgColor);
  if (hex.length !== 6) return "#fff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 128 ? "#000" : "#fff";
}

interface Props {
  cwd: string | null;
  position: "bottom" | "right";
  onTogglePosition: () => void;
  theme: string;
}

const ANSI_COLORS = {
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

function getXtermTheme(theme: string) {
  const baseThemes: Record<string, any> = {
    dark: {
      background: "#1e1e1e",
      foreground: "#d4d4d4",
      cursor: "#d4d4d4",
      selectionBackground: "#264f78",
    },
    light: {
      background: "#ffffff",
      foreground: "#333333",
      cursor: "#333333",
      selectionBackground: "#add6ff",
    },
    monokai: {
      background: "#272822",
      foreground: "#f8f8f2",
      cursor: "#f8f8f0",
      selectionBackground: "#49483e",
    },
    "solarized-dark": {
      background: "#002b36",
      foreground: "#839496",
      cursor: "#819090",
      selectionBackground: "#073642",
    },
  };
  const base = baseThemes[theme] || baseThemes["dark"];
  return { ...base, ...ANSI_COLORS };
}

export interface TerminalPanelHandle {
  createTerminalWithCwd: (cwd: string) => void;
  fitAll: () => void;
  /** Write a full shell line (newline appended) to the active PTY; focuses xterm. */
  runLineInActiveTerminal: (line: string) => Promise<void>;
  /** Spawn a new terminal tab and write the line there (AI CLI shortcuts). */
  runLineInNewTerminal: (line: string) => Promise<void>;
}

interface PtyOutputEvent {
  ptyId: number;
  data: number[];
}

function getDirName(path: string): string {
  const base = pathBasename(path.replace(/[/\\]+$/, ""));
  return base || "Terminal";
}

interface TabItemProps {
  tab: TermTab;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onClose: () => void;
  canClose: boolean;
}

const TabItem = memo(({
  tab, index, isActive, isEditing, onClick, onDoubleClick, onContextMenu, onRename, onCancelRename, onClose, canClose
}: TabItemProps) => {
  return (
    <div
      className={`terminal-tab-item ${isActive ? 'active' : ''}`}
      style={{ borderBottom: isActive ? `1px solid ${tab.color ?? "#0af"}` : "none" }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {isEditing ? (
        <input
          autoFocus
          defaultValue={tab.title}
          style={{
            background: "transparent",
            border: "1px solid #555",
            color: "#ddd",
            fontSize: 11,
            width: 80,
            outline: "none",
          }}
          onBlur={(e) => onRename(e.target.value || tab.title)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename((e.target as HTMLInputElement).value || tab.title);
            } else if (e.key === "Escape") {
              onCancelRename();
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <div style={{
            width: 16, height: 16, borderRadius: 3,
            background: tab.color ?? "#0af",
            display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0,
          }}>
            <i
              className={`fa-solid fa-${tab.icon ?? "terminal"}`}
              style={{ fontSize: 9, color: iconColor(tab.color ?? "#0af") }}
            />
          </div>
          <span>{tab.title}</span>
        </>
      )}
      {canClose && (
        <span
          className="terminal-tab-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </span>
      )}
    </div>
  );
});

const TerminalPanel = forwardRef<TerminalPanelHandle, Props>(({ cwd, position, onTogglePosition, theme }, ref) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fitFrameRef = useRef<number | null>(null);
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [editingTab, setEditingTab] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetIndex: number;
    submenu: "color" | "icon" | null;
  } | null>(null);

  const safeSearch = useCallback((tab: TermTab | undefined, action: "findNext" | "findPrevious", query: string) => {
    if (!tab || !query) return;
    try {
      tab.searchAddon[action](query);
    } catch {
      // xterm-addon-search may panic on fresh terminals
    }
  }, []);

  const clearTerminal = useCallback((tab: TermTab | undefined) => {
    if (!tab) return;
    tab.terminal.clear();
    tab.terminal.scrollToBottom();
    tab.terminal.focus();
  }, []);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<TermTab[]>([]);
  const activeTabRef = useRef(0);

  tabsRef.current = tabs;

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const fitVisibleTerminal = useCallback((tab: TermTab | undefined, focus = false) => {
    if (!tab) return;
    if (fitFrameRef.current !== null) {
      cancelAnimationFrame(fitFrameRef.current);
    }
    fitFrameRef.current = requestAnimationFrame(() => {
      fitFrameRef.current = null;
      tab.fitAddon.fit();
      if (focus) tab.terminal.focus();
    });
  }, []);

  // Listen to PTY output
  useEffect(() => {
    const unlistenPromise = listen<PtyOutputEvent>("pty-output", (event) => {
      const { ptyId, data } = event.payload;
      const dataArray = new Uint8Array(data);
      for (const tab of tabsRef.current) {
        if (tab.ptyId === ptyId) {
          tab.terminal.write(dataArray);
          break;
        }
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  const createTerminal = useCallback(async (termCwd?: string | null) => {
    const { invoke } = await import("@tauri-apps/api/core");
    const effectiveCwd = termCwd || cwd || undefined;

    const term = new Terminal({
      theme: getXtermTheme(theme) as any,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      convertEol: true,
      // Disable some heavy options
      fastScrollModifier: "alt",
      screenReaderMode: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    term.attachCustomKeyEventHandler((event) => {
      const isCmdK =
        event.type === "keydown" &&
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k";

      if (isCmdK) {
        term.clear();
        term.scrollToBottom();
        return false;
      }

      return true;
    });

    // We removed WebglAddon as it can cause flickering in some Tauri/WebView environments
    // The canvas renderer is more stable for general use.

    const containerEl = document.createElement("div");
    containerEl.className = "xterm-pane";
    containerEl.style.width = "100%";
    containerEl.style.height = "100%";
    containerEl.style.visibility = "hidden";
    containerEl.style.position = "absolute";
    containerEl.style.inset = "0";
    containerEl.style.pointerEvents = "none";

    if (wrapperRef.current) {
      wrapperRef.current.appendChild(containerEl);
    }

    term.open(containerEl);
    
    // Measure and spawn PTY
    const dims = fitAddon.proposeDimensions();
    const cols = dims?.cols || 80;
    const rows = dims?.rows || 24;

    const ptyId = await invoke<number>("pty_spawn", { rows, cols, cwd: effectiveCwd });

    term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      invoke("pty_write", { id: ptyId, data: bytes });
    });

    term.onResize(({ cols, rows }) => {
      invoke("pty_resize", { id: ptyId, rows, cols });
    });

    const title = effectiveCwd ? getDirName(effectiveCwd) : `Terminal ${tabsRef.current.length + 1}`;

    const newTab: TermTab = {
      id: Date.now(),
      ptyId,
      terminal: term,
      fitAddon,
      searchAddon,
      containerEl,
      title,
    };

    setTabs((prev) => {
      const next = [...prev, newTab];
      setActiveTab(next.length - 1);
      return next;
    });

    return newTab;
  }, [cwd, theme]);

  const runLineInActiveTerminal = useCallback(
    async (line: string) => {
      const { invoke } = await import("@tauri-apps/api/core");
      for (let i = 0; i < 40 && tabsRef.current.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 16));
      }
      let tab =
        tabsRef.current[activeTabRef.current] ?? tabsRef.current[0];
      if (!tab) {
        tab = await createTerminal(cwd);
      }
      if (!tab) return;
      const nl = /Windows/i.test(navigator.userAgent) ? "\r\n" : "\n";
      const payload = line.replace(/\r?\n$/u, "") + nl;
      const bytes = Array.from(new TextEncoder().encode(payload));
      await invoke("pty_write", { id: tab.ptyId, data: bytes });
      tab.terminal.focus();
    },
    [cwd, createTerminal]
  );

  const runLineInNewTerminal = useCallback(
    async (line: string) => {
      const { invoke } = await import("@tauri-apps/api/core");
      const tab = await createTerminal(cwd);
      if (!tab) return;
      const nl = /Windows/i.test(navigator.userAgent) ? "\r\n" : "\n";
      const payload = line.replace(/\r?\n$/u, "") + nl;
      const bytes = Array.from(new TextEncoder().encode(payload));
      await invoke("pty_write", { id: tab.ptyId, data: bytes });
      tab.terminal.focus();
    },
    [cwd, createTerminal]
  );

  useImperativeHandle(ref, () => ({
    createTerminalWithCwd: (dir: string) => {
      createTerminal(dir);
    },
    fitAll: () => {
      tabsRef.current.forEach((tab) => {
        if (tab.containerEl.offsetParent) tab.fitAddon.fit();
      });
    },
    runLineInActiveTerminal,
    runLineInNewTerminal,
  }), [createTerminal, runLineInActiveTerminal, runLineInNewTerminal]);

  // Initial terminal
  useEffect(() => {
    let cancelled = false;
    let termTab: TermTab | null = null;
    createTerminal().then((tab) => {
      if (!cancelled && tab) termTab = tab;
    });
    return () => {
      cancelled = true;
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
        fitFrameRef.current = null;
      }
      if (termTab) {
        termTab.containerEl.remove();
        termTab.terminal.dispose();
      }
    };
  }, []);

  // Sync tab visibility and fit
  useEffect(() => {
    tabs.forEach((tab, i) => {
      const isVisible = i === activeTab;
      tab.containerEl.style.visibility = isVisible ? "visible" : "hidden";
      tab.containerEl.style.pointerEvents = isVisible ? "auto" : "none";
      tab.containerEl.style.zIndex = isVisible ? "1" : "0";
      if (isVisible) {
        fitVisibleTerminal(tab, true);
      }
    });
  }, [activeTab, tabs.length, fitVisibleTerminal]); // Only re-run when active tab index changes or tabs are added/removed

  // Handle window resize and position toggle
  useEffect(() => {
    const onResize = () => {
      const tab = tabs[activeTab];
      if (tab) tab.fitAddon.fit();
    };
    window.addEventListener("resize", onResize);
    
    // Fit all visible terminals when position changes
    tabs.forEach(tab => {
        if (tab.containerEl.style.visibility === "visible") {
            tab.fitAddon.fit();
        }
    });

    return () => window.removeEventListener("resize", onResize);
  }, [activeTab, tabs, position]);

  useEffect(() => {
    tabs.forEach((tab) => {
      tab.terminal.options.theme = getXtermTheme(theme) as any;
    });
  }, [theme, tabs]);

  const handleRenameTab = (index: number, newTitle: string) => {
    setTabs((prev) =>
      prev.map((tab, i) => (i === index ? { ...tab, title: newTitle } : tab))
    );
    setEditingTab(null);
  };

  const handleCloseTab = useCallback(async (index: number) => {
    const tab = tabsRef.current[index];
    if (!tab) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("pty_close", { id: tab.ptyId });
    } catch {}
    tab.containerEl.remove();
    tab.terminal.dispose();
    setTabs((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (activeTab >= next.length) {
        setActiveTab(Math.max(0, next.length - 1));
      } else if (activeTab > index) {
        setActiveTab(activeTab - 1);
      }
      return next;
    });
  }, [activeTab]);

  return (
    <>
      <div className="terminal-tabs">
        {tabs.map((tab, i) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={i}
            isActive={i === activeTab}
            isEditing={editingTab === i}
            onClick={() => setActiveTab(i)}
            onDoubleClick={() => setEditingTab(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, targetIndex: i, submenu: null });
            }}
            onRename={(title) => handleRenameTab(i, title)}
            onCancelRename={() => setEditingTab(null)}
            onClose={() => handleCloseTab(i)}
            canClose={tabs.length > 1}
          />
        ))}
        <button className="add-term-btn" onClick={() => createTerminal()}>+</button>
        <button
          className="toggle-pos-btn"
          title="Clear Terminal"
          onClick={() => clearTerminal(tabs[activeTab])}
        >
          <i className="fa-solid fa-broom"></i>
        </button>
        <button
          className="toggle-pos-btn"
          title={position === "bottom" ? "移到右侧" : "移到底部"}
          onClick={onTogglePosition}
          style={{ marginLeft: "auto" }}
        >
          {position === "bottom" ? "⊡" : "⊟"}
        </button>
      </div>
      {showSearch && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            placeholder="Find..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              safeSearch(tabs[activeTab], "findNext", e.target.value);
            }}
            onKeyDown={(e) => {
              const tab = tabs[activeTab];
              if (!tab) return;
              if (e.key === "Enter") {
                e.preventDefault();
                safeSearch(tab, e.shiftKey ? "findPrevious" : "findNext", searchQuery);
              } else if (e.key === "Escape") {
                setShowSearch(false);
                setSearchQuery("");
                tab.terminal.focus();
              }
            }}
          />
          <button onClick={() => safeSearch(tabs[activeTab], "findPrevious", searchQuery)}>▲</button>
          <button onClick={() => safeSearch(tabs[activeTab], "findNext", searchQuery)}>▼</button>
          <button onClick={() => {
            setShowSearch(false);
            setSearchQuery("");
          }}>✕</button>
        </div>
      )}
      <div className="terminal-body" ref={wrapperRef} />
      {contextMenu && contextMenu.submenu === null && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: "关闭",
              action: () => {
                handleCloseTab(contextMenu.targetIndex);
                setContextMenu(null);
              },
            },
            {
              label: "清屏",
              action: () => {
                clearTerminal(tabsRef.current[contextMenu.targetIndex]);
                setContextMenu(null);
              },
            },
            {
              label: "重命名",
              action: () => {
                setEditingTab(contextMenu.targetIndex);
                setContextMenu(null);
              },
            },
            {
              label: "改变颜色",
              keepOpen: true,
              action: () => setContextMenu((prev) => prev ? { ...prev, submenu: "color" } : null),
            },
            {
              label: "改变图标",
              keepOpen: true,
              action: () => setContextMenu((prev) => prev ? { ...prev, submenu: "icon" } : null),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
      {contextMenu && contextMenu.submenu === "color" && (
        <div
          className="tab-color-picker"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {PRESET_COLORS.map((c) => (
            <div
              key={c.value}
              className="color-swatch"
              style={{ background: c.value }}
              title={c.label}
              onClick={() => {
                setTabs((prev) =>
                  prev.map((t, i) =>
                    i === contextMenu.targetIndex ? { ...t, color: c.value } : t
                  )
                );
                setContextMenu(null);
              }}
            />
          ))}
        </div>
      )}
      {contextMenu && contextMenu.submenu === "icon" && (() => {
        const currentColor = tabs[contextMenu.targetIndex]?.color ?? "#0af";
        return (
          <div
            className="tab-icon-picker"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {PRESET_ICONS.map((iconName) => (
              <div
                key={iconName}
                className="icon-swatch"
                title={iconName}
                style={{ background: currentColor }}
                onClick={() => {
                  setTabs((prev) =>
                    prev.map((t, i) =>
                      i === contextMenu.targetIndex ? { ...t, icon: iconName } : t
                    )
                  );
                  setContextMenu(null);
                }}
              >
                <i
                  className={`fa-solid fa-${iconName}`}
                  style={{ fontSize: 11, color: iconColor(currentColor) }}
                />
              </div>
            ))}
          </div>
        );
      })()}
    </>
  );
});

export default TerminalPanel;
