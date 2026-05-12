import { useState, useRef, useEffect } from "react";

interface SearchMatch {
  path: string;
  line: number;
  content: string;
}

interface Props {
  rootPaths: string[];
  onOpenFile: (path: string, name: string) => void;
  onClose: () => void;
}

export default function SearchPanel({ rootPaths, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = async (q: string) => {
    if (!q.trim() || rootPaths.length === 0) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const groups = await Promise.all(
        rootPaths.map((root) =>
          invoke<SearchMatch[]>("grep_files", {
            root,
            pattern: q,
            maxResults: 50,
          }).catch(() => [])
        )
      );
      setResults(groups.flat().slice(0, 50));
      setSelected(0);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const getFileName = (path: string) => path.split("/").pop() || path;
  const getShortPath = (path: string) => {
    const root = rootPaths
      .filter((folder) => path === folder || path.startsWith(`${folder}/`))
      .sort((a, b) => b.length - a.length)[0];
    return root ? path.slice(root.length + 1) : path;
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
