chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "UU_KV_START") {
    const job = {
      id: `job_${Date.now()}`,
      prompt: message.prompt,
      images: message.images,
      createdAt: Date.now(),
      status: "pending"
    };

    chrome.storage.local.set({ uuKvJob: job }, () => {
      chrome.tabs.create({ url: "https://chatgpt.com/", active: false }, (tab) => {
        if (tab?.id) {
          chrome.storage.local.set({ uuKvWorkerTabId: tab.id });
        }
        sendResponse({ ok: true, tabId: tab?.id, jobId: job.id });
      });
    });

    return true;
  }

  if (message?.type === "UU_KV_RESULT") {
    chrome.storage.local.set({
      uuKvResult: {
        jobId: message.jobId,
        src: message.src,
        receivedAt: Date.now()
      }
    }, () => {
      if (sender.tab?.id) chrome.tabs.remove(sender.tab.id);
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "UU_KV_STATUS") {
    chrome.storage.local.set({
      uuKvStatus: {
        jobId: message.jobId,
        status: message.status,
        detail: message.detail || "",
        updatedAt: Date.now()
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "UU_KV_CLOSE_WORKER") {
    if (sender.tab?.id) chrome.tabs.remove(sender.tab.id);
    sendResponse({ ok: true });
    return false;
  }
});
