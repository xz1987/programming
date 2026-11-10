// Copies the app into the GitHub Pages repository folder (default: ./programming,
// a clone of github.com/xz1987/programming). Then commit + push there with GitHub Desktop.
// Usage: npm run sync-pages            (or: node scripts/sync-pages.mjs /path/to/pages-repo)
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(process.argv[2] || join(root, "programming"));
if (!existsSync(join(target, ".git"))) throw new Error(`${target} is not a git repository (clone xz1987/programming there first).`);
if (resolve(target) === resolve(root)) throw new Error("Target must be a different folder than the app itself.");

// Refresh dist/ first so the copy includes an up-to-date build and extension zip.
execFileSync(process.execPath, [join(root, "scripts/build.mjs")], { stdio: "inherit" });

const items = [
  "index.html", "app.js", "styles.css", "trace.css",
  "server.mjs", "package.json", "README.md", "Start Pathways.command",
  "scripts", "trace-extension", "dist", ".github/workflows/pages.yml"
];
const skip = path => /(^|\/)\.DS_Store$/.test(path);

for (const item of items) {
  const from = join(root, item);
  if (!existsSync(from)) { console.warn(`skip (missing): ${item}`); continue; }
  const to = join(target, item);
  rmSync(to, { recursive: true, force: true }); // mirror: drop files deleted in the app
  cpSync(from, to, { recursive: true, filter: src => !skip(src) });
}

// Only pages.yml should deploy; the GitHub template Jekyll workflow would race it.
rmSync(join(target, ".github/workflows/jekyll-gh-pages.yml"), { force: true });

writeFileSync(join(target, ".gitignore"), ".DS_Store\nnode_modules/\n.claude/\n");

console.log(`Synced app into ${target}\nNext: open that folder in GitHub Desktop, commit, and Push origin.`);
