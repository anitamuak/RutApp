(() => {
  const status = document.querySelector("#comparison-status");
  const casesElement = document.querySelector("#comparison-cases");
  const errorPanel = document.querySelector("#comparison-error");

  function isCoordinate(point) {
    return Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Math.abs(point[0]) <= 90 &&
      Number.isFinite(point[1]) &&
      Math.abs(point[1]) <= 180;
  }

  function formatDistance(meters) {
    return meters >= 1000
      ? `${(meters / 1000).toFixed(2)} km`
      : `${Math.round(meters)} m`;
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function validateCase(item) {
    const candidate = item?.candidate;
    return item &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      Array.isArray(item.manual) &&
      item.manual.length > 1 &&
      item.manual.every(isCoordinate) &&
      candidate &&
      Array.isArray(candidate.geometryGeoJSON) &&
      candidate.geometryGeoJSON.length === candidate.pointCount &&
      candidate.geometryGeoJSON.length > 1 &&
      Array.isArray(candidate.geometryLeaflet) &&
      candidate.geometryLeaflet.length === candidate.geometryGeoJSON.length &&
      candidate.geometryLeaflet.every((point, index) =>
        isCoordinate(point) &&
        point[0] === candidate.geometryGeoJSON[index][1] &&
        point[1] === candidate.geometryGeoJSON[index][0]
      ) &&
      Number.isFinite(candidate.distanceMeters) &&
      Number.isFinite(candidate.durationSeconds) &&
      Array.isArray(candidate.waypoints) &&
      candidate.waypoints.length >= 2 &&
      candidate.waypoints.every((waypoint) =>
        isCoordinate(waypoint.requestedLatitudeLongitude) &&
        isCoordinate(waypoint.snappedLatitudeLongitude) &&
        Number.isFinite(waypoint.snapDistanceMeters)
      ) &&
      candidate.geometryLeaflet[0].every((value, index) =>
        value === candidate.waypoints[0].snappedLatitudeLongitude[index]
      ) &&
      candidate.geometryLeaflet.at(-1).every((value, index) =>
        value === candidate.waypoints.at(-1).snappedLatitudeLongitude[index]
      ) &&
      Array.isArray(candidate.legs);
  }

  function showError(message, error) {
    if (error) console.error("No se pudo cargar la comparación local.", error);
    status.textContent = "No se pudo cargar la comparación.";
    errorPanel.textContent = message;
    errorPanel.hidden = false;
  }

  function createPointIcon(L, number, kind) {
    return L.divIcon({
      className: `candidate-point-icon candidate-point-icon--${kind}`,
      html: `<span>${number}${kind === "requested" ? "S" : "A"}</span>`,
      iconSize: [25, 25],
      iconAnchor: [12, 12]
    });
  }

  function addPointMarker(L, map, point, number, kind, description, bounds) {
    const marker = L.marker(point, {
      icon: createPointIcon(L, number, kind),
      keyboard: true,
      title: description
    }).addTo(map);
    const popup = document.createElement("span");
    popup.textContent = description;
    marker.bindPopup(popup);
    bounds.extend(point);
  }

  function pointIndex(geometry, point, startAt = 0) {
    for (let index = startAt; index < geometry.length; index += 1) {
      if (geometry[index][0] === point[0] && geometry[index][1] === point[1]) return index;
    }
    return -1;
  }

  function flaggedGeometry(candidate, leg) {
    const geometry = candidate.geometryLeaflet;
    const start = pointIndex(
      geometry,
      candidate.waypoints[leg.fromPoint - 1].snappedLatitudeLongitude
    );
    const end = pointIndex(
      geometry,
      candidate.waypoints[leg.toPoint - 1].snappedLatitudeLongitude,
      Math.max(0, start)
    );
    return start >= 0 && end > start ? geometry.slice(start, end + 1) : null;
  }

  function renderTable(item) {
    const tableWrap = make("div", "candidate-case__table-wrap");
    const table = make("table", "candidate-case__table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Punto", "Solicitado [lat, lon]", "Ajustado [lat, lon]", "Separación", "Observación"].forEach((label) => {
      headerRow.append(make("th", "", label));
    });
    head.append(headerRow);
    const body = document.createElement("tbody");
    item.candidate.waypoints.forEach((waypoint, index) => {
      const row = document.createElement("tr");
      const warning = waypoint.snapDistanceMeters > 120;
      [
        `Punto ${index + 1}`,
        `[${waypoint.requestedLatitudeLongitude.join(", ")}]`,
        `[${waypoint.snappedLatitudeLongitude.join(", ")}]`,
        formatDistance(waypoint.snapDistanceMeters),
        warning ? "Ajuste amplio; revisar" : "Ajustado a vía"
      ].forEach((value, cellIndex) => {
        row.append(make("td", warning && (cellIndex === 3 || cellIndex === 4) ? "is-warning" : "", value));
      });
      body.append(row);
    });
    table.append(head, body);
    tableWrap.append(table);
    return tableWrap;
  }

  async function renderCase(L, item) {
    const section = make("article", "candidate-case");
    section.append(make("h2", "", item.title));
    const meta = make("div", "candidate-case__meta");
    [
      `Manual: ${item.manual.length} puntos`,
      `OSRM: ${item.candidate.pointCount} puntos`,
      `Distancia vial OSRM: ${formatDistance(item.candidate.distanceMeters)}`,
      `Duración driving de referencia: ${item.candidate.durationSeconds.toFixed(1)} s`,
      `Generada: ${item.candidate.generatedAt}`
    ].forEach((text) => meta.append(make("span", "", text)));
    section.append(meta);

    const mapElement = make("div", "candidate-case__map");
    mapElement.setAttribute("role", "application");
    mapElement.setAttribute("aria-label", `Comparación en mapa: ${item.title}`);
    section.append(mapElement);

    const warnings = make("div", "candidate-case__warnings");
    item.candidate.warnings.forEach((text) => warnings.append(make("p", "", text)));
    const flaggedLegs = item.candidate.legs.filter((leg) => leg.flagged);
    if (flaggedLegs.length) {
      warnings.append(make(
        "p",
        "",
        `Tramos señalados: ${flaggedLegs.map((leg) =>
          `puntos ${leg.fromPoint}→${leg.toPoint}: ${formatDistance(leg.roadMeters)} por conducción frente a ${formatDistance(leg.straightMeters)} en línea recta (${leg.factor.toFixed(2)}×)`
        ).join("; ")}.`
      ));
    }
    section.append(warnings);
    section.append(make("h3", "candidate-case__section-title", "Puntos de paso solicitados y ajustes OSRM"));
    section.append(renderTable(item));

    const attribution = make(
      "p",
      "candidate-case__attribution",
      `Proveedor: ${item.candidate.provider} · Perfil: ${item.candidate.profile} · Respuesta guardada: ${item.candidate.requestUrl}`
    );
    section.append(attribution);
    casesElement.append(section);

    const map = window.RutAppMaps.createMap(L, mapElement, {
      center: item.candidate.geometryLeaflet[0],
      zoom: 13,
      scrollWheelZoom: false
    });
    const bounds = L.latLngBounds([]);
    L.polyline(item.manual, {
      color: "#1976c9",
      opacity: 0.9,
      weight: 5,
      smoothFactor: 0
    }).addTo(map);
    const candidateLine = L.polyline(item.candidate.geometryLeaflet, {
      color: "#7529c7",
      opacity: 0.88,
      weight: 5,
      smoothFactor: 0
    }).addTo(map);
    item.manual.forEach((point) => bounds.extend(point));
    item.candidate.geometryLeaflet.forEach((point) => bounds.extend(point));

    flaggedLegs.forEach((leg) => {
      const coordinates = flaggedGeometry(item.candidate, leg);
      if (coordinates) {
        L.polyline(coordinates, {
          color: "#db3748",
          opacity: 1,
          weight: 8,
          smoothFactor: 0,
          lineCap: "round"
        }).addTo(map);
      }
    });

    item.candidate.waypoints.forEach((waypoint, index) => {
      const number = index + 1;
      L.polyline(
        [waypoint.requestedLatitudeLongitude, waypoint.snappedLatitudeLongitude],
        {
          color: "#424b55",
          opacity: 0.75,
          weight: 2,
          dashArray: "4 6"
        }
      ).addTo(map);
      addPointMarker(
        L,
        map,
        waypoint.requestedLatitudeLongitude,
        number,
        "requested",
        `Punto ${number} solicitado: [${waypoint.requestedLatitudeLongitude.join(", ")}]`,
        bounds
      );
      addPointMarker(
        L,
        map,
        waypoint.snappedLatitudeLongitude,
        number,
        "snapped",
        `Punto ${number} ajustado: [${waypoint.snappedLatitudeLongitude.join(", ")}], separación ${formatDistance(waypoint.snapDistanceMeters)}`,
        bounds
      );
    });

    map.fitBounds(bounds, { padding: [30, 30] });
    return candidateLine;
  }

  fetch("../data/comparacion-candidatas-unimag.json")
    .then((response) => {
      if (!response.ok) throw new Error(`El archivo local respondió HTTP ${response.status}.`);
      return response.json();
    })
    .then(async (data) => {
      if (!Array.isArray(data?.cases) || data.cases.length !== 2 || !data.cases.every(validateCase)) {
        throw new Error("El archivo local no contiene las dos comparaciones válidas.");
      }
      const L = await window.RutAppMaps.load();
      for (const item of data.cases) await renderCase(L, item);
      status.textContent = "Comparación cargada desde respuestas locales; no se consultó OSRM.";
    })
    .catch((error) => showError(error.message, error));
})();
