"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requestedPort = Number.parseInt(process.env.PORT || process.argv[2] || "4173", 10);
const port = Number.isFinite(requestedPort) ? requestedPort : 4173;
const host = process.env.HOST || "0.0.0.0";
const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store"
  });
  res.end(body);
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  const insideRoot = filePath === root || filePath.startsWith(root + path.sep);
  return insideRoot ? filePath : null;
}

const server = http.createServer((req, res) => {
  if ((req.url || "/") === "/health") {
    send(res, 200, JSON.stringify({ ok: true, service: "iron-line" }), "application/json; charset=utf-8");
    return;
  }

  const filePath = resolveRequestPath(req.url || "/");
  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      send(res, 404, "Not found");
      return;
    }

    const type = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

let onlineSocket = null;
try {
  const { RoomRegistry } = require("../server/room-registry");
  const { attachOnlineSocketServer } = require("../server/websocket");
  onlineSocket = attachOnlineSocketServer({ server, registry: new RoomRegistry() });
} catch (error) {
  onlineSocket = { enabled: false, reason: error?.message || "online_socket_setup_failed" };
}

server.listen(port, host, () => {
  console.log(`Iron Line server: http://${displayHost}:${port}/index.html`);
  console.log(`Map editor: http://${displayHost}:${port}/editor.html`);
  if (onlineSocket?.enabled) console.log(`Online socket: ws://${displayHost}:${port}/ws`);
  else console.log(`Online socket disabled: ${onlineSocket?.reason || "not available"}`);
});
