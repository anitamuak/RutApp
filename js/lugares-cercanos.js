
/* RutApp: lugares turísticos cercanos al trayecto del bus.
 * Coordenadas de las geometrías: [latitud, longitud].
 * Distancias en metros, aproximadas y en línea recta al trazado.
 */
((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) root.RutAppNearbyPlaces = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const EARTH_RADIUS_METERS = 6371000;
  const DEFAULT_RADIUS_METERS = 500;

  function validCoordinate(point) {
    return Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 &&
      Number.isFinite(point[1]) && Math.abs(point[1]) <= 180;
  }

  // Distancia mínima desde un punto hasta cualquier segmento de una polilínea.
  function distanceToPathMeters(point, path) {
    if (!validCoordinate(point) || !Array.isArray(path) || path.length < 2 ||
        !path.every(validCoordinate)) return Infinity;

    const toRadians = Math.PI / 180;
    const latitudeScale = EARTH_RADIUS_METERS * toRadians;
    const longitudeScale = latitudeScale * Math.cos(point[0] * toRadians);
    const toLocal = ([lat, lon]) => [
      (lon - point[1]) * longitudeScale,
      (lat - point[0]) * latitudeScale
    ];

    let nearest = Infinity;
    for (let index = 1; index < path.length; index += 1) {
      const [ax, ay] = toLocal(path[index - 1]);
      const [bx, by] = toLocal(path[index]);
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const fraction = lengthSquared === 0 ? 0 :
        Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
      const x = ax + fraction * dx;
      const y = ay + fraction * dy;
      nearest = Math.min(nearest, Math.hypot(x, y));
    }
    return nearest;
  }

  function findPlacesNearPaths(places, paths, radiusMeters = DEFAULT_RADIUS_METERS) {
    if (!Array.isArray(places) || !Array.isArray(paths) ||
        !Number.isFinite(radiusMeters) || radiusMeters < 0) return [];

    const validPaths = paths.filter((path) =>
      Array.isArray(path) && path.length >= 2 && path.every(validCoordinate));
    if (!validPaths.length) return [];

    return places.flatMap((place) => {
      const point = [place?.latitud, place?.longitud];
      if (!validCoordinate(point)) return [];
      const distance = validPaths.reduce((smallest, path) =>
        Math.min(smallest, distanceToPathMeters(point, path)), Infinity);
      return distance <= radiusMeters ? [{ place, distance }] : [];
    }).sort((a, b) => a.distance - b.distance ||
      String(a.place.nombre || "").localeCompare(String(b.place.nombre || ""), "es"));
  }

  function makeElement(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  // Lo llama js/detalle-ruta.js después de crear el mapa Leaflet.
  async function show(L, map, trip) {
    const mapSection = map?.getContainer?.()?.closest(".trip-map");
    if (!mapSection) return [];

    mapSection.parentElement.querySelector(".trip-nearby")?.remove();
    const section = makeElement("section", undefined, "trip-nearby");
    section.setAttribute("aria-label", "Lugares turísticos cerca del recorrido");
    section.append(makeElement("h2", "Lugares de interés cerca de tu recorrido", "trip-section-title"));
    const status = makeElement("p", "Buscando lugares cercanos…", "trip-note");
    status.setAttribute("role", "status");
    section.append(status);
    mapSection.after(section);

    const busPaths = (trip?.itinerary || [])
      .filter((step) => step.type === "bus" && Array.isArray(step.geometry))
      .map((step) => step.geometry);
    if (!busPaths.length) {
      status.textContent = "Este recorrido no contiene trazados de bus para buscar lugares cercanos.";
      return [];
    }

    try {
      const response = await fetch("../data/lugares.json");
      if (!response.ok) throw new Error(`El catálogo respondió HTTP ${response.status}.`);
      const catalog = await response.json();
      if (!Array.isArray(catalog)) throw new Error("El catálogo de lugares es inválido.");
      const nearby = findPlacesNearPaths(catalog, busPaths);

      
      // Recuperar lugares turísticos guardados en Favoritos (HU10).
      let favoriteIds = new Set();

      try {
        const saved = JSON.parse(
          localStorage.getItem("rutapp.favorites") || "[]"
        );

        if (Array.isArray(saved)) {
          favoriteIds = new Set(saved);
        }
      } catch (error) {
        console.warn("No se pudieron leer los favoritos.", error);
      }


      if (nearby.length === 0) {
        status.textContent = "No encontramos lugares del catálogo a 500 m o menos de este recorrido.";
        return [];
      }

      status.textContent = `${nearby.length} lugar(es) del catálogo a 500 m o menos del trazado del bus. Los marcadores muestran su ubicación aproximada; la distancia no es caminando.`;
      const list = makeElement("ul", undefined, "trip-nearby__list");
      nearby.forEach(({ place, distance }) => {
        const point = [place.latitud, place.longitud];
const isFavorite = favoriteIds.has(place.id);

const imageSrc =
  typeof place.imagen === "string" && place.imagen
    ? (place.imagen.startsWith("../") ? place.imagen : `../${place.imagen}`)
    : null;

const marker = L.marker(point, {
  icon: L.divIcon({
    className: "trip-nearby-marker-wrapper",
    html: `<span class="trip-nearby-marker${isFavorite ? " is-favorite" : ""}"></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -30]
  })
}).addTo(map);

const popup = makeElement("article", undefined, "trip-nearby-popup");

if (imageSrc) {
  const image = makeElement("img", undefined, "trip-nearby-popup__image");
  image.src = imageSrc;
  image.alt = place.nombre || "Lugar turístico";
  image.loading = "lazy";
  image.addEventListener("error", () => image.remove());
  popup.append(image);
}

const body = makeElement("div", undefined, "trip-nearby-popup__body");

body.append(
  makeElement(
    "strong",
    place.nombre || "Lugar de interés",
    "trip-nearby-popup__title"
  )
);

body.append(
  makeElement(
    "p",
    `${isFavorite ? "♥ Favorito guardado · " : ""}A ${Math.round(distance)} m aprox. del trazado del bus.`,
    "trip-nearby-popup__meta"
  )
);

const detailLink = makeElement("a", "Ver ficha", "trip-nearby-popup__link");
detailLink.href = `detalle-lugar.html?id=${encodeURIComponent(place.id)}`;

body.append(detailLink);
popup.append(body);

marker.bindPopup(popup);

        const item = makeElement("li", undefined, "trip-nearby__item");
        const focusButton = makeElement(
          "button",
          `${isFavorite ? "♥ Favorito · " : ""}${place.nombre} · ${Math.round(distance)} m aprox.`
        );
        focusButton.type = "button";
        focusButton.addEventListener("click", () => {
          map.setView(point, Math.max(map.getZoom(), 15));
          marker.openPopup();
        });

        item.append(focusButton);
        list.append(item);
      });

      section.append(list);
      return nearby;
    } catch (error) {
      console.error("No se pudieron cargar los lugares cercanos.", error);
      status.textContent = "No se pudieron cargar los lugares cercanos. Revisa que Live Server esté activo.";
      return [];
    }
  }

  return Object.freeze({
    distanceToPathMeters,
    findPlacesNearPaths,
    show
  });
});
