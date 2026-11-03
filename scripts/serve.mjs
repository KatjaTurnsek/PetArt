import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};
const port = Number(process.env.PORT || 3000);
http
  .createServer((req, res) => {
    let filename;
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      filename = path.resolve(root, "." + pathname);
      if (!filename.startsWith(root + path.sep) && filename !== root) throw new Error();
      if (fs.statSync(filename).isDirectory()) filename = path.join(filename, "index.html");
      if (!fs.statSync(filename).isFile()) throw new Error();
    } catch {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(path.join(root, "404.html")));
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filename).pipe(res);
  })
  .listen(port, "127.0.0.1", () => console.log(`Pet Art preview: http://localhost:${port}`));
