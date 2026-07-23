const directPresets = [
  {
    id: "tmall-1200x1600",
    name: "天猫",
    width: 1200,
    height: 1600,
    route: "direct",
    model: "GPT-image-2"
  },
  {
    id: "jd-1125x1380",
    name: "京东",
    width: 1125,
    height: 1380,
    route: "direct",
    model: "GPT-image-2"
  }
];

const widePresets = [
  {
    id: "pc-1920x540",
    name: "京东/天猫 PC",
    width: 1920,
    height: 540,
    route: "wide",
    model: "GPT-image-2",
    special: "pc"
  },
  {
    id: "mall-750x410",
    name: "商城",
    width: 750,
    height: 410,
    route: "wide",
    model: "GPT-image-2",
    safeArea: { width: 652, height: 322 }
  },
  {
    id: "mall-1920x809",
    name: "商城PC",
    width: 1920,
    height: 809,
    route: "wide",
    model: "GPT-image-2",
    safeArea: { width: 1208, height: 687 }
  },
  {
    id: "private-750x328",
    name: "私域",
    width: 750,
    height: 328,
    route: "wide",
    model: "GPT-image-2"
  },
  {
    id: "intranet-513x318",
    name: "内网",
    width: 513,
    height: 318,
    route: "wide",
    model: "GPT-image-2"
  }
];

const auditRuleSets = [
  {
    id: "cpc800",
    name: "800图/CPC",
    hint: "更重视版式间距、对齐、圆角和边距统一性",
    rules: [
      {
        id: "quality",
        name: "画质与整体清洁",
        weight: 20,
        text: "产品是否清晰，画质是否清晰，整体乱不乱，整体画面风格和颜色是否和谐，整体是否简约干净，是否有脏或者明显 bug。"
      },
      {
        id: "spacing",
        name: "间距/对齐/边距",
        weight: 40,
        text: "非常重要。仔细检查每一个间距和行间距：对齐、边距、居中、圆角和嵌套圆角是否统一合理；边框上下左右边距是否统一合理。出问题用红色标注。"
      },
      {
        id: "hierarchy",
        name: "信息层级",
        weight: 25,
        text: "信息层级是否明确，有没有无法阅读的文字，主要信息表现方式是否雷同。"
      },
      {
        id: "details",
        name: "小元素",
        weight: 15,
        text: "小元素是否合理，小元素是否有不清晰或者乱的情况。"
      }
    ]
  },
  {
    id: "landing",
    name: "落地页",
    hint: "额外关注区块是否分明，适合页面型长图审核",
    rules: [
      {
        id: "quality",
        name: "画质与区块清晰",
        weight: 20,
        text: "画质是否清晰，整体乱不乱，整体画面风格和颜色是否和谐，整体是否简约干净，是否有脏或者明显 bug，区块是否分明。"
      },
      {
        id: "spacing",
        name: "间距/对齐/边距",
        weight: 40,
        text: "非常重要。仔细检查每一个间距和行间距：对齐、边距、居中、圆角和嵌套圆角是否统一合理；边框上下左右边距是否统一合理。出问题用红色标注。"
      },
      {
        id: "hierarchy",
        name: "信息层级",
        weight: 25,
        text: "信息层级是否明确，有没有无法阅读的文字，主要信息表现方式是否雷同。"
      },
      {
        id: "details",
        name: "小元素",
        weight: 15,
        text: "小元素是否合理，小元素是否有不清晰或者乱的情况。"
      }
    ]
  },
  {
    id: "campaign",
    name: "其他活动图",
    hint: "更重视主视觉、颜色通透度、画面高级感",
    rules: [
      {
        id: "mainVisual",
        name: "主视觉与内容明确",
        weight: 30,
        text: "画质是否清晰，整体乱不乱，整体画面风格是否和谐，整体是否简约干净，是否有脏或者明显 bug，标题是否明确，主要内容是否明确，主视觉是否鲜明。"
      },
      {
        id: "color",
        name: "颜色与通透度",
        weight: 20,
        text: "画面颜色是否和谐，是否顺色，画面是否通透。"
      },
      {
        id: "hierarchy",
        name: "信息层级与高级感",
        weight: 30,
        text: "信息层级是否明确，视觉元素是否简洁，是否过乱或者过于单薄，有没有无法阅读的文字，主要信息展现方式是否雷同；画面会不会土，是否高级。"
      },
      {
        id: "spacing",
        name: "间距/对齐/边距",
        weight: 20,
        text: "对齐的位置是否对齐，一致的边距是否一致，居中的位置是否居中；圆角和嵌套圆角是否统一合理，边框上下左右边距是否统一合理。出问题用红色标注。"
      }
    ]
  }
];

const pageParams = new URLSearchParams(window.location.search);

const state = {
  tool: pageParams.get("tool") === "audit" ? "audit" : "extend",
  selected: new Set(),
  fields: {},
  custom: [],
  sourceName: "",
  sourceFile: null,
  results: {},
  seedResult: null,
  taskPackage: null,
  isPackaging: false,
  audit: {
    ruleId: "cpc800",
    files: [],
    taskPackage: null,
    results: [],
    isPackaging: false,
    isDemo: false
  }
};

const workspaceEyebrow = document.querySelector("#workspaceEyebrow");
const workspaceTitle = document.querySelector("#workspaceTitle");
const workspaceDesc = document.querySelector("#workspaceDesc");
const extendWorkbench = document.querySelector("#extendWorkbench");
const auditWorkbench = document.querySelector("#auditWorkbench");
const toolCards = document.querySelectorAll(".tool-card[data-tool]");
const directSizeList = document.querySelector("#directSizeList");
const wideSizeList = document.querySelector("#wideSizeList");
const customList = document.querySelector("#customList");
const timeline = document.querySelector("#timeline");
const promptList = document.querySelector("#promptList");
const finalCount = document.querySelector("#finalCount");
const gpt2Count = document.querySelector("#gpt2Count");
const defaultCount = document.querySelector("#defaultCount");
const extendCount = document.querySelector("#extendCount");
const sourceImage = document.querySelector("#sourceImage");
const sourcePreview = document.querySelector("#sourcePreview");
const resultGallery = document.querySelector("#resultGallery");
const sourceStatus = document.querySelector("#sourceStatus");
const uploadBox = document.querySelector(".upload-box");
const selectRecommended = document.querySelector("#selectRecommended");
const startProduction = document.querySelector("#startProduction");
const downloadResults = document.querySelector("#downloadResults");
const auditImageInput = document.querySelector("#auditImageInput");
const auditSourceStatus = document.querySelector("#auditSourceStatus");
const auditQueue = document.querySelector("#auditQueue");
const auditRuleList = document.querySelector("#auditRuleList");
const auditCount = document.querySelector("#auditCount");
const auditSplitMode = document.querySelector("#auditSplitMode");
const startAudit = document.querySelector("#startAudit");
const downloadAudit = document.querySelector("#downloadAudit");
const auditResultList = document.querySelector("#auditResultList");
const dailyLimitDialog = document.querySelector("#dailyLimitDialog");
const closeDailyLimitDialog = document.querySelector("#closeDailyLimitDialog");
let resultRefreshTimer = null;

function sizeLabel(item) {
  return `${item.width}x${item.height}`;
}

function modelClass(model) {
  return String(model || "").includes("GPT-image-2") ? "gpt2" : "";
}

function allPresets() {
  return [...directPresets, ...widePresets, ...state.custom];
}

function routeForCustom(width, height) {
  if (!width || !height) return "direct";
  return width / height > 2 ? "wide" : "direct";
}

function normalizeCustom(item) {
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  const route = routeForCustom(width, height);
  return {
    ...item,
    name: item.name?.trim() || "自定义尺寸",
    width,
    height,
    route,
    model: "GPT-image-2",
    custom: true
  };
}

function ensureField(id) {
  if (!state.fields[id]) {
    state.fields[id] = { title: "", subtitle: "", tweak: "" };
  }
  return state.fields[id];
}

function resetExecutionState() {
  state.results = {};
  state.seedResult = null;
  state.taskPackage = null;
  state.isPackaging = false;
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeTextarea(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setToolMode(tool, updateUrl = true) {
  state.tool = tool === "audit" ? "audit" : "extend";
  const isAudit = state.tool === "audit";
  extendWorkbench.classList.toggle("is-hidden", isAudit);
  auditWorkbench.classList.toggle("is-hidden", !isAudit);
  workspaceEyebrow.textContent = isAudit ? "Local Review Lab" : "Local Flow Lab";
  workspaceTitle.textContent = isAudit ? "GTM物料批量审核工具" : "GTM全渠道一键延展工具";
  workspaceDesc.textContent = isAudit
    ? "拖入单张长图或多张物料图，按规则生成 Codex 本地审核任务并回写评分表与问题标注。"
    : "上传 KV，勾选需要产出的尺寸后开始生成。";
  toolCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.tool === state.tool);
  });
  if (updateUrl) {
    const params = new URLSearchParams(window.location.search);
    params.set("tool", state.tool);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }
}

function selectedAuditRuleSet() {
  return auditRuleSets.find((item) => item.id === state.audit.ruleId) || auditRuleSets[0];
}

function resetAuditExecutionState() {
  state.audit.taskPackage = null;
  state.audit.results = [];
  state.audit.isPackaging = false;
}

function auditFileCountLabel() {
  const count = state.audit.files.length;
  if (!count) return "待审 0 张";
  if (count === 1 && auditSplitMode?.checked) return "待拆分 1 批";
  return `待审 ${count} 张`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function renderAuditRuleList() {
  auditRuleList.innerHTML = "";
  for (const ruleSet of auditRuleSets) {
    const selected = state.audit.ruleId === ruleSet.id;
    const button = document.createElement("button");
    button.className = `audit-rule-card ${selected ? "is-selected" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span>
        <strong>${ruleSet.name}</strong>
        <small>${ruleSet.hint}</small>
      </span>
      <span class="audit-weight-line">${ruleSet.rules.map((rule) => `${rule.name} ${rule.weight}%`).join(" / ")}</span>
    `;
    button.addEventListener("click", () => {
      state.audit.ruleId = ruleSet.id;
      resetAuditExecutionState();
      renderAuditAll();
    });
    auditRuleList.append(button);
  }
}

function renderAuditQueue() {
  auditQueue.innerHTML = "";
  auditSourceStatus.textContent = state.audit.files.length ? "已上传" : "未上传";
  auditSourceStatus.classList.toggle("ok", state.audit.files.length > 0);
  if (!state.audit.files.length) {
    auditQueue.innerHTML = `
      <div class="audit-queue-empty">
        <strong>等待素材</strong>
        <span>上传后这里会显示文件顺序；审核结果会按该顺序或拆分后的视觉顺序回写。</span>
      </div>
    `;
    return;
  }

  state.audit.files.forEach((file, index) => {
    const item = document.createElement("article");
    item.className = "audit-queue-item";
    item.innerHTML = `
      <span class="audit-index">${String(index + 1).padStart(2, "0")}</span>
      <img src="${escapeAttr(file.url)}" alt="${escapeAttr(file.name)}" />
      <span>
        <strong>${file.name}</strong>
        <small>${Math.max(1, Math.round(file.file.size / 1024))} KB</small>
      </span>
    `;
    auditQueue.append(item);
  });
}

function auditDisplayItems() {
  if (state.audit.results.length) return state.audit.results;
  return state.audit.files.map((file, index) => ({
    id: file.id,
    index: index + 1,
    name: file.name,
    previewUrl: file.url,
    sourceName: file.name,
    status: state.audit.taskPackage ? "queued" : "pending",
    totalScore: null,
    scores: [],
    annotations: []
  }));
}

function scoreRowsForResult(result) {
  const ruleSet = selectedAuditRuleSet();
  if (result.scores?.length) return result.scores;
  return ruleSet.rules.map((rule) => ({
    ruleId: rule.id,
    name: rule.name,
    weight: rule.weight,
    score: "--",
    issue: result.status === "queued" ? "等待 Codex 回写" : "待审核"
  }));
}

function annotationMarkup(result) {
  if (!result.annotations?.length) return "";
  return result.annotations.map((mark, index) => `
    <span class="audit-mark" style="left:${mark.x}%;top:${mark.y}%;width:${mark.w}%;height:${mark.h}%;">
      <small>${escapeAttr(mark.label || `问题 ${index + 1}`)}</small>
    </span>
  `).join("");
}

function renderAuditResultList() {
  auditResultList.innerHTML = "";
  updateAuditActions();
  if (!state.audit.files.length) {
    auditResultList.innerHTML = `
      <div class="result-empty">
        <strong>等待上传物料</strong>
        <span>上传单张大图或多张图后，右侧会按顺序显示审核卡片。</span>
      </div>
    `;
    return;
  }

  if (state.audit.taskPackage && !state.audit.results.length) {
    const taskCard = document.createElement("section");
    taskCard.className = "task-package-card";
    taskCard.innerHTML = `
      <span>
        <strong>审核任务包已生成</strong>
        <small>${state.audit.files.length} 个输入等待 Codex 按分布拆分并审核</small>
      </span>
      <span class="task-package-id">${escapeAttr(state.audit.taskPackage.taskId)}</span>
    `;
    auditResultList.append(taskCard);
  }

  for (const result of auditDisplayItems()) {
    const statusText = result.status === "reviewed"
      ? (state.audit.isDemo ? "本地演示回写" : "已审核")
      : result.status === "queued"
        ? "等待 Codex 审核"
        : "待审核";
    const totalText = result.totalScore == null ? "--" : `${result.totalScore}`;
    const card = document.createElement("article");
    card.className = `audit-result-card ${result.status === "reviewed" ? "is-reviewed" : ""} ${result.status === "queued" ? "is-queued" : ""}`;
    card.innerHTML = `
      <header>
        <span>
          <strong>物料 ${String(result.index).padStart(2, "0")} · ${escapeTextarea(result.name)}</strong>
          <small>${escapeTextarea(result.sourceName || result.name)}</small>
        </span>
        <span class="result-status">${statusText}</span>
      </header>
      <div class="audit-result-body">
        <div class="audit-markup-frame">
          <img src="${escapeAttr(result.previewUrl)}" alt="${escapeAttr(result.name)}" />
          ${annotationMarkup(result)}
        </div>
        <div class="audit-score-panel">
          <div class="audit-total">
            <span>总分</span>
            <strong>${totalText}</strong>
          </div>
          <table class="audit-score-table">
            <thead>
              <tr>
                <th>规则</th>
                <th>占比</th>
                <th>得分</th>
                <th>问题</th>
              </tr>
            </thead>
            <tbody>
              ${scoreRowsForResult(result).map((row) => `
                <tr>
                  <td>${escapeTextarea(row.name)}</td>
                  <td>${row.weight}%</td>
                  <td>${row.score}</td>
                  <td>${escapeTextarea(row.issue || "无明显问题")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    auditResultList.append(card);
  }
}

function updateAuditActions() {
  const hasFiles = state.audit.files.length > 0;
  if (auditCount) auditCount.textContent = auditFileCountLabel();
  if (startAudit) {
    startAudit.disabled = !hasFiles || state.audit.isPackaging;
    startAudit.textContent = state.audit.isPackaging ? "生成任务中" : "开始审核";
  }
  if (downloadAudit) {
    const hasReport = state.audit.results.length > 0;
    downloadAudit.disabled = !state.audit.taskPackage && !hasReport;
    downloadAudit.textContent = hasReport ? "下载报告" : state.audit.taskPackage ? "下载任务包" : "下载报告";
  }
}

function renderAuditAll() {
  renderAuditRuleList();
  renderAuditQueue();
  renderAuditResultList();
}

function inlineFillMarkup(item, compact = false) {
  const values = ensureField(item.id);
  return `
    <div class="inline-fill ${compact ? "compact" : ""}">
      <div class="inline-grid">
        <label>
          主标题
          <input data-key="title" value="${escapeAttr(values.title)}" placeholder="不填则不修改" />
        </label>
        <label>
          副标题
          <input data-key="subtitle" value="${escapeAttr(values.subtitle)}" placeholder="不填则不修改" />
        </label>
        <label>
          其他微调
          <textarea data-key="tweak" placeholder="不填则不增加微调">${escapeTextarea(values.tweak)}</textarea>
        </label>
      </div>
    </div>
  `;
}

function attachInlineFieldListeners(scope, id) {
  scope.querySelectorAll(".inline-fill input, .inline-fill textarea").forEach((input) => {
    input.addEventListener("input", () => {
      ensureField(id)[input.dataset.key] = input.value;
      resetExecutionState();
      renderOutput();
    });
  });
}

function optionCardMarkup(item, selected) {
  const safeChip = item.safeArea
    ? `<span class="model-chip safe-chip">安全区 ${item.safeArea.width}x${item.safeArea.height}</span>`
    : "";
  return `
    <label class="size-check">
      <input type="checkbox" value="${item.id}" ${selected ? "checked" : ""} />
      <span class="size-main">
        <span class="size-name">${item.name}</span>
        <span class="size-meta">${sizeLabel(item)}</span>
        ${safeChip}
      </span>
    </label>
    ${selected ? inlineFillMarkup(item) : ""}
  `;
}

function renderPresetList(target, list) {
  target.innerHTML = "";
  for (const item of list) {
    const selected = state.selected.has(item.id);
    const card = document.createElement("article");
    card.className = `size-option ${selected ? "is-selected" : ""}`;
    card.innerHTML = optionCardMarkup(item, selected);
    card.querySelector(".size-check input").addEventListener("change", (event) => {
      if (event.target.checked) {
        state.selected.add(item.id);
        ensureField(item.id);
      } else {
        state.selected.delete(item.id);
      }
      resetExecutionState();
      renderAll();
    });
    attachInlineFieldListeners(card, item.id);
    target.append(card);
  }
}

function updateCustomCardSummary(card, item) {
  const normalized = normalizeCustom(item);
  const meta = card.querySelector(".size-meta");
  const chip = card.querySelector(".model-chip");
  const name = card.querySelector(".size-name");
  if (name) name.textContent = normalized.name;
  if (meta) meta.textContent = normalized.width && normalized.height ? sizeLabel(normalized) : "填写宽高后生效";
  if (chip) {
    chip.textContent = normalized.route === "wide" ? "需第二步横版种子" : "";
    chip.classList.toggle("gpt2", normalized.route === "wide");
    chip.hidden = normalized.route !== "wide";
  }
}

function hasCustomContent(item) {
  return Boolean(
    String(item.name || "").trim() ||
    String(item.width || "").trim() ||
    String(item.height || "").trim()
  );
}

function dropCustomItem(index) {
  const item = state.custom[index];
  if (!item) return;
  state.selected.delete(item.id);
  delete state.fields[item.id];
  delete state.results[item.id];
  state.custom.splice(index, 1);
}

function pruneEmptyCollapsedCustomItems() {
  for (let index = state.custom.length - 1; index >= 0; index -= 1) {
    const item = state.custom[index];
    if (!state.selected.has(item.id) && !hasCustomContent(item)) {
      dropCustomItem(index);
    }
  }
}

function renderCustomList() {
  pruneEmptyCollapsedCustomItems();
  customList.innerHTML = "";
  state.custom.forEach((item, index) => {
    const normalized = normalizeCustom(item);
    const selected = state.selected.has(item.id);
    const card = document.createElement("article");
    card.className = `size-option custom-option ${selected ? "is-selected" : ""}`;
    card.innerHTML = `
      <label class="size-check">
        <input type="checkbox" value="${item.id}" ${selected ? "checked" : ""} />
        <span class="size-main">
          <span class="size-name">${normalized.name}</span>
          <span class="size-meta">${normalized.width && normalized.height ? sizeLabel(normalized) : "填写宽高后生效"}</span>
          <span class="model-chip ${normalized.route === "wide" ? "gpt2" : ""}" ${normalized.route === "wide" ? "" : "hidden"}>
            ${normalized.route === "wide" ? "需第二步横版种子" : ""}
          </span>
        </span>
      </label>
      ${
        selected
          ? `<div class="custom-dimensions">
              <label>
                名称
                <input data-field="name" value="${escapeAttr(item.name || "")}" placeholder="例：小红书横版" />
              </label>
              <label>
                宽
                <input data-field="width" type="number" min="1" value="${item.width || ""}" placeholder="1920" />
              </label>
              <label>
                高
                <input data-field="height" type="number" min="1" value="${item.height || ""}" placeholder="540" />
              </label>
              <button class="icon-button" type="button" aria-label="删除自定义尺寸">×</button>
            </div>`
          : ""
      }
      ${selected ? inlineFillMarkup(normalized, true) : ""}
    `;
    card.querySelector(".size-check input").addEventListener("change", (event) => {
      if (event.target.checked) {
        state.selected.add(item.id);
        ensureField(item.id);
      } else if (!hasCustomContent(item)) {
        dropCustomItem(index);
      } else {
        state.selected.delete(item.id);
      }
      resetExecutionState();
      renderAll();
    });
    card.querySelectorAll(".custom-dimensions input").forEach((input) => {
      input.addEventListener("input", () => {
        state.custom[index][input.dataset.field] = input.value;
        state.selected.add(item.id);
        ensureField(item.id);
        resetExecutionState();
        updateCustomCardSummary(card, item);
        renderOutput();
      });
      input.addEventListener("blur", renderAll);
    });
    card.querySelector(".icon-button")?.addEventListener("click", () => {
      dropCustomItem(index);
      resetExecutionState();
      renderAll();
    });
    attachInlineFieldListeners(card, item.id);
    customList.append(card);
  });

  const addCard = document.createElement("button");
  addCard.className = "size-option add-size-card";
  addCard.type = "button";
  addCard.innerHTML = `
    <span class="size-check add-size-content">
      <span class="add-size-icon" aria-hidden="true">+</span>
      <span class="size-main">
        <span class="size-name">增加自定义尺寸</span>
        <span class="size-meta">填写自定义宽高</span>
      </span>
    </span>
  `;
  addCard.addEventListener("click", () => {
    const draft = state.custom.find((item) => !hasCustomContent(item));
    if (draft) {
      state.selected.add(draft.id);
      ensureField(draft.id);
      resetExecutionState();
      renderAll();
      return;
    }
    const item = {
      id: `custom-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      name: "",
      width: "",
      height: "",
      custom: true
    };
    state.custom.push(item);
    state.selected.add(item.id);
    ensureField(item.id);
    resetExecutionState();
    renderAll();
  });
  customList.append(addCard);
}

function selectedItems() {
  return allPresets()
    .map((item) => (item.custom ? normalizeCustom(item) : item))
    .filter((item) => state.selected.has(item.id) && item.width && item.height);
}

function orientationClass(item) {
  const ratio = item.width / item.height;
  if (Math.abs(ratio - 1) < 0.04) return "is-square";
  if (ratio < 1) return "is-portrait";
  return ratio < 2.1 ? "is-balanced" : "is-landscape";
}

function resultEntry(item) {
  const result = state.results[item.id];
  if (!result) return null;
  if (typeof result === "string") {
    return { url: result, status: "done", filename: `${item.name}-${sizeLabel(item)}.png` };
  }
  return {
    url: result.url,
    status: result.status || (result.url ? "done" : "pending"),
    startedAt: result.startedAt,
    queuedAt: result.queuedAt,
    etaSeconds: result.etaSeconds,
    progress: result.progress,
    taskId: result.taskId,
    error: result.error,
    filename: result.filename || `${item.name}-${sizeLabel(item)}.png`
  };
}

function downloadableResults(items) {
  return items
    .map((item) => ({ item, result: resultEntry(item) }))
    .filter(({ result }) => result?.url);
}

function hasGeneratingItems(items) {
  return items.some((item) => generationState(resultEntry(item)).isGenerating);
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function generationState(result) {
  if (!result || result.status !== "generating") {
    return { isGenerating: false, label: "" };
  }
  const etaSeconds = Number(result.etaSeconds || 90);
  const startedAt = Number(result.startedAt || Date.now());
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const remaining = Math.max(0, etaSeconds - elapsed);
  const progress = Math.min(96, Math.max(8, Number(result.progress || (elapsed / etaSeconds) * 100)));
  return {
    isGenerating: true,
    label: remaining > 0 ? `生成中 ${formatCountdown(remaining)}` : "生成中",
    progress
  };
}

function syncResultRefreshTimer(items) {
  const hasGenerating = hasGeneratingItems(items);
  if (hasGenerating && !resultRefreshTimer) {
    resultRefreshTimer = window.setInterval(() => {
      renderResultGallery(selectedItems());
    }, 1000);
  }
  if (!hasGenerating && resultRefreshTimer) {
    window.clearInterval(resultRefreshTimer);
    resultRefreshTimer = null;
  }
}

function updateProductionActions(items) {
  const hasItems = items.length > 0;
  const hasSource = Boolean(state.sourceName);
  const isGenerating = hasGeneratingItems(items);
  const downloadables = downloadableResults(items);
  if (startProduction) {
    startProduction.disabled = !hasSource || !hasItems || isGenerating || state.isPackaging;
    startProduction.textContent = state.isPackaging ? "生成任务中" : isGenerating ? "生成中" : "开始生成";
  }
  downloadResults.disabled = downloadables.length === 0;
  downloadResults.textContent = "下载全部";
}

function renderResultGallery(items) {
  resultGallery.innerHTML = "";
  updateProductionActions(items);
  syncResultRefreshTimer(items);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "result-empty";
    empty.innerHTML = `
      <strong>等待选择尺寸</strong>
      <span>勾选后显示对应物料位。</span>
    `;
    resultGallery.append(empty);
    return;
  }

  const displayItems = state.seedResult
    ? [{ id: "seed-2000x1000", name: "横版中间图", width: 2000, height: 1000, isSeed: true }, ...items]
    : items;

  for (const item of displayItems) {
    const result = item.isSeed ? state.seedResult : resultEntry(item);
    const hasResult = Boolean(result?.url);
    const generating = generationState(result);
    const queuedForCodex = result?.status === "queuedForCodex";
    const taskPackageFailed = result?.status === "taskPackageFailed" || result?.status === "failed";
    const card = document.createElement("article");
    card.className = `result-card ${hasResult ? "has-result" : ""} ${generating.isGenerating ? "is-generating" : ""} ${queuedForCodex ? "is-queued" : ""} ${taskPackageFailed ? "is-failed" : ""}`;
    card.innerHTML = `
      <header>
        <span>
          <strong>${item.name}</strong>
          <small>${sizeLabel(item)}${item.isSeed ? " · 中间过程" : ""}</small>
        </span>
        <span class="result-status">${hasResult ? "已出图" : queuedForCodex ? "等待执行" : taskPackageFailed ? "生成失败" : generating.isGenerating ? generating.label : "待生成"}</span>
      </header>
      <div class="result-frame">
        <div class="result-canvas ${orientationClass(item)}" style="--ratio-w: ${item.width}; --ratio-h: ${item.height};">
          ${
            hasResult
              ? `<img src="${escapeAttr(result.url)}" alt="${escapeAttr(`${item.name} ${sizeLabel(item)}`)}" />`
              : `<span class="result-placeholder ${generating.isGenerating ? "is-loading" : ""}">
                  ${generating.isGenerating ? `<i class="loading-dot" aria-hidden="true"></i>` : ""}
                  <b>${queuedForCodex ? "任务已生成" : taskPackageFailed ? "生成失败" : sizeLabel(item)}</b>
                  <span>${queuedForCodex ? "等待本地执行器回写" : taskPackageFailed ? escapeTextarea(result?.error || "请重试") : generating.isGenerating ? item.isSeed ? "正在生成横版中间图" : "正在调用图片 API" : state.sourceName ? "点击开始生成" : "待上传 KV"}</span>
                </span>`
          }
        </div>
      </div>
      ${
        generating.isGenerating
          ? `<div class="result-progress" aria-hidden="true"><span style="width: ${generating.progress}%"></span></div>`
          : ""
      }
    `;
    resultGallery.append(card);
  }
}

function fieldClauses(item) {
  const values = ensureField(item.id);
  const clauses = [];
  if (values.title.trim()) {
    clauses.push(`主标题文字风格不变，文字变为：${values.title.trim()}`);
  }
  if (values.subtitle.trim()) {
    clauses.push(`副标题文字风格不变，文字变为：${values.subtitle.trim()}`);
  }
  if (values.tweak.trim()) {
    clauses.push(`其他微调：${values.tweak.trim()}`);
  }
  return clauses.length ? `，${clauses.join("；")}` : "";
}

function directPrompt(item) {
  return `把图片改成 ${sizeLabel(item)} 尺寸，图片不要拉伸${fieldClauses(item)}，其他未提及的画面内容保持不变。保持画面与参考图完全一致，保持画面完全不变`;
}

function seedPrompt() {
  return "我给出的图片变成左标题的2000x1000尺寸，不改变画面内容，左侧背景自然延展，注意标题区域在左侧上下居中，位置和谐；保持画面与参考图完全一致，保持画面完全不变";
}

function widePrompt(item) {
  const values = ensureField(item.id);
  const clauses = [`我给出的图片变成${sizeLabel(item)}尺寸，注意图片不要拉伸`];
  if (values.title.trim()) {
    clauses.push(`主标题文字修改为：${values.title.trim()}(注意风格完全不变，仅文字内容变化)`);
  }
  if (values.subtitle.trim()) {
    clauses.push(`副标题文字修改为：${values.subtitle.trim()}(注意风格完全不变，仅文字内容变化)`);
  }
  if (values.tweak.trim()) {
    clauses.push(`其他微调：${values.tweak.trim()}`);
  }
  clauses.push("保持画面与参考图完全一致，保持画面完全不变");
  return clauses.join("；");
}

function fieldSnapshot(item) {
  const values = ensureField(item.id);
  return {
    title: values.title.trim(),
    subtitle: values.subtitle.trim(),
    tweak: values.tweak.trim()
  };
}

function readSourceDataUrl() {
  if (!state.sourceFile) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(state.sourceFile);
  });
}

function executorForItem(item) {
  return "gtm-gpt-image-2";
}

function outputTask(item) {
  return {
    id: item.id,
    name: item.name,
    size: { width: item.width, height: item.height },
    route: item.route,
    source: item.route === "wide" ? "seed-2000x1000" : "source-kv",
    executor: executorForItem(item),
    safeArea: item.safeArea ? { ...item.safeArea } : null,
    textFields: fieldSnapshot(item),
    prompt: item.route === "direct" ? directPrompt(item) : widePrompt(item),
    expectedFilename: `${item.name}-${sizeLabel(item)}.png`
  };
}

async function buildCodexTaskPackage(items) {
  const plan = buildPlan(items);
  const createdAt = new Date().toISOString();
  const uniqueId = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
  const taskId = `gtm-extend-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${uniqueId}`;
  const sourceDataUrl = await readSourceDataUrl();
  const steps = [];

  if (plan.direct.length) {
    steps.push({
      id: "direct-outputs",
      title: "直出尺寸",
      executor: "gtm-gpt-image-2",
      outputIds: plan.direct.map((item) => item.id)
    });
  }

  if (plan.needsSeed) {
    steps.push({
      id: "seed-2000x1000",
      title: "横版种子图",
      executor: "gtm-gpt-image-2",
      size: { width: 2000, height: 1000 },
      source: "source-kv",
      prompt: seedPrompt()
    });
    steps.push({
      id: "wide-outputs",
      title: "横版目标尺寸",
      executor: "gtm-gpt-image-2",
      source: "seed-2000x1000",
      outputIds: plan.wide.map((item) => item.id)
    });
  }

  return {
    schemaVersion: "0.1",
    mode: "codex-local-executor",
    taskId,
    createdAt,
    demoOutputs: false,
    source: {
      id: "source-kv",
      name: state.sourceName,
      mimeType: state.sourceFile?.type || "",
      sizeBytes: state.sourceFile?.size || 0,
      dataUrl: sourceDataUrl
    },
    totalOutputs: items.length,
    plan: {
      needsSeed: plan.needsSeed,
      directCount: plan.direct.length,
      wideCount: plan.wide.length
    },
    steps,
    outputs: items.map(outputTask),
    resultContract: {
      writeBackMode: "local-file-or-workbench-bridge",
      expectedStatus: ["queued", "running", "done", "failed"],
      resultFields: ["outputId", "imageUrl", "filename"]
    }
  };
}

function buildPlan(items) {
  const direct = items.filter((item) => item.route === "direct");
  const wide = items.filter((item) => item.route === "wide");
  const needsSeed = wide.length > 0;
  const gpt2 = (needsSeed ? 1 : 0) + items.length;
  const defaults = 0;
  return { direct, wide, needsSeed, gpt2, defaults };
}

function renderTimeline(plan) {
  timeline.innerHTML = "";
  const rows = [
    {
      title: "准备图 1",
      desc: state.sourceName ? `已选择 ${state.sourceName}` : "等待上传图片；也可以先只测试流程和提示词。",
      model: "输入"
    }
  ];
  if (plan.direct.length) {
    rows.push({
      title: "第一步：直出竖版/非超宽尺寸",
      desc: `生成 ${plan.direct.length} 张：${plan.direct.map((item) => `${item.name} ${sizeLabel(item)}`).join("、")}`,
      model: "GPT-image-2"
    });
  }
  if (plan.needsSeed) {
    rows.push({
      title: "第二步：生成 2000x1000 横版种子图",
      desc: "只要第三步尺寸或超宽自定义尺寸被选中，就先由图 1 生成横版底图。",
      model: "GPT-image-2"
    });
    rows.push({
      title: "第三步：从横版种子图产出目标尺寸",
      desc: `生成 ${plan.wide.length} 张：${plan.wide.map((item) => `${item.name} ${sizeLabel(item)}`).join("、")}`,
      model: "GPT-image-2"
    });
  }
  if (!plan.direct.length && !plan.wide.length) {
    rows.push({
      title: "等待选择尺寸",
      desc: "勾选任意尺寸后会生成完整执行链路。",
      model: "空"
    });
  }

  rows.forEach((row, index) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <span class="step-index">${index + 1}</span>
      <span><strong>${row.title}</strong><span>${row.desc}</span></span>
      <span class="model-chip ${modelClass(row.model)}">${row.model}</span>
    `;
    timeline.append(item);
  });
}

function renderPrompts(plan) {
  promptList.innerHTML = "";
  const prompts = [];
  for (const item of plan.direct) {
    prompts.push({
      title: `第一步 / ${item.name} ${sizeLabel(item)}`,
      model: item.model,
      body: directPrompt(item)
    });
  }
  if (plan.needsSeed) {
    prompts.push({
      title: "第二步 / 2000x1000 横版种子图",
      model: "GPT-image-2",
      body: seedPrompt()
    });
  }
  for (const item of plan.wide) {
    prompts.push({
      title: `第三步 / ${item.name} ${sizeLabel(item)}`,
      model: item.model,
      body: widePrompt(item)
    });
  }

  if (!prompts.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "暂无提示词。请选择目标尺寸。";
    promptList.append(empty);
    return;
  }

  for (const prompt of prompts) {
    const card = document.createElement("article");
    card.className = "prompt-card";
    card.innerHTML = `
      <header>
        <strong>${prompt.title}</strong>
        <span class="model-chip ${modelClass(prompt.model)}">${prompt.model}</span>
      </header>
      <pre>${escapeTextarea(prompt.body)}</pre>
    `;
    promptList.append(card);
  }
}

function renderOutput() {
  const items = selectedItems();
  const plan = buildPlan(items);
  if (finalCount) finalCount.textContent = String(items.length);
  if (gpt2Count) gpt2Count.textContent = String(plan.gpt2);
  if (defaultCount) defaultCount.textContent = String(plan.defaults);
  extendCount.textContent = `目前延展 ${items.length} 张`;
  renderTimeline(plan);
  renderPrompts(plan);
  renderResultGallery(items);
}

function renderAll() {
  renderPresetList(directSizeList, directPresets);
  renderPresetList(wideSizeList, widePresets);
  renderCustomList();
  renderOutput();
}

function showDailyLimitDialog() {
  if (!dailyLimitDialog) return;
  if (typeof dailyLimitDialog.showModal === "function") {
    if (!dailyLimitDialog.open) dailyLimitDialog.showModal();
    return;
  }
  window.alert("当日生成数量已达上限");
}

async function requestExtendedImage({ width, height, prompt, sourceDataUrl, sourceUrl, runId }) {
  const response = await fetch("/api/extend-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ width, height, prompt, sourceDataUrl, sourceUrl, runId })
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (response.status === 429) {
    showDailyLimitDialog();
    throw new Error("当日生成数量已达上限");
  }
  if (!response.ok) throw new Error(result.error || `图片 API 调用失败（${response.status}）`);
  if (!result.imageUrl) throw new Error("图片 API 没有返回结果图。");
  return result;
}

function markGenerating(items, taskId) {
  const startedAt = Date.now();
  for (const item of items) {
    state.results[item.id] = {
      status: "generating",
      startedAt,
      etaSeconds: item.route === "wide" ? 240 : 150,
      taskId
    };
  }
}

async function generateSelectedOutputs(items, taskPackage) {
  const directItems = items.filter((item) => item.route === "direct");
  const wideItems = items.filter((item) => item.route === "wide");
  const sourceDataUrl = taskPackage.source.dataUrl;
  let seedUrl = "";

  for (const item of directItems) {
    try {
      const result = await requestExtendedImage({
        width: item.width,
        height: item.height,
        prompt: directPrompt(item),
        sourceDataUrl,
        runId: taskPackage.taskId
      });
      state.results[item.id] = {
        status: "done",
        url: result.imageUrl,
        filename: result.filename || `${item.name}-${sizeLabel(item)}.png`,
        taskId: taskPackage.taskId
      };
    } catch (error) {
      state.results[item.id] = { status: "failed", error: error.message, taskId: taskPackage.taskId };
    }
    renderOutput();
  }

  if (wideItems.length) {
    state.seedResult = {
      status: "generating",
      startedAt: Date.now(),
      etaSeconds: 180,
      taskId: taskPackage.taskId
    };
    renderOutput();
    try {
      const seed = await requestExtendedImage({
        width: 2000,
        height: 1000,
        prompt: seedPrompt(),
        sourceDataUrl,
        runId: taskPackage.taskId
      });
      seedUrl = seed.imageUrl;
      state.seedResult = {
        status: "done",
        url: seed.imageUrl,
        filename: seed.filename || "横版中间图-2000x1000.png",
        taskId: taskPackage.taskId
      };
      renderOutput();
    } catch (error) {
      state.seedResult = {
        status: "failed",
        error: error.message,
        taskId: taskPackage.taskId
      };
      for (const item of wideItems) {
        state.results[item.id] = {
          status: "failed",
          error: `横版种子图生成失败：${error.message}`,
          taskId: taskPackage.taskId
        };
      }
      renderOutput();
      return;
    }
  }

  for (const item of wideItems) {
    try {
      const result = await requestExtendedImage({
        width: item.width,
        height: item.height,
        prompt: widePrompt(item),
        sourceUrl: seedUrl,
        runId: taskPackage.taskId
      });
      state.results[item.id] = {
        status: "done",
        url: result.imageUrl,
        filename: result.filename || `${item.name}-${sizeLabel(item)}.png`,
        taskId: taskPackage.taskId
      };
    } catch (error) {
      state.results[item.id] = { status: "failed", error: error.message, taskId: taskPackage.taskId };
    }
    renderOutput();
  }
}

function createAuditFileRecord(file, index) {
  return {
    id: `audit-file-${Date.now()}-${index}-${Math.round(Math.random() * 1000)}`,
    name: file.name,
    file,
    url: URL.createObjectURL(file)
  };
}

function createDemoAuditFile() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
      <rect width="1200" height="760" fill="#f3f4f6"/>
      <g transform="translate(44 42)">
        <rect width="330" height="300" rx="24" fill="#fff" stroke="#d1d5db" stroke-width="4"/>
        <rect x="28" y="30" width="274" height="118" rx="18" fill="#111827"/>
        <rect x="30" y="178" width="210" height="22" rx="11" fill="#111827"/>
        <rect x="30" y="220" width="142" height="16" rx="8" fill="#9ca3af"/>
        <rect x="225" y="214" width="52" height="52" rx="10" fill="#e5e7eb"/>
      </g>
      <g transform="translate(434 42)">
        <rect width="330" height="300" rx="24" fill="#fff" stroke="#d1d5db" stroke-width="4"/>
        <rect x="30" y="34" width="120" height="120" rx="18" fill="#111827"/>
        <rect x="182" y="45" width="112" height="20" rx="10" fill="#111827"/>
        <rect x="182" y="84" width="78" height="14" rx="7" fill="#9ca3af"/>
        <rect x="62" y="204" width="220" height="42" rx="21" fill="#111827"/>
      </g>
      <g transform="translate(824 42)">
        <rect width="330" height="300" rx="24" fill="#fff" stroke="#d1d5db" stroke-width="4"/>
        <rect x="28" y="26" width="274" height="64" rx="14" fill="#111827"/>
        <rect x="50" y="126" width="230" height="28" rx="14" fill="#9ca3af"/>
        <rect x="44" y="194" width="96" height="72" rx="18" fill="#111827"/>
        <rect x="170" y="192" width="106" height="78" rx="18" fill="#e5e7eb"/>
      </g>
      <g transform="translate(44 404)">
        <rect width="330" height="300" rx="24" fill="#fff" stroke="#d1d5db" stroke-width="4"/>
        <rect x="32" y="40" width="266" height="40" rx="20" fill="#111827"/>
        <rect x="32" y="108" width="126" height="126" rx="24" fill="#e5e7eb"/>
        <rect x="186" y="118" width="90" height="18" rx="9" fill="#111827"/>
        <rect x="186" y="160" width="74" height="14" rx="7" fill="#9ca3af"/>
      </g>
      <g transform="translate(434 404)">
        <rect width="330" height="300" rx="24" fill="#fff" stroke="#d1d5db" stroke-width="4"/>
        <rect x="34" y="36" width="262" height="180" rx="20" fill="#111827"/>
        <rect x="54" y="244" width="222" height="20" rx="10" fill="#9ca3af"/>
      </g>
      <g transform="translate(824 404)">
        <rect width="330" height="300" rx="24" fill="#fff" stroke="#d1d5db" stroke-width="4"/>
        <rect x="42" y="34" width="246" height="54" rx="27" fill="#111827"/>
        <rect x="72" y="126" width="186" height="92" rx="18" fill="#e5e7eb"/>
        <rect x="82" y="242" width="166" height="20" rx="10" fill="#9ca3af"/>
      </g>
    </svg>
  `;
  return new File([svg], "批量审核演示长图.svg", { type: "image/svg+xml" });
}

function applyDemoAuditState() {
  const demoFile = createDemoAuditFile();
  state.audit.files = [createAuditFileRecord(demoFile, 0)];
  state.audit.ruleId = "cpc800";
  state.audit.isDemo = true;
  auditSplitMode.checked = true;
}

function auditPrompt(ruleSet) {
  return [
    `请按「${ruleSet.name}」规则审核输入图片。`,
    "如果单张图包含多张物料，请先按视觉分布自动拆分，顺序为从左到右、从上到下。",
    "请对每一张物料输出独立评分表、总分、问题说明和红色标注框。",
    "标注框坐标使用百分比 x/y/w/h，覆盖在原图或拆分图对应问题位置上。",
    "规则如下：",
    ...ruleSet.rules.map((rule, index) => `${index + 1}. ${rule.name}（${rule.weight}%）：${rule.text}`)
  ].join("\n");
}

async function buildAuditTaskPackage() {
  const ruleSet = selectedAuditRuleSet();
  const createdAt = new Date().toISOString();
  const taskId = `gtm-audit-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const files = [];

  for (const file of state.audit.files) {
    files.push({
      id: file.id,
      name: file.name,
      mimeType: file.file.type,
      sizeBytes: file.file.size,
      dataUrl: await fileToDataUrl(file.file)
    });
  }

  return {
    schemaVersion: "0.1",
    mode: "codex-local-material-audit",
    taskId,
    createdAt,
    ruleSet: {
      id: ruleSet.id,
      name: ruleSet.name,
      rules: ruleSet.rules
    },
    input: {
      files,
      splitCompositeImage: Boolean(auditSplitMode.checked),
      materialOrder: "left-to-right-top-to-bottom"
    },
    prompt: auditPrompt(ruleSet),
    resultContract: {
      itemFields: ["index", "sourceFileId", "sourceBounds", "totalScore", "scores", "annotations"],
      scoreFields: ["ruleId", "name", "weight", "score", "issue"],
      annotationFields: ["x", "y", "w", "h", "label", "severity"],
      annotationUnit: "percent"
    }
  };
}

function demoAuditResults() {
  const file = state.audit.files[0];
  if (!file) return [];
  const ruleSet = selectedAuditRuleSet();
  const samples = [
    {
      index: 1,
      name: "卡片 01",
      totalScore: 82,
      scores: [86, 76, 84, 88],
      issues: ["整体清晰，产品区表现稳定", "按钮与右侧小元素边距不一致", "主副信息层级基本清楚", "右下角小模块略拥挤"],
      annotations: [{ x: 66, y: 69, w: 16, h: 18, label: "边距不齐" }]
    },
    {
      index: 2,
      name: "卡片 02",
      totalScore: 74,
      scores: [78, 66, 82, 76],
      issues: ["产品主体清楚", "左侧主体与右侧文字未对齐", "信息层级可读", "按钮圆角与卡片圆角关系偏散"],
      annotations: [
        { x: 46, y: 14, w: 33, h: 18, label: "文字未对齐" },
        { x: 16, y: 68, w: 60, h: 13, label: "按钮位置偏低" }
      ]
    },
    {
      index: 3,
      name: "卡片 03",
      totalScore: 68,
      scores: [72, 58, 78, 70],
      issues: ["区块清楚但画面略乱", "上下间距差异明显", "主信息清楚，辅助内容略散", "双模块尺寸关系不够统一"],
      annotations: [
        { x: 10, y: 40, w: 76, h: 12, label: "间距偏大" },
        { x: 50, y: 61, w: 32, h: 25, label: "模块不统一" }
      ]
    }
  ];

  return samples.map((sample) => ({
    id: `demo-audit-${sample.index}`,
    index: sample.index,
    name: sample.name,
    sourceName: file.name,
    previewUrl: file.url,
    status: "reviewed",
    totalScore: sample.totalScore,
    annotations: sample.annotations,
    scores: ruleSet.rules.map((rule, index) => ({
      ruleId: rule.id,
      name: rule.name,
      weight: rule.weight,
      score: sample.scores[index] ?? "--",
      issue: sample.issues[index] || "无明显问题"
    }))
  }));
}

sourceImage.addEventListener("change", () => {
  const file = sourceImage.files?.[0];
  if (!file) return;
  state.sourceName = file.name;
  state.sourceFile = file;
  resetExecutionState();
  sourceStatus.textContent = "已上传";
  sourceStatus.classList.add("ok");
  const previewUrl = URL.createObjectURL(file);
  sourcePreview.src = previewUrl;
  sourcePreview.hidden = false;
  uploadBox.classList.add("has-image");
  renderOutput();
});

if (selectRecommended) {
  selectRecommended.addEventListener("click", () => {
    for (const item of [...directPresets, ...widePresets]) {
      state.selected.add(item.id);
      ensureField(item.id);
    }
    resetExecutionState();
    renderAll();
  });
}

startProduction?.addEventListener("click", async () => {
  const items = selectedItems();
  if (!state.sourceName || !items.length || hasGeneratingItems(items) || state.isPackaging) return;

  state.isPackaging = true;
  renderOutput();

  try {
    const taskPackage = await buildCodexTaskPackage(items);
    state.taskPackage = taskPackage;
    markGenerating(items, taskPackage.taskId);
    renderOutput();
    await generateSelectedOutputs(items, taskPackage);
  } catch (error) {
    console.error("Failed to build Codex task package", error);
    state.taskPackage = null;
    for (const item of items) {
      state.results[item.id] = { status: "taskPackageFailed" };
    }
  } finally {
    state.isPackaging = false;
    renderOutput();
  }
});

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

downloadResults.addEventListener("click", () => {
  const files = downloadableResults(selectedItems());
  for (const { item, result } of files) {
    const link = document.createElement("a");
    link.href = result.url;
    link.download = result.filename || `${item.name}-${sizeLabel(item)}.png`;
    document.body.append(link);
    link.click();
    link.remove();
  }
});

closeDailyLimitDialog?.addEventListener("click", () => {
  dailyLimitDialog?.close();
});

toolCards.forEach((card) => {
  card.addEventListener("click", () => {
    setToolMode(card.dataset.tool);
  });
});

auditImageInput?.addEventListener("change", () => {
  const files = Array.from(auditImageInput.files || []);
  state.audit.files = files.map(createAuditFileRecord);
  state.audit.isDemo = false;
  resetAuditExecutionState();
  renderAuditAll();
});

auditSplitMode?.addEventListener("change", () => {
  resetAuditExecutionState();
  renderAuditAll();
});

startAudit?.addEventListener("click", async () => {
  if (!state.audit.files.length || state.audit.isPackaging) return;
  state.audit.isPackaging = true;
  renderAuditAll();
  try {
    state.audit.taskPackage = await buildAuditTaskPackage();
    state.audit.results = state.audit.isDemo ? demoAuditResults() : [];
  } catch (error) {
    console.error("Failed to build audit task package", error);
    state.audit.taskPackage = null;
    state.audit.results = [];
  } finally {
    state.audit.isPackaging = false;
    renderAuditAll();
  }
});

downloadAudit?.addEventListener("click", () => {
  if (state.audit.results.length) {
    downloadJson(
      {
        task: state.audit.taskPackage,
        results: state.audit.results
      },
      `${state.audit.taskPackage?.taskId || "gtm-audit-report"}.json`
    );
    return;
  }
  if (state.audit.taskPackage) {
    downloadJson(state.audit.taskPackage, `${state.audit.taskPackage.taskId}.json`);
  }
});

if (pageParams.get("demo") === "1" && state.tool === "audit") {
  applyDemoAuditState();
}

renderAll();
renderAuditAll();
setToolMode(state.tool, false);
