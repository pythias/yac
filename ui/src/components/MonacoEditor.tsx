import { useRef, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { OpenFile } from "../App";

interface Props {
  file: OpenFile;
  onChange: (value: string) => void;
  onSave: () => void;
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
    dark: "vs-dark",
    light: "vs",
    monokai: "monokai",
    "solarized-dark": "solarized-dark",
  };
  return map[theme] || "vs-dark";
}

export default function MonacoEditor({ file, onChange, onSave, theme }: Props) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register Monokai theme
    monaco.editor.defineTheme("monokai", {
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
      },
    });

    // Register Solarized Dark theme
    monaco.editor.defineTheme("solarized-dark", {
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
      },
    });

    monaco.editor.setTheme(getMonacoTheme(theme));

    // Cmd+S / Ctrl+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave();
    });
  };

  // Sync Monaco theme when IDE theme changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(getMonacoTheme(theme));
    }
  }, [theme]);

  return (
    <Editor
      height="100%"
      language={getLanguage(file.name)}
      value={file.content}
      theme={getMonacoTheme(theme)}
      onChange={(val) => onChange(val || "")}
      onMount={handleMount}
      options={{
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
        minimap: { enabled: true },
        wordWrap: "off",
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        tabSize: 4,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        automaticLayout: true,
      }}
    />
  );
}
