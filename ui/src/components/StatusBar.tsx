import { OpenFile } from "../App";
import { EditorSettings } from "../settings";

interface Props {
  workspaceFolders: string[];
  file: OpenFile | null;
  cursor: { line: number; column: number };
  settings: EditorSettings;
  theme: string;
  onToggleTerminal: () => void;
}

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    rs: "Rust",
    go: "Go",
    py: "Python",
    js: "JavaScript",
    jsx: "JavaScript React",
    ts: "TypeScript",
    tsx: "TypeScript React",
    json: "JSON",
    toml: "TOML",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    html: "HTML",
    css: "CSS",
    sh: "Shell",
    bash: "Shell",
    zsh: "Shell",
    c: "C",
    cpp: "C++",
    h: "C",
    hpp: "C++",
    java: "Java",
    xml: "XML",
    sql: "SQL",
    dockerfile: "Dockerfile",
  };
  return map[ext] || "Plain Text";
}

function shortWorkspaceLabel(folders: string[]): string {
  if (folders.length === 0) return "No Folder";
  if (folders.length === 1) return folders[0].split("/").pop() || folders[0];
  return `${folders.length} Folders`;
}

function relativePath(path: string, folders: string[]): string {
  const root = folders
    .filter((folder) => path === folder || path.startsWith(`${folder}/`))
    .sort((a, b) => b.length - a.length)[0];
  return root ? path.slice(root.length + 1) : path;
}

export default function StatusBar({
  workspaceFolders,
  file,
  cursor,
  settings,
  theme,
  onToggleTerminal,
}: Props) {
  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item status-workspace" title={workspaceFolders.join("\n") || "No folder open"}>
          <i className="fa-regular fa-folder"></i>
          <span>{shortWorkspaceLabel(workspaceFolders)}</span>
        </div>
        {file && (
          <div className="status-item status-file" title={file.path}>
            <span>{relativePath(file.path, workspaceFolders)}</span>
            {file.dirty && <span className="status-dirty">Modified</span>}
          </div>
        )}
      </div>
      <div className="status-bar-right">
        <button className="status-button" onClick={onToggleTerminal} title="Toggle Terminal">
          <i className="fa-solid fa-terminal"></i>
          <span>Terminal</span>
        </button>
        {file && (
          <>
            <div className="status-item">Ln {cursor.line}, Col {cursor.column}</div>
            <div className="status-item">Spaces: {settings.tabSize}</div>
            <div className="status-item">UTF-8</div>
            <div className="status-item">{getLanguage(file.name)}</div>
          </>
        )}
        <div className="status-item">{theme}</div>
      </div>
    </div>
  );
}
