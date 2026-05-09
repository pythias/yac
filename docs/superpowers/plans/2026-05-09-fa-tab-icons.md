# FA Tab Icon Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace emoji-based terminal tab icons with Font Awesome Free solid icons rendered inside a colored square; color changes both the square background and the tab underline simultaneously.

**Architecture:** Install `@fortawesome/fontawesome-free` and import its CSS globally. In `TerminalPanel.tsx`, replace the `PRESET_ICONS` emoji array with FA icon names, replace the emoji `<span>` in tab rendering with a 16×16 colored square containing an `<i class="fa-solid fa-*">` element, update the icon picker to show colored squares, and add an `iconColor` helper for auto contrast. Update `styles.css` to remove the old icon picker styles and add new ones.

**Tech Stack:** React 18, TypeScript 5, `@fortawesome/fontawesome-free` 6.x, CSS

---

### Task E-1: Install Font Awesome Free and import CSS

**Files:**
- Modify: `ui/package.json` (via pnpm)
- Modify: `ui/src/main.tsx`

- [ ] **Step 1: Install the package**

```bash
cd /Users/chenjie/Code/rust/yac/ui
pnpm add @fortawesome/fontawesome-free
```

Expected output: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Import FA CSS in main.tsx**

Open `ui/src/main.tsx`. Current content:

```tsx
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);
```

Replace with:

```tsx
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd /Users/chenjie/Code/rust/yac/ui
npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/package.json ui/pnpm-lock.yaml ui/src/main.tsx
git commit -m "feat: install @fortawesome/fontawesome-free and import CSS"
```

---

### Task E-2: Refactor TerminalPanel — icon/color rendering + pickers

**Files:**
- Modify: `ui/src/components/TerminalPanel.tsx`

- [ ] **Step 1: Replace PRESET_ICONS and add iconColor helper**

In `TerminalPanel.tsx`, find:

```ts
const PRESET_ICONS = ["🚀", "🔥", "⚡", "🐛", "🌿", "📦", "🔧", "🎯", "💻", "🌐"];
```

Replace with:

```ts
const PRESET_ICONS = [
  "terminal",      "code",          "bolt",          "bug",
  "server",        "database",      "code-branch",   "cube",
  "rocket",        "gear",          "flask",         "fire",
  "layer-group",   "network-wired", "microchip",     "folder",
  "play",          "key",           "cloud",         "leaf",
];

function expandHex(hex: string): string {
  const h = hex.replace("#", "");
  return h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
}

function iconColor(bgColor: string): string {
  const hex = expandHex(bgColor);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r + g + b > 382 ? "#000" : "#fff";
}
```

- [ ] **Step 2: Update tab rendering — replace emoji span with colored square**

Find the tab rendering block (inside the `.map((tab, i) => ...)` return):

```tsx
) : (
  <span>{tab.icon ? tab.icon + " " : ""}{tab.title}</span>
)}
```

Replace with:

```tsx
) : (
  <>
    <div style={{
      width: 16, height: 16, borderRadius: 3,
      background: tab.color ?? "#0af",
      display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
    }}>
      <i
        className={`fa-solid fa-${tab.icon ?? "terminal"}`}
        style={{ fontSize: 9, color: iconColor(tab.color ?? "#0af") }}
      />
    </div>
    <span>{tab.title}</span>
  </>
)}
```

- [ ] **Step 3: Update icon picker — show colored squares instead of emoji spans**

Find the icon picker render block:

```tsx
{contextMenu && contextMenu.submenu === "icon" && (
  <div
    className="tab-icon-picker"
    style={{ left: contextMenu.x, top: contextMenu.y }}
  >
    {PRESET_ICONS.map((emoji) => (
      <span
        key={emoji}
        title={emoji}
        onClick={() => {
          setTabs((prev) =>
            prev.map((t, i) =>
              i === contextMenu.targetIndex ? { ...t, icon: emoji } : t
            )
          );
          setContextMenu(null);
        }}
      >
        {emoji}
      </span>
    ))}
  </div>
)}
```

Replace with:

```tsx
{contextMenu && contextMenu.submenu === "icon" && (
  <div
    className="tab-icon-picker"
    style={{ left: contextMenu.x, top: contextMenu.y }}
  >
    {PRESET_ICONS.map((iconName) => {
      const currentColor = tabs[contextMenu.targetIndex]?.color ?? "#0af";
      return (
        <div
          key={iconName}
          className="icon-swatch"
          title={iconName}
          style={{
            background: currentColor,
          }}
          onClick={() => {
            setTabs((prev) =>
              prev.map((t, i) =>
                i === contextMenu.targetIndex ? { ...t, icon: iconName } : t
              )
            );
            setContextMenu(null);
          }}
        >
          <i
            className={`fa-solid fa-${iconName}`}
            style={{ fontSize: 11, color: iconColor(currentColor) }}
          />
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/chenjie/Code/rust/yac/ui
npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/components/TerminalPanel.tsx
git commit -m "feat: replace emoji icons with FA solid icons in colored squares"
```

---

### Task E-3: Update styles.css — icon picker styles

**Files:**
- Modify: `ui/src/styles.css`

- [ ] **Step 1: Replace `.tab-icon-picker span` styles with `.icon-swatch`**

Find in `styles.css`:

```css
.tab-icon-picker span {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  font-size: 16px;
}

.tab-icon-picker span:hover {
  background: var(--context-menu-hover);
}
```

Replace with:

```css
.icon-swatch {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  border: 2px solid transparent;
  flex-shrink: 0;
}

.icon-swatch:hover {
  border-color: #fff;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add ui/src/styles.css
git commit -m "feat: update icon picker styles for FA icon swatches"
```
