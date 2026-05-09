# CLAUDE.md

## 项目概述
Yac IDE — 基于 Tauri 2 + React + Monaco Editor + xterm.js 的桌面代码编辑器（macOS）。

## 技术栈
| 层 | 技术 |
|---|---|
| Desktop Shell | Tauri 2 (WKWebView) |
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| Editor | Monaco Editor (@monaco-editor/react) |
| Terminal | xterm.js + @xterm/addon-fit |
| Backend | Rust (portable-pty + 文件系统操作) |
| 包管理 | pnpm (前端) / Cargo (后端) |

## 目录结构
```
/Users/chenjie/Code/rust/yac/
├── src-tauri/           # Rust 后端
│   ├── src/
│   │   ├── main.rs      # 入口
│   │   ├── lib.rs       # App setup，注册 9 个 IPC commands，管理 AppState
│   │   ├── fs_commands.rs  # 文件系统 CRUD (read_dir/read_file/write_file/rename/delete/reveal)
│   │   └── pty.rs       # PTY 管理器 (spawn zsh/bash，事件驱动 I/O)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/default.json
├── ui/                  # React 前端
│   ├── src/
│   │   ├── main.tsx     # React 入口（无 StrictMode）
│   │   ├── App.tsx      # 主布局 + 全局状态 + localStorage 持久化
│   │   ├── styles.css   # 暗色 VSCode 风格主题
│   │   └── components/
│   │       ├── Sidebar.tsx       # 文件树 + 右键菜单
│   │       ├── EditorTabs.tsx    # 已打开文件标签栏
│   │       ├── MonacoEditor.tsx  # Monaco 编辑器封装
│   │       ├── TerminalPanel.tsx # 多 tab 终端面板
│   │       └── ContextMenu.tsx   # 通用右键菜单组件
│   └── package.json
```

## 架构
- **IPC 通信**: 前端通过 `invoke()` 调用 Rust commands，PTY 输出通过 Tauri events (`pty-output`) 推送到前端
- **状态管理**: App.tsx 集中管理 `openFiles[]` / `activeFile` / `rootPath` / `showTerminal`，通过 localStorage 持久化
- **PTY 架构**: Rust 端每个 PTY 实例有 reader thread（emit event）和 writer thread（接收 channel），前端 xterm.js 监听 `pty-output` event
- **终端多 tab**: 每个 tab 独立 div 容器 + xterm Terminal 实例，切换通过 display none/block

## 开发命令
```bash
cd /Users/chenjie/Code/rust/yac
cargo tauri dev     # 启动开发模式（Rust + Vite dev server）
cargo build         # 仅编译 Rust
cd ui && npx tsc --noEmit  # TypeScript 类型检查
```

## 已知注意事项
- 不要加 React.StrictMode（会导致终端组件 double-mount，输入字符重复）
- PTY 输出是事件驱动的，不需要轮询 `pty_read`
- 终端 tab 切换用 display 切换而非 destroy/recreate
- Monaco Editor 语言检测基于文件扩展名映射