const form = document.querySelector("#posterForm");
const message = document.querySelector("#message");
const resultList = document.querySelector("#resultList");
const emptyState = document.querySelector("#emptyState");
const buttonText = document.querySelector("#buttonText");
const prototypeInput = document.querySelector("#prototypeImage");
const prototypePreview = document.querySelector("#prototypePreview");
const heroInput = document.querySelector("#heroImage");
const heroPreview = document.querySelector("#heroPreview");
const robotReferenceInput = document.querySelector("#robotReferenceImages");
const robotReferencePreview = document.querySelector("#robotReferencePreview");
const lockScreen = document.querySelector("#lockScreen");
const unlockForm = document.querySelector("#unlockForm");
const unlockMessage = document.querySelector("#unlockMessage");

const defaultPrototypeUrl = "/assets/prototype-default.png";
const defaultHeroUrl = "/assets/hero-default.png";
const defaultRobotReferenceUrls = ["/assets/robot-ref-1.png", "/assets/robot-ref-2.png"];
const maxCanvasHeight = 30000;
const maxCanvasArea = 180000000;
const seamFeatherHeight = 32;
const maxPrototypeUploadWidth = 1080;

let prototypeMeta = null;
let currentHeroDataUrl = "";
let generationTimerId = null;

function getFields() {
  const data = new FormData(form);
  return {
    tone: data.get("tone")?.trim(),
    heroRatio: data.get("heroRatio")?.trim(),
    mood: data.get("mood")?.trim()
  };
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  if (minutes <= 0) return `${restSeconds} 秒`;
  return `${minutes} 分 ${String(restSeconds).padStart(2, "0")} 秒`;
}

function stopGenerationTimer() {
  if (!generationTimerId) return;
  clearInterval(generationTimerId);
  generationTimerId = null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startGenerationTimer(segmentCount) {
  stopGenerationTimer();
  const startedAt = Date.now();
  const estimatedSeconds = Math.max(90, segmentCount * 85 + 25);

  function tick() {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const remainingSeconds = estimatedSeconds - elapsedSeconds;
    if (remainingSeconds > 0) {
      setMessage(`正在生成 ${segmentCount} 段内容，预计剩余 ${formatDuration(remainingSeconds)}。`);
    } else {
      setMessage(`已超过预计 ${formatDuration(Math.abs(remainingSeconds))}，仍在生成中，请继续等待。`);
    }
  }

  tick();
  generationTimerId = setInterval(tick, 1000);
}

function showLock() {
  lockScreen.hidden = false;
  document.querySelector(".app-shell").classList.add("is-locked");
}

function hideLock() {
  lockScreen.hidden = true;
  document.querySelector(".app-shell").classList.remove("is-locked");
}

async function checkAuth() {
  const response = await fetch("/api/auth-status");
  const result = await readJsonResponse(response);
  if (result.locked && !result.authorized) showLock();
  else hideLock();
  return result;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    const plainText = trimmed.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (response.status === 401 || plainText.includes("请输入访问密码")) {
      showLock();
      throw new Error("访问已过期或服务刚重启，请重新输入访问密码后再生成。");
    }
    throw new Error(`接口返回了 HTML 内容（HTTP ${response.status}），请检查 API 接口地址或刷新页面后重试。`);
  }
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(trimmed || "{}");
    } catch {
      throw new Error("接口返回了无法解析的 JSON，请刷新页面后重试。");
    }
  }

  const plainText = trimmed.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (response.status === 401 || plainText.includes("请输入访问密码")) {
    showLock();
    throw new Error("访问已过期或服务刚重启，请重新输入访问密码后再生成。");
  }
  throw new Error(`接口返回了非 JSON 内容（HTTP ${response.status}），请刷新页面后重试。`);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

async function urlToDataUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return await readFileAsDataUrl(blob);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片载入失败。"));
    image.src = src;
  });
}

async function normalizeDrawableImage(src) {
  if (src.startsWith("data:")) return src;
  try {
    return await urlToDataUrl(src);
  } catch {
    return src;
  }
}

async function getImageMeta(dataUrl) {
  const image = await loadImage(dataUrl);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function inferSegmentCount(meta, mode, manualCount) {
  if (mode === "single") return 1;
  if (mode === "manual") return Math.max(1, Math.min(10, Number(manualCount || 1)));
  const maxChunkHeight = meta.width * 2.1;
  return Math.max(1, Math.min(10, Math.ceil(meta.height / maxChunkHeight)));
}

async function splitPrototypeIntoSegments(dataUrl, mode, manualCount) {
  const source = await loadImage(dataUrl);
  const meta = { width: source.naturalWidth, height: source.naturalHeight };
  const count = inferSegmentCount(meta, mode, manualCount);
  const segments = [];
  const segmentMeta = [];
  const chunkHeight = Math.ceil(meta.height / count);
  const uploadScale = Math.min(1, maxPrototypeUploadWidth / Math.max(meta.width, 1));
  const uploadWidth = Math.max(1, Math.round(meta.width * uploadScale));

  for (let index = 0; index < count; index += 1) {
    const sy = index * chunkHeight;
    const sh = Math.min(chunkHeight, meta.height - sy);
    const canvas = document.createElement("canvas");
    canvas.width = uploadWidth;
    canvas.height = Math.max(1, Math.round(sh * uploadScale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, sy, meta.width, sh, 0, 0, canvas.width, canvas.height);
    segments.push(canvas.toDataURL("image/jpeg", 0.88));
    segmentMeta.push({ width: meta.width, height: sh, y: sy });
  }

  return { segments, meta, segmentMeta };
}

async function previewFile(input, img, shouldTrackPrototype = false) {
  const file = input.files?.[0];
  if (!file) return "";
  const dataUrl = await readFileAsDataUrl(file);
  img.src = dataUrl;
  input.closest(".drop-zone").classList.add("has-image");
  if (shouldTrackPrototype) prototypeMeta = await getImageMeta(dataUrl);
  else currentHeroDataUrl = dataUrl;
  return dataUrl;
}

async function getPrototypeDataUrl() {
  const file = prototypeInput.files?.[0];
  return file ? await readFileAsDataUrl(file) : await urlToDataUrl(defaultPrototypeUrl);
}

async function getHeroDataUrl() {
  const file = heroInput.files?.[0];
  if (file) return await readFileAsDataUrl(file);
  if (currentHeroDataUrl) return currentHeroDataUrl;
  currentHeroDataUrl = await urlToDataUrl(defaultHeroUrl);
  return currentHeroDataUrl;
}

async function getRobotReferenceDataUrls() {
  const files = Array.from(robotReferenceInput?.files || []);
  if (files.length) return Promise.all(files.map((file) => readFileAsDataUrl(file)));
  return [];
}

async function pollGenerationJob(jobId) {
  while (true) {
    await wait(3000);
    const response = await fetch(`/api/generate/${encodeURIComponent(jobId)}`);
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || "生成失败。");
    if (result.status === "done" || result.images) return result;
    const progressText = result.total
      ? `后台生成中：${result.progress || 0}/${result.total} 段。`
      : "后台生成中。";
    setMessage(`${progressText}${result.message ? ` ${result.message}` : ""}`);
  }
}

async function uploadImageRef(kind, dataUrl, index = 0) {
  const response = await fetch("/api/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, index, dataUrl })
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result.error || "上传图片失败。");
  return result.refId;
}

async function uploadPrototypeSegments(segments) {
  const refs = [];
  for (let index = 0; index < segments.length; index += 1) {
    setMessage(`正在上传原型切片 ${index + 1}/${segments.length}，上传完成后会在后台生成。`);
    refs.push(await uploadImageRef("prototype-segment", segments[index], index));
  }
  return refs;
}

async function stitchFinalImage(heroDataUrl, generatedImages, segmentMeta = []) {
  const hero = await loadImage(heroDataUrl);
  const generated = [];
  for (const item of generatedImages) {
    const image = await loadImage(await normalizeDrawableImage(item.image));
    generated.push({
      image,
      height: Math.round(image.naturalHeight * (hero.naturalWidth / image.naturalWidth)),
      sourceHeight: image.naturalHeight
    });
  }

  if (generated.length > 1 && segmentMeta.length === generated.length && segmentMeta[0]?.height) {
    const firstHeight = generated[0].height;
    const firstPrototypeHeight = segmentMeta[0].height;
    generated.forEach((item, index) => {
      if (index === 0) return;
      const expectedHeight = Math.round(firstHeight * (segmentMeta[index].height / firstPrototypeHeight));
      const allowance = index === generated.length - 1 ? 1.18 : 1.08;
      const cappedHeight = Math.min(item.height, Math.max(240, Math.round(expectedHeight * allowance)));
      if (cappedHeight < item.height) {
        const sourceScale = item.image.naturalWidth / hero.naturalWidth;
        item.height = cappedHeight;
        item.sourceHeight = Math.min(item.image.naturalHeight, Math.round(cappedHeight * sourceScale));
      }
    });
  }

  const width = hero.naturalWidth;
  const overlaps = generated.map((item, index) => {
    if (index === 0) return 0;
    const previous = generated[index - 1];
    return Math.min(seamFeatherHeight, Math.floor(Math.min(previous.height, item.height) * 0.18));
  });
  const height = hero.naturalHeight
    + generated.reduce((sum, item, index) => sum + item.height - overlaps[index], 0);

  if (height > maxCanvasHeight || width * height > maxCanvasArea) {
    return { tooLarge: true, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(hero, 0, 0);
  let y = hero.naturalHeight;
  generated.forEach((item, index) => {
    const overlap = overlaps[index];
    y -= overlap;
    if (overlap > 0) {
      drawImageWithTopFade(ctx, item.image, 0, y, width, item.height, overlap, item.sourceHeight);
    } else {
      ctx.drawImage(item.image, 0, 0, item.image.naturalWidth, item.sourceHeight, 0, y, width, item.height);
    }
    y += item.height;
  });

  try {
    return {
      tooLarge: false,
      width,
      height,
      dataUrl: canvas.toDataURL("image/png")
    };
  } catch {
    return {
      tooLarge: true,
      width,
      height,
      tainted: true
    };
  }
}

function drawImageWithTopFade(ctx, image, x, y, width, height, fadeHeight, sourceHeight = image.naturalHeight) {
  const sourceScale = sourceHeight / height;
  const stripCount = 24;
  const stripHeight = Math.max(1, Math.ceil(fadeHeight / stripCount));

  ctx.save();
  for (let offset = 0; offset < fadeHeight; offset += stripHeight) {
    const currentHeight = Math.min(stripHeight, fadeHeight - offset);
    const alpha = Math.min(1, (offset + currentHeight) / fadeHeight);
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      image,
      0,
      offset * sourceScale,
      image.naturalWidth,
      currentHeight * sourceScale,
      x,
      y + offset,
      width,
      currentHeight
    );
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(
    image,
    0,
    fadeHeight * sourceScale,
    image.naturalWidth,
    sourceHeight - fadeHeight * sourceScale,
    x,
    y + fadeHeight,
    width,
    height - fadeHeight
  );
  ctx.restore();
}

function appendResultCard({ titleText, image, downloadUrl, note }) {
  const card = document.createElement("article");
  card.className = "result-card";
  const title = document.createElement("div");
  title.className = "result-title";
  title.innerHTML = `<strong>${titleText}</strong>${downloadUrl ? `<a href="${downloadUrl}" target="_blank" rel="noreferrer">打开图片</a>` : ""}`;
  const img = document.createElement("img");
  img.src = image;
  img.alt = titleText;
  card.append(title, img);
  if (note) {
    const text = document.createElement("p");
    text.className = "result-note";
    text.textContent = note;
    card.append(text);
  }
  resultList.append(card);
}

async function renderResults(heroDataUrl, images, segmentMeta = []) {
  resultList.innerHTML = "";
  const stitched = await stitchFinalImage(heroDataUrl, images, segmentMeta);

  if (!stitched.tooLarge) {
    appendResultCard({
      titleText: "完整长图（顶部头图为原图直拼）",
      image: stitched.dataUrl,
      downloadUrl: stitched.dataUrl,
      note: `尺寸 ${stitched.width} × ${stitched.height}，顶部头图没有进入模型重绘，内容段拼接处已做柔和融合。`
    });
  } else {
    appendResultCard({
      titleText: "第 0 段：顶部头图原图",
      image: heroDataUrl,
      downloadUrl: heroDataUrl,
      note: stitched.tainted
        ? "有一段结果图来自跨域地址，浏览器不允许导出合成长图；已按段输出，顶部头图仍为原图。"
        : `完整长图约 ${stitched.width} × ${stitched.height}，超过浏览器安全拼接尺寸，已按段输出。`
    });
  }

  images.forEach((item) => {
    appendResultCard({
      titleText: `内容第 ${item.segment} 段`,
      image: item.image,
      downloadUrl: item.downloadUrl,
      note: "该段对应原型切片生成，用于接在顶部头图下方。"
    });
  });
}

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  unlockMessage.textContent = "正在验证...";
  const password = document.querySelector("#accessPassword").value;
  const response = await fetch("/api/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const result = await readJsonResponse(response);
  if (!response.ok) {
    unlockMessage.textContent = result.error || "验证失败。";
    unlockMessage.className = "message error";
    return;
  }
  unlockMessage.className = "message success";
  unlockMessage.textContent = "已解锁。";
  hideLock();
});

prototypeInput.addEventListener("change", () => previewFile(prototypeInput, prototypePreview, true));
heroInput.addEventListener("change", () => previewFile(heroInput, heroPreview));
robotReferenceInput?.addEventListener("change", async () => {
  const file = robotReferenceInput.files?.[0];
  if (!file) return;
  robotReferencePreview.src = await readFileAsDataUrl(file);
  robotReferenceInput.closest(".drop-zone").classList.add("has-image");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const button = form.querySelector(".primary-button");
  button.disabled = true;
  buttonText.textContent = "生成中...";
  setMessage("正在切分原型并生成内容区。顶部头图会在结果里原图直拼，不交给模型重绘。");

  try {
    const auth = await checkAuth();
    if (auth.locked && !auth.authorized) {
      throw new Error("访问已过期或服务刚重启，请重新输入访问密码后再生成。");
    }

    const prototypeImage = await getPrototypeDataUrl();
    const heroImage = await getHeroDataUrl();
    const robotReferenceImages = await getRobotReferenceDataUrls();
    const split = await splitPrototypeIntoSegments(
      prototypeImage,
      data.get("segmentMode"),
      data.get("segmentCount")
    );
    prototypeMeta = split.meta;
    const prototypeSegmentRefs = await uploadPrototypeSegments(split.segments);

    const payload = {
      apiKey: data.get("apiKey"),
      apiBaseUrl: data.get("apiBaseUrl"),
      model: data.get("model"),
      size: data.get("size"),
      quality: data.get("quality"),
      outputFormat: data.get("outputFormat"),
      segmentMode: data.get("segmentMode"),
      segmentCount: split.segments.length,
      fields: getFields(),
      prototypeSegmentRefs,
      prototypeMeta,
      robotReferenceImages
    };

    startGenerationTimer(split.segments.length);
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || "生成失败。");
    const finalResult = result.jobId ? await pollGenerationJob(result.jobId) : result;

    stopGenerationTimer();
    await renderResults(heroImage, finalResult.images || [], split.segmentMeta);
    setMessage(`生成完成：顶部头图原图直拼，内容区共 ${finalResult.segmentCount || finalResult.images?.length || 1} 段。`, "success");
  } catch (error) {
    stopGenerationTimer();
    if (!resultList.children.length) resultList.append(emptyState);
    setMessage(error.message, "error");
  } finally {
    stopGenerationTimer();
    button.disabled = false;
    buttonText.textContent = "生成落地页";
  }
});

checkAuth();
