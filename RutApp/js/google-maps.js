(() => {
  let apiPromise = null;
  const callbackName = "__rutappGoogleMapsReady";

  function load() {
    if (window.google?.maps) return Promise.resolve(window.google.maps);
    if (apiPromise) return apiPromise;

    const key = window.GOOGLE_MAPS_API_KEY;
    if (typeof key !== "string" || !key.trim()) {
      return Promise.reject(new Error(
        "Falta configurar GOOGLE_MAPS_API_KEY en js/maps-config.js para mostrar Google Maps."
      ));
    }

    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeoutId = window.setTimeout(() => {
        window[callbackName] = () => {};
        apiPromise = null;
        reject(new Error("Google Maps no respondió. Comprueba la conexión y la configuración de la API."));
      }, 15000);

      window[callbackName] = () => {
        window.clearTimeout(timeoutId);
        delete window[callbackName];
        if (!window.google?.maps) {
          apiPromise = null;
          reject(new Error("Google Maps no terminó de inicializarse."));
          return;
        }
        resolve(window.google.maps);
      };

      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key.trim())}&callback=${callbackName}&v=weekly`;
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        window[callbackName] = () => {};
        apiPromise = null;
        reject(new Error("No se pudo cargar Google Maps. Verifica la conexión y las restricciones de la clave."));
      };
      document.head.append(script);
    });

    return apiPromise;
  }

  function mapOptions(theme, overrides = {}) {
    const options = {
      center: { lat: 11.2320944, lng: -74.1950916 },
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      clickableIcons: false,
      gestureHandling: "greedy",
      ...overrides
    };

    if (theme === "dark" && !options.mapId) {
      options.styles = [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#d5d9df" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] }
      ];
    }

    return options;
  }

  function createMap(maps, element, options = {}) {
    const map = new maps.Map(element, mapOptions(
      document.documentElement.dataset.theme || "light",
      options
    ));
    window.addEventListener("rutapp:theme-change", (event) => {
      if (options.mapId) return;
      const themeOptions = mapOptions(event.detail?.theme || "light");
      map.setOptions({ styles: themeOptions.styles || [] });
    });
    return map;
  }

  window.RutAppGoogleMaps = Object.freeze({ load, mapOptions, createMap });
})();
