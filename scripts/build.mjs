// Builds the static site into dist/ for GitHub Pages (and any static host).
// The local server (server.mjs) serves the source files directly, so it does not need this step.
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const siteFiles = ["index.html", "app.js", "styles.css", "trace.css"];

if (!dist.startsWith(root) || dist === root) throw new Error(`Refusing to clean unexpected path: ${dist}`);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of siteFiles) {
  if (!existsSync(join(root, file))) throw new Error(`Missing site file: ${file}`);
  cpSync(join(root, file), join(dist, file));
}

// Serve files as-is (no Jekyll processing on GitHub Pages).
writeFileSync(join(dist, ".nojekyll"), "");

// Downloadable copy of the Chrome extension, linked from the setup guide.
execFileSync("zip", ["-r", "-X", "-q", join(dist, "pathways-trace-extension.zip"), "trace-extension", "-x", "trace-extension/test-*", "-x", "*.DS_Store"], { cwd: root, stdio: "inherit" });

console.log(`Built ${siteFiles.length} site files + extension zip into dist/`);
