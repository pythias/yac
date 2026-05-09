# Tab 右键菜单 Design Spec

**日期**: 2026-05-09

---

## 1. 概述

为 Editor Tab 和 Terminal Tab 分别实现右键菜单，复用现有 `ContextMenu` 组件。

---

## 2. Editor Tab 右键菜单

### 菜单项

| 项 | 行为 |
|---|---|
| 关闭 | 关闭被右键的 tab |
| 关闭其他 | 关闭除被右键 tab 以外的所有 tab |
| 关闭右侧 | 关闭在被右键 tab 右侧的所有 tab，保留被右键 tab 本身 |

### 组件改动：`EditorTabs.tsx`

新增内部状态：
```ts
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetPath: string } | null>(null);
```

每个 tab div 添加：
```tsx
onContextMenu={(e) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, targetPath: f.path });
}}
```

渲染 `ContextMenu` 组件，传入 3 个菜单项，`onClose` 时 `setContextMenu(null)`。

新增 Props：
```ts
onCloseOthers: (path: string) => void;
onCloseRight: (path: string) => void;
```

### App.tsx 新增 Handler

```ts
// 只保留目标 tab，activeFile 切到它
const closeOthers = useCallback((path: string) => {
  setOpenFiles((prev) => prev.filter((f) => f.path === path));
  setActiveFile(path);
}, []);

// 关闭目标 tab 右侧所有 tab
const closeRight = useCallback((path: string) => {
  setOpenFiles((prev) => {
    const idx = prev.findIndex((f) => f.path === path);
    if (idx === -1) return prev;
    const next = prev.slice(0, idx + 1);
    // 若当前激活的 tab 在被关闭范围内，切换到目标 tab
    setActiveFile((active) =>
      next.find((f) => f.path === active) ? active : path
    );
    return next;
  });
}, []);
```

---

## 3. Terminal Tab 右键菜单

### TermTab 数据扩展

```ts
interface TermTab {
  // 现有字段不变
  id: number;
  ptyId: number;
  terminal: Terminal;
  fitAddon: FitAddon;
  containerEl: HTMLDivElement;
  title: string;
  // 新增
  color?: string;  // tab 底部高亮线颜色，默认 "#0af"
  icon?: string;   // tab 前缀 emoji，默认无
}
```

### 菜单项

| 项 | 行为 |
|---|---|
| 关闭 | 复用 `handleCloseTab(targetIndex)` |
| 重命名 | 复用 `setEditingTab(targetIndex)`（与双击行为一致） |
| 改变颜色 | 内联展示 8 个色块，点选后更新 `tab.color` |
| 改变图标 | 内联展示 10 个 emoji，点选后更新 `tab.icon` |

### 预设颜色（8种）

```ts
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
```

> 注：加上默认色共 9 个色块。

### 预设 Emoji（10个）

```ts
const PRESET_ICONS = ["🚀", "🔥", "⚡", "🐛", "🌿", "📦", "🔧", "🎯", "💻", "🌐"];
```

### 组件内部状态

```ts
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  targetIndex: number;
  submenu: "color" | "icon" | null;
} | null>(null);
```

### Tab 渲染

- 底部高亮线：`borderBottom: i === activeTab ? \`1px solid ${tab.color ?? "#0af"}\` : "none"`
- 标题：`{tab.icon ? tab.icon + " " : ""}{tab.title}`

### 颜色/图标选择器渲染

不使用二级弹出菜单，直接在 `ContextMenu` 下方内联渲染色板或 emoji 网格：

```tsx
// 色板示例（在 ContextMenu 同级，绝对定位跟随菜单）
<div className="tab-color-picker" style={{ left: x, top: y + menuHeight }}>
  {PRESET_COLORS.map((c) => (
    <div
      key={c.value}
      className="color-swatch"
      style={{ background: c.value }}
      onClick={() => applyColor(targetIndex, c.value)}
    />
  ))}
</div>
```

关闭时机：点选颜色/emoji 后自动关闭；点击外部或 Escape 关闭（复用 `ContextMenu` 现有逻辑）。

---

## 4. 不涉及范围

- Terminal tab 无"关闭其他"/"关闭右侧"（需保留至少一个 terminal）
- 颜色/图标不持久化（刷新后重置）
- 不支持自定义输入颜色或 emoji

---

## 5. 文件改动清单

| 文件 | 改动类型 |
|---|---|
| `ui/src/components/EditorTabs.tsx` | 修改：添加右键菜单状态 + onContextMenu + 新 props |
| `ui/src/App.tsx` | 修改：新增 closeOthers / closeRight handler，传给 EditorTabs |
| `ui/src/components/TerminalPanel.tsx` | 修改：TermTab 扩展字段 + 右键菜单状态 + 颜色/图标选择器 |
| `ui/src/styles.css` | 修改：新增 `.color-swatch` / `.tab-icon-picker` 样式 |
