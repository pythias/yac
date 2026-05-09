# Drag Range 10%–90% Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded min/max pixel limits on drag handles with dynamic 10%–90% of the relevant container dimension.

**Architecture:** Three drag handlers need updating: (1) `Sidebar.tsx` — sidebar width relative to `window.innerWidth`; (2) `App.tsx` `handleTerminalDragStart` — terminal bottom height relative to `main-content` container height, terminal right width relative to `main-content` container width; (3) `App.tsx` `handleEditorRightDragStart` — same right-mode limit as terminal right. Add a `mainContentRef` to the `.main-content` div in App.tsx and pass it to both drag handlers.

**Tech Stack:** React 18, TypeScript 5

---

### Task F-1: Update Sidebar drag range to 10%–90% of window width

**Files:**
- Modify: `ui/src/components/Sidebar.tsx`

- [ ] **Step 1: Update `handleResizeMouseDown` range calculation**

In `Sidebar.tsx`, find `handleResizeMouseDown`:

```ts
const handleResizeMouseDown = (e: React.MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = width;
  const onMove = (ev: MouseEvent) => {
    const next = Math.min(400, Math.max(140, startWidth + ev.clientX - startX));
    onWidthChange(next);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    window.removeEventListener("blur", onUp);
  };
  window.addEventListener("blur", onUp);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
};
```

Replace the entire function with:

```ts
const handleResizeMouseDown = (e: React.MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = width;
  const onMove = (ev: MouseEvent) => {
    const min = window.innerWidth * 0.1;
    const max = window.innerWidth * 0.9;
    const next = Math.min(max, Math.max(min, startWidth + ev.clientX - startX));
    onWidthChange(next);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    window.removeEventListener("blur", onUp);
  };
  window.addEventListener("blur", onUp);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
};
```

- [ ] **Step 2: Also remove the hardcoded CSS min/max-width constraints on `.sidebar`**

In `ui/src/styles.css`, find:

```css
.sidebar {
  position: relative;
  min-width: 140px;
  max-width: 400px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  font-size: 13px;
  flex-shrink: 0;
}
```

Replace with:

```css
.sidebar {
  position: relative;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  font-size: 13px;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/chenjie/Code/rust/yac/ui
npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/components/Sidebar.tsx ui/src/styles.css
git commit -m "feat: sidebar drag range 10-90% of window width"
```

---

### Task F-2: Add mainContentRef and update terminal drag ranges in App.tsx

**Files:**
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Add `mainContentRef`**

In `App.tsx`, find:

```tsx
const terminalRef = useRef<TerminalPanelHandle>(null);
```

Add immediately after:

```tsx
const mainContentRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 2: Attach ref to `.main-content` div**

Find:

```tsx
<div className="main-content">
```

Replace with:

```tsx
<div className="main-content" ref={mainContentRef}>
```

- [ ] **Step 3: Update `handleTerminalDragStart` — dynamic range**

Find `handleTerminalDragStart`:

```tsx
const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  const isBottom = terminalPosition === "bottom";
  const startPos = isBottom ? e.clientY : e.clientX;
  const startSize = terminalSize;
  const onMove = (ev: MouseEvent) => {
    const delta = isBottom ? startPos - ev.clientY : startPos - ev.clientX;
    const next = Math.min(isBottom ? 600 : 700, Math.max(100, startSize + delta));
    setTerminalSize(next);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    window.removeEventListener("blur", onUp);
    setTimeout(() => terminalRef.current?.fitAll(), 50);
  };
  window.addEventListener("blur", onUp);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}, [terminalPosition, terminalSize]);
```

Replace with:

```tsx
const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  const isBottom = terminalPosition === "bottom";
  const startPos = isBottom ? e.clientY : e.clientX;
  const startSize = terminalSize;
  const container = mainContentRef.current;
  const onMove = (ev: MouseEvent) => {
    const total = isBottom
      ? (container?.clientHeight ?? window.innerHeight)
      : (container?.clientWidth ?? window.innerWidth);
    const min = total * 0.1;
    const max = total * 0.9;
    const delta = isBottom ? startPos - ev.clientY : startPos - ev.clientX;
    const next = Math.min(max, Math.max(min, startSize + delta));
    setTerminalSize(next);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    window.removeEventListener("blur", onUp);
    setTimeout(() => terminalRef.current?.fitAll(), 50);
  };
  window.addEventListener("blur", onUp);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}, [terminalPosition, terminalSize]);
```

- [ ] **Step 4: Update `handleEditorRightDragStart` — dynamic range**

Find `handleEditorRightDragStart`:

```tsx
const handleEditorRightDragStart = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  const startPos = e.clientX;
  const startSize = terminalSize;
  const onMove = (ev: MouseEvent) => {
    const delta = startPos - ev.clientX;
    const next = Math.min(700, Math.max(100, startSize + delta));
    setTerminalSize(next);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    window.removeEventListener("blur", onUp);
    setTimeout(() => terminalRef.current?.fitAll(), 50);
  };
  window.addEventListener("blur", onUp);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}, [terminalSize]);
```

Replace with:

```tsx
const handleEditorRightDragStart = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  const startPos = e.clientX;
  const startSize = terminalSize;
  const container = mainContentRef.current;
  const onMove = (ev: MouseEvent) => {
    const total = container?.clientWidth ?? window.innerWidth;
    const min = total * 0.1;
    const max = total * 0.9;
    const delta = startPos - ev.clientX;
    const next = Math.min(max, Math.max(min, startSize + delta));
    setTerminalSize(next);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    window.removeEventListener("blur", onUp);
    setTimeout(() => terminalRef.current?.fitAll(), 50);
  };
  window.addEventListener("blur", onUp);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}, [terminalSize]);
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/chenjie/Code/rust/yac/ui
npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/App.tsx
git commit -m "feat: terminal and editor drag range 10-90% of container size"
```
