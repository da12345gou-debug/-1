(function () {
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 1;

  function getShell() {
    return document.querySelector(".app-shell");
  }

  function scheduleFit() {
    if (scheduleFit.pending) return;
    scheduleFit.pending = true;
    window.requestAnimationFrame(() => {
      scheduleFit.pending = false;
      fit();
    });
  }

  function fit() {
    const shell = getShell();
    if (!shell) return;
    shell.style.transform = "none";
    document.documentElement.classList.remove("is-frame-fitted");

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const contentWidth = shell.scrollWidth;
    const contentHeight = shell.scrollHeight;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewportWidth / contentWidth, viewportHeight / contentHeight));

    shell.style.setProperty("--fit-scale", String(scale));
    document.documentElement.style.setProperty("--fit-shell-width", `${contentWidth}px`);
    document.documentElement.style.setProperty("--fit-shell-height", `${contentHeight * scale}px`);
    document.documentElement.classList.toggle("is-frame-fitted", scale < 0.995);
    shell.style.transform = "";
  }

  window.addEventListener("load", fit);
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
  document.addEventListener("load", fit, true);
  new MutationObserver((mutations) => {
    if (mutations.every((mutation) => mutation.target === getShell() && mutation.attributeName === "style")) return;
    scheduleFit();
  }).observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true
  });
  setTimeout(fit, 120);
  setTimeout(fit, 600);
})();