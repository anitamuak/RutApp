class RutAppHeader extends HTMLElement {
  connectedCallback() {
    if (this.hasChildNodes()) return;

    const basePath = this.getAttribute("base") || "../";
    this.innerHTML = `
      <a class="app-header" href="${basePath}pages/inicio.html" aria-label="RutApp, inicio">
        <img class="app-header__logo" src="${basePath}assets/images/logo.png" alt="" width="58" height="58">
        <span class="app-header__copy">
          <strong class="app-header__name">RutApp</strong>
          <span class="app-header__tagline">Santa Marta en tu ruta</span>
        </span>
      </a>
    `;
  }
}

customElements.define("rutapp-header", RutAppHeader);
