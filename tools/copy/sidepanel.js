const referenceInput = document.querySelector("#referenceImage");
const productInput = document.querySelector("#productImage");
const resultInput = document.querySelector("#resultImage");
const referenceCard = document.querySelector('[data-drop="reference"]');
const productCard = document.querySelector('[data-drop="product"]');
const resultCard = document.querySelector('[data-drop="result"]');
const referencePreview = document.querySelector("#referencePreview");
const productPreview = document.querySelector("#productPreview");
const resultPreview = document.querySelector("#resultPreview");
const ratioInput = document.querySelector("#ratioInput");
const adjustInput = document.querySelector("#adjustInput");
const generateBtn = document.querySelector("#generateBtn");
const copyBtn = document.querySelector("#copyBtn");
const openBtn = document.querySelector("#openBtn");
const downloadBtn = document.querySelector("#downloadBtn");
const promptOutput = document.querySelector("#promptOutput");
const statusText = document.querySelector("#statusText");
const resultStatus = document.querySelector("#resultStatus");

const state = {
  hasReference: false,
  hasProduct: false,
  resultDataUrl: "",
  countdownTimer: 0,
  elapsedSeconds: 0
};

function renderPreview(input, target, key) {
  const file = input.files && input.files[0];
  state[key] = Boolean(file);

  if (!file) {
    target.className = "drop-preview is-empty";
    target.innerHTML = key === "hasReference"
      ? '<span class="drop-icon">KV</span><strong>参考 KV 图</strong><small>点击或拖拽上传</small>'
      : '<span class="drop-icon">PR</span><strong>产品组合图</strong><small>点击或拖拽上传</small>';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    target.className = "drop-preview";
    target.innerHTML = `<img src="${reader.result}" alt="">`;
  };
  reader.readAsDataURL(file);
}

function renderResult() {
  const file = resultInput.files && resultInput.files[0];
  if (!file) {
    state.resultDataUrl = "";
    resultPreview.className = "result-preview is-empty";
    resultPreview.innerHTML = '<div class="loading-stack"><div class="orb"></div><div id="countdownText" class="countdown">00:00</div></div>';
    downloadBtn.disabled = true;
    resultStatus.textContent = "等待导入";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.resultDataUrl = reader.result;
    resultPreview.className = "result-preview";
    resultPreview.innerHTML = `<img src="${reader.result}" alt="生成结果">`;
    downloadBtn.disabled = false;
    resultStatus.textContent = "已导入";
  };
  reader.readAsDataURL(file);
}

function showResult(src) {
  stopCountdown();
  state.resultDataUrl = src;
  resultPreview.className = "result-preview";
  resultPreview.innerHTML = `<img src="${src}" alt="生成结果">`;
  downloadBtn.disabled = false;
  resultStatus.textContent = "已完成";
}

function startCountdown() {
  stopCountdown();
  state.elapsedSeconds = 0;
  updateCountdown();
  state.countdownTimer = window.setInterval(() => {
    state.elapsedSeconds += 1;
    updateCountdown();
  }, 1000);
}

function stopCountdown(clearText = true) {
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = 0;
  }
  if (clearText) {
    const countdown = document.querySelector("#countdownText");
    if (countdown) countdown.textContent = "00:00";
  }
}

function updateCountdown() {
  const countdown = document.querySelector("#countdownText");
  if (!countdown) return;
  const minutes = String(Math.floor(state.elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(state.elapsedSeconds % 60).padStart(2, "0");
  countdown.textContent = `${minutes}:${seconds}`;
}

function setFiles(input, files) {
  if (!files || !files[0] || !files[0].type.startsWith("image/")) return;
  const transfer = new DataTransfer();
  transfer.items.add(files[0]);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getImageUrlFromDrop(dataTransfer) {
  const uriList = dataTransfer.getData("text/uri-list")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (uriList) return uriList;

  const plainText = dataTransfer.getData("text/plain")?.trim();
  if (plainText && /^https?:\/\//i.test(plainText)) return plainText;

  const html = dataTransfer.getData("text/html");
  if (!html) return "";

  const doc = new DOMParser().parseFromString(html, "text/html");
  const img = doc.querySelector("img");
  return img?.src || "";
}

async function urlToFile(url, fallbackName) {
  if (url.startsWith("data:image/")) {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], `${fallbackName}.${blob.type.split("/")[1] || "png"}`, { type: blob.type });
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("image-fetch-failed");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("not-image");
  const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([blob], `${fallbackName}.${extension}`, { type: blob.type });
}

async function setDroppedImage(input, dataTransfer, fallbackName) {
  const file = [...(dataTransfer.files || [])].find((item) => item.type.startsWith("image/"));
  if (file) {
    setFiles(input, [file]);
    return true;
  }

  const imageUrl = getImageUrlFromDrop(dataTransfer);
  if (!imageUrl) return false;

  const fetchedFile = await urlToFile(imageUrl, fallbackName);
  setFiles(input, [fetchedFile]);
  return true;
}

function bindDrop(card, input) {
  ["dragenter", "dragover"].forEach((eventName) => {
    card.addEventListener(eventName, (event) => {
      event.preventDefault();
      card.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    card.addEventListener(eventName, (event) => {
      event.preventDefault();
      card.classList.remove("is-dragover");
    });
  });

  card.addEventListener("drop", async (event) => {
    const fallbackName = input.id === "referenceImage" ? "reference-kv" : input.id === "productImage" ? "product-reference" : "result-image";
    try {
      await setDroppedImage(input, event.dataTransfer, fallbackName);
    } catch (error) {
      const targetStatus = input.id === "resultImage" ? resultStatus : statusText;
      targetStatus.textContent = "图片拖拽失败";
    }
  });
}

function buildPrompt() {
  const ratio = ratioInput.value.trim() || "16:9";
  const adjustments = adjustInput.value.trim() || "无额外调整，尽量保留参考 KV 的商业风格、构图语言和信息层级。";

  return `Use GPT Image 2.

Task: Generate one final commercial KV image. Use Image 1 as the reference KV and Image 2 as the strict product reference.

Output size / aspect ratio:
${ratio}

User adjustment requirements:
${adjustments}

Image roles:
- Image 1: reference KV only. Analyze its composition, style, product slots, product priority, depth hierarchy, lighting, shadows, typography hierarchy, props, background, and campaign mood.
- Image 2: user product lineup. Use it as a strict product reference. Preserve the real product identities and shapes.

Internal workflow before generating:
1. Analyze Image 1 and identify only the true advertised products, ranked by priority. Do not treat headlines, background, price tags, logos, UI text, decorative props, coins, gift boxes, ribbons, clouds, roads, or scene supports as products.
2. For each product slot in Image 1, record its position, size, angle, perspective direction, foreground/background layer, occlusion, contact point, material light, and environment light.
3. Analyze Image 2 and rank the user's products by visual priority using size and position.
4. Map user product priority to reference product slot priority one by one. If Image 2 has fewer products than Image 1, replace only the top slots. If Image 2 has more products than Image 1, use only the top products unless there is room for secondary accessories.
5. Compose the final image once. Do not make an intermediate reproduction first.

Strict product fidelity rules:
- Image 2 product fidelity is the highest priority.
- Preserve each user's product silhouette, proportions, structure, screen aspect ratio, frame thickness, stand, base, camera modules, lenses, arms, buttons, distinctive details, and original product category.
- Do not morph, bend, stretch, melt, simplify, redesign, recolor into the scene color, or convert products into phones, watches, headphones, generic tablets, or unrelated devices.
- Only allowed product transformations: uniform scale, position, whole-object rotation, very mild perspective alignment, lighting/color-temperature matching, reflections, shadows, and partial occlusion.
- If a reference slot angle would deform the product, keep the product accurate and adapt the slot/layout instead.

Replacement and integration rules:
- Each user product should inherit the matched Image 1 slot's general position, scale, angle, perspective direction, depth layer, and lighting, but never at the cost of product deformation.
- Products must feel physically integrated in the scene with believable contact points, occlusion, cast shadows, contact shadows, reflected environment color, and consistent key light.
- Avoid products floating without support.
- Avoid object intersections, clipping, impossible overlaps, broken supports, products penetrating boxes, platforms, walls, or other products.
- For small products, keep them large enough to preserve details. Do not hide key structures in crowded intersections.

Reference KV preservation:
- Preserve Image 1's campaign mood, visual style, color palette, background type, major props, spatial composition, typography hierarchy, and commercial polish.
- Adapt the layout naturally to the requested aspect ratio (${ratio}). If the target ratio differs from Image 1, recompose the layout instead of cropping or stretching.
- If the reference background is open and simple, extend the environment. If the reference is dense or complex, rebuild the layout for the target ratio while preserving hierarchy and style.

Text handling:
- Follow the user's adjustment requirements for title/copy if provided.
- If no replacement copy is provided, keep a similar campaign hierarchy from Image 1, but prioritize clean layout over exact tiny text accuracy.
- Avoid messy unreadable text and random extra logos.

Quality:
Premium commercial advertising render, polished e-commerce KV, high-resolution, clean composition, realistic product integration, consistent lighting, no watermark, no screenshot frame.

Negative constraints:
No product deformation, no warped screens, no changed aspect ratios, no broken stands, no altered camera count or position, no pasted flat collage look, no floating products, no穿模/intersections, no leftover reference products after replacement, no clutter, no low resolution, no blurry details.`;
}

function generatePrompt() {
  if (!state.hasReference || !state.hasProduct) {
    statusText.textContent = "请先上传两张图";
    return;
  }

  const prompt = buildPrompt();
  promptOutput.value = prompt;
  copyBtn.disabled = false;
  statusText.textContent = "生成中";
  resultStatus.textContent = "生成中";
  resultPreview.className = "result-preview is-empty";
  resultPreview.innerHTML = '<div class="loading-stack"><div class="orb"></div><div id="countdownText" class="countdown">00:00</div></div>';
  startCountdown();
  downloadBtn.disabled = true;

  const referenceSrc = referencePreview.querySelector("img")?.src;
  const productSrc = productPreview.querySelector("img")?.src;

  if (globalThis.chrome && chrome.runtime && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      kvPrompt: prompt,
      kvRatio: ratioInput.value.trim(),
      kvAdjustments: adjustInput.value.trim(),
      uuKvResult: null,
      uuKvStatus: null
    });

    chrome.runtime.sendMessage({
      type: "UU_KV_START",
      prompt,
      images: [referenceSrc, productSrc].filter(Boolean)
    });
    return;
  }

  navigator.clipboard.writeText(prompt).then(openChatGPT);
}

async function copyPrompt() {
  if (!promptOutput.value) return;
  await navigator.clipboard.writeText(promptOutput.value);
  statusText.textContent = "已复制";
}

function openChatGPT() {
  if (globalThis.chrome && chrome.tabs) {
    chrome.tabs.create({ url: "https://chatgpt.com/" });
    return;
  }

  window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
}

function downloadResult() {
  if (!state.resultDataUrl) return;
  const link = document.createElement("a");
  link.href = state.resultDataUrl;
  link.download = `UU-KV-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function pollResult() {
  if (!(globalThis.chrome && chrome.storage && chrome.storage.local)) return;
  chrome.storage.local.get(["uuKvResult", "uuKvStatus"], ({ uuKvResult, uuKvStatus }) => {
    if (uuKvResult?.src && uuKvResult.src !== state.resultDataUrl) {
      showResult(uuKvResult.src);
      return;
    }
    if (uuKvStatus?.status) {
      resultStatus.textContent = uuKvStatus.status === "blocked" ? "需要手动继续" : "生成中";
    }
  });
}

referenceInput.addEventListener("change", () => {
  renderPreview(referenceInput, referencePreview, "hasReference");
});

productInput.addEventListener("change", () => {
  renderPreview(productInput, productPreview, "hasProduct");
});

resultInput.addEventListener("change", renderResult);

bindDrop(referenceCard, referenceInput);
bindDrop(productCard, productInput);
bindDrop(resultCard, resultInput);

generateBtn.addEventListener("click", generatePrompt);
copyBtn.addEventListener("click", copyPrompt);
openBtn.addEventListener("click", openChatGPT);
downloadBtn.addEventListener("click", downloadResult);

if (globalThis.chrome && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(["kvPrompt", "kvRatio", "kvAdjustments"], (saved) => {
    if (saved.kvRatio) ratioInput.value = saved.kvRatio;
    if (saved.kvAdjustments) adjustInput.value = saved.kvAdjustments;
    if (saved.kvPrompt) {
      promptOutput.value = saved.kvPrompt;
      copyBtn.disabled = false;
      statusText.textContent = "已恢复";
    }
  });
  setInterval(pollResult, 1500);
}
