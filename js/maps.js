(() => {
  const LEAFLET_VERSION = "1.9.4";
  const LEAFLET_BASE = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist`;
  const DEFAULT_CENTER = [11.2320944, -74.1950916];
  let apiPromise = null;

  function loadStyles() {
    if (document.querySelector("link[data-leaflet]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${LEAFLET_BASE}/leaflet.css`;
    link.crossOrigin = "";
    link.dataset.leaflet = "true";
    document.head.append(link);
  }

  function load() {
    if (window.L?.map) return Promise.resolve(window.L);
    if (apiPromise) return apiPromise;

    loadStyles();
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${LEAFLET_BASE}/leaflet.js`;
      script.crossOrigin = "";
      script.async = true;
      script.onload = () => {
        if (window.L?.map) resolve(window.L);
        else {
          apiPromise = null;
          reject(new Error("El mapa no terminó de inicializarse."));
        }
      };
      script.onerror = () => {
        apiPromise = null;
        script.remove();
        reject(new Error("No se pudo cargar el mapa. Verifica tu conexión a internet."));
      };
      document.head.append(script);
    });
    return apiPromise;
  }

  // Opciones: center ([lat, lng]), zoom, scrollWheelZoom.
  // El tema oscuro se aplica con CSS (ver css/global.css).
  function createMap(L, element, options = {}) {
    const { center = DEFAULT_CENTER, zoom = 13, ...mapOptions } = options;
    const map = L.map(element, { zoomControl: true, ...mapOptions }).setView(center, zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
    }).addTo(map);
    return map;
  }

  window.RutAppMaps = Object.freeze({ load, createMap, DEFAULT_CENTER });
})();