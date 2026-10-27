const navbarItems = [
  {
    id: "inicio",
    label: "Inicio",
    href: "pages/inicio.html",
    icon: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'
  },
  {
    id: "explorar",
    label: "Explorar",
    href: "pages/explorar.html",
    icon: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/>'
  },
  {
    id: "buscar",
    label: "Buscar ruta",
    href: "pages/buscar-ruta.html",
    icon: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M6 5V3h12v2M3 11h18M7 15h.01M17 15h.01M8 20v1m8-1v1"/>'
  },
  {
    id: "favoritos",
    label: "Favoritos",
    href: "pages/explorar.html?vista=favoritos",
    icon: '<path d="M20.8 8.6c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z"/>'
  },
  {
    id: "mas",
    label: "Más",
    href: "pages/mas.html",
    icon: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  }
];

class RutAppNavbar extends HTMLElement {
  static get observedAttributes() {
    return ["active"];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    const basePath = this.getAttribute("base") || "../";
    const active = this.getAttribute("active");
    const items = navbarItems.map((item) => {
      const selected = item.id === active;
      return `
        <a class="app-navbar__link${selected ? " is-active" : ""}"
          href="${basePath}${item.href}"
          ${selected ? 'aria-current="page"' : ""}>
          <svg class="app-navbar__icon" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
          <span>${item.label}</span>
        </a>
      `;
    }).join("");

    this.innerHTML = `<nav class="app-navbar" aria-label="Navegación principal">${items}</nav>`;
  }
}

customElements.define("rutapp-navbar", RutAppNavbar);
