# Theme & App Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Yac IDE 添加 4 种预设主题切换（Dark/Light/Monokai/Solarized Dark）和 macOS Dock 图标。

**Architecture:** CSS 变量体系驱动主题切换，`document.documentElement.dataset.theme` 作为选择器；Monaco Editor 通过 `theme` prop 同步；图标用 Python + iconutil 生成 icns 文件并注册到 tauri.conf.json。

**Tech Stack:** React 18 + TypeScript 5，CSS 自定义属性，@monaco-editor/react，Python 3 + Pillow，macOS iconutil

---

## 文件改动清单

| 文件 | 改动 |
|---|---|
| `ui/src/styles.css` | 所有硬编码颜色替换为 CSS 变量 + 4 套主题变量 + theme-selector 样式 |
| `ui/src/App.tsx` | 新增 theme state + data-theme 同步 + 主题选择器 UI + 传 theme prop 给 MonacoEditor |
| `ui/src/components/MonacoEditor.tsx` | 新增 theme prop + Monokai 注册 + 主题同步 useEffect |
| `src-tauri/icons/icon.icns` | 新增（Python 脚本生成） |
| `src-tauri/icons/icon.png` | 替换（1024x1024 新图标） |
| `src-tauri/tauri.conf.json` | 追加 icon.icns 到 bundle.icon |

---

## Task 1: 生成 macOS 图标文件

**Files:**
- Create: `src-tauri/icons/icon.icns`
- Modify: `src-tauri/icons/icon.png`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 运行图标生成脚本**

创建临时脚本 `/tmp/gen_icon.py`，内容如下：

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["Pillow"]
# ///
import subprocess, os, shutil
from PIL import Image

src = "/Users/chenjie/Library/Application Support/WeiboAP/Data/agents/agent_1776755426432_rldi8hwpw/425f1ce8.png"
iconset_dir = "/tmp/yac.iconset"
os.makedirs(iconset_dir, exist_ok=True)

sizes = [16, 32, 64, 128, 256, 512, 1024]
img = Image.open(src).convert("RGBA")

for s in sizes:
    img.resize((s, s), Image.LANCZOS).save(f"{iconset_dir}/icon_{s}x{s}.png")
    if s <= 512:
        img.resize((s*2, s*2), Image.LANCZOS).save(f"{iconset_dir}/icon_{s}x{s}@2x.png")

subprocess.run(
    ["iconutil", "-c", "icns", iconset_dir,
     "-o", "/Users/chenjie/Code/rust/yac/src-tauri/icons/icon.icns"],
    check=True
)

img.resize((1024, 1024), Image.LANCZOS).save(
    "/Users/chenjie/Code/rust/yac/src-tauri/icons/icon.png"
)

shutil.rmtree(iconset_dir)
print("Done: icon.icns + icon.png generated")
```

执行：
```bash
uv run /tmp/gen_icon.py
```

预期输出：`Done: icon.icns + icon.png generated`

验证：
```bash
ls -lh /Users/chenjie/Code/rust/yac/src-tauri/icons/
```

预期：`icon.icns`（> 100KB）和 `icon.png` 均存在

- [ ] **Step 2: 更新 tauri.conf.json**

文件路径：`/Users/chenjie/Code/rust/yac/src-tauri/tauri.conf.json`

找到：
```json
"icon": [
  "icons/icon.png"
]
```

替换为：
```json
"icon": [
  "icons/icon.png",
  "icons/icon.icns"
]
```

- [ ] **Step 3: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add src-tauri/icons/icon.icns src-tauri/icons/icon.png src-tauri/tauri.conf.json
git commit -m "feat: add macOS dock icon (icns)"
```

---

## Task 2: styles.css — CSS 变量体系 + 4 套主题

**Files:**
- Modify: `ui/src/styles.css`

- [ ] **Step 1: 在 styles.css 文件顶部（`* { ... }` 之前）插入 4 套主题变量**

在文件最开头插入：

```css
/* ── Theme Variables ─────────────────────────────── */
:root[data-theme="dark"] {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #323233;
  --bg-hover: #2a2d2e;
  --bg-active: #37373d;
  --text-primary: #d4d4d4;
  --text-secondary: #888;
  --border-color: #333;
  --accent-color: #0af;
  --tab-active-bg: #1e1e1e;
  --context-menu-bg: #2d2d30;
  --context-menu-border: #454545;
  --context-menu-hover: #094771;
}

:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f3f3;
  --bg-tertiary: #dddddd;
  --bg-hover: #e8e8e8;
  --bg-active: #d0d0d0;
  --text-primary: #1e1e1e;
  --text-secondary: #555;
  --border-color: #ccc;
  --accent-color: #0066cc;
  --tab-active-bg: #ffffff;
  --context-menu-bg: #ffffff;
  --context-menu-border: #ccc;
  --context-menu-hover: #e0eeff;
}

:root[data-theme="monokai"] {
  --bg-primary: #272822;
  --bg-secondary: #1e1f1b;
  --bg-tertiary: #1a1b18;
  --bg-hover: #3e3d32;
  --bg-active: #49483e;
  --text-primary: #f8f8f2;
  --text-secondary: #75715e;
  --border-color: #49483e;
  --accent-color: #a6e22e;
  --tab-active-bg: #272822;
  --context-menu-bg: #1e1f1b;
  --context-menu-border: #49483e;
  --context-menu-hover: #49483e;
}

:root[data-theme="solarized-dark"] {
  --bg-primary: #002b36;
  --bg-secondary: #073642;
  --bg-tertiary: #073642;
  --bg-hover: #0d4251;
  --bg-active: #124f5e;
  --text-primary: #839496;
  --text-secondary: #586e75;
  --border-color: #073642;
  --accent-color: #268bd2;
  --tab-active-bg: #002b36;
  --context-menu-bg: #073642;
  --context-menu-border: #124f5e;
  --context-menu-hover: #124f5e;
}
/* ─────────────────────────────────────────────────── */

```

- [ ] **Step 2: 将 styles.css 中所有硬编码颜色替换为 CSS 变量**

逐一替换以下规则中的颜色（**只改颜色值，不改其他属性**）：

```css
/* html, body, #root */
background: #1e1e1e;  →  background: var(--bg-primary);
color: #d4d4d4;        →  color: var(--text-primary);

/* .titlebar */
background: #323233;  →  background: var(--bg-tertiary);
color: #999;           →  color: var(--text-secondary);

/* .sidebar */
background: #252526;  →  background: var(--bg-secondary);
border-right: 1px solid #333;  →  border-right: 1px solid var(--border-color);

/* .sidebar-header */
color: #888;  →  color: var(--text-secondary);

/* .file-tree-item:hover */
background: #2a2d2e;  →  background: var(--bg-hover);

/* .file-tree-item.active */
background: #37373d;  →  background: var(--bg-active);

/* .tabs */
background: #2d2d2d;  →  background: var(--bg-secondary);
border-bottom: 1px solid #333;  →  border-bottom: 1px solid var(--border-color);

/* .tab */
border-right: 1px solid #333;  →  border-right: 1px solid var(--border-color);

/* .tab.active */
background: #1e1e1e;           →  background: var(--tab-active-bg);
border-bottom: 1px solid #1e1e1e;  →  border-bottom: 1px solid var(--tab-active-bg);

/* .terminal-container */
border-top: 1px solid #333;  →  border-top: 1px solid var(--border-color);
background: #1e1e1e;          →  background: var(--bg-primary);

/* .terminal-tabs */
background: #252526;  →  background: var(--bg-secondary);

/* .terminal-tabs button */
color: #999;  →  color: var(--text-secondary);

/* .terminal-tabs button:hover */
color: #fff;  →  color: var(--text-primary);

/* .terminal-tab-item */
color: #999;  →  color: var(--text-secondary);

/* .terminal-tab-item:hover */
color: #fff;  →  color: var(--text-primary);

/* .context-menu */
background: #2d2d30;         →  background: var(--context-menu-bg);
border: 1px solid #454545;   →  border: 1px solid var(--context-menu-border);

/* .context-menu-item */
color: #ccc;  →  color: var(--text-primary);

/* .context-menu-item:hover */
background: #094771;  →  background: var(--context-menu-hover);
color: #fff;           →  color: var(--text-primary);

/* .context-menu-separator */
background: #454545;  →  background: var(--context-menu-border);

/* .rename-input */
background: #1e1e1e;          →  background: var(--bg-primary);
border: 1px solid #0af;       →  border: 1px solid var(--accent-color);
color: #d4d4d4;                →  color: var(--text-primary);

/* .tab-color-picker, .tab-icon-picker */
background: #2d2d30;         →  background: var(--context-menu-bg);
border: 1px solid #454545;   →  border: 1px solid var(--context-menu-border);

/* .tab-icon-picker span:hover */
background: #094771;  →  background: var(--context-menu-hover);

/* .sidebar-resize-handle:hover/.dragging */
background: #0af;  →  background: var(--accent-color);

/* .terminal-drag-handle-h:hover/.dragging */
background: #0af;  →  background: var(--accent-color);

/* .terminal-drag-handle-v:hover/.dragging */
background: #0af;  →  background: var(--accent-color);

/* .terminal-container.right */
border-left: 1px solid #333;  →  border-left: 1px solid var(--border-color);
```

- [ ] **Step 3: 在 styles.css 末尾追加 theme-selector 样式**

```css
/* Theme selector in titlebar */
.theme-selector {
  margin-left: auto;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  font-size: 11px;
  padding: 2px 4px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.theme-selector:focus {
  outline: none;
  border-color: var(--accent-color);
}
```

- [ ] **Step 4: TypeScript 类型检查（CSS 不影响 TS）**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit 2>&1
```

预期：无报错

- [ ] **Step 5: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/styles.css
git commit -m "feat: migrate styles to CSS variables with 4 theme presets"
```

---

## Task 3: MonacoEditor.tsx — theme prop + Monokai 注册

**Files:**
- Modify: `ui/src/components/MonacoEditor.tsx`

- [ ] **Step 1: 将 MonacoEditor.tsx 全量替换为以下内容**

```tsx
import { useRef, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { OpenFile } from "../App";

interface Props {
  file: OpenFile;
  onChange: (value: string) => void;
  onSave: () => void;
  theme: string;
}

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    rs: "rust", go: "go", py: "python",
    js: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript",
    json: "json", toml: "toml",
    yaml: "yaml", yml: "yaml",
    md: "markdown", html: "html", css: "css",
    sh: "shell", bash: "shell", zsh: "shell",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    java: "java", xml: "xml", sql: "sql",
    dockerfile: "dockerfile",
  };
  return map[ext] || "plaintext";
}

function getMonacoTheme(theme: string): string {
  const map: Record<string, string> = {
    dark: "vs-dark",
    light: "vs",
    monokai: "monokai",
    "solarized-dark": "vs-dark",
  };
  return map[theme] || "vs-dark";
}

export default function MonacoEditor({ file, onChange, onSave, theme }: Props) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register Monokai theme
    monaco.editor.defineTheme("monokai", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "f92672" },
        { token: "string", foreground: "e6db74" },
        { token: "comment", foreground: "75715e", fontStyle: "italic" },
        { token: "number", foreground: "ae81ff" },
        { token: "type", foreground: "66d9ef" },
        { token: "function", foreground: "a6e22e" },
      ],
      colors: {
        "editor.background": "#272822",
        "editor.foreground": "#f8f8f2",
        "editor.selectionBackground": "#49483e",
        "editorCursor.foreground": "#f8f8f0",
      },
    });

    monaco.editor.setTheme(getMonacoTheme(theme));

    // Cmd+S / Ctrl+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave();
    });
  };

  // Sync Monaco theme when IDE theme changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(getMonacoTheme(theme));
    }
  }, [theme]);

  return (
    <Editor
      height="100%"
      language={getLanguage(file.name)}
      value={file.content}
      theme={getMonacoTheme(theme)}
      onChange={(val) => onChange(val || "")}
      onMount={handleMount}
      options={{
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
        minimap: { enabled: true },
        wordWrap: "off",
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        tabSize: 4,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        automaticLayout: true,
      }}
    />
  );
}
```

- [ ] **Step 2: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit 2>&1
```

预期：报错提示 App.tsx 的 `<MonacoEditor>` 缺少 theme prop（正常，Task 4 修复）

- [ ] **Step 3: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/components/MonacoEditor.tsx
git commit -m "feat: add theme prop and Monokai registration to MonacoEditor"
```

---

## Task 4: App.tsx — theme state + 选择器 + 传 theme prop

**Files:**
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: 新增 theme state 及 data-theme 同步 effect**

在现有 state 声明区域（`const [rootPath, ...]` 附近）添加：

```tsx
const [theme, setTheme] = useState<string>(
  () => localStorage.getItem("yac-theme") || "dark"
);

useEffect(() => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("yac-theme", theme);
}, [theme]);
```

**注意：** 同时在组件初始化时立即设置 data-theme（避免首次渲染前无主题）。在 `useState` 声明之后，`useEffect` 之外添加一行初始化：

由于 `useState` 初始化时已读取 localStorage，在 `useEffect` 外直接设置初始值：

在 App 函数体最开头（所有 useState 之前）添加：
```tsx
// 初始化 data-theme（避免首次渲染闪烁）
if (typeof document !== "undefined") {
  document.documentElement.dataset.theme =
    localStorage.getItem("yac-theme") || "dark";
}
```

- [ ] **Step 2: 在 titlebar 内添加主题选择器**

找到：
```tsx
<div className="titlebar">Yac IDE{rootPath ? ` — ${rootPath}` : ""}</div>
```

替换为：
```tsx
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
```

- [ ] **Step 3: 给 MonacoEditor 传入 theme prop**

找到：
```tsx
<MonacoEditor
  key={currentFile.path}
  file={currentFile}
  onChange={(val) => updateFileContent(currentFile.path, val)}
  onSave={() => saveFile(currentFile.path)}
/>
```

替换为：
```tsx
<MonacoEditor
  key={currentFile.path}
  file={currentFile}
  onChange={(val) => updateFileContent(currentFile.path, val)}
  onSave={() => saveFile(currentFile.path)}
  theme={theme}
/>
```

- [ ] **Step 4: TypeScript 类型检查**

```bash
cd /Users/chenjie/Code/rust/yac/ui && npx tsc --noEmit 2>&1
```

预期：无报错（0 errors）。如有报错请修复。

- [ ] **Step 5: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/App.tsx
git commit -m "feat: add theme selector to App"
```

---

## Task 5: 手动验证

- [ ] **Step 1: 启动**

```bash
cd /Users/chenjie/Code/rust/yac
cargo tauri dev
```

- [ ] **Step 2: 验证主题切换**

1. 默认为 Dark 主题，整体深色
2. 切换到 Light → 背景变白，文字变黑，Monaco 编辑器变亮色
3. 切换到 Monokai → 背景变 `#272822`，Monaco 语法高亮变 Monokai 风格
4. 切换到 Solarized Dark → 背景变深蓝绿色
5. 刷新页面 → 主题保持上次选择（localStorage 持久化）

- [ ] **Step 3: 验证图标（构建后）**

```bash
cd /Users/chenjie/Code/rust/yac
cargo tauri build
```

构建完成后，在 macOS Finder 中查看 `/Users/chenjie/Code/rust/yac/src-tauri/target/release/bundle/macos/Yac IDE.app`，确认 Dock 中显示自定义图标。
