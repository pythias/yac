# Brew Cask Release + GitHub Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push a `v*` tag → GitHub Actions builds `.dmg` → uploads to GitHub Releases → auto-updates `pythias/homebrew-yac` Cask formula.

**Architecture:** Two workflows in the main `yac` repo: `release.yml` builds and publishes the DMG; `update-cask.yml` triggers after release, computes sha256, and pushes the updated formula to the `homebrew-yac` tap repo. The tap repo stores `Casks/yac.rb`.

**Tech Stack:** GitHub Actions (macos-latest), Rust/Cargo, Tauri CLI, pnpm, `gh` CLI, bash

---

## Prerequisites (manual — do before running tasks)

1. Go to `https://github.com/pythias/homebrew-yac` and confirm it is empty (just created).
2. Create a GitHub Personal Access Token (PAT):
   - Go to https://github.com/settings/tokens → "Generate new token (classic)"
   - Scopes: `repo` (full)
   - Name: `HOMEBREW_TAP_TOKEN`
   - Copy the token value
3. Add the PAT as a secret in the **main yac repo**:
   - Go to `https://github.com/pythias/yac/settings/secrets/actions` → "New repository secret"
   - Name: `HOMEBREW_TAP_TOKEN`, Value: the token from step 2

---

### Task D-1: Initialize homebrew-yac tap repo with Cask formula

**Files:**
- Create: `Casks/yac.rb` (in `pythias/homebrew-yac` repo, NOT the yac repo)

- [ ] **Step 1: Clone the tap repo locally**

```bash
cd /tmp
git clone https://github.com/pythias/homebrew-yac.git
cd homebrew-yac
```

- [ ] **Step 2: Create the Casks directory and formula file**

```bash
mkdir -p Casks
```

Create file `Casks/yac.rb` with this exact content:

```ruby
cask "yac" do
  version "0.1.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/pythias/yac/releases/download/v#{version}/Yac.IDE_#{version}_aarch64.dmg"

  name "Yac IDE"
  desc "A minimal IDE built with Tauri + React"
  homepage "https://github.com/pythias/yac"

  app "Yac IDE.app"

  # NOTE: Not notarized. On first run: System Settings → Privacy & Security → Open Anyway
end
```

- [ ] **Step 3: Commit and push**

```bash
git add Casks/yac.rb
git commit -m "feat: add initial Yac IDE cask formula"
git push origin main
```

Expected: push succeeds, file visible at `https://github.com/pythias/homebrew-yac/blob/main/Casks/yac.rb`

- [ ] **Step 4: Verify tap is installable (dry run)**

```bash
brew tap pythias/yac https://github.com/pythias/homebrew-yac
brew info --cask yac
```

Expected: shows `Yac IDE: 0.1.0` with the URL. May warn about invalid sha256 — that's fine, it will be updated by CI.

---

### Task D-2: Add `release.yml` — build DMG and create GitHub Release

**Files:**
- Create: `/Users/chenjie/Code/rust/yac/.github/workflows/release.yml`

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p /Users/chenjie/Code/rust/yac/.github/workflows
```

- [ ] **Step 2: Create `release.yml`**

Create `/Users/chenjie/Code/rust/yac/.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  build-macos:
    runs-on: macos-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: ui/pnpm-lock.yaml

      - name: Install frontend dependencies
        run: pnpm install
        working-directory: ui

      - name: Install Tauri CLI
        run: cargo install tauri-cli --version "^2" --locked

      - name: Build Tauri app
        run: cargo tauri build --target aarch64-apple-darwin
        working-directory: src-tauri
        env:
          TAURI_SIGNING_PRIVATE_KEY: ""
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""

      - name: Find DMG
        id: find_dmg
        run: |
          DMG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name "*.dmg" | head -1)
          echo "path=$DMG" >> $GITHUB_OUTPUT
          echo "name=$(basename $DMG)" >> $GITHUB_OUTPUT

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ steps.find_dmg.outputs.path }}
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add .github/workflows/release.yml
git commit -m "ci: add release workflow — build DMG and publish GitHub Release"
```

---

### Task D-3: Add `update-cask.yml` — auto-update homebrew-yac formula

**Files:**
- Create: `/Users/chenjie/Code/rust/yac/.github/workflows/update-cask.yml`

- [ ] **Step 1: Create `update-cask.yml`**

Create `/Users/chenjie/Code/rust/yac/.github/workflows/update-cask.yml`:

```yaml
name: Update Homebrew Cask

on:
  release:
    types: [published]

jobs:
  update-cask:
    runs-on: macos-latest

    steps:
      - name: Get release info
        id: release
        run: |
          TAG="${{ github.event.release.tag_name }}"
          VERSION="${TAG#v}"
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "tag=$TAG" >> $GITHUB_OUTPUT

      - name: Download DMG and compute sha256
        id: sha
        run: |
          VERSION="${{ steps.release.outputs.version }}"
          URL="https://github.com/pythias/yac/releases/download/v${VERSION}/Yac.IDE_${VERSION}_aarch64.dmg"
          curl -L -o /tmp/yac.dmg "$URL"
          SHA=$(shasum -a 256 /tmp/yac.dmg | awk '{print $1}')
          echo "sha256=$SHA" >> $GITHUB_OUTPUT
          echo "url=$URL" >> $GITHUB_OUTPUT

      - name: Checkout homebrew-yac tap
        uses: actions/checkout@v4
        with:
          repository: pythias/homebrew-yac
          token: ${{ secrets.HOMEBREW_TAP_TOKEN }}
          path: homebrew-yac

      - name: Update formula
        run: |
          VERSION="${{ steps.release.outputs.version }}"
          SHA="${{ steps.sha.outputs.sha256 }}"
          cd homebrew-yac
          sed -i '' "s/version \".*\"/version \"${VERSION}\"/" Casks/yac.rb
          sed -i '' "s/sha256 \".*\"/sha256 \"${SHA}\"/" Casks/yac.rb
          cat Casks/yac.rb

      - name: Commit and push
        run: |
          cd homebrew-yac
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add Casks/yac.rb
          git commit -m "chore: update yac to ${{ steps.release.outputs.version }}"
          git push
```

- [ ] **Step 2: Commit**

```bash
cd /Users/chenjie/Code/rust/yac
git add .github/workflows/update-cask.yml
git commit -m "ci: add update-cask workflow — auto-update homebrew-yac formula on release"
```

---

### Task D-4: Push a test tag and verify end-to-end

- [ ] **Step 1: Push the workflows to remote**

```bash
cd /Users/chenjie/Code/rust/yac
git push origin main
```

- [ ] **Step 2: Tag and push**

```bash
cd /Users/chenjie/Code/rust/yac
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 3: Monitor the release workflow**

Open: `https://github.com/pythias/yac/actions`

Expected sequence:
1. `Release` workflow starts (~15–20 min build time)
2. On success: GitHub Release `v0.1.0` appears at `https://github.com/pythias/yac/releases`
3. `Update Homebrew Cask` workflow triggers automatically
4. `pythias/homebrew-yac/Casks/yac.rb` updated with real sha256

- [ ] **Step 4: Verify install**

```bash
brew update
brew install --cask yac
```

Expected: downloads DMG, installs `Yac IDE.app` to `/Applications`. First launch may require: System Settings → Privacy & Security → Open Anyway.

- [ ] **Step 5: Verify formula updated**

```bash
cat $(brew --repository)/Library/Taps/pythias/homebrew-yac/Casks/yac.rb
```

Expected: `version` and `sha256` match the release.
