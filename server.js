import http from "node:http";
import { readFile } from "node:fs/promises";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const logsDir = path.join(__dirname, "logs");
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";
const accessPassword = String(process.env.ACCESS_PASSWORD || "DUUE123").trim();
const sessions = new Map();

if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

const tools = [
  {
    id: "landing",
    name: "落地页一键延展",
    sourceUrl: "http://127.0.0.1:4174/",
    port: Number(process.env.LANDING_COPY_PORT || 5174),
    path: "/landing",
    mountPath: "/tools/landing",
    cwd: path.join(__dirname, "tools", "landing")
  },
  {
    id: "aggregate",
    name: "产品海报一键生成",
    sourceUrl: "http://127.0.0.1:4173/",
    port: Number(process.env.AGGREGATE_COPY_PORT || 5173),
    path: "/",
    mountPath: "/tools/aggregate",
    cwd: path.join(__dirname, "tools", "aggregate")
  },
  {
    id: "copy",
    name: "DEMO一键生成",
    sourceUrl: "http://127.0.0.1:4188/",
    port: Number(process.env.COPY_COPY_PORT || 5188),
    path: "/",
    mountPath: "/tools/copy",
    cwd: path.join(__dirname, "tools", "copy")
  }
];

const children = new Map();

function toolUrl(tool) {
  return `http://127.0.0.1:${tool.port}${tool.path}`;
}

function mountedToolUrl(tool) {
  return `${tool.mountPath}/`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isToolListening(tool) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600);
  try {
    const response = await fetch(toolUrl(tool), { signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function startTool(tool) {
  if (!existsSync(path.join(tool.cwd, "server.js"))) return;
  const existing = children.get(tool.id);
  if (existing && !existing.killed) return;
  if (await isToolListening(tool)) return;
  const out = createWriteStream(path.join(logsDir, `${tool.id}.out.log`), { flags: "a" });
  const err = createWriteStream(path.join(logsDir, `${tool.id}.err.log`), { flags: "a" });
  const child = spawn(process.execPath, ["server.js"], {
    cwd: tool.cwd,
    env: {
      ...process.env,
      COMBINED_WORKBENCH: "1",
      HOST: "127.0.0.1",
      PORT: String(tool.port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  children.set(tool.id, child);
}

async function ensureToolStarted(tool) {
  if (await isToolListening(tool)) return true;
  await startTool(tool);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await wait(150);
    if (await isToolListening(tool)) return true;
  }
  return false;
}

function stopChildren() {
  for (const child of children.values()) {
    if (!child.killed) child.kill();
  }
}
process.on("SIGINT", () => { stopChildren(); process.exit(0); });
process.on("SIGTERM", () => { stopChildren(); process.exit(0); });
process.on("exit", stopChildren);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function getSessionId(req) {
  return parseCookies(req).gtm_workbench_session || "";
}

function isAuthorized(req) {
  if (!accessPassword) return true;
  const sessionId = getSessionId(req);
  return Boolean(sessionId && sessions.has(sessionId));
}

function sendLocked(req, res) {
  const acceptsHtml = String(req.headers.accept || "").includes("text/html");
  if (req.method === "GET" && acceptsHtml) {
    res.writeHead(302, {
      Location: "/",
      "Cache-Control": "no-store"
    });
    res.end();
    return;
  }
  sendJson(res, 401, { error: "请先输入入口访问密码。" });
}

async function serveIndex(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const template = await readFile(path.join(publicDir, "index.html"), "utf8");
  const authState = {
    authorized: isAuthorized(req),
    error: url.searchParams.get("error") === "1" ? "访问密码不正确。" : ""
  };
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(template.replace("__AUTH_STATE__", JSON.stringify(authState).replaceAll("<", "\\u003c")));
}

async function checkTool(tool) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(toolUrl(tool), { signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error.name === "AbortError" ? "timeout" : "offline" };
  } finally {
    clearTimeout(timer);
  }
}

function getMountedTool(pathname) {
  return tools.find((tool) => pathname === tool.mountPath || pathname.startsWith(`${tool.mountPath}/`));
}

function rewriteToolText(text, tool) {
  const prefix = tool.mountPath;
  return text
    .replaceAll('"/api', `"${prefix}/api`)
    .replaceAll("'/api", `'${prefix}/api`)
    .replaceAll("`/api", "`" + prefix + "/api")
    .replaceAll('"/outputs', `"${prefix}/outputs`)
    .replaceAll("'/outputs", `'${prefix}/outputs`)
    .replaceAll("`/outputs", "`" + prefix + "/outputs")
    .replaceAll('"/assets', `"${prefix}/assets`)
    .replaceAll("'/assets", `'${prefix}/assets`)
    .replaceAll('href="/styles.css"', `href="${prefix}/styles.css"`)
    .replaceAll('href="/style.css"', `href="${prefix}/style.css"`)
    .replaceAll('src="/app.js', `src="${prefix}/app.js`)
    .replaceAll('src="/portal.js"', `src="${prefix}/portal.js"`)
    .replaceAll('href="/LANDING_PAGE_TYPE_RULES.md"', `href="${prefix}/LANDING_PAGE_TYPE_RULES.md"`);
}

function copyProxyHeaders(sourceHeaders, contentType) {
  const headers = {};
  for (const [key, value] of sourceHeaders.entries()) {
    const lower = key.toLowerCase();
    if (["connection", "content-encoding", "content-length", "keep-alive", "transfer-encoding"].includes(lower)) continue;
    headers[key] = value;
  }
  if (contentType) headers["content-type"] = contentType;
  headers["cache-control"] = "no-store";
  return headers;
}

function readRequestBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxyMountedTool(req, res, tool, pathname) {
  if (!(await ensureToolStarted(tool))) {
    sendJson(res, 503, { error: `${tool.name} 启动中，请稍后重试。` });
    return;
  }
  let upstreamPath = pathname.slice(tool.mountPath.length) || "/";
  if (upstreamPath === "/" && tool.path !== "/") upstreamPath = tool.path;
  const targetUrl = new URL(upstreamPath, `http://127.0.0.1:${tool.port}`);
  targetUrl.search = new URL(req.url, `http://${req.headers.host}`).search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.set("host", `127.0.0.1:${tool.port}`);

  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readRequestBuffer(req);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let upstream;
  try {
    upstream = await fetch(targetUrl, { method: req.method, headers, body, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const contentType = upstream.headers.get("content-type") || "";

  if (
    contentType.includes("text/html") ||
    contentType.includes("application/javascript") ||
    contentType.includes("text/css") ||
    contentType.includes("application/json")
  ) {
    const text = rewriteToolText(await upstream.text(), tool);
    res.writeHead(upstream.status, copyProxyHeaders(upstream.headers, contentType));
    res.end(text);
    return;
  }

  const bytes = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, copyProxyHeaders(upstream.headers, contentType));
  res.end(bytes);
}

async function handleUnlock(req, res) {
  try {
    if (!accessPassword) return sendJson(res, 200, { ok: true });
    const body = JSON.parse(await readRequestBuffer(req));
    if (String(body.password || "") !== accessPassword) {
      return sendJson(res, 401, { error: "访问密码不正确。" });
    }
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { createdAt: Date.now() });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `gtm_workbench_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    sendJson(res, 500, { error: error.message || "解锁失败。" });
  }
}

async function handleFormUnlock(req, res) {
  try {
    if (!accessPassword) {
      res.writeHead(303, { Location: "/#landing", "Cache-Control": "no-store" });
      res.end();
      return;
    }

    const body = new URLSearchParams((await readRequestBuffer(req)).toString("utf8"));
    if (String(body.get("password") || "") !== accessPassword) {
      res.writeHead(303, { Location: "/?error=1", "Cache-Control": "no-store" });
      res.end();
      return;
    }

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { createdAt: Date.now() });
    res.writeHead(303, {
      Location: "/#landing",
      "Set-Cookie": `gtm_workbench_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      "Cache-Control": "no-store"
    });
    res.end();
  } catch {
    res.writeHead(303, { Location: "/?error=1", "Cache-Control": "no-store" });
    res.end();
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  if (safePath === "/index.html") {
    await serveIndex(req, res);
    return;
  }
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": [".html", ".js", ".css"].includes(extension) ? "no-store" : "public, max-age=300"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const mountedTool = getMountedTool(decodeURIComponent(url.pathname));
    if (mountedTool) {
      if (!isAuthorized(req)) {
        sendLocked(req, res);
        return;
      }
      await proxyMountedTool(req, res, mountedTool, decodeURIComponent(url.pathname));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/auth-status") {
      sendJson(res, 200, { locked: Boolean(accessPassword), authorized: isAuthorized(req) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/unlock") {
      await handleUnlock(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/unlock") {
      await handleFormUnlock(req, res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/tools") {
      if (!isAuthorized(req)) {
        sendLocked(req, res);
        return;
      }
      const statuses = await Promise.all(tools.map(async (tool) => ({
        id: tool.id,
        name: tool.name,
        copiedUrl: mountedToolUrl(tool),
        directCopyUrl: toolUrl(tool),
        sourceUrl: tool.sourceUrl,
        status: await checkTool(tool)
      })));
      sendJson(res, 200, { tools: statuses });
      return;
    }
    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }
    res.writeHead(405);
    res.end("Method not allowed");
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "服务暂时不可用，请稍后重试。" });
    } else {
      res.end();
    }
  }
});

server.listen(port, host, () => {
  process.stdout?.write(`GTM combined workbench running at http://127.0.0.1:${port}\n`);
});
