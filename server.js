import http from "node:http";
import { readFile } from "node:fs/promises";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const preferredPublicDir = path.join(__dirname, "public");
const publicDir = existsSync(path.join(preferredPublicDir, "index.html")) ? preferredPublicDir : __dirname;
const outputDir = path.join(__dirname, "outputs");
const defaultRobotPath = path.join(publicDir, "assets", "robot-reference.png");
const defaultProductPath = path.join(publicDir, "assets", "product-example.png");
const port = Number(process.env.PORT || 4173);
const maxBodyBytes = 36 * 1024 * 1024;
let accessPassword = "";
let dailyLimit = 20;
const sessions = new Map();
const usageBySession = new Map();

await loadDotEnv();
accessPassword = String(process.env.ACCESS_PASSWORD || "").trim();
dailyLimit = Number(process.env.DAILY_LIMIT || 20);
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

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
  return parseCookies(req).kv_session || "";
}

function isAuthorized(req) {
  if (!accessPassword) return true;
  const sessionId = getSessionId(req);
  return sessionId && sessions.has(sessionId);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function checkUsage(req) {
  const sessionId = getSessionId(req) || "anonymous";
  const key = `${todayKey()}:${sessionId}`;
  const used = usageBySession.get(key) || 0;
  if (used >= dailyLimit) return false;
  usageBySession.set(key, used + 1);
  return true;
}

async function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*\uFEFF?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("上传内容太大，请压缩图片后重试。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function dataUrlToBlob(dataUrl, fallbackName) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error(`${fallbackName} 不是有效图片。`);
  const mime = match[1];
  const extension = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const bytes = Buffer.from(match[2], "base64");
  return {
    blob: new Blob([bytes], { type: mime }),
    filename: `${fallbackName}.${extension}`
  };
}

function normalizeBaseUrl(value) {
  const baseUrl = String(value || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
  return baseUrl.replace(/\/+$/, "");
}

async function fileToBlob(filePath, mime, filename) {
  const bytes = await readFile(filePath);
  return {
    blob: new Blob([bytes], { type: mime }),
    filename
  };
}

function buildPrompt(fields) {
  return `一张极具视觉冲击力的3D商业广告海报，比例3:4，大师级的3d渲染，材质清晰明确，整体光线柔和明亮，具有C4D和Blender渲染的顶级质感，色彩高饱和度，活泼、科技、年轻化，8k分辨率，极致细节。产品和标题突出：产品组合位于画面中心偏下，标题位于画面正中偏上。环境简洁，环境完全不抢，突出主体。产品是画面当之无愧的中心和焦点。整体冷暖和谐。画面采用「${fields.mainTone}」作为主色调背景。请根据「${fields.environmentScene}」自动联想并扩写合适的环境氛围，让画面情绪自然、具体、有季节感。

构图上：
产品组合位于画面中心偏下，圆润阶梯展台错落排布。请先严格识别上传产品六面图中的独立产品数量，并只呈现相同数量的产品：如果参考图中只有 1 个产品，海报中只能出现 1 个产品主体，禁止额外添加音箱、摄像头、屏幕、闹钟或任何其他智能家居产品；如果参考图中有多个产品，才可以完整呈现对应数量的多个产品。请严格参考上传的产品六面图：保持产品造型、大小比例和数量逻辑，调整产品透视和环境光，使其自然融入新场景。该参考图用于控制产品之间的比例；如果有多个产品，会在白底图上放置多个。最高的产品位于中央，其他产品在两侧，产品之间互不遮挡，上下前后高低错落，像电商商品陈列一样精致合理。除了墨镜产品之外，其他产品都要落地。所有产品外观严格参考产品六面图，不要凭空生成参考图之外的新产品。

标题位于画面正中偏上。主标题文字为「${fields.mainTitle}」，几个大字，字体为「手写」风格，艺术字设计。副标题文字为「${fields.subTitle}」，位于主标题下方，带有简约飘带或托底结构，与主标题组合和谐。标题颜色为「${fields.titleColor}」，文字颜色需要简洁突出、清晰可读，如果背景深色则使用浅色标题，如果背景浅色则使用深色标题。

环境为简约的「${fields.environmentScene}」，细节精致但完全不抢主体，背景为简单渐变色，保证标题突出。整体青春活泼。空中漂浮着粉色的简约小「${fields.floatingElement}」，颜色和谐，体现空间感和镜头感，有一定视觉冲击力。

画面中加入一个小度机器人吉祥物，严格参考内置机器人参考图。保持机器人角色完全不变，不要改造它的身体比例、脸部屏幕、眼睛形态、材质和轮廓；注意它无手、无脚、无腿，没有手指，呈现悬浮状态。该角色可以身着符合环境特色的轻量服饰，但服饰不能改变机器人本体结构，整体生动俏皮，不要抢占产品主体。`;
}

async function fetchOpenAI(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function handleGenerate(req, res) {
  try {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: "请先输入访问密码。" });
    if (!checkUsage(req)) return sendJson(res, 429, { error: `今日生成次数已达上限（${dailyLimit} 次）。` });
    const body = JSON.parse(await readBody(req));
    const apiKey = String(body.apiKey || process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) return sendJson(res, 400, { error: "请填写 OpenAI API Key，或让服务端配置 OPENAI_API_KEY。" });
    const apiBaseUrl = normalizeBaseUrl(body.apiBaseUrl);
    if (!body.productImage && !existsSync(defaultProductPath)) {
      return sendJson(res, 400, { error: "请上传产品六面图，或补齐内置产品参考图。" });
    }
    if (!existsSync(defaultRobotPath)) {
      return sendJson(res, 500, { error: "内置机器人参考图缺失，请补齐 assets/robot-reference.png。" });
    }

    const prompt = buildPrompt(body.fields || {});
    const model = body.model || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2-1K";
    const size = body.size || "1024x1536";
    const quality = body.quality || "medium";
    const outputFormat = body.outputFormat || "png";
    const form = new FormData();
    const product = body.productImage
      ? dataUrlToBlob(body.productImage, "product-reference")
      : await fileToBlob(defaultProductPath, "image/png", "product-reference.png");
    const robot = await fileToBlob(defaultRobotPath, "image/png", "robot-reference.png");

    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("output_format", outputFormat);
    form.append("image[]", product.blob, product.filename);
    form.append("image[]", robot.blob, robot.filename);

    const upstream = await fetchOpenAI(`${apiBaseUrl}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        error: result?.error?.message || "OpenAI 图片生成失败。",
        raw: result
      });
    }

    const firstImage = result?.data?.[0] || {};
    const imageBase64 = firstImage.b64_json || firstImage.base64 || firstImage.image_base64;
    const imageUrl = firstImage.url || firstImage.image_url;
    if (!imageBase64 && imageUrl) {
      return sendJson(res, 200, {
        image: imageUrl,
        downloadUrl: imageUrl,
        prompt,
        usage: result.usage || null,
        model
      });
    }
    if (!imageBase64) {
      return sendJson(res, 502, {
        error: `接口没有返回可识别的图片数据。返回字段：${Object.keys(firstImage).join(", ") || "无"}`,
        raw: result
      });
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${outputFormat}`;
    const filePath = path.join(outputDir, filename);
    const bytes = Buffer.from(imageBase64, "base64");
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.on("finish", resolve);
      stream.on("error", reject);
      stream.end(bytes);
    });

    sendJson(res, 200, {
      image: `data:image/${outputFormat};base64,${imageBase64}`,
      downloadUrl: `/outputs/${filename}`,
      prompt,
      usage: result.usage || null,
      model
    });
  } catch (error) {
    const cause = error.cause?.code || error.cause?.message;
    const detail = cause ? `${error.message}（${cause}）` : error.message;
    sendJson(res, 500, { error: detail || "服务器处理失败。" });
  }
}

async function handleUnlock(req, res) {
  try {
    if (!accessPassword) return sendJson(res, 200, { ok: true });
    const body = JSON.parse(await readBody(req));
    if (String(body.password || "") !== accessPassword) return sendJson(res, 401, { error: "访问密码不正确。" });
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { createdAt: Date.now() });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `kv_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    sendJson(res, 500, { error: error.message || "解锁失败。" });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  let filePath;
  if (pathname.startsWith("/outputs/")) {
    filePath = path.join(outputDir, pathname.replace("/outputs/", ""));
  } else {
    const safePath = pathname === "/" ? "/index.html" : pathname;
    filePath = path.join(publicDir, safePath);
  }
  if (!filePath.startsWith(publicDir) && !filePath.startsWith(outputDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/unlock") {
    await handleUnlock(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/auth-status") {
    sendJson(res, 200, { locked: Boolean(accessPassword), authorized: isAuthorized(req) });
    return;
  }
  if (req.method === "POST" && req.url === "/api/generate") {
    await handleGenerate(req, res);
    return;
  }
  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  if (process.stdout?.writable) {
    process.stdout.write(`Poster generator running at http://127.0.0.1:${port}\n`);
  }
});
