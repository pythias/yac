# Yac IDE

基于 **Tauri 2 + React + Monaco Editor + xterm.js** 构建的桌面代码编辑器（macOS）。

## 快速开始

### 安装

```bash
brew tap pythias/yac
brew install yac
```

### 从源码运行

```bash
# 前置依赖：Node.js 22.13+, pnpm 11+, Rust 1.80+

cd /path/to/yac

# 安装前端依赖
cd ui && pnpm install && cd ..

# 启动开发模式
cargo tauri dev
```

## 使用说明

- **打开项目** — 点击侧边栏顶部按钮选择文件夹，或拖入目录到窗口
- **文件操作** — 侧边栏右键创建、重命名、删除文件和目录
- **代码编辑** — 点击文件在 Monaco Editor 中打开，支持多 tab 切换和管理
- **集成终端** — 底部/右侧分屏终端，支持多 tab、拖拽调整大小
- **主题切换** — 标题栏下拉按钮切换 Dark / Light / Monokai / Solarized Dark
- **多窗口** — 标题栏 "+" 按钮新建独立窗口，同时打开不同项目
- **工作区恢复** — 重启后自动恢复上次打开的文件和目录

## 技术栈

| 层 | 技术 |
|---|---|
| Desktop Shell | Tauri 2 (WKWebView) |
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| Editor | Monaco Editor |
| Terminal | xterm.js |
| Backend | Rust (portable-pty + 文件系统) |
| 包管理 | pnpm / Cargo |

## 开发

```bash
cargo tauri dev                        # 启动开发模式（Rust + Vite）
cargo build --manifest-path src-tauri/Cargo.toml  # 仅编译 Rust
cd ui && npx tsc --noEmit              # TypeScript 类型检查
```

### 目录结构

```
yac/
├── src-tauri/         # Rust 后端 — IPC commands、PTY 管理、文件系统操作
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── fs_commands.rs
│       └── pty.rs
├── ui/                # React 前端 — 编辑器、终端、侧边栏
│   └── src/
│       ├── App.tsx
│       └── components/
│           ├── Sidebar.tsx
│           ├── EditorTabs.tsx
│           ├── MonacoEditor.tsx
│           ├── TerminalPanel.tsx
│           └── ContextMenu.tsx
```

## 许可证

MIT
