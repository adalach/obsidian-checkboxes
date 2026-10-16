import * as esbuild from "esbuild";
import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { homedir } from "node:os";
import path from "node:path";

// After a build, copy the plugin into a vault to try it: CHECKBOXES_PLUGIN_DIR, or else
// ~/Documents/Obsidian Vault/.obsidian/plugins/checkboxes when that folder exists.
const defaultDir = path.join(homedir(), "Documents", "Obsidian Vault", ".obsidian", "plugins", "checkboxes");
const vaultDir = process.env.CHECKBOXES_PLUGIN_DIR ?? (existsSync(defaultDir) ? defaultDir : null);

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules, ...builtinModules.map(m => `node:${m}`)],
  format: "cjs",
  platform: "browser",
  target: "es2020",
  outfile: "main.js",
  minify: process.argv.includes("--prod"),
  sourcemap: process.argv.includes("--prod") ? false : "inline",
  logLevel: "info"
});

if (vaultDir) {
  await mkdir(vaultDir, { recursive: true });
  await Promise.all(["main.js", "manifest.json", "styles.css"].map(f => copyFile(f, path.join(vaultDir, f))));
}
