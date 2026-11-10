// Builds the static site into dist/ for GitHub Pages (and any static host).
// The local server (server.mjs) serves the source files directly, so it does not need this step.
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const siteFiles = ["index.html", "participate.html", "app.js", "participant.js", "questions.js", "participant-config.js", "styles.css", "trace.css", "participant.css"];

if (!dist.startsWith(root) || dist === root) throw new Error(`Refusing to clean unexpected path: ${dist}`);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of siteFiles) {
  if (!existsSync(join(root, file))) throw new Error(`Missing site file: ${file}`);
  cpSync(join(root, file), join(dist, file));
}

// Cache-busting: GitHub Pages lets browsers cache files for ~10 minutes, which can pair a new
// page with an old script/stylesheet. Tag every asset URL with a hash of its contents.
// Shared modules first, so the scripts that import them get a new hash when they change.
const hashOf = file => createHash("sha256").update(readFileSync(join(dist, file))).digest("hex").slice(0, 10);
const tag = (file, assets) => {
  let text = readFileSync(join(dist, file), "utf8");
  for (const asset of assets) {
    const escaped = asset.replace(/[.]/g, "\\.");
    text = text.replace(new RegExp(`(src=|href=|from )"(\\./)?${escaped}"`, "g"), (match, lead, dot = "") => `${lead}"${dot}${asset}?v=${hashOf(asset)}"`);
  }
  writeFileSync(join(dist, file), text);
};
const modules = ["questions.js", "participant-config.js"];
tag("app.js", modules);
tag("participant.js", modules);
const pageAssets = ["app.js", "participant.js", "styles.css", "trace.css", "participant.css"];
tag("index.html", pageAssets);
tag("participate.html", pageAssets);

// Serve files as-is (no Jekyll processing on GitHub Pages).
writeFileSync(join(dist, ".nojekyll"), "");

// Downloadable copy of the Chrome extension, linked from the setup guide.
execFileSync("zip", ["-r", "-X", "-q", join(dist, "pathways-trace-extension.zip"), "trace-extension", "-x", "trace-extension/test-*", "-x", "*.DS_Store"], { cwd: root, stdio: "inherit" });

console.log(`Built ${siteFiles.length} site files + extension zip into dist/`);
