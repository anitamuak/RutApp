(() => {
  const status = document.querySelector("#pilot-status");
  const errorPanel = document.querySelector("#pilot-error");
  const metrics = document.querySelector("#pilot-metrics");
  const mapElement = document.querySelector("#pilot-map");
  const originSnap = document.querySelector("#pilot-origin-snap");
  const destinationSnap = document.querySelector("#pilot-destination-snap");

  function isGeoJsonCoordinate(coordinate) {
    return Array.isArray(coordinate) &&
      coordinate.length === 2 &&
      Number.isFinite(coordinate[0]) &&
      Number.isFinite(coordinate[1]) &&
      Math.abs(coordinate[0]) <= 180 &&
      Math.abs(coordinate[1]) <= 90;
  }

  function fail(message, error) {
    if (error) console.error("No se pudo mostrar el piloto OSRM.", error);
    status.textContent = "No se pudo cargar el piloto.";
    errorPanel.textContent = message;
    errorPanel.hidden = false;
    mapElement.replaceChildren(errorPanel);
  }

  function formatDistance(meters) {
    return meters >= 1000
      ? `${(meters / 1000).toFixed(2)} km`
      : `${Math.round(meters)} m`;
  }

  async function renderPilot(data) {
    const route = data?.route;
    const geoJson = route?.geometryGeoJSON;
    const leafletGeometry = route?.geometryLeaflet;
    const endpoints = [data?.origin, data?.destination];
    if (data?.dataMode !== "routing-pilot" ||
        route?.geometryType !== "LineString" ||
        !Array.isArray(geoJson) ||
        geoJson.length < 2 ||
        geoJson.length !== route.pointCount ||
        !geoJson.every(isGeoJsonCoordinate) ||
        !Array.isArray(leafletGeometry) ||
        leafletGeometry.length !== geoJson.length ||
        !leafletGeometry.every((point, index) =>
          Array.isArray(point) &&
          point.length === 2 &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]) &&
          point[0] === geoJson[index][1] &&
          point[1] === geoJson[index][0]
        ) ||
        !Number.isFinite(route.distanceMeters) ||
        !Number.isFinite(route.durationSeconds) ||
        endpoints.some((endpoint) =>
          !Array.isArray(endpoint?.requestedLatitudeLongitude) ||
          !Array.isArray(endpoint?.snappedLatitudeLongitude) ||
          !endpoint.requestedLatitudeLongitude.every(Number.isFinite) ||
          !endpoint.snappedLatitudeLongitude.every(Number.isFinite) ||
          !Number.isFinite(endpoint.snapDistanceMeters)
        )) {
      throw new Error("El JSON local está incompleto o tiene coordenadas inválidas.");
    }

    const L = await window.RutAppMaps.load();
    const map = window.RutAppMaps.createMap(L, mapElement, {
      center: leafletGeometry[0],
      zoom: 14
    });
    const routeLine = L.polyline(leafletGeometry, {
      color: "#5222df",
      opacity: 0.9,
      weight: 6,
      smoothFactor: 0
    }).addTo(map);
    const bounds = routeLine.getBounds();

    [
      [data.origin, "#16875b", "Origen solicitado"],
      [data.destination, "#e45465", "Destino solicitado"]
    ].forEach(([endpoint, color, label]) => {
      L.circleMarker(endpoint.requestedLatitudeLongitude, {
        radius: 8,
        fillColor: color,
        fillOpacity: 1,
        color: "#fff",
        weight: 2
      }).addTo(map).bindPopup(`${label}: ${endpoint.name}`);
      bounds.extend(endpoint.requestedLatitudeLongitude);
    });

    [
      [data.origin, "Ajuste de origen"],
      [data.destination, "Ajuste de destino"]
    ].forEach(([endpoint, label]) => {
      L.circleMarker(endpoint.snappedLatitudeLongitude, {
        radius: 6,
        fillColor: "#f0a52b",
        fillOpacity: 1,
        color: "#fff",
        weight: 2
      }).addTo(map).bindPopup(
        `${label}: ${formatDistance(endpoint.snapDistanceMeters)} desde el punto solicitado`
      );
      bounds.extend(endpoint.snappedLatitudeLongitude);
    });
    map.fitBounds(bounds, { padding: [28, 28] });

    document.querySelector("#pilot-distance").textContent = formatDistance(route.distanceMeters);
    document.querySelector("#pilot-points").textContent = String(route.pointCount);
    document.querySelector("#pilot-duration").textContent = `${route.durationSeconds.toFixed(1)} s`;
    metrics.hidden = false;
    document.querySelector("#pilot-driving-note").hidden = false;
    originSnap.textContent =
      `Origen: ${data.origin.waypointName || "sin nombre de vía"}; ajuste ${formatDistance(data.origin.snapDistanceMeters)}. ` +
      `Solicitado [${data.origin.requestedLatitudeLongitude.join(", ")}], ajustado [${data.origin.snappedLatitudeLongitude.join(", ")}].`;
    destinationSnap.textContent =
      `Destino: ${data.destination.waypointName || "sin nombre de vía"}; ajuste ${formatDistance(data.destination.snapDistanceMeters)}. ` +
      `Solicitado [${data.destination.requestedLatitudeLongitude.join(", ")}], ajustado [${data.destination.snappedLatitudeLongitude.join(", ")}].`;
    document.querySelector("#pilot-snaps").hidden = false;
    document.querySelector("#pilot-generated").textContent =
      `Resultado local guardado el ${data.generatedAt}. Perfil: ${data.provider.profile}.`;
    status.textContent = "Resultado local cargado; esta página no consulta el servicio de enrutamiento.";
  }

  fetch("../data/piloto-ocean-buenavista.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`El archivo local respondió HTTP ${response.status}.`);
      }
      return response.json();
    })
    .then(renderPilot)
    .catch((error) => fail(error.message, error));
})();
