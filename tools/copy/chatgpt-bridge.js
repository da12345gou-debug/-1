(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function sendStatus(jobId, status, detail = "") {
    chrome.runtime.sendMessage({ type: "UU_KV_STATUS", jobId, status, detail });
  }

  function dataUrlToFile(dataUrl, name) {
    const [header, base64] = dataUrl.split(",");
    const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], name, { type: mime });
  }

  async function waitFor(selector, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await sleep(400);
    }
    return null;
  }

  async function setComposerText(text) {
    const selectors = [
      "textarea",
      "[contenteditable='true'][role='textbox']",
      "div.ProseMirror[contenteditable='true']",
      "#prompt-textarea"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;

      element.focus();
      if ("value" in element) {
        element.value = text;
      } else {
        element.textContent = text;
      }
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      return true;
    }

    return false;
  }

  async function attachImages(images) {
    let input = document.querySelector("input[type='file']");
    if (!input) {
      const attachButton = [...document.querySelectorAll("button")].find((button) => {
        const label = `${button.ariaLabel || ""} ${button.textContent || ""}`.toLowerCase();
        return label.includes("attach") || label.includes("upload") || label.includes("上传") || label.includes("添加");
      });
      attachButton?.click();
      await sleep(800);
      input = document.querySelector("input[type='file']");
    }

    if (!input) return false;

    const transfer = new DataTransfer();
    images.forEach((src, index) => transfer.items.add(dataUrlToFile(src, `uu-kv-${index + 1}.png`)));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await sleep(2500);
    return true;
  }

  async function submitComposer() {
    const buttons = [...document.querySelectorAll("button")];
    const sendButton = buttons.find((button) => {
      const label = `${button.ariaLabel || ""} ${button.getAttribute("data-testid") || ""} ${button.textContent || ""}`.toLowerCase();
      return label.includes("send") || label.includes("submit") || label.includes("发送") || label.includes("composer-submit");
    });

    if (sendButton && !sendButton.disabled) {
      sendButton.click();
      return true;
    }

    const textbox = document.querySelector("textarea, [contenteditable='true'][role='textbox'], div.ProseMirror[contenteditable='true'], #prompt-textarea");
    textbox?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    return true;
  }

  function findGeneratedImage(beforeSrcSet) {
    const images = [...document.images]
      .filter((image) => image.naturalWidth >= 512 && image.naturalHeight >= 512)
      .filter((image) => image.src && !beforeSrcSet.has(image.src))
      .filter((image) => !image.src.startsWith("data:image/svg"));

    return images.at(-1);
  }

  async function waitForResult(jobId, beforeSrcSet) {
    const started = Date.now();
    while (Date.now() - started < 420000) {
      const image = findGeneratedImage(beforeSrcSet);
      if (image) {
        chrome.runtime.sendMessage({ type: "UU_KV_RESULT", jobId, src: image.currentSrc || image.src });
        return true;
      }
      await sleep(2000);
    }
    return false;
  }

  async function runJob(job) {
    if (!job || job.status === "running" || job.status === "done") return;

    const runningJob = { ...job, status: "running" };
    chrome.storage.local.set({ uuKvJob: runningJob });
    sendStatus(job.id, "running", "open");

    const beforeSrcSet = new Set([...document.images].map((image) => image.src).filter(Boolean));
    await waitFor("body", 30000);

    sendStatus(job.id, "running", "attach");
    const attached = await attachImages(job.images || []);
    if (!attached) {
      sendStatus(job.id, "blocked", "no-file-input");
      chrome.runtime.sendMessage({ type: "UU_KV_CLOSE_WORKER" });
      return;
    }

    sendStatus(job.id, "running", "prompt");
    const filled = await setComposerText(job.prompt);
    if (!filled) {
      sendStatus(job.id, "blocked", "no-composer");
      chrome.runtime.sendMessage({ type: "UU_KV_CLOSE_WORKER" });
      return;
    }

    sendStatus(job.id, "running", "submit");
    await sleep(800);
    await submitComposer();

    sendStatus(job.id, "running", "waiting-result");
    const ok = await waitForResult(job.id, beforeSrcSet);
    chrome.storage.local.set({ uuKvJob: { ...runningJob, status: ok ? "done" : "timeout" } });
    sendStatus(job.id, ok ? "done" : "timeout");
    if (!ok) chrome.runtime.sendMessage({ type: "UU_KV_CLOSE_WORKER" });
  }

  chrome.storage.local.get(["uuKvJob"], ({ uuKvJob }) => {
    if (uuKvJob?.status === "pending") {
      runJob(uuKvJob);
    }
  });
})();
