(() => {
  const grid = document.querySelector("#place-grid");
  const count = document.querySelector("#results-count");
  const title = document.querySelector("#catalog-title");
  const subtitle = document.querySelector("#catalog-subtitle");
  const status = document.querySelector("#catalog-status");
  const filters = [...document.querySelectorAll(".category-filter")];
  const viewButtons = [...document.querySelectorAll("[data-catalog-view]")];
  const mapPanel = document.querySelector("#catalog-map-panel");
  const mapStatus = document.querySelector("#catalog-map-status");
  const mapCanvas = document.querySelector("#catalog-map");
  const navbar = document.querySelector("rutapp-navbar");
  const favoritesOnly = new URLSearchParams(window.location.search).get("vista") === "favoritos";
  let places = [];
  let activeCategory = "todos";
  let visiblePlaces = [];
  let mapVisible = false;
  let exploreMap = null;
  let mapMarkers = [];
  let mapRenderId = 0;

  if (favoritesOnly) {
    title.textContent = "Mis favoritos";
    subtitle.textContent = "Lugares que guardaste en este dispositivo";
    navbar.setAttribute("active", "favoritos");
  }

  function makeCard(place, favorites) {
    const card = document.createElement("article");
    card.className = "place-card";

    const visual = document.createElement("div");
    visual.className = "place-card__visual";
    if (!place.image) visual.classList.add("place-card__visual--empty");

    const image = document.createElement("img");
    image.className = "place-card__image";
    image.loading = "lazy";
    RutApp.setPlaceImage(image, place.image ? `../${place.image}` : null, place.name);
    visual.append(image);

    const favorite = document.createElement("button");
    favorite.className = "place-card__favorite";
    favorite.type = "button";
    favorite.setAttribute("aria-label", favorites.includes(place.id)
      ? `Quitar ${place.name} de favoritos`
      : `Añadir ${place.name} a favoritos`);
    favorite.setAttribute("aria-pressed", String(favorites.includes(place.id)));
    favorite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z"/></svg>';
    favorite.addEventListener("click", () => {
      try {
        RutApp.toggleFavorite(place.id);
        render();
        RutApp.setStatus(status, favorites.includes(place.id)
          ? `${place.name} se quitó de tus favoritos.`
          : `${place.name} se guardó en tus favoritos.`);
      } catch (error) {
        console.error("No se pudo actualizar favoritos.", error);
        RutApp.setStatus(status, "No se pudieron guardar los favoritos en este dispositivo.", "error");
      }
    });
    visual.append(favorite);

    const content = document.createElement("div");
    content.className = "place-card__content";
    const info = document.createElement("div");
    info.className = "place-card__info";
    const name = document.createElement("a");
    name.className = "place-card__name";
    name.href = `detalle-lugar.html?id=${encodeURIComponent(place.id)}`;
    name.textContent = place.name;
    const category = document.createElement("span");
    category.className = "place-card__category";
    category.textContent = place.categoryLabel;
    info.append(name, category);

    const details = document.createElement("a");
    details.className = "place-card__details";
    details.href = name.href;
    details.setAttribute("aria-label", `Ver detalles de ${place.name}`);
    details.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    content.append(info, details);
    card.append(visual, content);
    return card;
  }

  function setMapStatus(message, kind = "info") {
    mapStatus.textContent = message;
    mapStatus.dataset.kind = kind;
  }

  function clearMapMarkers() {
    mapMarkers.forEach((marker) => marker.remove());
    mapMarkers = [];
    if (exploreMap) exploreMap.closePopup();
  }

  function createMapInfo(place) {
    const content = document.createElement("article");
    content.className = "catalog-map-info";
    if (place.image) {
      const image = document.createElement("img");
      image.src = `../${place.image}`;
      image.alt = "";
      image.loading = "lazy";
      content.append(image);
    }

    const name = document.createElement("strong");
    name.textContent = place.name;
    const location = document.createElement("span");
    const approximate = place.coordinates.precision && place.coordinates.precision !== "sitio"
      ? " · ubicación aproximada"
      : "";
    location.textContent = `${place.location || place.categoryLabel}${approximate}`;
    const link = document.createElement("a");
    link.href = `detalle-lugar.html?id=${encodeURIComponent(place.id)}`;
    link.textContent = "Ver ficha";
    content.append(name, location, link);
    return content;
  }

  async function renderMapMarkers() {
    const renderId = ++mapRenderId;
    const mappedPlaces = visiblePlaces.filter((place) =>
      Number.isFinite(place.coordinates?.lat) &&
      Number.isFinite(place.coordinates?.lon) &&
      Math.abs(place.coordinates.lat) <= 90 &&
      Math.abs(place.coordinates.lon) <= 180
    );
    clearMapMarkers();
    if (mappedPlaces.length === 0) {
      setMapStatus("No hay lugares con coordenadas en esta selección. No se mostrarán ubicaciones aproximadas inventadas.");
      return;
    }

    setMapStatus("Cargando mapa…");
    try {
      const L = await window.RutAppMaps.load();
      if (renderId !== mapRenderId || !mapVisible) return;
      if (!exploreMap) {
        exploreMap = window.RutAppMaps.createMap(L, mapCanvas, { zoom: 12 });
      }
      exploreMap.invalidateSize();

      const bounds = L.latLngBounds([]);
      mappedPlaces.forEach((place) => {
        const position = [place.coordinates.lat, place.coordinates.lon];
        const marker = L.marker(position, { title: place.name })
          .addTo(exploreMap)
          .bindPopup(createMapInfo(place));
        mapMarkers.push(marker);
        bounds.extend(position);
      });

      if (mappedPlaces.length === 1) {
        const place = mappedPlaces[0];
        exploreMap.setView(
          [place.coordinates.lat, place.coordinates.lon],
          Math.min(Math.max(place.coordinates.zoom || 15, 13), 17)
        );
      } else {
        exploreMap.fitBounds(bounds, { padding: [40, 40] });
      }
      setMapStatus(`${mappedPlaces.length} lugar${mappedPlaces.length === 1 ? "" : "es"} con coordenadas del catálogo. La ficha indica la precisión de cada punto.`);
    } catch (error) {
      if (renderId !== mapRenderId) return;
      console.error("No se pudo cargar el mapa para explorar lugares.", error);
      setMapStatus(error.message, "error");
    }
  }

  function render() {
    let favorites = [];
    try {
      favorites = RutApp.getFavorites();
    } catch (error) {
      console.error("No se pudieron leer los favoritos.", error);
      RutApp.setStatus(status, "No se pudieron leer los favoritos guardados en este dispositivo.", "error");
    }

    visiblePlaces = favoritesOnly
      ? places.filter((place) => favorites.includes(place.id))
      : places;
    if (activeCategory !== "todos") {
      visiblePlaces = visiblePlaces.filter((place) => place.category === activeCategory);
    }

    count.textContent = String(visiblePlaces.length);
    grid.replaceChildren();
    if (mapVisible) renderMapMarkers();
    if (visiblePlaces.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = favoritesOnly
        ? "Aún no tienes lugares guardados. Explora el catálogo y pulsa el corazón para añadirlos."
        : "No hay lugares en esta categoría.";
      grid.append(empty);
      return;
    }

    grid.append(...visiblePlaces.map((place) => makeCard(place, favorites)));
  }

  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      activeCategory = filter.dataset.category;
      filters.forEach((item) => {
        const selected = item === filter;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      render();
    });
  });

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      mapVisible = button.dataset.catalogView === "map";
      viewButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      mapPanel.hidden = !mapVisible;
      grid.hidden = mapVisible;
      if (mapVisible) renderMapMarkers();
    });
  });

  window.addEventListener("rutapp:favorites-change", render);
  window.addEventListener("storage", render);

  RutApp.loadPlaces()
    .then((loadedPlaces) => {
      places = loadedPlaces;
      render();
    })
    .catch((error) => {
      console.error("No se pudo cargar el catálogo de lugares.", error);
      RutApp.setStatus(status, "No se pudo cargar el catálogo. Comprueba la conexión al servidor y vuelve a intentarlo.", "error");
      count.textContent = "0";
      grid.innerHTML = '<p class="empty-state">No se pudo cargar la lista de lugares.</p>';
    });
})();