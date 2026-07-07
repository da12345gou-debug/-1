const tabs = Array.from(document.querySelectorAll(".tool-tab"));

function setActiveTab(tool) {
  for (const tab of tabs) {
    tab.classList.toggle("active", tab.dataset.tool === tool);
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tool || "landing";
    const open = tab.dataset.open || "/";
    setActiveTab(target);
    window.location.href = open;
  });
}

setActiveTab(new URL(window.location.href).hash.replace("#", "") || "landing");
