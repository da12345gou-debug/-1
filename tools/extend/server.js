import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(process.env.OUTPUT_DIR || path.join(root, "outputs"));
const port = Number(process.env.PORT || 5198);
const maxBodyBytes = 48 * 1024 * 1024;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

await loadLocalApiConfig();
await mkdir(outputDir, { recursive: true });

async function loadEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) return;
  const content = await readFile(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*\uFEFF?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function loadLocalApiConfig() {
  const candidates = [
    process.env.GTM_ENV_PATH,
    path.join(os.homedir(), "Documents", "聚合kv小测试", ".env"),
    path.join(os.homedir(), "Documents", "落地页一键延展傻瓜工具", ".env")
  ];
  for (const candidate of candidates) {
    await loadEnvFile(candidate);
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL) return;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function resolveSafe(urlPath) {
  const clean = decodeURIComponent(String(urlPath || "/").split("?")[0]).replace(/^\/+/, "");
  const target = path.resolve(root, clean || "index.html");
  if (!target.startsWith(root)) return null;
  return target;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("上传图片过大，请压缩到 36MB 以内。");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeBaseUrl(value) {
  return String(value || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function extensionForMime(mimeType) {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || ""));
  if (!match) throw new Error("没有收到可用的 KV 原图。");
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}

async function sourceImage(body) {
  if (body.sourceDataUrl) {
    const decoded = decodeDataUrl(body.sourceDataUrl);
    return { ...decoded, filename: `source.${extensionForMime(decoded.mimeType)}` };
  }
  const sourceUrl = String(body.sourceUrl || "");
  if (!sourceUrl.startsWith("/outputs/")) throw new Error("生成链路缺少上一步图片。");
  const filename = path.basename(sourceUrl);
  const filePath = path.join(outputDir, filename);
  if (!filePath.startsWith(outputDir) || !existsSync(filePath)) throw new Error("上一步生成图片不存在。");
  const extension = path.extname(filename).toLowerCase();
  return {
    bytes: await readFile(filePath),
    mimeType: mime[extension] || "image/png",
    filename
  };
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.status < 500 || attempt === attempts) return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
  }
  throw lastError || new Error("图片接口连接失败。");
}

async function parseUpstream(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text.slice(0, 240) || "图片接口没有返回 JSON。" } };
  }
}

async function persistResult(result, outputFormat) {
  const first = result?.data?.[0] || {};
  let bytes;
  let contentType = `image/${outputFormat}`;
  const imageBase64 = first.b64_json || first.base64 || first.image_base64;
  const remoteUrl = first.url || first.image_url;

  if (imageBase64) {
    bytes = Buffer.from(imageBase64, "base64");
  } else if (remoteUrl) {
    const response = await fetchWithRetry(remoteUrl, { method: "GET" }, 2);
    if (!response.ok) throw new Error(`结果图下载失败（${response.status}）。`);
    contentType = response.headers.get("content-type") || contentType;
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error("图片接口没有返回可识别的图片。");
  }

  const extension = extensionForMime(contentType);
  const filename = `${crypto.randomUUID()}.${extension}`;
  await writeFile(path.join(outputDir, filename), bytes);
  return { imageUrl: `/outputs/${filename}`, filename };
}

async function generateImage(body) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("本机没有找到 GTM 图片 API 配置。");
  const input = await sourceImage(body);
  const width = Math.max(1, Number(body.width) || 1024);
  const height = Math.max(1, Number(body.height) || 1024);
  const outputFormat = "png";
  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2-1K");
  form.append("prompt", String(body.prompt || "请按目标尺寸延展图片，保持内容和风格不变，不要拉伸。"));
  form.append("size", `${width}x${height}`);
  form.append("quality", "high");
  form.append("output_format", outputFormat);
  form.append("response_format", "b64_json");
  form.append("image[]", new Blob([input.bytes], { type: input.mimeType }), input.filename);

  const response = await fetchWithRetry(`${normalizeBaseUrl()}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const result = await parseUpstream(response);
  if (!response.ok) {
    const message = result?.error?.message || `图片 API 调用失败（${response.status}）。`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return persistResult(result, outputFormat);
}

async function serveFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/status") {
    sendJson(res, 200, {
      ready: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL),
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2-1K"
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/extend-image") {
    try {
      const body = await readJsonBody(req);
      const result = await generateImage(body);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.message || "生成失败。" });
    }
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const filePath = resolveSafe(req.url);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  await serveFile(res, filePath);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`One-click extend lab: http://127.0.0.1:${port}/\n`);
});
