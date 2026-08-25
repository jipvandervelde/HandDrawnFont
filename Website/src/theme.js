(() => {
  const STORAGE_KEY = "handdrawn-color-scheme";
  const MODES = ["system", "light", "dark"];
  const ICONS = {
    system: "\uE0BD",
    light: "\uE09A",
    dark: "\uE092",
  };

  function storedMode() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return MODES.includes(value) ? value : "system";
    } catch {
      return "system";
    }
  }

  let mode = storedMode();

  function applyMode() {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme =
      mode === "system" ? "light dark" : mode;
    window.dispatchEvent(
      new CustomEvent("handdrawn:themechange", { detail: { mode } }),
    );
  }

  function updateButtons() {
    const nextMode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      const glyph = document.createElement("span");
      glyph.className = "theme-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = ICONS[mode];
      button.replaceChildren(glyph);
      button.dataset.themeMode = mode;
      button.setAttribute(
        "aria-label",
        `Color scheme: ${mode}. Switch to ${nextMode}.`,
      );
      button.title = `${mode} color scheme · switch to ${nextMode}`;
    }
  }

  function cycleMode() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // The selected mode still applies for this page when storage is unavailable.
    }
    applyMode();
    updateButtons();
  }

  applyMode();
  window.addEventListener("DOMContentLoaded", () => {
    updateButtons();
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.addEventListener("click", cycleMode);
    }
  });
})();
