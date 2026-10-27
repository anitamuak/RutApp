(() => {
  const favoriteStorageKey = "rutapp.favorites";

  function getFavorites() {
    const stored = window.localStorage.getItem(favoriteStorageKey);
    if (stored === null) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
      throw new Error("El formato de favoritos guardado no es válido.");
    }

    return parsed;
  }

  function toggleFavorite(id) {
    if (typeof id !== "string" || !id) {
      throw new TypeError("Se necesita un identificador de lugar válido.");
    }

    const favorites = getFavorites();
    const isFavorite = favorites.includes(id);
    const updated = isFavorite
      ? favorites.filter((favoriteId) => favoriteId !== id)
      : [...favorites, id];

    window.localStorage.setItem(favoriteStorageKey, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("rutapp:favorites-change", {
      detail: { id, isFavorite: !isFavorite, favorites: updated }
    }));

    return !isFavorite;
  }

  function setStatus(element, message, kind = "info") {
    if (!element) return;
    element.textContent = message;
    element.dataset.kind = kind;
  }

  async function loadPlaces() {
    const response = await fetch("../data/lugares.json");
    if (!response.ok) {
      throw new Error(`No se pudo cargar el catálogo (${response.status}).`);
    }
    const records = await response.json();
    if (!Array.isArray(records)) {
      throw new Error("El catálogo de lugares debe ser una lista.");
    }

    return records.map((record) => ({
      ...record,
      name: record.nombre,
      category: record.categoria,
      categoryLabel: record.categoriaEtiqueta,
      location: record.zona,
      description: record.descripcion,
      image: record.imagen,
      coordinates: Number.isFinite(record.latitud) &&
          Math.abs(record.latitud) <= 90 &&
          Number.isFinite(record.longitud) &&
          Math.abs(record.longitud) <= 180
        ? {
            lat: record.latitud,
            lon: record.longitud,
            zoom: record.nivelZoom,
            precision: record.precisionCoordenadas,
            source: record.fuenteCoordenadas,
            verifiedOn: record.fechaCoordenadasVerificadas
          }
        : null,
      details: {
        schedule: record.horarios?.detalle,
        admission: record.costos?.entrada,
        idealFor: record.idealPara,
        recommended: Array.isArray(record.recomendaciones)
          ? record.recomendaciones.join(" ")
          : record.recomendaciones
      }
    }));
  }

  async function loadRoutes() {
    const response = await fetch("../data/rutas.json");
    if (!response.ok) {
      throw new Error(`No se pudo cargar la base de recorridos (${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data.routes) || (data.signs !== undefined && !Array.isArray(data.signs))) {
      throw new Error("La base de recorridos debe contener una lista de rutas.");
    }
    return data;
  }

  async function loadDemoRoutes() {
    const response = await fetch("../data/rutas-demo.json");
    if (!response.ok) {
      throw new Error(`No se pudo cargar el archivo de datos de demostración (${response.status}).`);
    }
    const data = await response.json();
    if (data.dataMode !== "demo" || !Array.isArray(data.routes) || !data.examples) {
      throw new Error("El archivo de demostración no tiene el formato esperado.");
    }
    return data;
  }

  window.RutApp = Object.freeze({
    getFavorites,
    toggleFavorite,
    setStatus,
    loadPlaces,
    loadRoutes,
    loadDemoRoutes
  });
})();
