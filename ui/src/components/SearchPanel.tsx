import { useState, useRef, useEffect } from "react";

interface SearchMatch {
  path: string;
  line: number;
  content: string;
}

interface Props {
  rootPath: string | null;
  onOpenFile: (path: string, name: string) => void;
  onClose: () => void;
}

export default function SearchPanel({ rootPath, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = async (q: string) => {
    if (!q.trim() || !rootPath) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const matches = await invoke<SearchMatch[]>("grep_files", {
        root: rootPath,
        pattern: q,
        maxResults: 50,
      });
      setResults(matches);
      setSelected(0);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const getFileName = (path: string) => path.split("/").pop() || path;
  const getShortPath = (path: string) => {
    if (!rootPath) return path;
    return path.startsWith(rootPath) ? path.slice(rootPath.length + 1) : path;
  };

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
        onOpenFile(results[selected].path, getFileName(results[selected].path));
      } else {
        doSearch(query);
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="search-panel-inline">
      <div className="search-input-wrap">
        <input
          ref={inputRef}
          placeholder="Search files..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            doSearch(e.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        {searching && <span className="search-spinner">Searching...</span>}
      </div>
      <div className="search-results">
        {results.map((m, i) => (
          <div
            key={`${m.path}:${m.line}`}
            className={`search-item ${i === selected ? "selected" : ""}`}
            onClick={() => {
              onOpenFile(m.path, getFileName(m.path));
            }}
          >
            <div className="search-item-path">
              {getShortPath(m.path)}:{m.line}
            </div>
            <div className="search-item-content">{m.content}</div>
          </div>
        ))}
        {results.length === 0 && query && !searching && (
          <div className="quick-open-empty">No results found</div>
        )}
      </div>
    </div>
  );
}