import { useState, useEffect, useRef, useCallback } from "react";

interface QuickOpenProps {
  rootPath: string | null;
  onOpenFile: (path: string, name: string) => void;
  onClose: () => void;
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export default function QuickOpen({ rootPath, onOpenFile, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<FileEntry[]>([]);
  const searchingRef = useRef(false);

  // Collect all files recursively
  useEffect(() => {
    if (!rootPath) return;
    const files: FileEntry[] = [];
    const walk = async (dir: string) => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const entries = await invoke<FileEntry[]>("read_dir", { path: dir });
        for (const e of entries) {
          if (e.is_dir) {
            await walk(e.path);
          } else {
            files.push(e);
          }
        }
      } catch {}
    };
    walk(rootPath).then(() => {
      filesRef.current = files;
    });
  }, [rootPath]);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const lower = q.toLowerCase();
    const parts = lower.split(/\s+/);
    const matched = filesRef.current.filter((f) => {
      const name = f.name.toLowerCase();
      return parts.every((p) => name.includes(p));
    });
    // Sort: exact match first, then by name length
    matched.sort((a, b) => {
      const aExact = a.name.toLowerCase() === lower;
      const bExact = b.name.toLowerCase() === lower;
      if (aExact !== bExact) return aExact ? -1 : 1;
      return a.name.length - b.name.length;
    });
    setResults(matched.slice(0, 20));
    setSelected(0);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selected]) {
        onOpenFile(results[selected].path, results[selected].name);
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
          placeholder="Type to search files..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            doSearch(e.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="quick-open-results">
          {results.map((f, i) => (
            <div
              key={f.path}
              className={`quick-open-item ${i === selected ? "selected" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => {
                onOpenFile(f.path, f.name);
                onClose();
              }}
            >
              {f.name}
            </div>
          ))}
          {results.length === 0 && query && (
            <div className="quick-open-empty">No files found</div>
          )}
        </div>
      </div>
    </div>
  );
}