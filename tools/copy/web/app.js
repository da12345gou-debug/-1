const lockScreen = document.querySelector("#lockScreen");
const unlockForm = document.querySelector("#unlockForm");
const unlockMessage = document.querySelector("#unlockMessage");
const appShell = document.querySelector(".app-shell");
const referenceInput = document.querySelector("#referenceImage");
const productInput = document.querySelector("#productImage");
const referencePreview = document.querySelector("#referencePreview");
const productPreview = document.querySelector("#productPreview");
const modeInput = document.querySelector("#modeInput");
const ratioInput = document.querySelector("#ratioInput");
const mainTitleInput = document.querySelector("#mainTitleInput");
const subTitleInput = document.querySelector("#subTitleInput");
const adjustInput = document.querySelector("#adjustInput");
const quickFillButtons = Array.from(document.querySelectorAll(".quick-fill-chip"));
const generateBtn = document.querySelector("#generateBtn");
const message = document.querySelector("#message");
const resultPreview = document.querySelector("#resultPreview");
const downloadLink = document.querySelector("#downloadLink");
const imageModal = document.querySelector("#imageModal");
const modalImage = document.querySelector("#modalImage");
const modalClose = document.querySelector("#modalClose");

const modeEstimates = { v1: 180, v2: 360 };
const emptyResultMarkup = `
  <div class="empty-state">
    <strong>等待生成</strong>
    <span>生成完成后，结果会出现在这里。</span>
  </div>
`;
const quickFillPrompts = {
  music: "现有除产品之外的次要元素换成音乐元素（如果现有元素悬浮，则识别它们的位置大小和角度再替换成音乐元素，不要改变现在的创意构图和布局。注意严格按照旧元素本身的位置替换），把它们替换为同大小的精致简约的画册和唱片，整体变暖色调。空中漂浮着银色的简约的小【音符】（颜色和谐，体现空间感和镜头感，有一定的视觉冲击力）",
  summer: "现有除产品之外的次要元素换成夏日元素（如果现有元素悬浮，则识别它们的位置大小和角度再替换成夏日元素，不要改变现在的创意构图和布局。注意严格按照旧元素本身的位置替换），把它们替换为和原图对应位置的元素同大小的精致简约的游泳圈和水果饮料，整体变蓝色调（点缀夏日配色）。如有地表则把地表调整为海滩风格（没有地表就不考虑这句话）。空中漂浮着简约的小【气泡】（颜色和谐，体现空间感和镜头感，有一定的视觉冲击力）"
};
let referenceDataUrl = "";
let productDataUrl = "";
let selectedQuickFill = "";
let countdownTimer = 0;
let remainingSeconds = modeEstimates.v1;
let pollTimer = 0;
let activeJobId = localStorage.getItem("uuKvActiveJobId") || "";
let activeEstimate = Number(localStorage.getItem("uuKvActiveEstimate") || modeEstimates.v1);
let activeDeadline = Number(localStorage.getItem("uuKvActiveDeadline") || 0);

function openImageModal(src) {
  if (!src || !imageModal || !modalImage) return;
  modalImage.src = src;
  imageModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeImageModal() {
  if (!imageModal) return;
  imageModal.hidden = true;
  document.body.classList.remove("modal-open");
}

modalClose?.addEventListener("click", closeImageModal);
imageModal?.addEventListener("click", (event) => {
  if (event.target === imageModal) closeImageModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && imageModal && !imageModal.hidden) closeImageModal();
});

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function loadingMarkup(initial = "03:00") {
  return `<div class="loading-stack"><div class="orb"></div><div class="loading-label">预计剩余</div><div id="countdownText" class="countdown">${initial}</div></div>`;
}

function updateCountdown() {
  const node = document.querySelector("#countdownText");
  if (!node) return;
  if (activeDeadline) {
    remainingSeconds = Math.max(0, Math.ceil((activeDeadline - Date.now()) / 1000));
  }
  node.textContent = remainingSeconds > 0 ? formatTime(remainingSeconds) : "响应较慢";
}

function stopCountdown() {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = 0;
  }
}

function startCountdown(seconds = activeEstimate) {
  stopCountdown();
  remainingSeconds = Math.max(0, Number(seconds) || modeEstimates.v1);
  if (!activeDeadline) activeDeadline = Date.now() + remainingSeconds * 1000;
  updateCountdown();
  countdownTimer = window.setInterval(() => {
    updateCountdown();
  }, 1000);
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }
}

function updateQuickFillState() {
  quickFillButtons.forEach((button) => {
    const isActive = button.dataset.fill === selectedQuickFill;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function getAdjustments() {
  const preset = quickFillPrompts[selectedQuickFill] || "";
  const custom = adjustInput.value.trim();
  return [preset, custom].filter(Boolean).join("\n\n用户补充要求：\n");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

function postJson(url, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        body = { error: xhr.responseText || "响应解析失败。" };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("网络请求失败。"));
    xhr.ontimeout = () => reject(new Error("请求超时，请刷新页面重试。"));
    xhr.send(JSON.stringify(payload));
  });
}

async function loadDroppedItem(item) {
  if (item.kind === "file") return item.getAsFile();
  if (item.kind !== "string" || item.type !== "text/uri-list") return null;
  return null;
}

function bindDrop(input, preview, setter) {
  const card = input.closest(".drop-card");

  async function load(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await readFileAsDataUrl(file);
    setter(dataUrl);
    preview.innerHTML = `<img src="${dataUrl}" alt="">`;
  }

  input.addEventListener("change", () => load(input.files?.[0]));

  ["dragenter", "dragover"].forEach((name) => {
    card.addEventListener(name, (event) => {
      event.preventDefault();
      card.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((name) => {
    card.addEventListener(name, (event) => {
      event.preventDefault();
      card.classList.remove("is-dragover");
    });
  });

  card.addEventListener("drop", async (event) => {
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await load(file);
      return;
    }
    const items = Array.from(event.dataTransfer.items || []);
    const droppedFile = await Promise.any(items.map(loadDroppedItem)).catch(() => null);
    if (droppedFile) await load(droppedFile);
  });
}

function showLock() {
  lockScreen.hidden = false;
  appShell.classList.add("is-locked");
}

function hideLock() {
  lockScreen.hidden = true;
  appShell.classList.remove("is-locked");
}

async function checkAuth() {
  const response = await fetch("/api/auth-status");
  const result = await response.json();
  if (result.locked && !result.authorized) showLock();
  else hideLock();
}

function rememberJob(jobId, estimate) {
  activeJobId = jobId;
  activeEstimate = estimate;
  if (!activeDeadline) activeDeadline = Date.now() + estimate * 1000;
  localStorage.setItem("uuKvActiveJobId", jobId);
  localStorage.setItem("uuKvActiveEstimate", String(estimate));
  localStorage.setItem("uuKvActiveDeadline", String(activeDeadline));
}

function clearJob() {
  activeJobId = "";
  activeDeadline = 0;
  localStorage.removeItem("uuKvActiveJobId");
  localStorage.removeItem("uuKvActiveEstimate");
  localStorage.removeItem("uuKvActiveDeadline");
}

async function pollJob(jobId) {
  try {
    const response = await fetch(`/api/job?id=${encodeURIComponent(jobId)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "任务查询失败。");

    if (result.estimatedSeconds && result.estimatedSeconds !== activeEstimate) {
      activeEstimate = result.estimatedSeconds;
      localStorage.setItem("uuKvActiveEstimate", String(activeEstimate));
    }
    if (result.createdAt && result.estimatedSeconds) {
      activeDeadline = result.createdAt + result.estimatedSeconds * 1000;
      localStorage.setItem("uuKvActiveDeadline", String(activeDeadline));
      updateCountdown();
    }

    if (result.status === "done") {
      stopPolling();
      stopCountdown();
      clearJob();
      resultPreview.innerHTML = `<button class="result-image-button" type="button" aria-label="查看大图"><img src="${result.image}" alt="生成结果"></button>`;
      resultPreview.querySelector(".result-image-button")?.addEventListener("click", () => openImageModal(result.image));
      downloadLink.href = result.downloadUrl;
      downloadLink.hidden = false;
      generateBtn.disabled = false;
      setMessage("生成完成。", "success");
      return;
    }

    if (result.status === "error") {
      stopPolling();
      stopCountdown();
      clearJob();
      generateBtn.disabled = false;
      setMessage(result.error || "生成失败。", "error");
      return;
    }

    generateBtn.disabled = true;
    setMessage(result.message || "生成中，可以切换页面，后台会继续生成。");
  } catch (error) {
    stopPolling();
    stopCountdown();
    generateBtn.disabled = false;
    setMessage(error.message, "error");
  }
}

function watchJob(jobId, estimate = activeEstimate) {
  rememberJob(jobId, estimate);
  stopPolling();
  const seconds = activeDeadline ? Math.max(0, Math.ceil((activeDeadline - Date.now()) / 1000)) : estimate;
  resultPreview.innerHTML = loadingMarkup(seconds > 0 ? formatTime(seconds) : "响应较慢");
  startCountdown(estimate);
  generateBtn.disabled = true;
  downloadLink.hidden = true;
  setMessage("生成中，可以切换页面，后台会继续生成。");
  pollJob(jobId);
  pollTimer = window.setInterval(() => pollJob(jobId), 2500);
}

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  unlockMessage.textContent = "验证中...";
  unlockMessage.className = "message";
  try {
    const password = document.querySelector("#accessPassword").value;
    const result = await postJson("/api/unlock", { password }, 12000);
    if (!result.ok) {
      unlockMessage.textContent = result.body.error || "验证失败。";
      unlockMessage.className = "message error";
      return;
    }
    unlockMessage.textContent = "";
    hideLock();
    if (activeJobId) watchJob(activeJobId, activeEstimate);
  } catch (error) {
    unlockMessage.textContent = error.message || "验证失败。";
    unlockMessage.className = "message error";
  }
});

quickFillButtons.forEach((button) => {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    const prompt = quickFillPrompts[button.dataset.fill || ""];
    if (!prompt) return;
    selectedQuickFill = selectedQuickFill === button.dataset.fill ? "" : button.dataset.fill || "";
    updateQuickFillState();
  });
});

generateBtn.addEventListener("click", async () => {
  if (!referenceDataUrl || !productDataUrl) {
    setMessage("请先上传参考 KV 图和产品组合图。", "error");
    return;
  }

  const mode = modeInput.value === "v2" ? "v2" : "v1";
  const estimate = modeEstimates[mode];
  activeDeadline = Date.now() + estimate * 1000;
  generateBtn.disabled = true;
  setMessage("正在提交任务...");
  resultPreview.innerHTML = loadingMarkup(formatTime(estimate));
  startCountdown(estimate);
  downloadLink.hidden = true;

  try {
    const result = await postJson("/api/generate", {
      mode,
      referenceImage: referenceDataUrl,
      productImage: productDataUrl,
      ratio: ratioInput.value.trim(),
      mainTitle: mainTitleInput.value.trim(),
      subTitle: subTitleInput.value.trim(),
      adjustments: getAdjustments()
    }, 45000);

    if (!result.ok) throw new Error(result.body.error || "生成失败。");
    watchJob(result.body.jobId, result.body.estimatedSeconds || estimate);
  } catch (error) {
    stopCountdown();
    generateBtn.disabled = false;
    setMessage(error.message, "error");
    resultPreview.innerHTML = emptyResultMarkup;
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activeJobId && !pollTimer) watchJob(activeJobId, activeEstimate);
});

bindDrop(referenceInput, referencePreview, (value) => {
  referenceDataUrl = value;
});
bindDrop(productInput, productPreview, (value) => {
  productDataUrl = value;
});

checkAuth().then(() => {
  if (activeJobId && lockScreen.hidden) watchJob(activeJobId, activeEstimate);
});
