# Development

Engineering notes for working on DuckData itself. End-user docs live in
[README.md](./README.md).

## Build

```sh
npm install
npm run dev      # esbuild watch → dist/{main.js,manifest.json,styles.css}
npm run build    # type-check + production bundle into dist/
```

Build output goes to `dist/`, which contains the three files Obsidian needs:
`main.js`, `manifest.json`, `styles.css`.

## Link `dist/` into a vault

Use the helper script (requires Administrator PowerShell **or** Windows Developer Mode):

```powershell
./scripts/link-to-vault.ps1 -VaultPath 'D:\MyVault'
```

This creates the symlink `<vault>/.obsidian/plugins/duckdata → <repo>/dist`,
so each `npm run dev` rebuild is picked up automatically (use Obsidian's
**Reload app without saving** or the Hot-Reload plugin to refresh).

## Cutting a release

Obsidian rejects `v`-prefixed tags — use pure semver throughout.

```sh
# 1. Sync version across manifest.json + versions.json + package.json
npm run bump 0.2.0

# 2. Commit the version bump
git add -A
git commit -m "release: 0.2.0"
git push

# 3. Tag and push (interactive; lists existing tags first)
./tag.ps1 -Tag 0.2.0
# or, non-interactive:
./tag.ps1 -Tag 0.2.0 -Force
```

The `Release` workflow then builds `dist/` and publishes a GitHub release with
`main.js`, `manifest.json`, `styles.css`, and a `SHA256SUMS.txt`. Obsidian's
plugin updater pulls these files directly from the release.

### Dry-run a release

Append `-test` or `-debug` to the tag — the workflow will still build and
verify outputs but **skip** publishing the GitHub release:

```sh
./tag.ps1 -Tag 0.2.0-test
```

### Removing a tag

Use `tag-del.ps1` to clean up a failed or dry-run tag (deletes both local and
remote). Note: this does **not** delete the corresponding GitHub Release if
one was already created — delete that from the Releases page.

```sh
./tag-del.ps1 -Tag 0.2.0-test
# or, non-interactive:
./tag-del.ps1 -Tag 0.2.0-test -Force
```

## Submitting to the community plugin list

First-time submission only: fork
[obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases),
append the entry below to `community-plugins.json`, and open a PR following the
review checklist in the PR template.

```json
{
  "id": "duckdata",
  "name": "DuckData",
  "author": "Hui LIU",
  "description": "Query and visualize vault/markdown data with embedded duckdata code blocks, powered by DuckDB-WASM.",
  "repo": "atliuhui/obsidian-duckdata"
}
```
