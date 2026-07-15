import http from "node:http";
import { readFile, readdir, stat as statFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const logsDir = path.join(__dirname, "logs");
const generatedOutputRoot = path.resolve(process.env.GENERATED_OUTPUT_ROOT || path.join(__dirname, "generated-images"));
const port = Number(process.env.PORT || 10000);
const host = "0.0.0.0";
const accessPassword = String(process.env.WORKBENCH_ACCESS_PASSWORD || "DUUE2026").trim();
const ownerAccessPassword = String(process.env.WORKBENCH_OWNER_PASSWORD || "DUUE2026_OWNER").trim();
const sharedDailyLimit = Number(process.env.SHARED_DAILY_LIMIT || 20);
const sharedAggregateDailyLimit = Number(process.env.SHARED_AGGREGATE_DAILY_LIMIT || 5);
const sessions = new Map();
const usageByDate = new Map();

if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
if (!existsSync(generatedOutputRoot)) mkdirSync(generatedOutputRoot, { recursive: true });

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
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function toolUrl(tool) {
  return `http://127.0.0.1:${tool.port}${tool.path}`;
}

function mountedToolUrl(tool) {
  return `${tool.mountPath}/`;
}

function toolOutputDir(tool) {
  return path.join(generatedOutputRoot, tool.id);
}

function legacyToolOutputDir(tool) {
  return path.join(tool.cwd, "outputs");
}

function isAdminRequest(req) {
  if (isOwner(req)) return true;
  const headerPassword = String(req.headers["x-admin-password"] || "").trim();
  return Boolean(ownerAccessPassword && headerPassword === ownerAccessPassword);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function toPublicPath(filePath, rootPath) {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

async function collectImagesFromDir(rootPath, sinceMs, tool, seen) {
  const images = [];
  if (!existsSync(rootPath)) return images;
  let entries = [];
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return images;
  }
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      images.push(...await collectImagesFromDir(fullPath, sinceMs, tool, seen));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!imageExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const resolved = path.resolve(fullPath);
    if (seen.has(resolved)) continue;
    let fileStat;
    try {
      fileStat = await statFile(fullPath);
    } catch {
      continue;
    }
    if (fileStat.mtimeMs < sinceMs) continue;
    seen.add(resolved);
    const relativePath = toPublicPath(fullPath, rootPath);
    images.push({
      toolId: tool.id,
      toolName: tool.name,
      filename: path.basename(fullPath),
      path: relativePath,
      createdAt: fileStat.mtime.toISOString(),
      size: fileStat.size,
      downloadUrl: `/api/admin/generated-images/file?tool=${encodeURIComponent(tool.id)}&path=${encodeURIComponent(relativePath)}`
    });
  }
  return images;
}

async function listGeneratedImages(days = 5) {
  const lookbackDays = clampInteger(days, 1, 30, 5);
  const sinceMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const seen = new Set();
  const images = [];
  for (const tool of tools) {
    images.push(...await collectImagesFromDir(toolOutputDir(tool), sinceMs, tool, seen));
    images.push(...await collectImagesFromDir(legacyToolOutputDir(tool), sinceMs, tool, seen));
  }
  images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    days: lookbackDays,
    generatedOutputRoot,
    images: images.slice(0, 1000)
  };
}

function safeRelativePath(value) {
  const text = String(value || "").replaceAll("/", path.sep);
  if (!text || path.isAbsolute(text)) return "";
  const normalized = path.normalize(text);
  if (normalized === "." || normalized.startsWith("..") || path.isAbsolute(normalized)) return "";
  return normalized;
}

async function findGeneratedImage(toolId, relativePath) {
  const tool = tools.find((item) => item.id === toolId);
  const safePath = safeRelativePath(relativePath);
  if (!tool || !safePath) return null;
  for (const rootPath of [toolOutputDir(tool), legacyToolOutputDir(tool)]) {
    const resolvedRoot = path.resolve(rootPath);
    const filePath = path.resolve(rootPath, safePath);
    if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) continue;
    if (!imageExtensions.has(path.extname(filePath).toLowerCase())) continue;
    if (existsSync(filePath)) return { tool, filePath };
  }
  return null;
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
  const outputDir = toolOutputDir(tool);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const out = createWriteStream(path.join(logsDir, `${tool.id}.out.log`), { flags: "a" });
  const err = createWriteStream(path.join(logsDir, `${tool.id}.err.log`), { flags: "a" });
  const child = spawn(process.execPath, ["server.js"], {
    cwd: tool.cwd,
    env: {
      ...process.env,
      COMBINED_WORKBENCH: "1",
      HOST: "127.0.0.1",
      PORT: String(tool.port),
      DAILY_LIMIT: "999999",
      OUTPUT_DIR: outputDir
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

function sendJson(res, status, payload, method = "GET") {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(method === "HEAD" ? "" : JSON.stringify(payload));
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

function isOwner(req) {
  const sessionId = getSessionId(req);
  return Boolean(sessionId && sessions.get(sessionId)?.owner);
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function dailyUsage() {
  const key = todayKey();
  let usage = usageByDate.get(key);
  if (!usage) {
    usage = { total: 0, aggregate: 0 };
    usageByDate.clear();
    usageByDate.set(key, usage);
  }
  return usage;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.ceil(number)));
}

function generationCost(tool, body) {
  if (tool.id !== "landing") return 1;
  if (Array.isArray(body?.prototypeSegmentRefs)) return clamp(body.prototypeSegmentRefs.length, 1, 10);
  if (Array.isArray(body?.prototypeSegments)) return clamp(body.prototypeSegments.length, 1, 10);
  return clamp(body?.segmentCount || 1, 1, 10);
}

function reserveSharedQuota(req, tool, body) {
  if (isOwner(req)) return { ok: true, count: 0, reserved: false };
  const count = generationCost(tool, body);
  const usage = dailyUsage();
  if (usage.total + count > sharedDailyLimit) {
    return {
      ok: false,
      status: 429,
      error: "今日总额度已用完，可联系管理员"
    };
  }
  if (tool.id === "aggregate" && usage.aggregate + count > sharedAggregateDailyLimit) {
    return {
      ok: false,
      status: 429,
      error: `今日聚合 KV 共享额度已达上限（${sharedAggregateDailyLimit} 张）。`
    };
  }
  usage.total += count;
  if (tool.id === "aggregate") usage.aggregate += count;
  return { ok: true, count, reserved: true };
}

function releaseSharedQuota(req, tool, count) {
  if (isOwner(req) || !count) return;
  const usage = dailyUsage();
  usage.total = Math.max(0, usage.total - count);
  if (tool.id === "aggregate") usage.aggregate = Math.max(0, usage.aggregate - count);
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
  if (req.method === "HEAD") {
    res.end();
    return;
  }
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

function sanitizeAggregateClientScript(text, upstreamPath) {
  if (path.basename(decodeURIComponent(upstreamPath.split("?")[0] || "")) !== "app.js") return text;
  let sanitized = text;
  const promptStart = sanitized.indexOf("function buildPortraitPrompt(fields) {");
  const promptEnd = sanitized.indexOf("function updatePrompt() {");
  if (promptStart !== -1 && promptEnd !== -1 && promptEnd > promptStart) {
    sanitized = sanitized.slice(0, promptStart) + sanitized.slice(promptEnd);
  }
  sanitized = sanitized.replace(
    /function updatePrompt\(\) \{\r?\n\s*const fields = getFields\(\);\r?\n\s*promptPreview\.value = buildPrompt\(fields\);\r?\n\s*resultFrame\?\.classList\.toggle\("is-landscape", fields\.layout === "landscape"\);\r?\n\s*resultFrame\?\.style\.setProperty\("--preview-ratio", ratioPreviews\[fields\.layout\]\?\.\[fields\.aspectRatio\] \|\| "3 \/ 4"\);\r?\n\}/,
    `function updatePrompt() {
  const fields = getFields();
  resultFrame?.classList.toggle("is-landscape", fields.layout === "landscape");
  resultFrame?.style.setProperty("--preview-ratio", ratioPreviews[fields.layout]?.[fields.aspectRatio] || "3 / 4");
}`
  );
  sanitized = sanitized.replace(/\r?\n\s*promptPreview\.value = result\.prompt;/g, "");
  return sanitized;
}

function rewriteToolText(text, tool, upstreamPath) {
  const safeText = tool.id === "aggregate" ? sanitizeAggregateClientScript(text, upstreamPath) : text;
  const prefix = tool.mountPath;
  return safeText
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

function isBlockedToolPath(upstreamPath) {
  const pathname = decodeURIComponent(upstreamPath.split("?")[0] || "/");
  const name = path.basename(pathname).toLowerCase();
  if (!name) return false;
  if (name.startsWith(".")) return true;
  if (name === "server.js" || name === "package.json" || name.endsWith(".md") || name.endsWith(".map")) return true;
  return false;
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
  let upstreamPath = pathname.slice(tool.mountPath.length) || "/";
  if (upstreamPath === "/" && tool.path !== "/") upstreamPath = tool.path;
  if ((req.method === "GET" || req.method === "HEAD") && isBlockedToolPath(upstreamPath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? "" : "Not found");
    return;
  }
  if (!(await ensureToolStarted(tool))) {
    sendJson(res, 503, { error: `${tool.name} 启动中，请稍后重试。` });
    return;
  }
  const targetUrl = new URL(upstreamPath, `http://127.0.0.1:${tool.port}`);
  targetUrl.search = new URL(req.url, `http://${req.headers.host}`).search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.set("host", `127.0.0.1:${tool.port}`);

  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readRequestBuffer(req);
  let quota = { ok: true, count: 0, reserved: false };
  if (req.method === "POST" && upstreamPath === "/api/generate") {
    let parsedBody = {};
    try {
      parsedBody = JSON.parse(body?.toString("utf8") || "{}");
    } catch {
      parsedBody = {};
    }
    quota = reserveSharedQuota(req, tool, parsedBody);
    if (!quota.ok) {
      sendJson(res, quota.status, { error: quota.error });
      return;
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let upstream;
  try {
    upstream = await fetch(targetUrl, { method: req.method, headers, body, signal: controller.signal });
  } catch (error) {
    if (quota.reserved) releaseSharedQuota(req, tool, quota.count);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (quota.reserved && !upstream.ok) releaseSharedQuota(req, tool, quota.count);
  const contentType = upstream.headers.get("content-type") || "";

  if (
    contentType.includes("text/html") ||
    contentType.includes("application/javascript") ||
    contentType.includes("text/css") ||
    contentType.includes("application/json")
  ) {
    const text = rewriteToolText(await upstream.text(), tool, upstreamPath);
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
    const password = String(body.password || "");
    const owner = Boolean(ownerAccessPassword && password === ownerAccessPassword);
    if (password !== accessPassword && !owner) {
      return sendJson(res, 401, { error: "访问密码不正确。" });
    }
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { createdAt: Date.now(), owner });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `gtm_workbench_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, owner }));
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
    const password = String(body.get("password") || "");
    const owner = Boolean(ownerAccessPassword && password === ownerAccessPassword);
    if (password !== accessPassword && !owner) {
      res.writeHead(303, { Location: "/?error=1", "Cache-Control": "no-store" });
      res.end();
      return;
    }

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { createdAt: Date.now(), owner });
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
    res.end(req.method === "HEAD" ? "" : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(req.method === "HEAD" ? "" : "Not found");
  }
}

async function handleAdminGeneratedImage(req, res, url) {
  if (!isAdminRequest(req)) {
    sendJson(res, 403, { error: "需要管理员密码查看公网生成图片。" });
    return;
  }
  sendJson(res, 200, await listGeneratedImages(url.searchParams.get("days")));
}

async function handleAdminGeneratedImageFile(req, res, url) {
  if (!isAdminRequest(req)) {
    sendJson(res, 403, { error: "需要管理员密码下载公网生成图片。" }, req.method);
    return;
  }
  const found = await findGeneratedImage(url.searchParams.get("tool"), url.searchParams.get("path"));
  if (!found) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? "" : "Not found");
    return;
  }
  const extension = path.extname(found.filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(found.filePath))}"`
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(found.filePath).pipe(res);
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
      sendJson(res, 200, { locked: Boolean(accessPassword), authorized: isAuthorized(req), owner: isOwner(req) });
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true }, req.method);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/admin/generated-images") {
      await handleAdminGeneratedImage(req, res, url);
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/api/admin/generated-images/file") {
      await handleAdminGeneratedImageFile(req, res, url);
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
    if (req.method === "GET" || req.method === "HEAD") {
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
  process.stdout?.write(`GTM combined workbench running on ${host}:${port}\n`);
});
