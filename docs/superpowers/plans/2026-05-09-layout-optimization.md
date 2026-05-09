# Layout Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Sidebar 宽度可拖动调整，以及 Terminal 停靠位置切换（底部 ↔ 右侧）。

**Architecture:** App.tsx 持有 sidebarWidth / terminalPosition / terminalSize 三个 state 并持久化到 localStorage；Sidebar 接收 width/onWidthChange prop 并内置 drag handle；TerminalPanel 接收 position/onTogglePosition prop，暴露 fitAll() handle，Tab 栏右侧增加切换按钮。

**Tech Stack:** React 18 + TypeScript 5，CSS flex 布局，无新依赖

---

## 文件改动清单

| 文件 | 改动 |
|---|---|
| `ui/src/styles.css` | 新增 sidebar drag handle 样式 + terminal right 布局样式 + terminal drag handle 样式 |
| `ui/src/components/Sidebar.tsx` | 新增 width / onWidthChange props + drag handle div |
| `ui/src/components/TerminalPanel.tsx` | 新增 position / onTogglePosition props + fitAll handle + 切换按钮 |
| `ui/src/App.tsx` | 新增 3 个 state + localStorage 持久化 + 布局分支 JSX + terminal drag handle 逻辑 |

---

## Task 1: styles.css — 新增布局相关样式

**Files:**
- Modify: `ui/src/styles.css`

- [ ] **Step 1: 在 styles.css 末尾追加以下样式**

```css
/* Sidebar resize handle */
.sidebar-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.sidebar-resize-handle:hover,
.sidebar-resize-handle.dragging {
  background: #0af;
}

/* Terminal drag handle (bottom mode: top edge; right mode: left edge) */
.terminal-drag-handle-h {
  height: 4px;
  cursor: row-resize;
  background: transparent;
  flex-shrink: 0;
}

.terminal-drag-handle-h:hover,
.terminal-drag-handle-h.dragging {
  background: #0af;
}

.terminal-drag-handle-v {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
}

.terminal-drag-handle-v:hover,
.terminal-drag-handle-v.dragging {
  background: #0af;
}

/* editor-main wrapper used in right mode */
.editor-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

/* terminal-container right mode override */
.terminal-container.right {
  border-top: none;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: 同时修改 .sidebar 规则 — 去掉固定 width，加 position: relative**

找到现有 `.sidebar` 规则：
```css
.sidebar {
  width: 220px;
  min-width: 180px;
  background: #252526;
  border-right: 1px solid #333;
  overflow-y: auto;
  font-size: 13px;
}
```

替换为：
```css
.sidebar {
  position: relative;
  min-width: 140px;
  max-width: 400px;
  background: #252526;
  border-right: 1px solid #333;
  overflow-y: auto;
  font-size: 13px;
  flex-shrink: 0;
}
```

- [ ] **Step 3: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit 2>&1
```

预期：无报错（CSS 改动不影响类型）

- [ ] **Step 4: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/styles.css
git commit -m "feat: add drag handle and terminal layout styles"
```

---

## Task 2: Sidebar.tsx — 宽度 prop + drag handle

**Files:**
- Modify: `ui/src/components/Sidebar.tsx`

- [ ] **Step 1: 新增 width / onWidthChange props，更新根元素 style，添加 drag handle**

找到 Props 接口：
```ts
interface Props {
  rootPath: string | null;
  setRootPath: (path: string) => void;
  onOpenFile: (path: string, name: string) => void;
  onOpenTerminal?: (cwd: string) => void;
}
```

替换为：
```ts
interface Props {
  rootPath: string | null;
  setRootPath: (path: string) => void;
  onOpenFile: (path: string, name: string) => void;
  onOpenTerminal?: (cwd: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
}
```

- [ ] **Step 2: 更新组件签名，添加 drag handle 逻辑**

找到：
```ts
export default function Sidebar({ rootPath, setRootPath, onOpenFile, onOpenTerminal }: Props) {
```

替换为：
```ts
export default function Sidebar({ rootPath, setRootPath, onOpenFile, onOpenTerminal, width, onWidthChange }: Props) {
```

在组件体内（useState 之后）添加 drag handle handler：
```tsx
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
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
};
```

- [ ] **Step 3: 更新根元素 style，在末尾添加 drag handle div**

找到 Sidebar 组件 return 语句中根元素（`<div className="sidebar"`），添加 style prop：

```tsx
<div className="sidebar" style={{ width }}>
```

在根 div 的**最后一个子元素之后、`</div>` 关闭标签之前**添加：
```tsx
<div
  className="sidebar-resize-handle"
  onMouseDown={handleResizeMouseDown}
/>
```

- [ ] **Step 4: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit 2>&1
```

预期：报错提示 App.tsx 的 `<Sidebar>` 缺少 width/onWidthChange props（正常，Task 4 修复）

- [ ] **Step 5: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/components/Sidebar.tsx
git commit -m "feat: add resizable width to Sidebar"
```

---

## Task 3: TerminalPanel.tsx — position prop + fitAll + 切换按钮

**Files:**
- Modify: `ui/src/components/TerminalPanel.tsx`

- [ ] **Step 1: 扩展 TerminalPanelHandle 接口，新增 fitAll**

找到：
```ts
export interface TerminalPanelHandle {
  createTerminalWithCwd: (cwd: string) => void;
}
```

替换为：
```ts
export interface TerminalPanelHandle {
  createTerminalWithCwd: (cwd: string) => void;
  fitAll: () => void;
}
```

- [ ] **Step 2: 新增 position / onTogglePosition props**

找到：
```ts
interface Props {
  cwd: string | null;
}
```

替换为：
```ts
interface Props {
  cwd: string | null;
  position: "bottom" | "right";
  onTogglePosition: () => void;
}
```

更新组件签名：
```ts
const TerminalPanel = forwardRef<TerminalPanelHandle, Props>(({ cwd, position, onTogglePosition }, ref) => {
```

- [ ] **Step 3: 在 useImperativeHandle 中追加 fitAll**

找到：
```ts
useImperativeHandle(ref, () => ({
  createTerminalWithCwd: (dir: string) => {
    createTerminal(dir);
  },
}), [createTerminal]);
```

替换为：
```ts
useImperativeHandle(ref, () => ({
  createTerminalWithCwd: (dir: string) => {
    createTerminal(dir);
  },
  fitAll: () => {
    tabsRef.current.forEach((tab) => tab.fitAddon.fit());
  },
}), [createTerminal]);
```

- [ ] **Step 4: 在 terminal-tabs 栏右侧添加切换按钮**

找到 terminal-tabs div 中 `<button onClick={() => createTerminal()}>+</button>` 这一行，在其**之后**添加：

```tsx
<button
  title={position === "bottom" ? "移到右侧" : "移到底部"}
  onClick={onTogglePosition}
  style={{ marginLeft: "auto" }}
>
  {position === "bottom" ? "⊡" : "⊟"}
</button>
```

- [ ] **Step 5: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit 2>&1
```

预期：报错提示 App.tsx 的 `<TerminalPanel>` 缺少 position/onTogglePosition props（正常，Task 4 修复）

- [ ] **Step 6: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/components/TerminalPanel.tsx
git commit -m "feat: add position toggle and fitAll to TerminalPanel"
```

---

## Task 4: App.tsx — state + 持久化 + 布局分支 + terminal drag handle

**Files:**
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: 新增 3 个 state 及其 localStorage 持久化**

在现有 `const terminalRef` 之后插入：

```tsx
const [sidebarWidth, setSidebarWidth] = useState<number>(
  () => Number(localStorage.getItem("yac-sidebar-width")) || 220
);
const [terminalPosition, setTerminalPosition] = useState<"bottom" | "right">(
  () => (localStorage.getItem("yac-terminal-position") as "bottom" | "right") || "bottom"
);
const [terminalSize, setTerminalSize] = useState<number>(
  () => Number(localStorage.getItem("yac-terminal-size")) || 250
);

useEffect(() => {
  localStorage.setItem("yac-sidebar-width", String(sidebarWidth));
}, [sidebarWidth]);

useEffect(() => {
  localStorage.setItem("yac-terminal-position", terminalPosition);
}, [terminalPosition]);

useEffect(() => {
  localStorage.setItem("yac-terminal-size", String(terminalSize));
}, [terminalSize]);
```

- [ ] **Step 2: 新增 handleToggleTerminalPosition 和 terminal drag handle handler**

在现有 `handleOpenTerminal` useCallback 之后插入：

```tsx
const handleToggleTerminalPosition = useCallback(() => {
  setTerminalPosition((prev) => (prev === "bottom" ? "right" : "bottom"));
  setTimeout(() => terminalRef.current?.fitAll(), 50);
}, []);

const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  const isBottom = terminalPosition === "bottom";
  const startPos = isBottom ? e.clientY : e.clientX;
  const startSize = terminalSize;
  const onMove = (ev: MouseEvent) => {
    const delta = isBottom ? startPos - ev.clientY : startPos - ev.clientX;
    const next = Math.min(isBottom ? 600 : 700, Math.max(100, startSize + delta));
    setTerminalSize(next);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    setTimeout(() => terminalRef.current?.fitAll(), 50);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}, [terminalPosition, terminalSize]);
```

- [ ] **Step 3: 更新 Sidebar 调用，传入 width 和 onWidthChange**

找到：
```tsx
<Sidebar
  rootPath={rootPath}
  setRootPath={setRootPath}
  onOpenFile={openFile}
  onOpenTerminal={handleOpenTerminal}
/>
```

替换为：
```tsx
<Sidebar
  rootPath={rootPath}
  setRootPath={setRootPath}
  onOpenFile={openFile}
  onOpenTerminal={handleOpenTerminal}
  width={sidebarWidth}
  onWidthChange={setSidebarWidth}
/>
```

- [ ] **Step 4: 重写 editor-area 内的布局 JSX**

找到现有的 `<div className="editor-area">` 到 `</div>` 整块（约第 163-192 行），替换为：

```tsx
<div
  className="editor-area"
  style={{ flexDirection: terminalPosition === "right" ? "row" : "column" }}
>
  {/* editor-main: tabs + editor */}
  <div className={terminalPosition === "right" ? "editor-main" : undefined} style={terminalPosition === "bottom" ? { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" } : undefined}>
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
  </div>

  {/* terminal */}
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
      />
    </div>
  )}
</div>
```

- [ ] **Step 5: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit 2>&1
```

预期：无报错（0 errors）。如有报错请修复。

- [ ] **Step 6: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/App.tsx
git commit -m "feat: resizable sidebar and terminal position toggle"
```

---

## Task 5: 手动验证

- [ ] **Step 1: 启动**

```bash
cd /Users/chenjie/Code/rust/yac
cargo tauri dev
```

- [ ] **Step 2: 验证 Sidebar 宽度可拖动**

1. 鼠标移到 sidebar 右边缘 → cursor 变为 col-resize，出现蓝色高亮线
2. 拖动 → sidebar 宽度实时变化，范围 140-400px
3. 刷新页面 → 宽度恢复到拖动后的值（localStorage 持久化）

- [ ] **Step 3: 验证 Terminal 位置切换**

1. Terminal 默认在底部，tab 栏右侧有 `⊡` 按钮
2. 点击 `⊡` → terminal 移到右侧，按钮变为 `⊟`
3. 拖动 terminal 左边缘 drag handle → 宽度实时调整
4. 点击 `⊟` → terminal 移回底部
5. 拖动 terminal 上边缘 drag handle → 高度实时调整
6. 刷新页面 → position 和 size 恢复到切换前的值
