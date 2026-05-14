import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import {
  AI_CLI_PRESETS,
  type AiCliPreset,
} from "../aiCliPresets";

type ResolvedMap = Record<string, string | undefined>;

function posixQuoteSingle(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/** Quote executable path for shell input when sending to PTY. */
function quoteExeForShell(path: string): string {
  if (/Windows/i.test(navigator.userAgent)) {
    if (/[\s&|^<>()"']/.test(path)) {
      return `"${path.replace(/"/g, '\\"')}"`;
    }
    return path;
  }
  return posixQuoteSingle(path);
}

function CliIcon({
  presetId,
  size,
}: {
  presetId: string;
  size: number;
}) {
  const s = size;
  switch (presetId) {
    case "codex":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="#10a37f" />
          <path
            fill="#fff"
            d="M11.2 6.8c1.5-.3 3 .3 4 1.4 1 1.1 1.4 2.6 1 4-.4 1.4-1.5 2.5-2.9 2.9-.9.2-1.9 0-2.7-.6-.8-.6-1.3-1.6-1.4-2.6-.1-1 .3-2 1-2.7.8-.8 1.9-1.2 3-1.4Zm-.8 3.7c-.3.4-.4 1-.3 1.5.2.9 1 1.6 1.9 1.8 1 .2 2-.3 2.5-1.2.5-.9.4-2-.3-2.8-.7-.8-1.9-1.1-2.9-.7-.5.2-.9.6-1.2 1.1-.5 1.4-.4 3 .5 4.3 1 1.4 2.8 2 4.4 1.5 1.9-.6 3.2-2.4 3.2-4.4 0-2.7-2.5-4.8-5.2-4.4-2 .3-3.6 2-3.8 4-.1 1.2.2 2.4 1 3.3"
          />
        </svg>
      );
    case "claude":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <rect width="24" height="24" rx="5" fill="#d97757" />
          <path
            fill="#fff"
            d="M12 6l1.6 3.4L17 11l-3.4 1.6L12 16l-1.6-3.4L7 11l3.4-1.6L12 6z"
          />
        </svg>
      );
    case "gemini":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="aiCliGemGrad" x1="0" y1="0" x2="24" y2="24">
              <stop offset="0%" stopColor="#4285f4" />
              <stop offset="50%" stopColor="#34a853" />
              <stop offset="100%" stopColor="#fbbc04" />
            </linearGradient>
          </defs>
          <path
            fill="url(#aiCliGemGrad)"
            d="M12 3l7 7-7 7-7-7 7-7zm0 3.5L8.5 12 12 17.5 15.5 12 12 6.5z"
          />
        </svg>
      );
    case "cursor_agent":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <rect width="24" height="24" rx="5" fill="#5c24fa" />
          <path
            fill="#fff"
            d="M8 7l8 5-8 5V7zm2 3.2v4.6L14 12l-4-1.8z"
          />
        </svg>
      );
    case "copilot_cli":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="#24292f" />
          <path
            fill="#fff"
            d="M12 5c3.3 0 6 2.5 6 5.7 0 2.5-1.6 4.6-3.9 5.4-.3.1-.4-.1-.4-.3v-1.2c0-.8-.3-1.3-.6-1.6 1.6-.2 3.3-.8 3.3-3.5 0-.7-.3-1.3-.7-1.8.1-.4.3-1.3-.1-2.7 0 0-.6-.2-2 .8-.6-.2-1.2-.3-1.8-.3-.6 0-1.2.1-1.8.3-1.4-1-2-.8-2-.8-.4 1.4-.2 2.3-.1 2.7-.4.5-.7 1.1-.7 1.8 0 2.7 1.7 3.3 3.3 3.5-.2.2-.4.6-.4 1.1v1.7c0 .2-.1.4-.4.3C7.6 15.3 6 13.2 6 10.7 6 7.5 8.7 5 12 5z"
          />
        </svg>
      );
    case "aider":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <rect width="24" height="24" rx="5" fill="#374151" />
          <path
            fill="#93c5fd"
            d="M7 9h10v2H7V9zm2 4h6v2H9v-2zm-2 4h10v2H7v-2z"
          />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <rect width="24" height="24" rx="4" fill="#6b7280" />
        </svg>
      );
  }
}

export function AiCliShortcuts({
  onBeforeRun,
  runPreparedCommand,
}: {
  onBeforeRun?: () => void;
  runPreparedCommand: (line: string) => void | Promise<void>;
}) {
  const [resolved, setResolved] = useState<ResolvedMap>({});

  const specs = useMemo(
    () =>
      AI_CLI_PRESETS.map((p) => ({
        id: p.id,
        candidates: p.candidates,
      })),
    []
  );

  const probe = useCallback(async () => {
    try {
      const result = await invoke<Record<string, string | null>>(
        "resolve_cli_binaries",
        {
          specs,
        }
      );
      const normalized: ResolvedMap = {};
      if (result) {
        for (const [k, v] of Object.entries(result)) {
          if (v) normalized[k] = v;
        }
      }
      setResolved(normalized);
    } catch {
      setResolved({});
    }
  }, [specs]);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    const onFocus = () => void probe();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [probe]);

  const onChipClick = async (preset: AiCliPreset) => {
    const exe = resolved[preset.id];
    if (!exe) {
      await message(preset.installHint, {
        title: `${preset.label} 未安装`,
        kind: "warning",
      });
      return;
    }
    onBeforeRun?.();
    const quoted = quoteExeForShell(exe);
    const tail = preset.args.trim();
    const line = tail ? `${quoted} ${tail}` : quoted;
    await Promise.resolve(runPreparedCommand(line));
  };

  return (
    <div className="terminal-ai-cli-bar" role="toolbar" aria-label="AI CLI 快捷入口">
      {AI_CLI_PRESETS.map((p) => {
        const ok = Boolean(resolved[p.id]);
        return (
          <button
            key={p.id}
            type="button"
            className={`terminal-ai-cli-chip ${ok ? "installed" : "missing"}`}
            title={
              ok
                ? `${p.label}（已检测到）`
                : `${p.label}（未检测到，点击查看安装提示）`
            }
            onClick={() => void onChipClick(p)}
          >
            <span className="terminal-ai-cli-chip-icon">
              <CliIcon presetId={p.id} size={16} />
            </span>
            <span className="terminal-ai-cli-chip-label">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
