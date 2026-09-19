// Loopback-only static export server for browser checks. No production hosting.
import { createServer } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../out/", import.meta.url)));
await access(join(root, "index.html")); // Fail early if the build is missing.
const types = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".txt": "text/plain", ".glb": "model/gltf-binary",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png",
  ".avif": "image/avif", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(root, `.${pathname}`);
    if (path !== root && !path.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    // Match production's .html-first lookup ahead of Next's RSC directories.
    for (const file of [path + ".html", path, join(path, "index.html")]) {
      if (!(await stat(file).catch(() => null))?.isFile()) continue;
      const bytes = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Content-Length": bytes.length,
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
      return;
    }
    response.writeHead(404).end();
  } catch {
    response.writeHead(500).end();
  }
}).listen(3216, "127.0.0.1");
