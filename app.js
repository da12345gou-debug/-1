const form = document.querySelector("#posterForm");
const promptPreview = document.querySelector("#promptPreview");
const message = document.querySelector("#message");
const resultImage = document.querySelector("#resultImage");
const emptyState = document.querySelector("#emptyState");
const downloadLink = document.querySelector("#downloadLink");
const previewButton = document.querySelector("#previewButton");
const imageModal = document.querySelector("#imageModal");
const modalImage = document.querySelector("#modalImage");
const modalClose = document.querySelector("#modalClose");
const buttonText = document.querySelector("#buttonText");

const productInput = document.querySelector("#productImage");
const productPreview = document.querySelector("#productPreview");
const resultFrame = document.querySelector(".result-frame");
const layoutInput = document.querySelector("#layoutMode");
const aspectRatioInput = document.querySelector("#aspectRatio");
const lockScreen = document.querySelector("#lockScreen");
const unlockForm = document.querySelector("#unlockForm");
const unlockMessage = document.querySelector("#unlockMessage");

const ratioSizes = {
  "2:3": "1024x1536",
  "3:4": "1024x1365",
  "4:5": "1024x1280",
  "1:1": "1024x1024",
  "16:9": "1536x864",
  "1:2": "1536x768"
};

const ratioPreviews = {
  portrait: {
    "2:3": "2 / 3",
    "3:4": "3 / 4",
    "4:5": "4 / 5",
    "1:1": "1 / 1"
  },
  landscape: {
    "16:9": "16 / 9",
    "1:2": "2 / 1"
  }
};

const defaultRatios = {
  portrait: "3:4",
  landscape: "1:2"
};

const ratioOptions = {
  portrait: ["2:3", "3:4", "4:5", "1:1"],
  landscape: ["16:9", "1:2"]
};

const presets = {
  spring: {
    label: "春日",
    mainTone: "嫩绿色",
    titleColor: "白色点缀黄色",
    environmentScene: "春日旷野露营环境",
    mainTitle: "春夏换新季",
    subTitle: "小度家用智能好物分享",
    floatingElement: "花瓣"
  },
  summer: {
    label: "夏日",
    mainTone: "充满生机的渐变蓝色和沙滩的黄色橙色",
    titleColor: "白色点缀黄色",
    environmentScene: "夏日海滩",
    mainTitle: "度粉有奖招募令",
    subTitle: "小度家用智能好物分享",
    floatingElement: "气泡"
  },
  christmas: {
    label: "圣诞",
    mainTone: "圣诞的夜晚的深蓝到紫色渐变天空，圣诞色调，暖色的圣诞光芒。圣诞老人和麋鹿还有礼物盒和圣诞树",
    titleColor: "黄色",
    environmentScene: "圣诞夜",
    mainTitle: "圣诞欢乐购",
    subTitle: "小度家用智能好物分享",
    floatingElement: "雪花"
  }
};

let countdownTimer = null;
let statusTimer = null;
let activeJobId = "";
const activeJobKey = "kv-generator-active-job";

function getFields() {
  const data = new FormData(form);
  return {
    layout: data.get("layout") || "portrait",
    aspectRatio: data.get("aspectRatio") || defaultRatios[data.get("layout")] || "3:4",
    mainTone: data.get("mainTone")?.trim(),
    titleColor: data.get("titleColor")?.trim(),
    environmentScene: data.get("environmentScene")?.trim(),
    mainTitle: data.get("mainTitle")?.trim(),
    subTitle: data.get("subTitle")?.trim(),
    floatingElement: data.get("floatingElement")?.trim()
  };
}

function buildPortraitPrompt(fields) {
  return `一张极具视觉冲击力的3D商业广告海报，比例3:4，大师级的3d渲染，材质清晰明确，整体光线柔和明亮，具有C4D和Blender渲染的顶级质感，色彩高饱和度，活泼、科技、年轻化，8k分辨率，极致细节。产品和标题突出：产品组合位于画面中心偏下，标题位于画面正中偏上。环境简洁，环境完全不抢，突出主体。产品是画面当之无愧的中心和焦点。整体冷暖和谐。画面采用「${fields.mainTone || ""}」作为主色调背景。请根据「${fields.environmentScene || ""}」自动联想并扩写合适的环境氛围，让画面情绪自然、具体、有季节感。

构图上：
产品组合位于画面中心偏下，圆润阶梯展台错落排布。请先严格识别上传产品六面图中的独立产品数量，并只呈现相同数量的产品：如果参考图中只有 1 个产品，海报中只能出现 1 个产品主体，禁止额外添加音箱、摄像头、屏幕、闹钟或任何其他智能家居产品；如果参考图中有多个产品，才可以完整呈现对应数量的多个产品。请严格参考上传的产品六面图：保持产品造型、大小比例和数量逻辑，调整产品透视和环境光，使其自然融入新场景。该参考图用于控制产品之间的比例；如果有多个产品，会在白底图上放置多个。最高的产品位于中央，其他产品在两侧，产品之间互不遮挡，上下前后高低错落，像电商商品陈列一样精致合理。除了墨镜产品之外，其他产品都要落地。所有产品外观严格参考产品六面图，不要凭空生成参考图之外的新产品。

标题位于画面正中偏上。主标题文字为「${fields.mainTitle || ""}」，几个大字，字体为「手写」风格，艺术字设计。副标题文字为「${fields.subTitle || ""}」，位于主标题下方，带有简约飘带或托底结构，与主标题组合和谐。标题颜色为「${fields.titleColor || ""}」，文字颜色需要简洁突出、清晰可读，如果背景深色则使用浅色标题，如果背景浅色则使用深色标题。

环境为简约的「${fields.environmentScene || ""}」，细节精致但完全不抢主体，背景为简单渐变色，保证标题突出。整体青春活泼。空中漂浮着粉色的简约小「${fields.floatingElement || ""}」，颜色和谐，体现空间感和镜头感，有一定视觉冲击力。

画面中加入一个小度机器人吉祥物，严格参考内置机器人参考图。保持机器人角色完全不变，不要改造它的身体比例、脸部屏幕、眼睛形态、材质和轮廓；注意它无手、无脚、无腿，没有手指，呈现悬浮状态。该角色可以身着符合环境特色的轻量服饰，但服饰不能改变机器人本体结构，整体生动俏皮，不要抢占产品主体。`;
}

function buildLandscapePrompt(fields) {
  return `一张极具视觉冲击力的3D商业广告横版 KV，比例${fields.aspectRatio || "1:2"}，宽幅横向构图，大师级的3d渲染，材质清晰明确，整体光线柔和明亮，具有C4D和Blender渲染的顶级质感，色彩高饱和度，活泼、科技、年轻化，8k分辨率，极致细节。整体冷暖和谐。画面采用「${fields.mainTone || ""}」作为主色调背景。请根据「${fields.environmentScene || ""}」自动联想并扩写合适的环境氛围，让画面情绪自然、具体、有季节感。

横版构图必须清晰分区：标题文字位于画面左侧，占据左侧视觉区域；产品组合位于画面右侧偏中下，是横版画面的商业主体。白色小度机器人位于产品堆品台右侧，白色机器角色的完整高度必须小于或等于整张画面高度的三分之一。

产品组合位于画面右侧偏中下，圆润阶梯展台错落排布。请先严格识别上传产品白底图中的独立产品数量，并只呈现相同数量的产品：如果参考图中只有 1 个产品，海报中只能出现 1 个产品主体，禁止额外添加音箱、摄像头、屏幕、闹钟或任何其他智能家居产品；如果参考图中有多个产品，才可以完整呈现对应数量的多个产品。请严格参考上传的产品白底图：保持产品造型、大小比例和数量逻辑，调整产品透视和环境光，使其自然融入新场景。该参考图用于控制产品之间的比例；如果有多个产品，会在白底图上放置多个。产品之间互不遮挡，上下前后高低错落，像电商商品陈列一样精致合理。除了墨镜产品之外，其他产品都要落地。所有产品外观严格参考产品白底图，不要凭空生成参考图之外的新产品。

标题位于画面左侧。主标题文字为「${fields.mainTitle || ""}」，几个大字，字体为「手写」风格，艺术字设计，左侧大标题要醒目、清晰、留有呼吸感。副标题文字为「${fields.subTitle || ""}」，位于主标题下方，带有简约飘带或托底结构，与主标题组合和谐。标题颜色为「${fields.titleColor || ""}」，文字颜色需要简洁突出、清晰可读，如果背景深色则使用浅色标题，如果背景浅色则使用深色标题。干净粗壮紧凑的手写字效果，笔触边缘清爽，不产生脏污笔刷、灰色雾边或背景残影，文字没有任何投影在背景上。标题背后必须保持干净通透，不允许灰色阴影、脏污笔刷、杂乱飞溅、噪点纹理或多余托底；标题不许有任何形式的阴影或投影投在背景上，仅靠标题颜色与背景形成区分。

环境为简约的「${fields.environmentScene || ""}」，细节精致但完全不抢主体，背景为简单渐变色，保证标题突出。整体青春活泼。空中漂浮着粉色的简约小「${fields.floatingElement || ""}」，颜色和谐，体现空间感和镜头感，有一定视觉冲击力。

画面中加入一个小度机器人吉祥物，严格参考内置机器人参考图。机器人位于产品堆品台右侧，完整高度不得大于画面高度的三分之一。保持机器人角色完全不变，不要改造它的身体比例、脸部屏幕、眼睛形态、材质和轮廓；注意它无手、无脚、无腿，没有手指，呈现悬浮状态。该角色可以身着符合环境特色的轻量服饰，但服饰不能改变机器人本体结构，整体生动俏皮，不要抢占产品主体。底部离开展台一点点，呈现轻微悬浮，底部有淡淡蓝色尾焰。`;
}

function buildPrompt(fields) {
  return fields.layout === "landscape" ? buildLandscapePrompt(fields) : buildPortraitPrompt(fields);
}

function updatePrompt() {
  const fields = getFields();
  promptPreview.value = buildPrompt(fields);
  resultFrame?.classList.toggle("is-landscape", fields.layout === "landscape");
  resultFrame?.style.setProperty("--preview-ratio", ratioPreviews[fields.layout]?.[fields.aspectRatio] || "3 / 4");
}

function syncRatioOptions(layout) {
  const current = aspectRatioInput.value;
  const options = ratioOptions[layout] || ratioOptions.portrait;
  const nextValue = options.includes(current) ? current : defaultRatios[layout];
  aspectRatioInput.innerHTML = options.map((ratio) => `<option value="${ratio}">${ratio}</option>`).join("");
  aspectRatioInput.value = nextValue;
}

function sizeForRatio(ratio) {
  return ratioSizes[ratio] || ratioSizes[defaultRatios.portrait];
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function normalizeErrorMessage(text) {
  const messageText = String(text || "").trim();
  const lower = messageText.toLowerCase();
  const shouldHideTechnicalError =
    lower.includes("excessive system load") ||
    lower.includes("system load") ||
    lower.includes("overloaded") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("service unavailable") ||
    lower.includes("rate limit") ||
    lower.includes("failed to fetch");

  return shouldHideTechnicalError ? "当前生图服务繁忙，请稍后重试。" : messageText || "生成失败，请稍后重试。";
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const restSeconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${restSeconds}`;
}

function startCountdown(seconds = 60) {
  const startedAt = Date.now();
  clearCountdown();
  setMessage(formatDuration(seconds));
  countdownTimer = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const remaining = seconds - elapsed;
    if (remaining > 0) {
      setMessage(formatDuration(remaining));
      return;
    }
    setMessage(`仍在生成，可能需要更长时间，请继续等待，已等待 ${formatDuration(elapsed)}`);
  }, 1000);
}

function clearCountdown() {
  if (!countdownTimer) return;
  window.clearInterval(countdownTimer);
  countdownTimer = null;
}

function restoreButton() {
  const button = form.querySelector(".primary-button");
  button.disabled = false;
  buttonText.textContent = "生成 KV";
}

function showResult(result) {
  resultImage.src = result.image;
  modalImage.src = result.image;
  previewButton.hidden = false;
  emptyState.style.display = "none";
  downloadLink.href = result.downloadUrl;
  downloadLink.hidden = false;
  promptPreview.value = result.prompt;
  setMessage("KV 生成完成。", "success");
}

function openImageModal() {
  if (!resultImage.src) return;
  imageModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeImageModal() {
  imageModal.hidden = true;
  document.body.classList.remove("modal-open");
}

previewButton.addEventListener("click", openImageModal);
modalClose.addEventListener("click", closeImageModal);
imageModal.addEventListener("click", (event) => {
  if (event.target === imageModal) closeImageModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageModal.hidden) closeImageModal();
});

function stopStatusPolling() {
  if (statusTimer) {
    window.clearInterval(statusTimer);
    statusTimer = null;
  }
  activeJobId = "";
  localStorage.removeItem(activeJobKey);
}

function rememberActiveJob(jobId) {
  activeJobId = jobId;
  localStorage.setItem(activeJobKey, jobId);
}

async function checkJobStatus(jobId) {
  const response = await fetch(`/api/generate/${encodeURIComponent(jobId)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "生成失败，请稍后重试。");
  if (result.status === "completed") {
    stopStatusPolling();
    clearCountdown();
    showResult(result.result);
    restoreButton();
    return true;
  }
  if (result.status === "error") {
    stopStatusPolling();
    clearCountdown();
    setMessage(normalizeErrorMessage(result.error), "error");
    restoreButton();
    return true;
  }
  return false;
}

function startStatusPolling(jobId) {
  rememberActiveJob(jobId);
  if (statusTimer) window.clearInterval(statusTimer);
  statusTimer = window.setInterval(async () => {
    try {
      await checkJobStatus(jobId);
    } catch (error) {
      stopStatusPolling();
      clearCountdown();
      setMessage(normalizeErrorMessage(error.message), "error");
      restoreButton();
    }
  }, 2500);
}

function resumeActiveJob() {
  const jobId = localStorage.getItem(activeJobKey);
  if (!jobId) return;
  const button = form.querySelector(".primary-button");
  button.disabled = true;
  buttonText.textContent = "生成中...";
  startCountdown();
  startStatusPolling(jobId);
  checkJobStatus(jobId).catch((error) => {
    stopStatusPolling();
    clearCountdown();
    setMessage(normalizeErrorMessage(error.message), "error");
    restoreButton();
  });
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
  const result = await response.json();
  if (result.locked && !result.authorized) showLock();
  else hideLock();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

async function previewFile(input, img) {
  const file = input.files?.[0];
  if (!file) return;
  const dataUrl = await readFileAsDataUrl(file);
  img.src = dataUrl;
  input.closest(".drop-zone").classList.add("has-image");
}

form.addEventListener("input", updatePrompt);

document.addEventListener("click", (event) => {
  const layoutButton = event.target.closest("[data-layout-option]");
  if (layoutButton) {
    layoutInput.value = layoutButton.dataset.layoutOption;
    document.querySelectorAll("[data-layout-option]").forEach((option) => {
      option.classList.toggle("is-active", option === layoutButton);
    });
    syncRatioOptions(layoutInput.value);
    updatePrompt();
  }
});

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  unlockMessage.textContent = "正在验证...";
  const password = document.querySelector("#accessPassword").value;
  const response = await fetch("/api/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const result = await response.json();
  if (!response.ok) {
    unlockMessage.textContent = result.error || "验证失败。";
    unlockMessage.className = "message error";
    return;
  }
  unlockMessage.className = "message success";
  unlockMessage.textContent = "已解锁。";
  hideLock();
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = presets[button.dataset.preset];
    if (!preset) return;
    Object.entries(preset).forEach(([name, value]) => {
      if (name === "label") return;
      const input = form.elements[name];
      if (input) input.value = value;
    });
    updatePrompt();
    setMessage(`已填入${preset.label}示例，可以继续微调。`, "success");
  });
});

productInput.addEventListener("change", () => previewFile(productInput, productPreview));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  updatePrompt();

  const productFile = productInput.files?.[0];

  const data = new FormData(form);
  const button = form.querySelector(".primary-button");
  button.disabled = true;
  buttonText.textContent = "生成中...";
  startCountdown();
  stopStatusPolling();

  try {
    const payload = {
      apiKey: data.get("apiKey"),
      apiBaseUrl: data.get("apiBaseUrl"),
      model: data.get("model"),
      size: sizeForRatio(data.get("aspectRatio")),
      quality: data.get("quality"),
      outputFormat: data.get("outputFormat"),
      layout: data.get("layout"),
      aspectRatio: data.get("aspectRatio"),
      fields: getFields(),
      productImage: productFile ? await readFileAsDataUrl(productFile) : ""
    };

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "生成失败。");

    if (!result.jobId) throw new Error("生成任务创建失败，请稍后重试。");
    startStatusPolling(result.jobId);
    await checkJobStatus(result.jobId);
  } catch (error) {
    stopStatusPolling();
    clearCountdown();
    setMessage(normalizeErrorMessage(error.message), "error");
    restoreButton();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activeJobId) {
    checkJobStatus(activeJobId).catch((error) => {
      stopStatusPolling();
      clearCountdown();
      setMessage(normalizeErrorMessage(error.message), "error");
      restoreButton();
    });
  }
});

syncRatioOptions(layoutInput.value);
updatePrompt();
checkAuth();
resumeActiveJob();
