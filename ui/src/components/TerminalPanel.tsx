import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import ContextMenu from "./ContextMenu";

interface TermTab {
  id: number;
  ptyId: number;
  terminal: Terminal;
  fitAddon: FitAddon;
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

const PRESET_ICONS = ["🚀", "🔥", "⚡", "🐛", "🌿", "📦", "🔧", "🎯", "💻", "🌐"];

interface Props {
  cwd: string | null;
  position: "bottom" | "right";
  onTogglePosition: () => void;
}

export interface TerminalPanelHandle {
  createTerminalWithCwd: (cwd: string) => void;
  fitAll: () => void;
}

interface PtyOutputEvent {
  ptyId: number;
  data: number[];
}

function getDirName(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "Terminal";
}

const TerminalPanel = forwardRef<TerminalPanelHandle, Props>(({ cwd, position, onTogglePosition }, ref) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [editingTab, setEditingTab] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetIndex: number;
    submenu: "color" | "icon" | null;
  } | null>(null);
  const tabsRef = useRef<TermTab[]>([]);

  tabsRef.current = tabs;

  // 监听 PTY 输出事件（只注册一次）
  useEffect(() => {
    const unlistenPromise = listen<PtyOutputEvent>("pty-output", (event) => {
      const { ptyId, data } = event.payload;
      for (const tab of tabsRef.current) {
        if (tab.ptyId === ptyId) {
          tab.terminal.write(new Uint8Array(data));
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
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#264f78",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
      fontSize: 13,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const cols = 80;
    const rows = 24;
    const ptyId = await invoke<number>("pty_spawn", { rows, cols, cwd: effectiveCwd });

    term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      invoke("pty_write", { id: ptyId, data: bytes });
    });

    const containerEl = document.createElement("div");
    containerEl.style.width = "100%";
    containerEl.style.height = "100%";
    containerEl.style.display = "none";

    if (wrapperRef.current) {
      wrapperRef.current.appendChild(containerEl);
    }

    term.open(containerEl);
    fitAddon.fit();

    const title = effectiveCwd ? getDirName(effectiveCwd) : `Terminal ${tabsRef.current.length + 1}`;

    const newTab: TermTab = {
      id: Date.now(),
      ptyId,
      terminal: term,
      fitAddon,
      containerEl,
      title,
    };

    setTabs((prev) => {
      const next = [...prev, newTab];
      setActiveTab(next.length - 1);
      return next;
    });

    return newTab;
  }, [cwd]);

  useImperativeHandle(ref, () => ({
    createTerminalWithCwd: (dir: string) => {
      createTerminal(dir);
    },
    fitAll: () => {
      tabsRef.current.forEach((tab) => tab.fitAddon.fit());
    },
  }), [createTerminal]);

  // 初始化第一个终端
  useEffect(() => {
    let cancelled = false;
    let termTab: TermTab | null = null;
    createTerminal().then((tab) => {
      if (!cancelled && tab) termTab = tab;
    });
    return () => {
      cancelled = true;
      if (termTab) {
        termTab.containerEl.remove();
        termTab.terminal.dispose();
      }
    };
  }, []);

  // 切换 tab 时控制 display 可见性
  useEffect(() => {
    tabs.forEach((tab, i) => {
      tab.containerEl.style.display = i === activeTab ? "block" : "none";
    });
    const active = tabs[activeTab];
    if (active) {
      active.fitAddon.fit();
      active.terminal.focus();
    }
  }, [activeTab, tabs]);

  // Window resize → fit active terminal
  useEffect(() => {
    const onResize = () => {
      const tab = tabs[activeTab];
      if (tab) tab.fitAddon.fit();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeTab, tabs]);

  useEffect(() => {
    if (!contextMenu?.submenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".tab-color-picker") && !target.closest(".tab-icon-picker")) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu?.submenu]);

  const handleRenameTab = (index: number, newTitle: string) => {
    setTabs((prev) =>
      prev.map((tab, i) => (i === index ? { ...tab, title: newTitle } : tab))
    );
    setEditingTab(null);
  };

  const handleCloseTab = async (index: number) => {
    const tab = tabs[index];
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
  };

  return (
    <>
      <div className="terminal-tabs">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            className="terminal-tab-item"
            style={{ borderBottom: i === activeTab ? `1px solid ${tab.color ?? "#0af"}` : "none" }}
            onClick={() => setActiveTab(i)}
            onDoubleClick={() => setEditingTab(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, targetIndex: i, submenu: null });
            }}
          >
            {editingTab === i ? (
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
                onBlur={(e) => handleRenameTab(i, e.target.value || tab.title)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRenameTab(i, (e.target as HTMLInputElement).value || tab.title);
                  } else if (e.key === "Escape") {
                    setEditingTab(null);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span>{tab.icon ? tab.icon + " " : ""}{tab.title}</span>
            )}
            {tabs.length > 1 && (
              <span
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(i);
                }}
              >
                ×
              </span>
            )}
          </div>
        ))}
        <button onClick={() => createTerminal()}>+</button>
        <button
          title={position === "bottom" ? "移到右侧" : "移到底部"}
          onClick={onTogglePosition}
          style={{ marginLeft: "auto" }}
        >
          {position === "bottom" ? "⊡" : "⊟"}
        </button>
      </div>
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
      {contextMenu && contextMenu.submenu === "icon" && (
        <div
          className="tab-icon-picker"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {PRESET_ICONS.map((emoji) => (
            <span
              key={emoji}
              title={emoji}
              onClick={() => {
                setTabs((prev) =>
                  prev.map((t, i) =>
                    i === contextMenu.targetIndex ? { ...t, icon: emoji } : t
                  )
                );
                setContextMenu(null);
              }}
            >
              {emoji}
            </span>
          ))}
        </div>
      )}
    </>
  );
});

export default TerminalPanel;