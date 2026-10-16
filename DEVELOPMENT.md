# Developing Checkboxes

## Build and test

```bash
npm install
npm run build   # typecheck, then a minified main.js
npm run dev     # an unminified main.js with an inline source map, for debugging
npm test        # the logic tests in test/
npm run lint    # eslint with Obsidian's plugin review rules (eslint-plugin-obsidianmd)
```

Obsidian loads `main.js`, `manifest.json` and `styles.css` from `<vault>/.obsidian/plugins/checkboxes/`. Each build copies the three files there: into the folder named by the `CHECKBOXES_PLUGIN_DIR` environment variable, or else into `~/Documents/Obsidian Vault/.obsidian/plugins/checkboxes/` when that folder exists. After a rebuild, turn the plugin off and on under **Settings → Community plugins** to load the new code.

## How it works

`src/main.ts` only wires the parts together. `src/logic.ts` holds the syntax and every rule as pure functions without runtime imports from `obsidian`: parsing items, toggling, the **Toggle checklist item** command, Enter and Backspace, converting tasks, counting per heading, and matching rendered items to their source lines. `test/logic.test.ts` covers them, partly against a converted trip note in `test/fixtures/`.

`src/editor.ts` draws the boxes in Live Preview as CodeMirror widgets. A box covers the bullet and `( ) ` and is exactly as wide as the bullet, so wrapped lines stay aligned; a cursor inside the marker shows the source. `src/reading.ts` turns rendered list items into boxes in Reading view, embeds, hover previews and canvas cards; a click there finds the line from the renderer's line number, or else by the item's text and the heading above it. `src/bar.ts` places the progress bar inside `.cm-sizer` in Live Preview and after `.mod-header` in Reading view, where a `MutationObserver` puts it back after each re-render. `src/settings.ts` declares the settings with `getSettingDefinitions()`, so they appear in Obsidian's settings search. Every color in `styles.css` comes from the active theme.

The plugin uses no Node or Electron APIs and makes no network requests, so `isDesktopOnly` is `false`.

## Release

1. `npm version <x.y.z>` sets the version in `package.json`, `manifest.json` and `versions.json` (through `version-bump.mjs`), commits, and tags the commit `x.y.z` without a `v`.
2. `git push --follow-tags` starts `.github/workflows/release.yml`, which checks that the tag matches `manifest.json`, builds, tests, lints and opens a draft release with `main.js`, `manifest.json` and `styles.css` attached.
3. Review the draft on GitHub and publish it. Obsidian offers the update to users once the release is published.

Raise `minAppVersion` in `manifest.json` before `npm version` when a release needs a newer Obsidian.
