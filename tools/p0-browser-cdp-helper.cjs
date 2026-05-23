"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const chromePath = process.env.CHROME_PATH || ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((item) => fs.existsSync(item));

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
function stat(values = []) {
  const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const total = list.reduce((sum, value) => sum + value, 0);
  const at = (pct) => list[Math.min(list.length - 1, Math.floor(list.length * pct))] || 0;
  return { count: list.length, avg: round(total / Math.max(1, list.length)), p95: round(at(0.95)), max: round(list[list.length - 1] || 0) };
}
function makeRequestJson(baseUrl) {
  return function requestJson(pathname, options = {}) {
    const body = options.body ? JSON.stringify(options.body) : "";
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${pathname}`, {
        method: options.method || "GET",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
        timeout: options.timeout || 8000
      }, (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let payload = {};
          try { payload = raw ? JSON.parse(raw) : {}; } catch (error) { return reject(error); }
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`${options.method || "GET"} ${pathname} ${res.statusCode}: ${raw}`));
          resolve(payload);
        });
      });
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error(`${pathname} timed out`)));
      if (body) req.write(body);
      req.end();
    });
  };
}
async function waitForServer(requestJson) {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await requestJson("/api/build", { timeout: 1000 })).ok) return; } catch (_error) {}
    await sleep(200);
  }
  throw new Error("static server did not start");
}
function cdpJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch (error) { reject(error); } });
    }).on("error", reject);
  });
}
async function waitForTarget(port) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const page = (await cdpJson(port, "/json/list")).find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (_error) {}
    await sleep(200);
  }
  throw new Error(`Chrome target ${port} did not start`);
}

class CdpPage {
  constructor(name, wsUrl, child, profileDir) {
    this.name = name;
    this.child = child;
    this.profileDir = profileDir;
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.requests = new Map();
    this.metrics = freshMetrics();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
      this.ws.on("message", (raw) => this.onMessage(raw));
    });
    await this.send("Network.enable");
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    await this.send("Log.enable");
    this.on("Network.requestWillBeSent", (p) => this.requests.set(p.requestId, { method: p.request.method, url: p.request.url, status: 0 }));
    this.on("Network.responseReceived", (p) => {
      const item = this.requests.get(p.requestId) || {};
      item.url = p.response.url;
      item.status = p.response.status;
      this.requests.set(p.requestId, item);
    });
    this.on("Network.loadingFinished", (p) => {
      const item = this.requests.get(p.requestId);
      if (item) recordHttp(this.metrics, item.method, item.url, p.encodedDataLength || 0, item.status);
    });
    this.on("Runtime.exceptionThrown", (p) => this.metrics.errors.push(p.exceptionDetails?.text || "runtime_exception"));
    this.on("Log.entryAdded", (p) => { if (["error", "warning"].includes(p.entry?.level)) this.metrics.errors.push(p.entry.text); });
  }
  onMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result || {});
      return;
    }
    for (const handler of this.handlers.get(msg.method) || []) handler(msg.params || {});
  }
  on(method, handler) {
    const list = this.handlers.get(method) || [];
    list.push(handler);
    this.handlers.set(method, list);
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate failed");
    return result.result?.value;
  }
  async navigate(url) {
    await this.send("Page.navigate", { url });
    await waitForExpression(this, "document.readyState === 'complete' && !!window.IronLine?.game?.hud?.sessionFlow", 12000);
  }
  resetMetrics() {
    this.metrics = freshMetrics();
    this.requests.clear();
  }
  async close() {
    try { this.ws.close(); } catch (_error) {}
    try { this.child.kill(); } catch (_error) {}
    await sleep(250);
    try { fs.rmSync(this.profileDir, { recursive: true, force: true }); } catch (_error) {}
  }
}

function freshMetrics() { return { http: new Map(), errors: [] }; }
function endpointKey(method, url) {
  let pathname = "";
  try { pathname = new URL(url).pathname; } catch (_error) { return ""; }
  if (method === "GET" && pathname === "/api/rooms") return "GET /api/rooms";
  if (method === "GET" && /^\/api\/rooms\/[^/]+$/.test(pathname)) return "GET /api/rooms/:id";
  if (method === "POST" && /^\/api\/rooms\/[^/]+\/participants$/.test(pathname)) return "POST /participants";
  if (method === "POST" && pathname === "/api/rooms") return "POST /api/rooms";
  if (method === "POST" && /\/combat$/.test(pathname)) return "POST /combat";
  return "";
}
function recordHttp(metrics, method, url, bytes, status) {
  const key = endpointKey(method, url);
  if (!key) return;
  const item = metrics.http.get(key) || { count: 0, bytesTotal: 0, bytesMax: 0, statuses: {} };
  item.count += 1;
  item.bytesTotal += bytes;
  item.bytesMax = Math.max(item.bytesMax, bytes);
  item.statuses[status] = (item.statuses[status] || 0) + 1;
  metrics.http.set(key, item);
}
function httpSummary(metrics, key) {
  const item = metrics.http.get(key);
  return item ? { count: item.count, avgBytes: Math.round(item.bytesTotal / item.count), maxBytes: item.bytesMax, statuses: item.statuses } : { count: 0, avgBytes: 0, maxBytes: 0, statuses: {} };
}
async function waitForExpression(page, expression, timeoutMs = 9000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await page.eval(`Boolean(${expression})`)) return true; } catch (_error) {}
    await sleep(160);
  }
  throw new Error(`${page.name} timed out waiting for ${expression}`);
}
function browserArgs(debugPort, profileDir) {
  return [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"];
}
async function launchPage({ name, debugPort, originHost, appPort, baseUrl, profilePrefix, installProbe }) {
  if (!chromePath) throw new Error("Chrome or Edge executable was not found.");
  const profileDir = path.join(os.tmpdir(), `${profilePrefix || "iron-line-p0"}-${name}-${process.pid}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  const child = spawn(chromePath, browserArgs(debugPort, profileDir), { stdio: "ignore", windowsHide: true });
  const page = new CdpPage(name, await waitForTarget(debugPort), child, profileDir);
  await page.open();
  await page.navigate(`http://${originHost}:${appPort}/index.html?roomsApi=${encodeURIComponent(baseUrl)}`);
  if (installProbe) await installProbe(page);
  return page;
}

module.exports = { httpSummary, launchPage, makeRequestJson, sleep, stat, waitForServer };
