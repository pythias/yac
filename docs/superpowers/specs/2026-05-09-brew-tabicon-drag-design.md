# Spec: Brew Release + Terminal Tab Icon Redesign + Drag Range

Date: 2026-05-09

---

## 1. Brew Cask 发布 + GitHub Actions

### 目标

用户可通过 `brew install --cask yac` 安装 Yac IDE，发布流程全自动化（push tag → build → release → 更新 formula）。

### 架构

**Tap 仓库**：`github.com/<owner>/homebrew-yac`
- `Casks/yac.rb` — Homebrew Cask formula

**主仓库新增两个 workflow**：

#### `release.yml`
触发条件：`push: tags: ["v*"]`

步骤：
1. checkout
2. 安装 Rust stable + `cargo-tauri`
3. 安装 Node.js + pnpm，`pnpm install`
4. `cargo tauri build` （macOS-latest runner，aarch64）
5. 找到产物 `.dmg`（路径：`src-tauri/target/release/bundle/dmg/*.dmg`）
6. 用 `softwareupdate --install-rosetta` + `create-dmg` 或 Tauri 自带打包
7. `gh release create $TAG --title "Yac IDE $TAG" dist/*.dmg`

#### `update-cask.yml`
触发条件：`workflow_run`（release.yml 完成后）或 `release: types: [published]`

步骤：
1. 下载 Release 里的 `.dmg`，计算 `sha256sum`
2. checkout `homebrew-yac` tap 仓库（用 deploy key 或 PAT）
3. 用 `sed` 替换 `Casks/yac.rb` 里的 `version` + `sha256`
4. commit + push（直接 push main，不开 PR）

### Formula 模板（`Casks/yac.rb`）

```ruby
cask "yac" do
  version "0.1.0"
  sha256 "PLACEHOLDER_SHA256"

  url "https://github.com/<owner>/yac/releases/download/v#{version}/Yac.IDE_#{version}_aarch64.dmg"

  name "Yac IDE"
  desc "A minimal IDE built with Tauri + React"
  homepage "https://github.com/<owner>/yac"

  app "Yac IDE.app"

  # NOTE: Not notarized. First run: System Settings → Privacy & Security → Open Anyway
end
```

### 约束

- 初期跳过 Apple 公证（notarization），formula 注释说明手动允许方法
- 只构建 `aarch64`（Apple Silicon）；如需 `x86_64` 后续扩展
- Runner：`macos-latest`（GitHub 免费额度约 2000min/月，单次构建约 15–20min）
- Secrets 需要：`HOMEBREW_TAP_TOKEN`（PAT，scope: `repo`，用于 push tap 仓库）

---

## 2. Terminal Tab 颜色同步 Icon 方块

### 当前行为
- `tab.color` 只作用于 tab 下边线
- `tab.icon` 存储 emoji 字符串，与颜色无关联

### 新行为
- Tab 左侧渲染一个 16×16px 圆角方块
- 方块背景色 = `tab.color`（默认 `#0af`）
- 方块内渲染 FA icon（默认 `terminal`）
- 下边线颜色 = `tab.color`（保持不变）
- icon 内文字颜色根据背景亮度自动选黑/白：亮色（R+G+B > 382）用 `#000`，暗色用 `#fff`

### TermTab 数据结构变更

```ts
interface TermTab {
  // 已有字段不变...
  color?: string;   // 默认 "#0af"，同时控制方块背景 + 下边线
  icon?: string;    // FA icon name，默认 "terminal"（从 emoji 改为 icon name）
}
```

### Tab 渲染

```tsx
const bgColor = tab.color ?? "#0aff";
// 展开 3 位 hex 为 6 位（#0af → #00aaff）
function expandHex(hex: string) {
  const h = hex.replace("#","");
  return h.length === 3 ? h.split("").map(c => c+c).join("") : h;
}
const hex = expandHex(bgColor);
const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
const iconColor = (r + g + b > 382) ? "#000" : "#fff";

<div style={{ width:16, height:16, borderRadius:3, background:bgColor,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
  <i className={`fa-solid fa-${tab.icon ?? "terminal"}`}
     style={{ fontSize:9, color:iconColor }} />
</div>
```

---

## 3. FA Free 图标选择器

### 依赖

```bash
pnpm add @fortawesome/fontawesome-free
```

在 `ui/src/main.tsx` 引入：
```ts
import "@fortawesome/fontawesome-free/css/all.min.css";
```

### 图标列表（20 个，`PRESET_ICONS`）

```ts
const PRESET_ICONS = [
  "terminal",      "code",          "bolt",          "bug",
  "server",        "database",      "code-branch",   "cube",
  "rocket",        "gear",          "flask",         "fire",
  "layer-group",   "network-wired", "microchip",     "folder",
  "play",          "key",           "cloud",         "leaf",
];
```

### 图标选择器 UI

- 触发：右键菜单 → 「改变图标」（keepOpen: true）
- 布局：4列×5行方块网格，每格 28×28px 圆角方块
- 方块颜色：使用当前 tab 的 `color`（预览颜色+图标组合效果）
- 选中后关闭 picker，更新 `tab.icon`
- 删除旧 `PRESET_ICONS`（emoji 数组），替换为上述 FA icon name 数组

### 颜色选择器 UI（无变化）

保持 9 色色块，选中后更新 `tab.color`，方块背景 + 下边线同步。

---

## 4. 拖拽范围限制 10%–90%

### 当前行为

- Sidebar：硬编码 140–400px
- Terminal bottom：硬编码 100–600px
- Terminal right（editor left handle）：硬编码 100–700px

### 新行为

所有拖拽约束改为相对于**可用容器尺寸**的 10%–90%。

| 组件 | 尺寸基准 | 最小值 | 最大值 |
|---|---|---|---|
| Sidebar 宽度 | `window.innerWidth` | `×10%` | `×90%` |
| Terminal bottom 高度 | `editorArea.clientHeight`（main-content 区域高度） | `×10%` | `×90%` |
| Terminal right 宽度 | `editorArea.clientWidth`（main-content 区域宽度） | `×10%` | `×90%` |

### 实现

**Sidebar.tsx**（`handleResizeMouseDown`）：
```ts
const min = window.innerWidth * 0.1;
const max = window.innerWidth * 0.9;
const next = Math.min(max, Math.max(min, startSize + delta));
```

**App.tsx**（`handleTerminalDragStart` + `handleEditorRightDragStart`）：

需要一个 ref 指向 `.main-content` 容器（`mainContentRef`）：
```ts
const mainContentRef = useRef<HTMLDivElement>(null);
```

bottom 模式（高度）：
```ts
const container = mainContentRef.current;
const h = container ? container.clientHeight : window.innerHeight;
const min = h * 0.1;
const max = h * 0.9;
```

right 模式（宽度）：
```ts
const container = mainContentRef.current;
const w = container ? container.clientWidth : window.innerWidth;
const min = w * 0.1;
const max = w * 0.9;
```

---

## 实现顺序

| ID | 任务 | 文件 |
|---|---|---|
| D-1 | 创建 `homebrew-yac` tap 仓库 + `Casks/yac.rb` | 新仓库 |
| D-2 | `release.yml` — build + upload DMG | `.github/workflows/release.yml` |
| D-3 | `update-cask.yml` — 计算 sha256 + 更新 formula | `.github/workflows/update-cask.yml` |
| E-1 | 安装 FA Free，引入 CSS | `ui/src/main.tsx`, `package.json` |
| E-2 | TerminalPanel — 重构 icon/color 渲染 + 新 picker | `ui/src/components/TerminalPanel.tsx` |
| E-3 | styles.css — tab icon picker 样式更新 | `ui/src/styles.css` |
| F-1 | Sidebar — 10%/90% 动态范围 | `ui/src/components/Sidebar.tsx` |
| F-2 | App.tsx — mainContentRef + 两个 drag handler 更新 | `ui/src/App.tsx` |
