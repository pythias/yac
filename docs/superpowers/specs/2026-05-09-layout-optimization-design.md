# Layout Optimization Design Spec

**日期**: 2026-05-09

---

## 1. 概述

两项布局改进：
1. Sidebar 宽度可拖动调整
2. Terminal 停靠位置切换（底部 ↔ 右侧）

---

## 2. Sidebar 宽度可拖动

### 行为
- sidebar 右边缘有一个 4px 宽的 drag handle（透明，hover 时显示蓝色高亮线）
- 鼠标按下拖动时实时更新宽度
- 宽度范围：140px ~ 400px，默认 220px
- 宽度持久化到 localStorage（key: `yac-sidebar-width`）

### 实现方式
App.tsx 新增 `sidebarWidth` state，通过 prop 传给 Sidebar。Sidebar 内部放 drag handle div，监听 `mousedown` → 全局 `mousemove` + `mouseup`。

### 组件改动

**App.tsx**
```ts
const [sidebarWidth, setSidebarWidth] = useState<number>(
  () => Number(localStorage.getItem("yac-sidebar-width")) || 220
);
// 宽度变化时持久化
useEffect(() => {
  localStorage.setItem("yac-sidebar-width", String(sidebarWidth));
}, [sidebarWidth]);
```
`<Sidebar>` 新增 prop：`width={sidebarWidth}` / `onWidthChange={setSidebarWidth}`

**Sidebar.tsx**
新增 props：`width: number` / `onWidthChange: (w: number) => void`
根元素 style 改为 `{ width }`（原 CSS 固定 220px 改为由 prop 控制）
在组件内右边缘渲染 drag handle：

```tsx
const handleMouseDown = (e: React.MouseEvent) => {
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

**styles.css**
```css
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
.sidebar {
  position: relative; /* 新增，供 handle absolute 定位 */
  /* width 改为由 prop 控制，去掉固定 220px */
}
```

---

## 3. Terminal 停靠位置切换（底部 ↔ 右侧）

### 行为
- 默认底部（bottom），与现有布局一致
- 点击 terminal tab 栏右侧的切换按钮可切换到右侧（right）
- bottom 模式：terminal 在编辑器下方，高度固定（可拖动调整，默认 250px）
- right 模式：terminal 在编辑器右侧，宽度可拖动调整，默认 300px
- 切换后调用 `fitAll()` 重新适配所有 terminal 实例尺寸
- 位置持久化到 localStorage（key: `yac-terminal-position`）

### 切换按钮图标
- bottom 模式下显示 `⊡`（切换到右侧）
- right 模式下显示 `⊟`（切换到底部）
- 放在 terminal-tabs 栏最右侧，与 `+` 按钮相邻

### 布局结构变化

**bottom 模式（现有）：**
```
.editor-area (flex-direction: column)
  EditorTabs
  .editor-container
  .terminal-container (height: terminalSize)
```

**right 模式：**
```
.editor-area (flex-direction: row)
  .editor-main (flex-direction: column, flex: 1)
    EditorTabs
    .editor-container
  .terminal-container (width: terminalSize, border-left)
```

### 组件改动

**App.tsx**
```ts
const [terminalPosition, setTerminalPosition] = useState<"bottom" | "right">(
  () => (localStorage.getItem("yac-terminal-position") as "bottom" | "right") || "bottom"
);
const [terminalSize, setTerminalSize] = useState<number>(
  () => Number(localStorage.getItem("yac-terminal-size")) || 250
);
useEffect(() => {
  localStorage.setItem("yac-terminal-position", terminalPosition);
}, [terminalPosition]);
useEffect(() => {
  localStorage.setItem("yac-terminal-size", String(terminalSize));
}, [terminalSize]);
```

JSX 布局根据 `terminalPosition` 分支渲染：
- bottom：`<editor-area column>` 内底部放 terminal-container（height: terminalSize）
- right：`<editor-area row>` 内左侧 `<editor-main column>`，右侧 terminal-container（width: terminalSize）

两种模式均有 drag handle（bottom 时在 terminal 上边缘，right 时在 terminal 左边缘）。

传给 TerminalPanel 新 props：`position: "bottom" | "right"` / `onTogglePosition: () => void`

**TerminalPanel.tsx**
新增 props：`position: "bottom" | "right"` / `onTogglePosition: () => void`
新增 handle：`fitAll(): void`（遍历所有 tab 调用 `fitAddon.fit()`）
terminal-tabs 栏右侧添加切换按钮：
```tsx
<button title="切换布局" onClick={onTogglePosition}>
  {position === "bottom" ? "⊡" : "⊟"}
</button>
```
`useImperativeHandle` 追加 `fitAll`。

**TerminalPanelHandle 接口扩展：**
```ts
export interface TerminalPanelHandle {
  createTerminalWithCwd: (cwd: string) => void;
  fitAll: () => void;
}
```

切换时 App.tsx 调用：
```ts
const handleToggleTerminalPosition = useCallback(() => {
  setTerminalPosition((prev) => (prev === "bottom" ? "right" : "bottom"));
  setTimeout(() => terminalRef.current?.fitAll(), 50); // 等布局重排
}, []);
```

---

## 4. 不涉及范围
- Sidebar 折叠/展开按钮
- Terminal 最大化
- 拖动调整 sidebar 宽度不持久化 terminalSize 之外的其他尺寸

---

## 5. 文件改动清单

| 文件 | 改动 |
|---|---|
| `ui/src/App.tsx` | 新增 sidebarWidth / terminalPosition / terminalSize state + 布局分支 + drag handle 逻辑 |
| `ui/src/components/Sidebar.tsx` | 新增 width / onWidthChange props + drag handle |
| `ui/src/components/TerminalPanel.tsx` | 新增 position / onTogglePosition props + fitAll handle + 切换按钮 |
| `ui/src/styles.css` | sidebar-resize-handle 样式 + terminal right 布局样式 + terminal drag handle 样式 |
