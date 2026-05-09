# Tab 右键菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Editor Tab 添加"关闭/关闭其他/关闭右侧"右键菜单，为 Terminal Tab 添加"关闭/重命名/改变颜色/改变图标"右键菜单。

**Architecture:** Editor Tab 的右键菜单通过新增 props 将操作委托给 App.tsx 的 handler；Terminal Tab 的右键菜单完全在 TerminalPanel 内部实现，包含颜色和 emoji 内联选择器。两者均复用现有 ContextMenu 组件。

**Tech Stack:** React 18 + TypeScript 5，现有 ContextMenu 组件

---

## 文件改动清单

| 文件 | 改动 |
|---|---|
| `ui/src/components/EditorTabs.tsx` | 新增内部状态 + onContextMenu + 2 个新 props |
| `ui/src/App.tsx` | 新增 closeOthers / closeRight handler，传给 EditorTabs |
| `ui/src/components/TerminalPanel.tsx` | TermTab 接口扩展 + 右键菜单状态 + 颜色/图标选择器 |
| `ui/src/styles.css` | 新增 `.color-swatch` / `.tab-color-picker` / `.tab-icon-picker` 样式 |

---

## Task 1: App.tsx — closeOthers / closeRight handler

**Files:**
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: 在 App.tsx 的 closeFile handler 之后新增 closeOthers**

打开 `ui/src/App.tsx`，在 `closeFile` useCallback（约第 96 行）之后插入：

```tsx
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
```

- [ ] **Step 2: 将新 handler 传给 EditorTabs**

找到 `<EditorTabs` 的 JSX（约第 147 行），添加两个 props：

```tsx
<EditorTabs
  files={openFiles}
  activeFile={activeFile}
  onSelect={setActiveFile}
  onClose={closeFile}
  onCloseOthers={closeOthers}
  onCloseRight={closeRight}
/>
```

- [ ] **Step 3: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit
```

预期：报错提示 EditorTabs Props 缺少新字段（正常，Task 2 修复）

- [ ] **Step 4: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/App.tsx
git commit -m "feat: add closeOthers/closeRight handlers in App"
```

---

## Task 2: EditorTabs.tsx — 右键菜单

**Files:**
- Modify: `ui/src/components/EditorTabs.tsx`

- [ ] **Step 1: 更新 Props 接口，新增内部状态，添加 onContextMenu**

将 `ui/src/components/EditorTabs.tsx` 全量替换为：

```tsx
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
```

- [ ] **Step 2: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit
```

预期：无报错

- [ ] **Step 3: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/components/EditorTabs.tsx
git commit -m "feat: add context menu to editor tabs"
```

---

## Task 3: styles.css — 颜色/图标选择器样式

**Files:**
- Modify: `ui/src/styles.css`

- [ ] **Step 1: 在 styles.css 末尾追加样式**

在 `ui/src/styles.css` 文件末尾追加：

```css
/* Tab color picker */
.tab-color-picker {
  position: fixed;
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 4px;
  padding: 8px;
  z-index: 10000;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 168px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  flex-shrink: 0;
}

.color-swatch:hover {
  border-color: #fff;
}

/* Tab icon picker */
.tab-icon-picker {
  position: fixed;
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 4px;
  padding: 8px;
  z-index: 10000;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: 168px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.tab-icon-picker span {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  font-size: 16px;
}

.tab-icon-picker span:hover {
  background: #094771;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/styles.css
git commit -m "feat: add styles for tab color/icon pickers"
```

---

## Task 4: TerminalPanel.tsx — 右键菜单 + 颜色/图标选择器

**Files:**
- Modify: `ui/src/components/TerminalPanel.tsx`

- [ ] **Step 1: 扩展 TermTab 接口，添加常量**

在文件顶部 `TermTab` 接口（第 7 行）中添加两个可选字段，并在接口定义之后添加常量：

将：
```ts
interface TermTab {
  id: number;
  ptyId: number;
  terminal: Terminal;
  fitAddon: FitAddon;
  containerEl: HTMLDivElement;
  title: string;
}
```

改为：
```ts
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
```

- [ ] **Step 2: 新增 contextMenu 状态**

在 `TerminalPanel` 组件内，紧接 `editingTab` state 之后添加：

```ts
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  targetIndex: number;
  submenu: "color" | "icon" | null;
} | null>(null);
```

- [ ] **Step 3: 更新 tab 渲染 — 底部高亮线颜色、图标前缀、onContextMenu**

找到 `.terminal-tab-item` 的 div（约第 194 行），将其 style 和内容更新为：

```tsx
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
```

- [ ] **Step 4: 在 JSX 末尾（`</>` 之前）添加右键菜单和选择器渲染**

在 `return` 的 `</>` 结束标签之前添加：

```tsx
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
        action: () => setContextMenu((prev) => prev ? { ...prev, submenu: "color" } : null),
      },
      {
        label: "改变图标",
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
```

- [ ] **Step 5: 在文件顶部 import 中添加 ContextMenu**

在 `TerminalPanel.tsx` 顶部添加 import：

```ts
import ContextMenu from "./ContextMenu";
```

- [ ] **Step 6: 为颜色/图标选择器添加点击外部关闭逻辑**

颜色/图标选择器没有复用 ContextMenu 的关闭逻辑，需要在 `useEffect` 中处理 mousedown 关闭。在 `TerminalPanel` 组件内的现有 useEffect 之后添加：

```tsx
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
```

- [ ] **Step 7: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit
```

预期：无报错

- [ ] **Step 8: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/components/TerminalPanel.tsx
git commit -m "feat: add context menu with color/icon picker to terminal tabs"
```

---

## Task 5: 手动验证

- [ ] **Step 1: 启动开发模式**

```bash
cd /Users/chenjie/Code/rust/yac
cargo tauri dev
```

- [ ] **Step 2: 验证 Editor Tab 右键菜单**

  1. 打开 2 个以上文件
  2. 右键任意 tab → 菜单出现，包含"关闭"/"关闭其他"/"关闭右侧"
  3. 点击"关闭其他" → 仅保留被右键的 tab，该 tab 变为 active
  4. 重新打开多个文件，右键非最后一个 tab → 点击"关闭右侧" → 右侧 tab 全部关闭，被右键 tab 保留
  5. 点击外部或按 Escape → 菜单关闭

- [ ] **Step 3: 验证 Terminal Tab 右键菜单**

  1. 新建 2 个终端 tab
  2. 右键任意 terminal tab → 菜单出现，包含"关闭"/"重命名"/"改变颜色"/"改变图标"
  3. 点击"改变颜色" → 色板出现，点选一种颜色 → 该 tab 底部线变色，菜单关闭
  4. 点击"改变图标" → emoji 选择器出现，点选一个 emoji → tab 标题前缀出现该 emoji，菜单关闭
  5. 点击"重命名" → 进入编辑状态（与双击行为一致）
  6. 点击"关闭" → tab 关闭，PTY 释放
  7. 在色板/emoji 选择器出现时点击外部 → 选择器关闭
