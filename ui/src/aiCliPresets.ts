export interface AiCliPreset {
  id: string;
  label: string;
  candidates: string[];
  /** Arguments appended after the resolved executable (shell-style string). */
  args: string;
  /** Message shown when the CLI is not found on PATH. */
  installHint: string;
  docUrl?: string;
}

export const AI_CLI_PRESETS: AiCliPreset[] = [
  {
    id: "codex",
    label: "Codex",
    candidates: ["codex"],
    args: ".",
    installHint:
      "未检测到 codex。常见安装：npm install -g @openai/codex\n官方：https://github.com/openai/codex",
    docUrl: "https://github.com/openai/codex",
  },
  {
    id: "claude",
    label: "Claude",
    candidates: ["claude"],
    args: "",
    installHint:
      "未检测到 claude。请在 Claude Code / Anthropic 文档中安装 CLI，并将可执行文件加入 PATH。",
    docUrl: "https://docs.anthropic.com/en/docs/claude-code",
  },
  {
    id: "gemini",
    label: "Gemini",
    candidates: ["gemini"],
    args: "",
    installHint:
      "未检测到 gemini。Google Gemini CLI：参见 https://github.com/google-gemini/gemini-cli",
    docUrl: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "cursor_agent",
    label: "Cursor agent",
    candidates: ["cursor-agent"],
    args: "",
    installHint:
      "未检测到 cursor-agent。请安装 Cursor CLI / Agent 并用 PATH 暴露 cursor-agent。",
    docUrl: "https://cursor.com/docs",
  },
  {
    id: "copilot_cli",
    label: "Copilot",
    candidates: ["copilot", "gh-copilot"],
    args: "",
    installHint:
      "未检测到 Copilot CLI。若使用 gh extension：gh extension install github/gh-copilot\n或将 copilot 加入 PATH。",
    docUrl: "https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli",
  },
  {
    id: "aider",
    label: "Aider",
    candidates: ["aider"],
    args: "",
    installHint:
      "未检测到 aider。常见安装：pip install aider-install && aider-install\n文档：https://aider.chat/",
    docUrl: "https://aider.chat/",
  },
];
