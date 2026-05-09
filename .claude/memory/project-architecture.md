**摘要**: Yac IDE 项目架构、技术栈、目录结构、开发命令 | **创建**: 2026-05-09 | **更新**: 2026-05-09

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
│   │       ├── TerminalPanel.tsx # 多 tab 终端面板（forwardRef + useImperativeHandle）
│   │       └── ContextMenu.tsx   # 通用右键菜单组件
│   └── package.json
```

## 架构关键决策
1. **IPC 通信**: 前端 `invoke()` 调用 Rust commands；PTY 输出通过 Tauri events (`pty-output`) 推送到前端
2. **状态管理**: App.tsx 集中管理 `openFiles[]` / `activeFile` / `rootPath` / `showTerminal`，通过 localStorage key `"yac-ide-state"` 持久化
3. **PTY 事件驱动**: Rust reader thread 循环读取 PTY master → emit Tauri event；前端 listen `pty-output` 根据 ptyId 路由到对应 tab 的 terminal.write()
4. **终端多 tab**: 每个 tab 独立 div 容器 + xterm Terminal 实例，切换通过 `display: none/block` 而非 destroy/recreate
5. **Monaco 语言检测**: 基于文件扩展名映射表（rust/go/python/js/ts/json/toml/yaml/md/html/css/sh/c/cpp/java/xml/sql/dockerfile → plaintext fallback）

## Rust 后端 9 个 IPC Commands
| Command | 功能 |
|---|---|
| `read_dir` | 读取目录（单层，跳过隐藏文件，目录优先排序） |
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件内容 |
| `rename_path` | 重命名文件/目录 |
| `delete_path` | 删除文件/目录（递归） |
| `reveal_in_finder` | macOS `open -R` 在 Finder 中显示 |
| `pty_spawn` | 创建 PTY 进程（zsh/bash），返回 ptyId |
| `pty_write` | 向 PTY 写入数据 |
| `pty_close` | 关闭 PTY 实例 |

## 开发命令
```bash
cd /Users/chenjie/Code/rust/yac
cargo tauri dev              # 启动开发模式
cargo build --manifest-path src-tauri/Cargo.toml  # 仅编译 Rust
cd ui && npx tsc --noEmit    # TypeScript 类型检查
```

## 已知注意事项
- **禁止 React.StrictMode** — 会导致 TerminalPanel double-mount，产生两个 onData handler，输入字符重复
- PTY 输出是事件驱动的，没有 `pty_read` 轮询命令（已删除）
- 终端 tab 切换用 display 切换，不能 destroy/recreate（否则丢失内容）
- 端口占用: Vite dev server 固定 5173，冲突时 `lsof -ti:5173 | xargs kill -9`