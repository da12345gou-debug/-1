const form = document.querySelector("#posterForm");
const promptPreview = document.querySelector("#promptPreview");
const message = document.querySelector("#message");
const resultImage = document.querySelector("#resultImage");
const emptyState = document.querySelector("#emptyState");
const downloadLink = document.querySelector("#downloadLink");
const buttonText = document.querySelector("#buttonText");

const productInput = document.querySelector("#productImage");
const productPreview = document.querySelector("#productPreview");
const lockScreen = document.querySelector("#lockScreen");
const unlockForm = document.querySelector("#unlockForm");
const unlockMessage = document.querySelector("#unlockMessage");

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

function getFields() {
  const data = new FormData(form);
  return {
    mainTone: data.get("mainTone")?.trim(),
    titleColor: data.get("titleColor")?.trim(),
    environmentScene: data.get("environmentScene")?.trim(),
    mainTitle: data.get("mainTitle")?.trim(),
    subTitle: data.get("subTitle")?.trim(),
    floatingElement: data.get("floatingElement")?.trim()
  };
}

function buildPrompt(fields) {
  return `一张极具视觉冲击力的3D商业广告海报，比例3:4，大师级的3d渲染，材质清晰明确，整体光线柔和明亮，具有C4D和Blender渲染的顶级质感，色彩高饱和度，活泼、科技、年轻化，8k分辨率，极致细节。产品和标题突出：产品组合位于画面中心偏下，标题位于画面正中偏上。环境简洁，环境完全不抢，突出主体。产品是画面当之无愧的中心和焦点。整体冷暖和谐。画面采用「${fields.mainTone || ""}」作为主色调背景。请根据「${fields.environmentScene || ""}」自动联想并扩写合适的环境氛围，让画面情绪自然、具体、有季节感。

构图上：
产品组合位于画面中心偏下，多个不同高度的圆润阶梯展台错落排布，上面精致地展示着上传产品六面图中的全部智能家居电子产品。请自动识别产品六面图中的产品数量，并在海报中完整呈现对应数量的产品。请严格参考上传的产品六面图：保持产品造型、大小比例和数量逻辑，调整产品透视和环境光，使其自然融入新场景。该参考图用于控制产品之间的比例；如果有多个产品，会在白底图上放置多个。最高的产品位于中央，其他产品在两侧，产品之间互不遮挡，上下前后高低错落，像电商商品陈列一样精致合理。除了墨镜产品之外，其他产品都要落地。所有产品外观严格参考产品六面图。

标题位于画面正中偏上。主标题文字为「${fields.mainTitle || ""}」，几个大字，字体为「手写」风格，艺术字设计。副标题文字为「${fields.subTitle || ""}」，位于主标题下方，带有简约飘带或托底结构，与主标题组合和谐。标题颜色为「${fields.titleColor || ""}」，文字颜色需要简洁突出、清晰可读，如果背景深色则使用浅色标题，如果背景浅色则使用深色标题。

环境为简约的「${fields.environmentScene || ""}」，细节精致但完全不抢主体，背景为简单渐变色，保证标题突出。整体青春活泼。空中漂浮着粉色的简约小「${fields.floatingElement || ""}」，颜色和谐，体现空间感和镜头感，有一定视觉冲击力。

画面中加入一个小度机器人吉祥物，严格参考内置机器人参考图：机器人无手指、无腿、呈悬浮状态。该角色身着符合环境特色的服装，生动俏皮，但不要抢占产品主体。`;
}

function updatePrompt() {
  promptPreview.value = buildPrompt(getFields());
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
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
  if (!productFile) {
    setMessage("请先上传产品六面图。", "error");
    return;
  }

  const data = new FormData(form);
  const button = form.querySelector(".primary-button");
  button.disabled = true;
  buttonText.textContent = "生成中...";
  setMessage("正在提交给 OpenAI，通常需要几十秒。");

  try {
    const payload = {
      apiKey: data.get("apiKey"),
      apiBaseUrl: data.get("apiBaseUrl"),
      model: data.get("model"),
      size: data.get("size"),
      quality: data.get("quality"),
      outputFormat: data.get("outputFormat"),
      fields: getFields(),
      productImage: await readFileAsDataUrl(productFile)
    };

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "生成失败。");

    resultImage.src = result.image;
    resultImage.style.display = "block";
    emptyState.style.display = "none";
    downloadLink.href = result.downloadUrl;
    downloadLink.hidden = false;
    promptPreview.value = result.prompt;
    setMessage("KV 生成完成。", "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
    buttonText.textContent = "生成 KV";
  }
});

updatePrompt();
checkAuth();
