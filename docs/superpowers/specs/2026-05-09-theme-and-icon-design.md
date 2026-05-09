# Theme & App Icon Design Spec

**日期**: 2026-05-09

---

## 1. 概述

两项独立改进：
1. 支持 4 种预设主题切换（Dark / Light / Monokai / Solarized Dark）
2. 为 macOS 添加 Dock 图标

---

## 2. 主题系统

### 主题列表

| ID | 名称 | 背景色 | 前景色 | 强调色 | Monaco 主题 |
|---|---|---|---|---|---|
| `dark` | Dark（默认） | `#1e1e1e` | `#d4d4d4` | `#0af` | `vs-dark` |
| `light` | Light | `#ffffff` | `#1e1e1e` | `#0066cc` | `vs` |
| `monokai` | Monokai | `#272822` | `#f8f8f2` | `#a6e22e` | `monokai`（需注册） |
| `solarized-dark` | Solarized Dark | `#002b36` | `#839496` | `#268bd2` | `vs-dark`（近似） |

### CSS 变量体系

`styles.css` 中所有硬编码颜色改为 CSS 变量，在 `:root[data-theme="xxx"]` 下定义。

**变量清单（每个主题都需定义）：**
```css
--bg-primary      /* 主背景，编辑器区 */
--bg-secondary    /* 次级背景，sidebar / tabs */
--bg-tertiary     /* 第三级背景，titlebar / terminal-tabs */
--bg-hover        /* hover 背景 */
--bg-active       /* active/selected 背景 */
--text-primary    /* 主文字 */
--text-secondary  /* 次级文字（标签、说明） */
--border-color    /* 边框 */
--accent-color    /* 强调色（active tab 线、focus border） */
--tab-active-bg   /* active tab 背景 */
```

**4 套变量定义：**

```css
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
}
```

### 主题选择器 UI

- 位置：titlebar 右侧，一个 `<select>` 下拉
- 选项：Dark / Light / Monokai / Solarized Dark
- 选中即应用，同时更新 `document.documentElement.dataset.theme`
- 持久化到 localStorage（key: `yac-theme`）

### Monaco 主题注册

Monokai 主题需要向 Monaco 注册自定义 token 颜色。在 `MonacoEditor.tsx` 中，`onMount` 时根据当前 theme 调用：
```ts
monaco.editor.defineTheme("monokai", { ... });
monaco.editor.setTheme(monacoTheme);
```

Monokai token 规则：
```ts
{
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
}
```

Solarized Dark 使用 `vs-dark` 近似，不单独注册。

### 组件改动

**App.tsx**
```ts
const [theme, setTheme] = useState<string>(
  () => localStorage.getItem("yac-theme") || "dark"
);
useEffect(() => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("yac-theme", theme);
}, [theme]);
```

titlebar 内添加：
```tsx
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
```

传给 MonacoEditor 新 prop：`theme={theme}`

**MonacoEditor.tsx**
新增 prop：`theme: string`
新增 `monacoTheme` 映射函数：
```ts
function getMonacoTheme(theme: string): string {
  const map: Record<string, string> = {
    dark: "vs-dark",
    light: "vs",
    monokai: "monokai",
    "solarized-dark": "vs-dark",
  };
  return map[theme] || "vs-dark";
}
```
`onMount` 时注册 Monokai 主题，并调用 `monaco.editor.setTheme(getMonacoTheme(theme))`。
`theme` prop 变化时调用 `monaco.editor.setTheme(getMonacoTheme(theme))`（通过 `useEffect`）。

**styles.css**
- 所有硬编码颜色替换为 CSS 变量
- 添加 4 套主题变量定义
- 添加 `.theme-selector` 样式（与 titlebar 风格一致的小下拉）

---

## 3. macOS Dock 图标

### 图标文件
- 已生成 PNG：`/Users/chenjie/Library/Application Support/WeiboAP/Data/agents/agent_1776755426432_rldi8hwpw/425f1ce8.png`
- 目标：生成 macOS 所需的 `icon.icns` 格式

### 生成步骤（Python 脚本）
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

subprocess.run(["iconutil", "-c", "icns", iconset_dir,
                "-o", "/Users/chenjie/Code/rust/yac/src-tauri/icons/icon.icns"], check=True)

# 同时覆盖 icon.png（1024x1024）
img.resize((1024, 1024), Image.LANCZOS).save("/Users/chenjie/Code/rust/yac/src-tauri/icons/icon.png")

shutil.rmtree(iconset_dir)
print("Done: icon.icns + icon.png generated")
```

### tauri.conf.json 更新
```json
"bundle": {
  "active": true,
  "targets": "all",
  "icon": [
    "icons/icon.png",
    "icons/icon.icns"
  ]
}
```

---

## 4. 不涉及范围
- 用户自定义颜色
- 主题导入/导出
- xterm.js terminal 主题随 IDE 主题切换（保持固定暗色）

---

## 5. 文件改动清单

| 文件 | 改动 |
|---|---|
| `ui/src/App.tsx` | 新增 theme state + 主题选择器 + 传 theme prop 给 MonacoEditor |
| `ui/src/components/MonacoEditor.tsx` | 新增 theme prop + Monokai 注册 + 主题同步 useEffect |
| `ui/src/styles.css` | 全面替换为 CSS 变量 + 4 套主题变量 + theme-selector 样式 |
| `src-tauri/icons/icon.icns` | 新增（Python 脚本生成） |
| `src-tauri/icons/icon.png` | 替换（1024x1024 新图标） |
| `src-tauri/tauri.conf.json` | 追加 icon.icns 到 bundle.icon |
