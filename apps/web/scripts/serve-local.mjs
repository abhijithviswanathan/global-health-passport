/**
 * Local server for an already built web client, with /api forwarded to Java on 8080.
 * This is used by start_saved.py, not by GitHub Pages. File resolution below must
 * stay inside dist/client; it is not a general filesystem download endpoint.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/client",
);
if (!fs.existsSync(path.join(root, "index.html")))
  throw new Error("Run npm run build first.");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};
const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  const url = new URL(req.url, "http://localhost");
  // Keep browser requests same-origin while Java owns sessions, CSRF and authorization.
  if (url.pathname.startsWith("/api/")) {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 8080,
        path: url.pathname + url.search,
        method: req.method,
        headers: req.headers,
        timeout: 35000,
      },
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent)
        res.writeHead(502, { "Content-Type": "application/json" });
      res.end('{"message":"Clinical service unavailable"}');
    });
    req.pipe(upstream);
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  // Normalize before containment checking so encoded traversal cannot escape the build directory.
  let file = path.resolve(root, "." + decoded);
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (file === root || (fs.existsSync(file) && fs.statSync(file).isDirectory()))
    file = path.join(file, "index.html");
  if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.setHeader(
    "Content-Type",
    mime[path.extname(file)] || "application/octet-stream",
  );
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
});
server.requestTimeout = 40000;
server.listen(5173, "127.0.0.1", () =>
  console.log(
    "Health Passport: http://localhost:5173 (clinical backend required on port 8080)",
  ),
);
