import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "web");
const outputDir = path.join(__dirname, "outputs");
const port = Number(process.env.PORT || 4188);
const maxBodyBytes = 48 * 1024 * 1024;
const sessions = new Map();
const usageBySession = new Map();
const jobs = new Map();
const skipAuth = process.env.COMBINED_WORKBENCH === "1";

await loadDotEnv(path.join(__dirname, ".env"));
await loadSiblingEnvWithKey();

const accessPassword = String(process.env.ACCESS_PASSWORD || "DUUE2026").trim();
const dailyLimit = Number(process.env.DAILY_LIMIT || 20);
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

async function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*\uFEFF?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function loadSiblingEnvWithKey() {
  if (process.env.OPENAI_API_KEY) return;
  const parent = path.dirname(__dirname);
  let entries = [];
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const envPath = path.join(parent, entry.name, ".env");
    if (!existsSync(envPath)) continue;
    const content = await readFile(envPath, "utf8").catch(() => "");
    if (!content.includes("OPENAI_API_KEY=")) continue;
    await loadDotEnv(envPath);
    if (process.env.OPENAI_API_KEY) return;
  }
}

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
  return parseCookies(req).uu_kv_session || "";
}

function isAuthorized(req) {
  if (skipAuth) return true;
  if (!accessPassword) return true;
  const sessionId = getSessionId(req);
  return Boolean(sessionId && sessions.has(sessionId));
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
  return String(value || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
}

function imageModel() {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-2-1K";
}

function imageQuality() {
  return process.env.OPENAI_IMAGE_QUALITY || "medium";
}

function sizeFromRatio(ratio) {
  const normalized = String(ratio || "original").trim().replace("：", ":");
  const map = {
    original: "auto",
    "keep-original": "auto",
    "16:9": "1536x864",
    "9:16": "864x1536",
    "3:4": "1024x1360",
    "4:3": "1360x1024",
    "1:1": "1024x1024",
    "4:5": "1024x1280",
    "5:4": "1280x1024"
  };
  return map[normalized] || "auto";
}

function ratioInstruction(ratio, sourceName = "reference image") {
  return ratio === "original" || ratio === "keep-original"
    ? `Keep the same aspect ratio, canvas orientation, and broad framing as the ${sourceName}. Do not force a new ratio.`
    : `Output aspect ratio: ${ratio || "16:9"}. Recompose naturally, do not stretch or crop crudely.`;
}

function titleInstruction(mainTitle, subTitle, sourceName) {
  if (mainTitle || subTitle) {
    return `Title replacement:
- Identify the main title and subtitle areas in ${sourceName}. If no clear title/subtitle exists, create a clean campaign title area only when useful.
- Replace the main title with: "${mainTitle || "keep the original main title style/content if appropriate"}"
- Replace the subtitle with: "${subTitle || "keep the original subtitle style/content if appropriate"}"
- Preserve typography hierarchy, placement, scale, alignment, color logic, and relationship to the scene unless user adjustments say otherwise.`;
  }
  return `Title handling:
- Identify main title and subtitle areas in ${sourceName}, if present.
- Since the user did not provide replacement text, keep the same title hierarchy and style when appropriate.
- If no title/subtitle exists, do not invent unnecessary large text.`;
}

function buildV1Prompt({ ratio, mainTitle, subTitle, adjustments }) {
  return `Use GPT Image 2.

Generate one final commercial KV image. Use Image 1 as the strict product reference and Image 2 as the reference KV.

${ratioInstruction(ratio, "Image 2 reference KV")}

User adjustment requirements:
${adjustments || "No extra changes. Preserve the reference KV's commercial style, visual hierarchy, composition logic, and campaign mood."}

${titleInstruction(mainTitle, subTitle, "Image 2")}

Internal analysis before generation:
1. Analyze Image 1 first as the user's product image. Rank the user's products by visual priority using size and position. Treat Image 1 as the source of truth for product appearance.
2. Analyze Image 2 as the reference KV. Record its layout, campaign style, background, props, lighting, typography hierarchy, product positions, and commercial atmosphere.
3. Identify only true advertised products in Image 2. Do not treat headlines, logos, price tags, UI copy, backgrounds, gift boxes, coins, ribbons, roads, clouds, platforms, or decorative props as products.
4. Identify main title and subtitle areas in Image 2, if present.
5. Rank Image 2 product slots by visual priority. For each slot, record position, size, angle, perspective direction, foreground/background layer, occlusion, contact point, material light, and environment light.
6. Map Image 1 user product priority to Image 2 reference product slot priority one by one.

Strict product fidelity:
- Image 1 is the direct visual reference for the user's products and is the source of truth.
- Product identity fidelity is the highest priority, but this means preserving what the product is, not preserving the front-facing pose from Image 1.
- Preserve product silhouettes, proportions, structures, screens, frames, stands, bases, camera modules, lenses, arms, buttons, details, colors, and categories.
- Do not morph, bend, stretch, melt, simplify, redesign, recolor, or convert products into unrelated devices.

Rigid pose matching:
- Product pose must inherit the matched Image 2 slot through rigid object transform.
- Rotate, tilt, scale, and perspective-transform the whole product as one solid object until it matches the slot's angle and camera perspective.
- Do not deform internal parts, screen ratios, stands, cameras, arms, or edges.
- Do not keep products front-facing unless the matched Image 2 slot is also front-facing.
- Balance: 100% product identity from Image 1, 100% pose/perspective/lighting inheritance from the matched Image 2 slot.

Replacement and integration:
- Each user product should inherit the matched Image 2 slot's position, scale, angle, perspective direction, depth layer, and lighting.
- Add believable contact points, occlusion, shadows, reflected environment color, and consistent key light.
- Avoid floating products, object intersections, clipping, impossible overlaps, broken supports, and products penetrating props.
- If Image 1 has more products than useful slots, prioritize by size and position. If Image 2 has more slots than user products, replace only the corresponding priority slots.

Quality:
Premium commercial advertising render, polished e-commerce KV, high-resolution, clean composition, realistic product integration, consistent lighting, no watermark, no screenshot frame.

Negative constraints:
No product deformation, no warped screens, no changed aspect ratios, no broken stands, no altered camera count or position, no pasted flat collage look, no floating products, no object intersections, no leftover reference products after replacement, no clutter, no low resolution, no blurry details.`;
}

function buildV2PromptExtractionPrompt({ ratio, adjustments }) {
  return `Analyze the uploaded reference KV and write a highly precise GPT Image 2 text-to-image prompt for recreating it.

The prompt you write will be used without any image reference. Therefore it must describe the image in enough detail to reproduce the same composition logic from text only.

Required output:
- Return only the final image-generation prompt.
- Do not mention that an image was uploaded.
- Do not include analysis notes outside the prompt.

The prompt must include:
- ${ratioInstruction(ratio, "reference KV")}
- Overall scene category, commercial mood, visual hierarchy, camera angle, lens feeling, render/photo style, color palette, background, props, depth, lighting, shadows, reflections, and material details.
- All true product placeholders in the reference KV: number of products, relative priority, position, size, angle, perspective, depth, occlusion, contact points, key light, fill light, and environment light.
- Main title/subtitle areas if present: placement, hierarchy, typography feeling, color, scale, and line rhythm. Use readable placeholder campaign text if exact text is uncertain.
- Keep decorative elements as decorative, not products.

User adjustment requirements to incorporate if compatible:
${adjustments || "No extra changes."}

Important:
- This is a pure text-to-image prompt.
- It must instruct the model to create a new AI-recreated KV with natural detail differences, not a traced copy.
- The result will later be used as an intermediate base for replacing products.`;
}

function buildV2Step1GenerationPrompt(referencePrompt) {
  return `Use GPT Image 2.

Task: reproduce the reference KV as a new image using pure text generation only. The provided image is only for visual analysis; do not trace, copy, or directly place it into the output.

Use this extracted text prompt as the complete visual plan:
${referencePrompt}

Important:
- This is a pure text-to-image reproduction stage.
- Do not use the reference image as a direct image layer.
- Make the output a strong intermediate KV base for later product replacement.

Quality:
Premium commercial advertising KV, polished e-commerce composition, high-resolution, clean lighting, detailed but controlled, no watermark, no screenshot frame.`;
}

function buildV2Step2Prompt() {
  return `Analyze Image 1, the intermediate reproduced KV.

Return concise structured analysis for product replacement:
1. Main title area: whether present, text role, placement, font feeling, color, hierarchy.
2. Subtitle area: whether present, text role, placement, font feeling, color, hierarchy.
3. True product slots only, ranked by visual priority. Ignore decoration, background, price labels, icons, platforms, boxes, ribbons, particles, and typography.
For every product slot, record:
- priority number
- approximate position
- approximate size
- angle/yaw/pitch/roll, explicitly say whether it is front-facing, three-quarter view, side view, top-down, tilted, or rotated
- perspective direction
- foreground/background depth
- occlusion/contact points
- key light direction
- fill/environment light color
- shadow/reflection behavior

Keep it short but precise.`;
}

function buildV2Step3Prompt({ ratio, mainTitle, subTitle, adjustments, slotAnalysis }) {
  return `Use GPT Image 2.

Generate the final commercial KV.

Inputs:
- Image 1 is the user's product combination image. It is the strict product identity reference.
- Image 2 is the intermediate reproduced KV base. It is the visual/style/layout reference for the final output.
- The product/title slot analysis below was extracted from Image 2 and must guide the replacement.

${ratioInstruction(ratio, "Image 2 intermediate KV")}

User adjustment requirements:
${adjustments || "No extra changes. Preserve the intermediate KV's style, hierarchy, composition, and campaign mood."}

${titleInstruction(mainTitle, subTitle, "Image 2")}

Product/title slot analysis from Image 2:
${slotAnalysis || "Use Image 2 product slots and title hierarchy directly."}

Replacement rules:
1. Rank products in Image 1 by size and position.
2. Rank true product slots in Image 2 by the slot analysis priority.
3. Replace Image 2 slot products one by one using Image 1 product priority.
4. If Image 1 has fewer products than Image 2 slots, replace only the top matching slots and remove or visually downplay remaining original products so they do not compete.
5. If Image 1 has more products than Image 2 slots, use only the highest-priority user products unless the layout can add extra products cleanly.

Strict product fidelity:
- Image 1 is the source of truth for product appearance.
- Preserve product identity, structure, details, and category from Image 1, but do not preserve Image 1's original front-facing pose when the target slot is angled.
- Preserve every product silhouette, proportion, structure, screen aspect ratio, frame thickness, stand, base, camera modules, lenses, arms, buttons, distinctive details, surface color, and category.
- Do not morph, bend, stretch, melt, simplify, redesign, recolor into the scene color, or convert products into unrelated devices.
- Small products must not lose parts, merge parts, gain extra lenses, or become generic blobs.

Rigid pose and lighting matching:
- Follow the slot analysis for each product's angle, perspective, position, depth, occlusion, contact point, key light, fill light, and environment light.
- Rotate, tilt, scale, and perspective-transform the whole product as one solid object to match the slot. The final product should not default to a flat front-facing view.
- Do not deform internal parts.
- For screens, perspective may turn rectangles into trapezoids, but the device must remain a rigid flat object with preserved aspect ratio and believable edges.
- Desired balance: 100% product identity from Image 1, 100% pose/perspective/lighting inheritance from Image 2 slot analysis.

Integration:
- Products must sit physically in the scene with believable contact shadows, cast shadows, reflected color, edge light, occlusion, and depth.
- Avoid flat pasted cutout feeling, floating products, clipping, object intersections, impossible overlaps, broken supports, and products penetrating props.

Text:
- If user provided main title/subtitle, replace the identified title areas while preserving typography hierarchy and placement.
- If not provided, keep clean campaign hierarchy from Image 2 and avoid random extra text.

Quality:
Premium commercial advertising render, polished e-commerce KV, high-resolution, clean composition, realistic product integration, consistent lighting, no watermark, no screenshot frame.

Negative constraints:
No product deformation, no warped screens, no changed aspect ratios, no broken stands, no altered camera count or position, no pasted collage look, no floating products, no object intersections, no unreadable messy text, no leftover competing reference products.`;
}

function openAiFetchTimeoutMs() {
  const timeoutMs = Number(process.env.OPENAI_FETCH_TIMEOUT_MS || 240000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 240000;
}

function makeOpenAiTimeoutError(timeoutMs) {
  const error = new Error(`图片生成服务响应超时（${Math.round(timeoutMs / 1000)} 秒），请稍后重试。`);
  error.status = 504;
  error.rawMessage = "OpenAI request timed out";
  return error;
}

async function fetchOpenAI(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = openAiFetchTimeoutMs();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      lastError = error?.name === "AbortError" ? makeOpenAiTimeoutError(timeoutMs) : error;
      if (lastError.status === 504 || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function isBusyUpstream(status, message) {
  const text = String(message || "").toLowerCase();
  return status === 429 || status === 503 || text.includes("excessive system load") || text.includes("system load");
}

function friendlyUpstreamError(message) {
  const text = String(message || "");
  if (isBusyUpstream(503, text)) return "生成服务暂时繁忙，请稍后重试。";
  return text || "图片生成失败。";
}

async function callImageEdit({ prompt, images, size, outputFormat = "png" }) {
  const form = new FormData();
  form.append("model", imageModel());
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", imageQuality());
  form.append("output_format", outputFormat);
  for (const image of images) form.append("image[]", image.blob, image.filename);

  const upstream = await fetchOpenAI(`${normalizeBaseUrl()}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  });
  const result = await upstream.json();
  if (!upstream.ok) {
    const error = new Error(friendlyUpstreamError(result?.error?.message));
    error.status = upstream.status;
    error.rawMessage = result?.error?.message || "";
    error.raw = result;
    throw error;
  }
  return extractImageResult(result);
}

async function callImageGenerate({ prompt, size, outputFormat = "png" }) {
  const upstream = await fetchOpenAI(`${normalizeBaseUrl()}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      size,
      quality: imageQuality(),
      output_format: outputFormat,
      response_format: "b64_json"
    })
  });
  const result = await upstream.json();
  if (!upstream.ok) {
    const error = new Error(friendlyUpstreamError(result?.error?.message));
    error.status = upstream.status;
    error.rawMessage = result?.error?.message || "";
    error.raw = result;
    throw error;
  }
  return extractImageResult(result);
}

async function callVisionText({ prompt, image, maxTokens = 1200 }) {
  const upstream = await fetchOpenAI(`${normalizeBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_TEXT_MODEL || "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } }
          ]
        }
      ],
      max_tokens: maxTokens
    })
  });
  const result = await upstream.json();
  if (!upstream.ok) {
    const error = new Error(friendlyUpstreamError(result?.error?.message));
    error.status = upstream.status;
    error.rawMessage = result?.error?.message || "";
    error.raw = result;
    throw error;
  }
  return result?.choices?.[0]?.message?.content || "";
}

function extractImageResult(result) {
  const firstImage = result?.data?.[0] || {};
  const imageBase64 = firstImage.b64_json || firstImage.base64 || firstImage.image_base64;
  const imageUrl = firstImage.url || firstImage.image_url;
  if (imageUrl && !imageBase64) return { imageUrl };
  if (!imageBase64) {
    const error = new Error("接口没有返回可识别的图片数据。");
    error.raw = result;
    throw error;
  }
  return { imageBase64 };
}

async function saveGeneratedImage(imageResult, outputFormat = "png") {
  if (imageResult.imageUrl) {
    return { image: imageResult.imageUrl, downloadUrl: imageResult.imageUrl };
  }
  const filename = `${crypto.randomUUID()}.${outputFormat}`;
  const filePath = path.join(outputDir, filename);
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    stream.end(Buffer.from(imageResult.imageBase64, "base64"));
  });
  return {
    image: `data:image/${outputFormat};base64,${imageResult.imageBase64}`,
    downloadUrl: `/outputs/${filename}`
  };
}

async function callWithBusyRetry(job, label, action) {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    job.attempt = attempt;
    job.message = attempt > 1 ? `${label}响应较慢，正在第 ${attempt} 次自动重试` : label;
    try {
      return await action();
    } catch (error) {
      if (!isBusyUpstream(error.status, error.rawMessage) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

async function runGenerateJob(job, body) {
  try {
    job.status = "running";
    job.message = "生成中";
    job.startedAt = Date.now();

    const ratio = String(body.ratio || "original").trim();
    const mode = String(body.mode || "v1").trim();
    const outputFormat = "png";
    const size = sizeFromRatio(ratio);
    const mainTitle = String(body.mainTitle || "").trim();
    const subTitle = String(body.subTitle || "").trim();
    const adjustments = String(body.adjustments || "").trim();
    const reference = dataUrlToBlob(body.referenceImage, "reference-kv");
    const product = dataUrlToBlob(body.productImage, "product-reference");
    let imageResult;

    if (mode === "v2") {
      job.estimatedSeconds = 360;
      job.message = "2.0 第一步：提取参考图提示词";
      const extractedPrompt = await callVisionText({
        prompt: buildV2PromptExtractionPrompt({ ratio, adjustments }),
        image: body.referenceImage,
        maxTokens: 1800
      });

      job.message = "2.0 第二步：纯文本复现参考 KV";
      const step1Prompt = buildV2Step1GenerationPrompt(extractedPrompt);
      const intermediate = await callWithBusyRetry(job, "2.0 第二步：纯文本复现参考 KV", () =>
        callImageGenerate({ prompt: step1Prompt, size, outputFormat })
      );
      const intermediateDataUrl = intermediate.imageUrl
        ? intermediate.imageUrl
        : `data:image/${outputFormat};base64,${intermediate.imageBase64}`;

      job.message = "2.0 第三步：分析产品槽位和标题";
      const slotAnalysis = await callVisionText({
        prompt: buildV2Step2Prompt(),
        image: intermediateDataUrl
      });

      job.message = "2.0 第四步：替换产品并生成最终图";
      const step3Prompt = buildV2Step3Prompt({ ratio, mainTitle, subTitle, adjustments, slotAnalysis });
      const intermediateBlob = dataUrlToBlob(intermediateDataUrl, "intermediate-kv");
      imageResult = await callWithBusyRetry(job, "2.0 第四步：替换产品并生成最终图", () =>
        callImageEdit({
          prompt: step3Prompt,
          size,
          outputFormat,
          images: [product, intermediateBlob]
        })
      );
    } else {
      job.estimatedSeconds = 180;
      const prompt = buildV1Prompt({ ratio, mainTitle, subTitle, adjustments });
      imageResult = await callWithBusyRetry(job, "1.0 生成中", () =>
        callImageEdit({
          prompt,
          size,
          outputFormat,
          images: [product, reference]
        })
      );
    }

    const saved = await saveGeneratedImage(imageResult, outputFormat);
    job.status = "done";
    job.image = saved.image;
    job.downloadUrl = saved.downloadUrl;
    job.finishedAt = Date.now();
    job.message = "生成完成";
  } catch (error) {
    const cause = error.cause?.code || error.cause?.message;
    job.status = "error";
    job.error = cause ? `${error.message} (${cause})` : error.message;
    job.finishedAt = Date.now();
  }
}

async function handleUnlock(req, res) {
  if (skipAuth) return sendJson(res, 200, { ok: true });
  if (!accessPassword) return sendJson(res, 200, { ok: true });
  const body = JSON.parse(await readBody(req));
  if (String(body.password || "") !== accessPassword) {
    return sendJson(res, 401, { error: "访问密码不正确。" });
  }
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { createdAt: Date.now() });
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": `uu_kv_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify({ ok: true }));
}

async function handleGenerate(req, res) {
  try {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: "请先输入访问密码。" });
    if (!checkUsage(req)) return sendJson(res, 429, { error: `今日生成次数已达上限（${dailyLimit} 次）。` });

    const body = JSON.parse(await readBody(req));
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) return sendJson(res, 400, { error: "服务端未配置 OpenAI API Key。" });
    if (!body.referenceImage || !body.productImage) return sendJson(res, 400, { error: "请上传参考 KV 图和产品组合图。" });

    const mode = String(body.mode || "v1") === "v2" ? "v2" : "v1";
    const id = crypto.randomUUID();
    const job = {
      id,
      mode,
      status: "queued",
      message: "等待生成服务响应",
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      attempt: 0,
      estimatedSeconds: mode === "v2" ? 360 : 180
    };
    jobs.set(id, job);
    runGenerateJob(job, body);
    sendJson(res, 202, { jobId: id, status: job.status, estimatedSeconds: job.estimatedSeconds, mode });
  } catch (error) {
    const cause = error.cause?.code || error.cause?.message;
    sendJson(res, 500, { error: cause ? `${error.message} (${cause})` : error.message });
  }
}

function handleJobStatus(req, res) {
  if (!isAuthorized(req)) return sendJson(res, 401, { error: "请先输入访问密码。" });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const id = url.searchParams.get("id");
  const job = jobs.get(id);
  if (!job) return sendJson(res, 404, { error: "任务不存在或已过期。" });
  sendJson(res, 200, {
    id: job.id,
    mode: job.mode,
    status: job.status,
    message: job.message,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    attempt: job.attempt,
    estimatedSeconds: job.estimatedSeconds,
    image: job.image || "",
    downloadUrl: job.downloadUrl || "",
    error: job.error || ""
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  let filePath;
  if (pathname.startsWith("/outputs/")) {
    filePath = path.join(outputDir, pathname.replace("/outputs/", ""));
  } else {
    filePath = path.join(publicDir, pathname === "/" ? "index.html" : pathname);
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
  if (req.method === "POST" && req.url === "/api/unlock") return handleUnlock(req, res);
  if (req.method === "GET" && req.url === "/api/auth-status") {
    return sendJson(res, 200, { locked: !skipAuth && Boolean(accessPassword), authorized: isAuthorized(req) });
  }
  if (req.method === "POST" && req.url === "/api/generate") return handleGenerate(req, res);
  if (req.method === "GET" && req.url.startsWith("/api/job")) return handleJobStatus(req, res);
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  process.stdout?.write(`UU KV running at http://127.0.0.1:${port}\n`);
});
