import { useRef, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { OpenFile } from "../App";
import { EditorSettings } from "../settings";

interface Props {
  file: OpenFile;
  rootPath: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onReload?: (path: string, content: string) => void;
  onCursorChange?: (position: { line: number; column: number }) => void;
  settings?: EditorSettings;
  theme: string;
}

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    rs: "rust", go: "go", py: "python",
    js: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript",
    json: "json", toml: "toml",
    yaml: "yaml", yml: "yaml",
    md: "markdown", html: "html", css: "css",
    sh: "shell", bash: "shell", zsh: "shell",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    java: "java", xml: "xml", sql: "sql",
    dockerfile: "dockerfile",
  };
  return map[ext] || "plaintext";
}

function getMonacoTheme(theme: string): string {
  const map: Record<string, string> = {
    dark: "yac-dark",
    light: "yac-light",
    monokai: "yac-monokai",
    "solarized-dark": "yac-solarized-dark",
  };
  return map[theme] || "yac-dark";
}

export default function MonacoEditor({ file, rootPath, onChange, onSave, onReload, onCursorChange, settings, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const layoutFrameRef = useRef<number | null>(null);
  const lastLayoutSizeRef = useRef({ width: 0, height: 0 });
  const lastMtimeRef = useRef<number>(0);
  const fileRef = useRef(file);
  const onReloadRef = useRef(onReload);
  fileRef.current = file;
  onReloadRef.current = onReload;

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    const position = editor.getPosition();
    onCursorChange?.({
      line: position?.lineNumber || 1,
      column: position?.column || 1,
    });

    monaco.editor.defineTheme("yac-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.foreground": "#d4d4d4",
        "editor.selectionBackground": "#264f78",
        "editorCursor.foreground": "#d4d4d4",
        "minimap.background": "#1e1e1e",
        "minimapSlider.background": "#79797933",
        "minimapSlider.hoverBackground": "#64646459",
        "minimapSlider.activeBackground": "#bfbfbf33",
      },
    });

    monaco.editor.defineTheme("yac-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#333333",
        "editor.selectionBackground": "#add6ff",
        "editorCursor.foreground": "#333333",
        "minimap.background": "#ffffff",
        "minimapSlider.background": "#0000001a",
        "minimapSlider.hoverBackground": "#00000026",
        "minimapSlider.activeBackground": "#00000033",
      },
    });

    monaco.editor.defineTheme("yac-monokai", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "f92672" },
        { token: "string", foreground: "e6db74" },
        { token: "comment", foreground: "75715e", fontStyle: "italic" },
        { token: "number", foreground: "ae81ff" },
        { token: "type", foreground: "66d9ef" },
        { token: "function", foreground: "a6e22e" },
      ],
      colors: {
        "editor.background": "#272822",
        "editor.foreground": "#f8f8f2",
        "editor.selectionBackground": "#49483e",
        "editorCursor.foreground": "#f8f8f0",
        "minimap.background": "#272822",
        "minimapSlider.background": "#75715e33",
        "minimapSlider.hoverBackground": "#75715e59",
        "minimapSlider.activeBackground": "#f8f8f233",
      },
    });

    monaco.editor.defineTheme("yac-solarized-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword",   foreground: "859900" },
        { token: "string",    foreground: "2aa198" },
        { token: "comment",   foreground: "586e75", fontStyle: "italic" },
        { token: "number",    foreground: "d33682" },
        { token: "type",      foreground: "268bd2" },
        { token: "function",  foreground: "b58900" },
        { token: "variable",  foreground: "cb4b16" },
        { token: "constant",  foreground: "6c71c4" },
      ],
      colors: {
        "editor.background":              "#002b36",
        "editor.foreground":              "#839496",
        "editor.selectionBackground":     "#073642",
        "editorCursor.foreground":        "#819090",
        "editor.lineHighlightBackground": "#073642",
        "editorLineNumber.foreground":    "#586e75",
        "minimap.background":             "#002b36",
        "minimapSlider.background":       "#586e7533",
        "minimapSlider.hoverBackground":  "#586e7559",
        "minimapSlider.activeBackground": "#83949633",
      },
    });

    monaco.editor.setTheme(getMonacoTheme(theme));

    // Cmd+S / Ctrl+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave();
    });

    // Cmd+G → goto line
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      editor.getAction("editor.action.gotoLine")?.run();
    });

    editor.onDidChangeCursorPosition((event) => {
      onCursorChange?.({
        line: event.position.lineNumber,
        column: event.position.column,
      });
    });

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      lastLayoutSizeRef.current = {
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      };
      editor.layout(lastLayoutSizeRef.current);
    }

    // Check for external changes when editor gains focus
    editor.onDidFocusEditorText(async () => {
      const f = fileRef.current;
      if (!f.path || f.dirty) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const info = await invoke<{ mtime: number }>("get_file_info", { path: f.path, workspaceRoot: rootPath });
        if (info.mtime > lastMtimeRef.current) {
          if (window.confirm(`"${f.name}" has been modified externally. Reload?`)) {
            const content = await invoke<string>("read_file", { path: f.path, workspaceRoot: rootPath });
            lastMtimeRef.current = info.mtime;
            onReloadRef.current?.(f.path, content);
          } else {
            lastMtimeRef.current = info.mtime;
          }
        }
      } catch {}
    });
  };

  // Sync Monaco theme when IDE theme changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(getMonacoTheme(theme));
    }
  }, [theme]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scheduleLayout = (width: number, height: number) => {
      const next = {
        width: Math.floor(width),
        height: Math.floor(height),
      };
      if (next.width <= 0 || next.height <= 0) return;
      const last = lastLayoutSizeRef.current;
      if (last.width === next.width && last.height === next.height) return;

      lastLayoutSizeRef.current = next;
      if (layoutFrameRef.current !== null) {
        cancelAnimationFrame(layoutFrameRef.current);
      }
      layoutFrameRef.current = requestAnimationFrame(() => {
        layoutFrameRef.current = null;
        editorRef.current?.layout(next);
      });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      scheduleLayout(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(el);
    const rect = el.getBoundingClientRect();
    scheduleLayout(rect.width, rect.height);

    return () => {
      observer.disconnect();
      if (layoutFrameRef.current !== null) {
        cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
    };
  }, []);

  // Record mtime when file is opened / changed
  useEffect(() => {
    const checkMtime = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const info = await invoke<{ mtime: number }>("get_file_info", { path: file.path, workspaceRoot: rootPath });
        lastMtimeRef.current = info.mtime;
      } catch {}
    };
    checkMtime();
  }, [file.path, rootPath]);

  return (
    <div className="monaco-editor-host" ref={containerRef}>
      <Editor
        height="100%"
        language={getLanguage(file.name)}
        value={file.content}
        theme={getMonacoTheme(theme)}
        onChange={(val) => onChange(val || "")}
        onMount={handleMount}
        options={{
          fontSize: settings?.fontSize ?? 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
          minimap: {
            enabled: settings?.minimapEnabled ?? true,
            renderCharacters: false,
            showSlider: "mouseover",
          },
          wordWrap: settings?.wordWrap ?? "off",
          scrollBeyondLastLine: false,
          renderWhitespace: "selection",
          tabSize: settings?.tabSize ?? 4,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          automaticLayout: false,
        }}
      />
    </div>
  );
}
