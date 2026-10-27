(() => {
  const preferenceKey = "rutapp-theme";
  const root = document.documentElement;
  const validThemes = new Set(["light", "dark"]);

  function readTheme() {
    try {
      const saved = window.localStorage.getItem(preferenceKey);
      return validThemes.has(saved) ? saved : "light";
    } catch (error) {
      console.error("No se pudo leer la preferencia del tema.", error);
      return "light";
    }
  }

  function updateThemeControls(theme, message = "") {
    document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
      toggle.setAttribute("aria-checked", String(theme === "dark"));
      toggle.setAttribute("aria-label", "Modo oscuro");
      const setting = toggle.closest(".appearance-setting") || toggle;
      const status = setting.querySelector("[data-theme-status]");
      if (status) status.textContent = theme === "dark" ? "Activado" : "Desactivado";
      setting.querySelectorAll("[data-theme-icon]").forEach((icon) => {
        icon.hidden = icon.dataset.themeIcon !== (theme === "dark" ? "sun" : "moon");
      });
    });
    document.querySelectorAll("[data-theme-message]").forEach((element) => {
      element.textContent = message;
    });
  }

  function applyTheme(theme, message = "") {
    const nextTheme = validThemes.has(theme) ? theme : "light";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = nextTheme === "dark" ? "#101c29" : "#f3f8fd";
    updateThemeControls(nextTheme, message);
    return nextTheme;
  }

  function setTheme(theme) {
    if (!validThemes.has(theme)) {
      throw new TypeError("El tema debe ser light o dark.");
    }

    const appliedTheme = applyTheme(theme);
    let message = "";
    try {
      window.localStorage.setItem(preferenceKey, appliedTheme);
    } catch (error) {
      console.error("El tema cambió, pero no se pudo guardar la preferencia.", error);
      message = "El cambio se aplicó, pero no pudo guardarse en este dispositivo.";
    }
    updateThemeControls(appliedTheme, message);
    window.dispatchEvent(new CustomEvent("rutapp:theme-change", {
      detail: { theme: appliedTheme }
    }));
  }

  applyTheme(readTheme());

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-theme-toggle]");
    if (!toggle) return;
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== preferenceKey) return;
    applyTheme(event.newValue === "dark" ? "dark" : "light");
  });

  document.addEventListener("DOMContentLoaded", () => {
    updateThemeControls(root.dataset.theme || "light");
  });

  window.RutAppTheme = Object.freeze({
    get current() {
      return root.dataset.theme || "light";
    },
    set: setTheme
  });
})();
