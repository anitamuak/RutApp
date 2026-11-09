(() => {
  const root = document.querySelector("#trip-content");
  const tripId = new URLSearchParams(window.location.search).get("id");
  const busColors = ["#0879d1", "#eb8c22", "#7d58c2", "#16875b", "#d34b60"];
  let tripMap = null;
  const layersByStep = new Map();

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatDistance(meters) {
    return meters >= 1000
      ? `${(meters / 1000).toFixed(1)} km`
      : `${Math.round(meters)} m`;
  }

  function formatMinutes(minutes) {
    return `${Math.ceil(minutes)} min`;
  }

  function getStepIcon(kind) {
    if (kind === "walk") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="5" r="2"/><path d="m11 10 3-2 2 3 3 1m-8-2-2 4 3 2-1 5m5-9-2 4-4 0"/></svg>';
    }
    if (kind === "bus") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M8 16h.01M16 16h.01"/></svg>';
    }
    if (kind === "destination") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 1h13l-2 4 2 4H5"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  function coordinatesAreValid(point) {
    return Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 &&
      Number.isFinite(point[1]) && Math.abs(point[1]) <= 180;
  }

  function isTripValid(trip) {
    return trip &&
      trip.id === tripId &&
      typeof trip.origin?.label === "string" &&
      coordinatesAreValid(trip.origin?.coordinates) &&
      typeof trip.destination?.label === "string" &&
      coordinatesAreValid(trip.destination?.coordinates) &&
      Array.isArray(trip.routeNames) &&
      trip.routeNames.length > 0 &&
      Number.isFinite(trip.buses) &&
      Number.isFinite(trip.estimatedMinutes) &&
      Number.isFinite(trip.totalDistanceMeters) &&
      Number.isFinite(trip.walkingDistanceMeters) &&
      Number.isFinite(trip.busDistanceMeters) &&
      Number.isFinite(trip.transfers) &&
      Array.isArray(trip.itinerary) &&
      trip.itinerary.every((step) =>
        step && typeof step.type === "string" &&
        typeof step.title === "string" &&
        (step.type !== "bus" ||
          (typeof step.routeName === "string" &&
            step.board && typeof step.board.name === "string" && coordinatesAreValid(step.board.coordinates) &&
            step.alight && typeof step.alight.name === "string" && coordinatesAreValid(step.alight.coordinates) &&
            Array.isArray(step.geometry) && step.geometry.length > 1 &&
            step.geometry.every(coordinatesAreValid))) &&
        (step.type !== "walk" ||
          (coordinatesAreValid(step.from) && coordinatesAreValid(step.to)))
      );
  }

  function showMapUnavailable(mapCanvas, message) {
    const notice = make("p", "trip-map__state", message);
    mapCanvas.replaceWith(notice);
  }

  async function addTripMap(trip) {
    const mapCanvas = document.querySelector("#trip-map-canvas");
    try {
      const L = await window.RutAppMaps.load();
      if (!mapCanvas.isConnected) return;
      tripMap = window.RutAppMaps.createMap(L, mapCanvas, {
        center: trip.origin.coordinates,
        zoom: 12
      });

      const bounds = L.latLngBounds([]);
      const addInfoMarker = (coordinates, title, color, index) => {
        const marker = L.circleMarker(coordinates, {
          radius: 7,
          fillColor: color,
          fillOpacity: 1,
          color: "#ffffff",
          weight: 2
        }).addTo(tripMap).bindPopup(make("span", "", title));
        bounds.extend(coordinates);
        if (Number.isInteger(index)) layersByStep.set(index, { layer: marker });
        return marker;
      };

      addInfoMarker(trip.origin.coordinates, `Origen: ${trip.origin.label}`, "#42b883");
      const destinationMarker = addInfoMarker(
        trip.destination.coordinates,
        `Destino: ${trip.destination.label}`,
        "#e45465"
      );
      const keepAllDemoGeometry = trip.dataMode === "demo" &&
        trip.routeIds.some((routeId) =>
          [
            "demo-unimag-rodadero",
            "demo-unimag-rodadero-a",
            "demo-unimag-rodadero-b",
            "demo-parque-taganga",
            "demo-ocean-buenavista-osrm",
            "demo-ocean-buenavista-libertador"
          ].includes(routeId)
        );

      let busIndex = 0;
      trip.itinerary.forEach((step, index) => {
        if (step.type === "bus" && Array.isArray(step.geometry) && step.geometry.length > 1) {
          const color = busColors[busIndex % busColors.length];
          busIndex += 1;
          const line = L.polyline(step.geometry, {
            color,
            opacity: 0.9,
            weight: 6,
            smoothFactor: keepAllDemoGeometry ? 0 : 1
          }).addTo(tripMap);
          const board = addInfoMarker(
            step.board.coordinates,
            `Abordaje (${step.routeName}): ${step.board.name}`,
            color
          );
          addInfoMarker(
            step.alight.coordinates,
            `Descenso (${step.routeName}): ${step.alight.name}`,
            color
          );
          layersByStep.set(index, { layer: line, popup: board });
          step.geometry.forEach((point) => bounds.extend(point));
        } else if (step.type === "walk" &&
            coordinatesAreValid(step.from) && coordinatesAreValid(step.to)) {
          const line = L.polyline([step.from, step.to], {
            color: "#16875b",
            opacity: 0.9,
            weight: 4,
            dashArray: "2 10",
            lineCap: "round"
          }).addTo(tripMap);
          layersByStep.set(index, { layer: line });
          bounds.extend(step.from);
          bounds.extend(step.to);
        } else if (step.type === "destination") {
          layersByStep.set(index, { layer: destinationMarker });
        }
      });

      if (trip.dataMode === "demo" &&
          trip.routeIds.includes("demo-unimag-rodadero-a") &&
          trip.routeIds.includes("demo-unimag-rodadero-b")) {
        const lineA = trip.itinerary.find((step) =>
          step.type === "bus" && step.routeId === "demo-unimag-rodadero-a"
        );
        const transferMarker = lineA && L.circleMarker(lineA.alight.coordinates, {
          radius: 10,
          fillColor: "#7441a6",
          fillOpacity: 1,
          color: "#ffffff",
          weight: 3
        }).addTo(tripMap).bindPopup(make(
          "span",
          "",
          "Transbordo · Universidad–La 30 → Rodadero · La paz · conexión de demostración"
        ));
        const transferStepIndex = trip.itinerary.findIndex((step) =>
          step.type === "walk" && step.title.startsWith("Cambia de bus en Conexión Rodadero")
        );
        if (transferMarker) {
          bounds.extend(lineA.alight.coordinates);
          if (transferStepIndex >= 0) {
            layersByStep.set(transferStepIndex, { layer: transferMarker });
          }
        }
      }

      if (bounds.isValid()) tripMap.fitBounds(bounds, { padding: [28, 28] });
      window.RutAppNearbyPlaces?.show(L, tripMap, trip);
    } catch (error) {
      console.error("No se pudo cargar el mapa del itinerario.", error);
      showMapUnavailable(mapCanvas, error.message);
    }
  }

  function selectStep(index, button) {
    root.querySelectorAll(".trip-step").forEach((step) => step.classList.remove("is-selected"));
    button.classList.add("is-selected");
    const stepLayer = layersByStep.get(index);
    if (!tripMap || !stepLayer) return;
    const layer = stepLayer.layer;
    if (typeof layer.getBounds === "function") {
      const bounds = layer.getBounds();
      if (bounds.isValid()) tripMap.fitBounds(bounds, { padding: [40, 40] });
    } else if (typeof layer.getLatLng === "function") {
      tripMap.setView(layer.getLatLng(), 16);
    }
    (stepLayer.popup || layer).openPopup();
  }

  function getSelectedTripId() {
    try {
      return sessionStorage.getItem("rutapp.selectedTripId");
    } catch (error) {
      console.error("No se pudo leer la ruta seleccionada.", error);
      return null;
    }
  }

   function openPosterDialog(src, caption) {
    const dialog = make("dialog", "poster-dialog");
    dialog.setAttribute("aria-label", caption);
    const image = make("img");
    image.src = src;
    image.alt = caption;
    const close = make("button", "poster-dialog__close", "Cerrar");
    close.type = "button";
    const closeDialog = () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.remove();
    };
    close.addEventListener("click", closeDialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener("close", () => dialog.remove());
    dialog.append(image, make("p", "", caption), close);
    document.body.append(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function makePosterPlaceholder(caption) {
    const slot = make("div", "trip-poster trip-poster--empty");
    slot.setAttribute("role", "img");
    slot.setAttribute("aria-label", `Cartel de ${caption}: imagen pendiente`);
    const frame = make("span", "trip-poster__frame");
    frame.append(
      make("strong", "", "Cartel del bus"),
      make("small", "", "Imagen pendiente")
    );
    slot.append(frame, make("span", "trip-poster__caption", caption));
    return slot;
  }

  function buildPosters(busSteps, isDemo) {
    if (busSteps.length === 0) return null;
    const hasPoster = (step) => typeof step.poster === "string" && step.poster;
    const realCount = busSteps.filter(hasPoster).length;

    const section = make("section", "trip-posters");
    section.setAttribute("aria-label", "Cartel del bus para identificarlo");
    section.append(make(
      "p",
      "trip-posters__hint",
      realCount === 0
        ? (busSteps.length === 1
          ? "Cartel para identificar el bus:"
          : "Carteles para identificar cada bus:")
        : (busSteps.length === 1
          ? "Busca este cartel en el parabrisas del bus:"
          : "Busca estos carteles en el parabrisas de cada bus:")
    ));
    const list = make("div", "trip-posters__list");
    busSteps.forEach((step, index) => {
      const caption = busSteps.length > 1
        ? `Bus ${index + 1}: ${step.routeName}`
        : step.routeName;
      if (!hasPoster(step)) {
        list.append(makePosterPlaceholder(caption));
        return;
      }
      const button = make("button", "trip-poster");
      button.type = "button";
      button.setAttribute("aria-label", `Ampliar el cartel de ${caption}`);
      const image = make("img");
      image.src = step.poster;
      image.alt = `Cartel del bus ${step.routeName}`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        button.replaceWith(makePosterPlaceholder(caption));
        if (!list.querySelector("button.trip-poster")) {
          section.querySelector(".trip-posters__note")?.remove();
        }
      });
      button.append(image, make("span", "trip-poster__caption", caption));
      button.addEventListener("click", () => openPosterDialog(step.poster, caption));
      list.append(button);
    });
    section.append(list);
    if (isDemo && realCount > 0) {
      section.append(make(
        "p",
        "trip-posters__note",
        "El cartel es de referencia y su correspondencia con esta ruta está pendiente de verificación."
      ));
    }
    return section;
  }

  function render(trip) {
    root.replaceChildren();
    const pageHeader = make("header", "trip-header");
    const back = make("a", "trip-header__back");
    back.href = "buscar-ruta.html?restaurar=1";
    back.setAttribute("aria-label", "Volver a los resultados");
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
    const brand = make("a", "trip-header__brand");
    brand.href = "inicio.html";
    brand.innerHTML = '<img src="../assets/images/logo.png" alt=""><strong>RutApp</strong>';
    pageHeader.append(back, brand);

    const heading = make("section", "trip-heading");
    heading.append(make("h1", "", "Tu viaje"));
    heading.append(make("p", "", `${trip.origin.label} → ${trip.destination.label}`));

    const routeCard = make("section", "trip-route-card");
    routeCard.append(make("h2", "", trip.routeNames.join(" → ")));
    routeCard.append(make("p", "", `${trip.buses} bus${trip.buses === 1 ? "" : "es"} · ${trip.transfers} transbordo${trip.transfers === 1 ? "" : "s"}`));
      const busSteps = trip.itinerary.filter((step) => step.type === "bus");
    const postersSection = buildPosters(busSteps, trip.dataMode === "demo");
    if (postersSection) routeCard.append(postersSection);
    const metrics = make("div", "trip-metrics");
    [
      [formatMinutes(trip.estimatedMinutes), "Tiempo aprox."],
      [formatDistance(trip.totalDistanceMeters), "Distancia total aprox."],
      [formatDistance(trip.walkingDistanceMeters), "Caminando aprox."],
      [formatDistance(trip.busDistanceMeters), "En bus"],
      [String(trip.transfers), "Transbordos"]
    ].forEach(([value, label]) => {
      const metric = make("div", "trip-metric");
      metric.append(make("strong", "", value), make("span", "", label));
      metrics.append(metric);
    });
    routeCard.append(metrics);

    const selectButton = make("button", "trip-select-button");
    const selectionStatus = make("p", "trip-selection-status");
    selectionStatus.setAttribute("role", "status");
    selectionStatus.setAttribute("aria-live", "polite");
    const alreadySelected = getSelectedTripId() === trip.id;
    selectButton.type = "button";
    selectButton.textContent = alreadySelected ? "Ruta seleccionada" : "Seleccionar ruta";
    selectButton.setAttribute("aria-pressed", String(alreadySelected));
    selectionStatus.textContent = alreadySelected ? "Has seleccionado esta ruta." : "";
    selectButton.addEventListener("click", () => {
      try {
        sessionStorage.setItem("rutapp.selectedTrip", JSON.stringify(trip));
        sessionStorage.setItem("rutapp.selectedTripId", trip.id);
        selectButton.textContent = "Ruta seleccionada";
        selectButton.setAttribute("aria-pressed", "true");
        selectionStatus.textContent = "Has seleccionado esta ruta. Puedes volver a las alternativas para elegir otra.";
      } catch (error) {
        console.error("No se pudo conservar la alternativa seleccionada.", error);
        selectionStatus.textContent = "No se pudo guardar la selección en esta pestaña. Inténtalo de nuevo.";
      }
    });

    const itineraryTitle = make("h2", "trip-section-title", "Cómo llegar");
    const itinerary = make("section", "trip-itinerary");
    itinerary.setAttribute("aria-label", "Pasos del itinerario");
    trip.itinerary.forEach((step, index) => {
      const button = make("button", "trip-step");
      button.type = "button";
      button.dataset.kind = step.type;
      const icon = make("span", "trip-step__icon");
      icon.innerHTML = getStepIcon(step.type);
      const copy = make("span", "trip-step__copy");
      copy.append(make("strong", "", step.title));
      const details = [];
      if (step.routeName) details.push(step.routeName);
      if (Number.isFinite(step.distanceMeters)) details.push(`${formatDistance(step.distanceMeters)} · ${formatMinutes(step.durationMinutes)}`);
      if (step.description) details.push(step.description);
      if (step.type === "bus") details.push(`Desciende en ${step.alight.name}`);
      copy.append(make("small", "", details.join(" · ")));
      button.append(icon, copy);
      button.addEventListener("click", () => selectStep(index, button));
      itinerary.append(button);
    });

    const mapTitle = make("h2", "trip-section-title", "Tu recorrido");
    const map = make("div", "trip-map");
    const mapCanvas = make("div", "trip-map__canvas");
    mapCanvas.id = "trip-map-canvas";
    mapCanvas.setAttribute("role", "application");
    mapCanvas.setAttribute("aria-label", "Mapa interactivo con el itinerario del viaje");
    map.append(mapCanvas);
    const legend = make("div", "trip-map__legend");
    trip.itinerary.filter((step) => step.type === "bus").forEach((step, index) => {
      const busLegend = make("span");
      const swatch = make("i", "trip-map__legend-bus");
      swatch.style.backgroundColor = busColors[index % busColors.length];
      busLegend.append(swatch, document.createTextNode(`Bus ${index + 1}: ${step.routeName}`));
      legend.append(busLegend);
    });
    const walkLegend = make("span");
    walkLegend.innerHTML = '<i class="trip-map__legend-walk"></i> Caminata estimada';
    legend.append(walkLegend);

    const walkMinutes = trip.itinerary
      .filter((step) => step.type === "walk")
      .reduce((total, step) => total + (step.durationMinutes || 0), 0);
    const mapSummary = make("section", "trip-map-summary");
    mapSummary.setAttribute("aria-label", "Resumen aproximado del recorrido");
    mapSummary.append(make("strong", "", `${formatMinutes(trip.estimatedMinutes)} · ${formatDistance(trip.totalDistanceMeters)} total`));
    mapSummary.append(make(
      "span",
      "",
      `${formatDistance(trip.walkingDistanceMeters)} a pie · ${Math.ceil(walkMinutes)} min`
    ));
    mapSummary.append(make("span", "", `${formatDistance(trip.busDistanceMeters)} en bus`));
    map.append(mapSummary);

    root.append(pageHeader, heading, routeCard, selectButton, selectionStatus, itineraryTitle, itinerary, mapTitle, map, legend);
    root.append(make("p", "trip-note", `${trip.estimateNote} ${trip.walkingNote} Los segmentos de bus siguen la geometría registrada; las caminatas se dibujan como conectores esquemáticos y no como calles peatonales.`));
    if (trip.dataMode === "demo" &&
        trip.routeIds.includes("demo-unimag-rodadero-a") &&
        trip.routeIds.includes("demo-unimag-rodadero-b")) {
      root.append(make(
        "p",
        "trip-note",
        "Universidad–La 30, Rodadero · La paz y la conexión son candidatas de demostración pendientes de verificación. Los trazados OSRM usan perfil driving, no representan servicios ni tiempos de bus. La conexión y el punto de paso son aproximados; la referencia Calle 6 con Carrera 4 no está comprobada."
      ));
    }
    if (trip.dataMode === "demo" && trip.routeIds.includes("demo-unimag-rodadero")) {
      root.append(make(
        "p",
        "trip-note",
        "Alternativa directa de demostración pendiente de verificación. El trazado de conducción OSRM no representa un servicio ni un tiempo de bus verificado."
      ));
    }
    (trip.reviewWarnings || []).forEach((warning) => {
      root.append(make("p", "trip-note", warning));
    });
    if (trip.dataMode === "demo" && trip.routeIds.includes("demo-parque-taganga")) {
      root.append(make(
        "p",
        "trip-note",
        "Recorrido aproximado con datos simulados. La caminata inicial conecta el Parque de los Novios con Calle 20 con Carrera 5, sin representar navegación peatonal verificada. La referencia «Kra 11 Taganga», el punto de abordaje y el servicio no están verificados."
      ));
    }
    if (trip.dataMode === "demo" && trip.routeIds.some((routeId) =>
      ["demo-ocean-buenavista-osrm", "demo-ocean-buenavista-libertador"].includes(routeId)
    )) {
      root.append(make(
        "p",
        "trip-note",
        "Recorrido aproximado de demostración. No representa un servicio de transporte verificado."
      ));
    }
    const hasSpecificDemoNotice = trip.routeIds.some((routeId) =>
      [
        "demo-unimag-rodadero",
        "demo-unimag-rodadero-a",
        "demo-unimag-rodadero-b",
        "demo-parque-taganga",
        "demo-ocean-buenavista-osrm",
        "demo-ocean-buenavista-libertador"
      ].includes(routeId)
    );
    if (trip.dataMode === "demo" && !hasSpecificDemoNotice) {
      root.append(make(
        "p",
        "trip-note",
        "Este itinerario de demostración está pendiente de verificación y no representa un servicio real de transporte."
      ));
    }
    trip.itinerary.filter((step) =>
      step.type === "bus" && step.attribution && step.generatedAt
    ).forEach((busStep) => {
      root.append(make(
        "p",
        "trip-note",
        `${busStep.source} ${busStep.attribution} Geometría de conducción calculada; los accesos a pie son conectores esquemáticos y la estimación del viaje la calcula el planificador demo.`
      ));
    });
    addTripMap(trip);
  }

  if (!tripId) {
    root.innerHTML = '<section class="trip-error"><h1>No encontramos este itinerario</h1><p>La URL no incluye un identificador de viaje.</p><a href="buscar-ruta.html">Volver a Buscar ruta</a></section>';
    return;
  }

  try {
    const stored = sessionStorage.getItem(`rutapp.trip.${tripId}`);
    const trip = stored ? JSON.parse(stored) : null;
    if (!isTripValid(trip)) {
      throw new Error("No hay un itinerario válido guardado en esta pestaña.");
    }
    render(trip);
  } catch (error) {
    console.error("No se pudo abrir el itinerario.", error);
    root.replaceChildren();
    const panel = make("section", "trip-error");
    panel.append(
      make("h1", "", "Itinerario no disponible"),
      make("p", "", "Este viaje no está guardado en la pestaña actual. Vuelve a buscar una ruta para seleccionar una alternativa.")
    );
    const link = make("a", "", "Ir a Buscar ruta");
    link.href = "buscar-ruta.html";
    panel.append(link);
    root.append(panel);
  }
})();