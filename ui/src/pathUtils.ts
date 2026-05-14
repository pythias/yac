/** Path helpers for display/join logic (Rust APIs accept native paths; these keep UI consistent). */

export function normalizePathSeparators(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Parent directory; supports `/` and `\\` and Windows drive roots. */
export function pathDirname(p: string): string {
  const s = p.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  if (i < 0) return s;
  if (i === 0) return s.slice(0, 1);
  const prefix = s.slice(0, i);
  if (/^[A-Za-z]:$/.test(prefix) && (s[i] === "\\" || s[i] === "/")) {
    return s.slice(0, i + 1);
  }
  return prefix;
}

/** Join two path segments using the separator style of `dir`. */
export function pathJoin(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const base = dir.replace(/[/\\]+$/, "");
  const rest = name.replace(/^[/\\]+/, "");
  return `${base}${sep}${rest}`;
}

/** Whether `path` is `folder` or a nested path under `folder` (slash-normalized). */
export function isPathUnderWorkspaceRoot(folder: string, path: string): boolean {
  const f = normalizePathSeparators(folder).replace(/\/+$/, "");
  const p = normalizePathSeparators(path);
  return p === f || p.startsWith(`${f}/`);
}

/** Last path segment (folder name for cwd labels). */
export function pathBasename(path: string): string {
  const s = path.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}
