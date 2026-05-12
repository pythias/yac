import { useState, useEffect, useRef, useCallback } from "react";

interface QuickOpenProps {
  rootPaths: string[];
  onOpenFile: (path: string, name: string) => void;
  commands?: QuickCommand[];
  onClose: () => void;
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface QuickCommand {
  id: string;
  title: string;
  subtitle?: string;
  run: () => void;
}

type QuickResult =
  | { type: "command"; command: QuickCommand }
  | { type: "file"; file: FileEntry };

function resultKey(result: QuickResult): string {
  return result.type === "command" ? `command:${result.command.id}` : `file:${result.file.path}`;
}

function resultTitle(result: QuickResult): string {
  return result.type === "command" ? result.command.title : result.file.name;
}

function resultSearchText(result: QuickResult): string {
  if (result.type === "command") {
    return `${result.command.title} ${result.command.subtitle || ""}`.toLowerCase();
  }
  return result.file.name.toLowerCase();
}

export default function QuickOpen({ rootPaths, onOpenFile, commands = [], onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<FileEntry[]>([]);

  // Collect all files recursively
  useEffect(() => {
    if (rootPaths.length === 0) return;
    const files: FileEntry[] = [];
    const getWorkspaceRootForPath = (path: string) =>
      rootPaths
        .filter((folder) => path === folder || path.startsWith(`${folder}/`))
        .sort((a, b) => b.length - a.length)[0] || null;
    const walk = async (dir: string) => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const entries = await invoke<FileEntry[]>("read_dir", { path: dir, workspaceRoot: getWorkspaceRootForPath(dir) });
        for (const e of entries) {
          if (e.is_dir) {
            await walk(e.path);
          } else {
            files.push(e);
          }
        }
      } catch {}
    };
    Promise.all(rootPaths.map((root) => walk(root))).then(() => {
      filesRef.current = files;
    });
  }, [rootPaths]);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults(commands.map((command) => ({ type: "command", command })));
      setSelected(0);
      return;
    }
    const lower = q.toLowerCase();
    const parts = lower.split(/\s+/);
    const commandResults: QuickResult[] = commands.map((command) => ({ type: "command", command }));
    const fileResults: QuickResult[] = filesRef.current.map((file) => ({ type: "file", file }));
    const matched = [...commandResults, ...fileResults].filter((result) =>
      parts.every((p) => resultSearchText(result).includes(p))
    );
    // Sort: exact match first, then by name length
    matched.sort((a, b) => {
      if (a.type !== b.type) return a.type === "command" ? -1 : 1;
      const aTitle = resultTitle(a).toLowerCase();
      const bTitle = resultTitle(b).toLowerCase();
      const aExact = aTitle === lower;
      const bExact = bTitle === lower;
      if (aExact !== bExact) return aExact ? -1 : 1;
      return aTitle.length - bTitle.length;
    });
    setResults(matched.slice(0, 20));
    setSelected(0);
  }, [commands]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(commands.map((command) => ({ type: "command", command })));
      setSelected(0);
    }
  }, [commands, query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = results[selected];
      if (result) {
        if (result.type === "command") {
          result.command.run();
        } else {
          onOpenFile(result.file.path, result.file.name);
        }
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="quick-open-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="quick-open-panel">
        <input
          ref={inputRef}
          className="quick-open-input"
          placeholder="Search files and commands..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            doSearch(e.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="quick-open-results">
          {results.map((result, i) => (
            <div
              key={resultKey(result)}
              className={`quick-open-item ${i === selected ? "selected" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => {
                if (result.type === "command") {
                  result.command.run();
                } else {
                  onOpenFile(result.file.path, result.file.name);
                }
                onClose();
              }}
            >
              <span>{resultTitle(result)}</span>
              {result.type === "command" && result.command.subtitle && (
                <span className="quick-open-item-subtitle">{result.command.subtitle}</span>
              )}
            </div>
          ))}
          {results.length === 0 && query && (
            <div className="quick-open-empty">No results found</div>
          )}
        </div>
      </div>
    </div>
  );
}
