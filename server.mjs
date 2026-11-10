import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const root = fileURLToPath(new URL("./", import.meta.url));
// Files are served from the project root first, then from dist/ (e.g. the packaged extension zip).
const searchRoots = [root, join(root, "dist")];
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4318);
const shouldOpen = process.argv.includes("--open");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".webm": "video/webm"
};

async function resolveFile(requested) {
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  for (const base of searchRoots) {
    const candidate = join(base, safePath);
    if (!candidate.startsWith(base.endsWith(sep) ? base : base + sep)) continue;
    try { if ((await stat(candidate)).isFile()) return candidate; } catch {}
  }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    // Unknown paths without an extension fall back to the app shell.
    const filePath = (await resolveFile(requested)) || (extname(requested) ? null : join(root, "index.html"));
    if (!filePath) throw new Error("not found");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": types[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.log(`Port ${port} is already in use — the app is probably already running at http://${host}:${port}`);
    if (shouldOpen) openBrowser();
    process.exit(0);
  }
  throw error;
});

function openBrowser() {
  const url = `http://${host}:${port}`;
  const command = process.platform === "darwin"
    ? `open -a "Google Chrome" "${url}" || open "${url}"`
    : process.platform === "win32" ? `start chrome "${url}"` : `xdg-open "${url}"`;
  exec(command, () => {});
}

server.listen(port, host, () => {
  console.log(`Pathways Research Kit is running at http://${host}:${port}`);
  console.log("Data stays in this Chrome profile (IndexedDB). Press Ctrl+C to stop the server.");
  if (shouldOpen) openBrowser();
});
