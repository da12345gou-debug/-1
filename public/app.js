const tools = {
  landing: {
    title: "落地页延展",
    kind: "Landing Copy",
    desc: "拖入KV和原型图就可以生成落地页。",
    copiedUrl: "/tools/landing/"
  },
  aggregate: {
    title: "产品海报一键生成",
    kind: "Poster Copy",
    desc: "生成横版或者竖版的聚合KV。",
    copiedUrl: "/tools/aggregate/"
  },
  copy: {
    title: "DEMO一键生成",
    kind: "Demo Copy",
    desc: "你可以用它替换产品和融合参考图。",
    copiedUrl: "/tools/copy/"
  },
  extend: {
    title: "GTM全渠道一键延展工具",
    kind: "Channel Extension",
    desc: "天猫、京东、小度商城、私域 及自定义尺寸",
    copiedUrl: "/tools/extend/"
  }
};

const loginView = document.querySelector("#loginView");
const workbenchView = document.querySelector("#workbenchView");
const unlockMessage = document.querySelector("#unlockMessage");
const accessPassword = document.querySelector("#accessPassword");
const cards = Array.from(document.querySelectorAll(".tool-card"));
const frame = document.querySelector("#toolFrame");
const activeKind = document.querySelector("#activeKind");
const activeTitle = document.querySelector("#activeTitle");
const activeDesc = document.querySelector("#activeDesc");
const activeStatus = document.querySelector("#activeStatus");
const copiedOpen = document.querySelector("#copiedOpen");
const authState = window.__GTM_AUTH_STATE__ || { authorized: false, error: "" };
let statusByTool = {};
let isUnlocked = false;
let statusTimer = null;

function requestJson(url, options = {}) {
  if (typeof XMLHttpRequest !== "function") {
    return Promise.reject(new Error("request unavailable"));
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", url);
    for (const [key, value] of Object.entries(options.headers || {})) {
      xhr.setRequestHeader(key, value);
    }
    xhr.onload = () => {
      let data = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = {};
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("request failed"));
    xhr.send(options.body || null);
  });
}

function normalizeTool(value) {
  return tools[value] ? value : "aggregate";
}

function setStatus(key) {
  if (!activeStatus) return;
  const info = statusByTool[key];
  activeStatus.classList.remove("ok", "bad");
  if (!info) {
    activeStatus.textContent = "检测中";
    return;
  }
  if (info.status?.ok) {
    activeStatus.textContent = "复制版在线";
    activeStatus.classList.add("ok");
  } else {
    activeStatus.textContent = "复制版未就绪";
    activeStatus.classList.add("bad");
  }
}

function setActiveTool(value, updateHash = true) {
  if (!isUnlocked) return;
  const key = normalizeTool(value);
  const tool = tools[key];
  for (const card of cards) card.classList.toggle("active", card.dataset.tool === key);
  activeKind.textContent = tool.kind;
  activeTitle.textContent = tool.title;
  activeDesc.textContent = tool.desc;
  if (copiedOpen) copiedOpen.href = tool.copiedUrl;
  frame.src = tool.copiedUrl;
  setStatus(key);
  if (updateHash && window.location.hash !== `#${key}`) history.replaceState(null, "", `#${key}`);
}

async function refreshStatus() {
  if (!isUnlocked) return;
  try {
    const response = await requestJson("/api/tools");
    if (response.status === 401) {
      showLogin();
      return;
    }
    const data = response.data;
    statusByTool = Object.fromEntries(data.tools.map((tool) => [tool.id, tool]));
    setStatus(normalizeTool(window.location.hash.replace("#", "")));
  } catch {
    if (activeStatus) {
      activeStatus.textContent = "状态未知";
      activeStatus.classList.add("bad");
    }
  }
}

function showLogin(message = "") {
  isUnlocked = false;
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = null;
  frame.removeAttribute("src");
  loginView.classList.remove("is-hidden");
  workbenchView.classList.add("is-hidden");
  unlockMessage.textContent = message;
  unlockMessage.className = message ? "message error" : "message";
  accessPassword.focus();
}

function showWorkbench() {
  isUnlocked = true;
  loginView.classList.add("is-hidden");
  workbenchView.classList.remove("is-hidden");
  setActiveTool(window.location.hash.replace("#", ""), false);
  refreshStatus();
  if (!statusTimer) statusTimer = setInterval(refreshStatus, 5000);
}

for (const card of cards) {
  card.addEventListener("click", () => setActiveTool(card.dataset.tool));
}

window.addEventListener("hashchange", () => setActiveTool(window.location.hash.replace("#", ""), false));

if (authState.authorized) {
  showWorkbench();
} else {
  showLogin(authState.error || "");
}
