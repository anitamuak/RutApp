(() => {
  const form = document.querySelector("#route-form");
  const originDisplay = document.querySelector("#origin-display");
  const destinationInput = document.querySelector("#destination-input");
  const suggestions = document.querySelector("#destination-suggestions");
  const originError = document.querySelector("#origin-error");
  const destinationError = document.querySelector("#destination-error");
  const routeMessage = document.querySelector("#route-message");
  const results = document.querySelector("#route-results");
  const resultsList = document.querySelector("#results-list");
  const resultsTitle = document.querySelector("#results-title");
  const resultsDescription = document.querySelector("#results-description");
  const searchButton = document.querySelector("#search-submit");
  const locateButton = document.querySelector("#use-location");
  const demoToggle = document.querySelector("#use-demo-routes");
  const demoExampleList = document.querySelector("#demo-example-list");
  const demoNotice = document.querySelector("#demo-notice");
  const mapDialog = document.querySelector("#map-dialog");
  const mapSelection = document.querySelector("#map-selection");
  const mapConfirm = document.querySelector("#confirm-map");
  const mapHint = document.querySelector("#map-hint");
  const clearDestination = document.querySelector("#clear-destination");
  const demoExamples = [
    { id: "unimagRodadero", label: "Universidad–Rodadero" },
    { id: "parqueTaganga", label: "Parque de los Novios–Playa de Taganga" },
    { id: "oceanBuenavista", label: "Ocean Mall → Buenavista" }
  ];
  const state = { origin: null, destination: null };
  let places = [];
  let routeCatalog = null;
  let routeCatalogData = null;
  let routeCatalogError = null;
  let demoRouteCatalog = null;
  let demoRouteError = null;
  let activeMapMode = null;
  let selectionMap = null;
  let selectionMarker = null;
  let pendingMapPoint = null;
  let locationRequestPending = false;
  let locationRequestId = 0;

  function setMessage(message, kind = "info") {
    routeMessage.textContent = message;
    routeMessage.dataset.kind = kind;
  }

  function setInputError(element, message) {
    element.textContent = message;
  }

  function updateDestinationValue(value, selectedPlace = null) {
    destinationInput.value = value;
    state.destination = selectedPlace;
    clearDestination.hidden = value.length === 0;
    suggestions.hidden = true;
    setInputError(destinationError, "");
  }

  function getPlaceCoordinates(place) {
    if (!place.coordinates) return null;
    return {
      latitude: place.coordinates.lat,
      longitude: place.coordinates.lon,
      precision: place.coordinates.precision
    };
  }

  function choosePlace(place) {
    state.destination = {
      type: "catalog",
      id: place.id,
      label: place.name,
      coordinates: getPlaceCoordinates(place)
    };
    updateDestinationValue(place.name, state.destination);
    setMessage("Destino seleccionado desde el catálogo turístico.");
  }

  function renderSuggestions(query) {
    suggestions.replaceChildren();
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    if (normalizedQuery.length < 2) {
      suggestions.hidden = true;
      return;
    }

    const matching = places
      .filter((place) => `${place.name} ${place.location} ${place.categoryLabel}`.toLocaleLowerCase("es").includes(normalizedQuery))
      .slice(0, 6);

    if (matching.length === 0) {
      suggestions.hidden = true;
      return;
    }

    matching.forEach((place) => {
      const option = document.createElement("button");
      option.className = "route-search__suggestion";
      option.type = "button";
      option.role = "option";
      option.setAttribute("aria-selected", "false");
      const name = document.createElement("strong");
      name.textContent = place.name;
      const location = document.createElement("span");
      location.textContent = `${place.categoryLabel} · ${place.location}`;
      option.append(name, location);
      option.addEventListener("click", () => choosePlace(place));
      suggestions.append(option);
    });
    suggestions.hidden = false;
  }

  function persistOrigin() {
    try {
      if (["gps", "map"].includes(state.origin?.type) && state.origin.coordinates) {
        sessionStorage.setItem("rutapp.routeOrigin", JSON.stringify(state.origin));
      } else {
        sessionStorage.removeItem("rutapp.routeOrigin");
      }
    } catch (error) {
      console.error("No se pudo conservar el origen de la ruta en esta pestaña.", error);
    }
  }

  function restoreOrigin() {
    try {
      const stored = sessionStorage.getItem("rutapp.routeOrigin");
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const coordinates = parsed?.coordinates;
      if (
        ["gps", "map"].includes(parsed?.type) &&
        typeof parsed.label === "string" &&
        Number.isFinite(coordinates?.latitude) &&
        Math.abs(coordinates.latitude) <= 90 &&
        Number.isFinite(coordinates?.longitude)
        && Math.abs(coordinates.longitude) <= 180
      ) {
        state.origin = parsed;
        originDisplay.value = parsed.label;
        setMessage("Se conservó el origen que seleccionaste en esta pestaña.");
      }
    } catch (error) {
      sessionStorage.removeItem("rutapp.routeOrigin");
      console.error("No se pudo restaurar el origen guardado para esta pestaña.", error);
    }
  }

  function showLocationError(error) {
    if (error.code === 1) {
      setInputError(originError, "No se concedió el permiso de ubicación. Elige un punto en el mapa.");
    } else if (error.code === 2) {
      setInputError(originError, "El dispositivo no pudo determinar la ubicación. Inténtalo de nuevo o elige el mapa.");
    } else if (error.code === 3) {
      setInputError(originError, "Se agotó el tiempo para obtener la ubicación. Inténtalo de nuevo.");
    } else {
      setInputError(originError, "No fue posible obtener la ubicación. Elige el origen en el mapa.");
    }
  }

  function requestLocation() {
    if (locationRequestPending) return;
    setInputError(originError, "");

    if (!window.isSecureContext) {
      setInputError(originError, "La ubicación requiere HTTPS o localhost. Puedes elegir un punto en el mapa.");
      return;
    }
    if (!("geolocation" in navigator)) {
      setInputError(originError, "Este navegador no admite geolocalización. Elige un punto en el mapa.");
      return;
    }

    locationRequestPending = true;
    const requestId = ++locationRequestId;
    state.origin = null;
    locateButton.disabled = true;
    locateButton.setAttribute("aria-busy", "true");
    originDisplay.value = "Obteniendo ubicación…";
    setMessage("Solicitando permiso y ubicación del dispositivo…");

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (requestId !== locationRequestId) return;
          state.origin = {
            type: "gps",
            label: "Ubicación obtenida",
            coordinates: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            }
          };
          originDisplay.value = state.origin.label;
          persistOrigin();
          setMessage("Ubicación obtenida. Las coordenadas se guardan solo en esta pestaña.");
          locationRequestPending = false;
          locateButton.disabled = false;
          locateButton.removeAttribute("aria-busy");
        },
        (error) => {
          if (requestId !== locationRequestId) return;
          state.origin = null;
          originDisplay.value = "Mi ubicación";
          showLocationError(error);
          setMessage("");
          locationRequestPending = false;
          locateButton.disabled = false;
          locateButton.removeAttribute("aria-busy");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    } catch (error) {
      console.error("No se pudo iniciar la solicitud de geolocalización.", error);
      state.origin = null;
      originDisplay.value = "Mi ubicación";
      setInputError(originError, "No se pudo iniciar la solicitud de ubicación. Elige el origen en el mapa.");
      locationRequestPending = false;
      locateButton.disabled = false;
      locateButton.removeAttribute("aria-busy");
    }
  }

  async function openMap(mode) {
    if (mode === "origin" && locationRequestPending) {
      locationRequestId += 1;
      locationRequestPending = false;
      locateButton.disabled = false;
      locateButton.removeAttribute("aria-busy");
      originDisplay.value = "Mi ubicación";
    }
    activeMapMode = mode;
    pendingMapPoint = null;
    mapConfirm.disabled = true;
    mapSelection.textContent = "Aún no has seleccionado un punto.";
    mapHint.textContent = mode === "origin"
      ? "Pulsa en el mapa para seleccionar tu punto de origen."
      : "Pulsa en el mapa para seleccionar el destino.";

    if (!mapDialog.open) mapDialog.showModal();
    mapSelection.textContent = "Cargando mapa…";
    if (selectionMarker) {
      selectionMarker.remove();
      selectionMarker = null;
    }

    try {
      const L = await window.RutAppMaps.load();
      if (activeMapMode !== mode || !mapDialog.open) return;
      if (!selectionMap) {
        selectionMap = window.RutAppMaps.createMap(
          L,
          document.querySelector("#selection-map"),
          { zoom: 12 }
        );
        selectionMap.on("click", (event) => {
          if (!event.latlng) return;
          const { lat: latitude, lng: longitude } = event.latlng;
          pendingMapPoint = {
            latitude,
            longitude,
            precision: "punto seleccionado por el usuario"
          };
          if (selectionMarker) selectionMarker.setLatLng(event.latlng);
          else selectionMarker = L.marker(event.latlng).addTo(selectionMap);
          mapSelection.textContent = `Punto seleccionado en el mapa (${latitude.toFixed(5)}, ${longitude.toFixed(5)}).`;
          mapConfirm.disabled = false;
        });
      }

      const existingPoint = mode === "origin" ? state.origin : state.destination;
      const coordinates = existingPoint?.coordinates;
      if (Number.isFinite(coordinates?.latitude) && Number.isFinite(coordinates?.longitude)) {
        selectionMap.setView([coordinates.latitude, coordinates.longitude], 15);
      }
      selectionMap.invalidateSize();
      mapSelection.textContent = "Aún no has seleccionado un punto.";
    } catch (error) {
      console.error("No se pudo cargar el mapa para seleccionar un punto.", error);
      mapSelection.textContent = error.message;
      setMessage(error.message, "error");
    }
  }

  function closeMap() {
    if (mapDialog.open) mapDialog.close();
    activeMapMode = null;
  }

  function confirmMapPoint() {
    if (!pendingMapPoint || !activeMapMode) return;
    const selection = {
      type: "map",
      label: "Punto seleccionado en el mapa",
      coordinates: pendingMapPoint
    };

    if (activeMapMode === "origin") {
      locationRequestId += 1;
      locationRequestPending = false;
      locateButton.disabled = false;
      locateButton.removeAttribute("aria-busy");
      state.origin = selection;
      originDisplay.value = selection.label;
      setInputError(originError, "");
      persistOrigin();
    } else {
      state.destination = selection;
      updateDestinationValue(selection.label, selection);
    }
    setMessage("Punto seleccionado. No se consultó ningún servicio de geocodificación.");
    closeMap();
  }

  function swapPlaces() {
    const previousOrigin = state.origin || {
      type: "text",
      label: originDisplay.value,
      coordinates: null
    };
    const previousDestination = state.destination || (
      destinationInput.value.trim()
        ? { type: "text", label: destinationInput.value.trim(), coordinates: null }
        : null
    );
    state.origin = previousDestination;
    state.destination = previousOrigin;
    originDisplay.value = state.origin?.label || "Mi ubicación";
    updateDestinationValue(state.destination?.label || "");
    setInputError(originError, "");
    setInputError(destinationError, "");
    persistOrigin();
    setMessage("Origen y destino intercambiados.");
  }

  function showInitialResults() {
    results.dataset.state = "idle";
    resultsTitle.textContent = "¿A dónde quieres ir?";
    resultsDescription.textContent = "Selecciona tu origen y destino para encontrar opciones de ruta.";
    resultsList.replaceChildren();
    demoNotice.hidden = !demoToggle.checked;
    demoNotice.textContent = demoToggle.checked && demoRouteCatalog
      ? demoRouteCatalog.notice
      : "";
  }

  function formatDistance(meters) {
    return meters >= 1000
      ? `${(meters / 1000).toFixed(1)} km`
      : `${Math.round(meters)} m`;
  }

  function plannerCoordinate(selection) {
    const coordinates = selection?.coordinates;
    if (Number.isFinite(coordinates?.latitude) && Number.isFinite(coordinates?.longitude)) {
      return [coordinates.latitude, coordinates.longitude];
    }
    return null;
  }

  function saveAndOpenTrip(trip) {
    try {
      sessionStorage.setItem(`rutapp.trip.${trip.id}`, JSON.stringify(trip));
      window.location.href = `detalle-ruta.html?id=${encodeURIComponent(trip.id)}`;
    } catch (error) {
      console.error("No se pudo conservar el itinerario seleccionado.", error);
      setMessage("No se pudo guardar el itinerario en esta pestaña. Revisa la configuración del navegador e inténtalo de nuevo.", "error");
    }
  }

  function getSelectedTripId() {
    try {
      return sessionStorage.getItem("rutapp.selectedTripId");
    } catch (error) {
      console.error("No se pudo leer la ruta seleccionada en esta pestaña.", error);
      return null;
    }
  }

  function renderAlternative(trip, originLabel, destinationLabel) {
    const card = document.createElement("article");
    card.className = "route-option";
    const heading = document.createElement("div");
    heading.className = "route-option__heading";
    const title = document.createElement("h3");
    title.textContent = trip.routeNames.join(" → ");
    const badge = document.createElement("span");
    badge.className = "route-option__badge";
    badge.textContent = trip.transfers === 0 ? "Directa" : `${trip.transfers} transbordo${trip.transfers === 1 ? "" : "s"}`;
    if (trip.dataMode === "demo") {
      badge.classList.add("route-option__badge--demo");
      badge.textContent = "Aproximada";
    }
    if (getSelectedTripId() === trip.id) {
      badge.classList.add("route-option__badge--selected");
      badge.textContent = trip.dataMode === "demo"
        ? "Demo · seleccionada"
        : "Seleccionada";
    }
    heading.append(title, badge);

    const summary = document.createElement("p");
    summary.className = "route-option__summary";
    summary.textContent = `${originLabel} → ${destinationLabel} · ${trip.buses} bus${trip.buses === 1 ? "" : "es"} · ${trip.transfers} transbordo${trip.transfers === 1 ? "" : "s"}`;

    const posters = document.createElement("div");
    posters.className = "route-option__posters";
    trip.itinerary.filter((step) => step.type === "bus" && step.poster).forEach((step) => {
      const image = document.createElement("img");
      image.src = step.poster;
      image.alt = `Cartel de ${step.routeName}`;
      image.loading = "lazy";
      posters.append(image);
    });

    const stats = document.createElement("div");
    stats.className = "route-option__stats";
    const walkingMinutes = trip.itinerary
      .filter((step) => step.type === "walk")
      .reduce((total, step) => total + (step.durationMinutes || 0), 0);
    [
      [`${trip.estimatedMinutes} min`, "Tiempo aprox."],
      [formatDistance(trip.totalDistanceMeters), "Distancia total aprox."],
      [
        formatDistance(trip.walkingDistanceMeters),
        trip.dataMode === "demo"
          ? `A pie · ${Math.ceil(walkingMinutes)} min aprox.`
          : "Caminando aprox."
      ],
      [formatDistance(trip.busDistanceMeters), "En bus"]
    ].forEach(([value, label]) => {
      const stat = document.createElement("div");
      stat.className = "route-option__stat";
      stat.append(Object.assign(document.createElement("strong"), { textContent: value }));
      stat.append(Object.assign(document.createElement("span"), { textContent: label }));
      stats.append(stat);
    });

    const stops = document.createElement("div");
    stops.className = "route-option__stops";
    trip.itinerary.filter((step) => step.type === "bus").forEach((step) => {
      const line = document.createElement("span");
      line.textContent = `${step.routeName}: aborda en ${step.board.name} · desciende en ${step.alight.name}`;
      stops.append(line);
    });

    const details = document.createElement("a");
    details.className = "route-option__details";
    details.href = `detalle-ruta.html?id=${encodeURIComponent(trip.id)}`;
    details.textContent = "Ver detalles del recorrido →";
    details.addEventListener("click", (event) => {
      event.preventDefault();
      saveAndOpenTrip(trip);
    });

    const note = document.createElement("p");
    note.className = "route-option__notice";
    note.textContent = [trip.estimateNote, ...(trip.reviewWarnings || [])].join(" ");
    card.append(heading, summary);
    if (posters.childElementCount > 0) card.append(posters);
    card.append(stats, stops, details, note);
    return card;
  }

  function renderAlternatives(alternatives, dataMode = "verified") {
    results.dataset.state = "results";
    resultsTitle.textContent = dataMode === "demo"
      ? "Alternativas calculadas"
      : "Rutas disponibles";
    resultsDescription.textContent = `${alternatives.length} alternativa${alternatives.length === 1 ? "" : "s"} · ${state.origin.label} → ${state.destination.label}`;
    demoNotice.hidden = dataMode !== "demo";
    demoNotice.textContent = dataMode === "demo"
      ? demoRouteCatalog?.notice || "Recorrido aproximado. No representa una línea de transporte verificada."
      : "";
    resultsList.replaceChildren(...alternatives.map((trip) =>
      renderAlternative(trip, state.origin.label, state.destination.label)
    ));
  }

  function renderDemoExamples() {
    if (!demoRouteCatalog) return;
    const routeIds = new Set(demoRouteCatalog.routes.map((route) => route.id));
    const availableExamples = demoExamples.filter((example) => {
      const data = demoRouteCatalog.examples[example.id];
      return data &&
        Array.isArray(data.routeIds) &&
        data.routeIds.length > 0 &&
        data.routeIds.every((routeId) => routeIds.has(routeId)) &&
        isValidDemoEndpoint(data.origin) &&
        isValidDemoEndpoint(data.destination);
    });
    demoExampleList.replaceChildren(...availableExamples.map((example) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "route-search__minor route-demo-control__sample";
      button.dataset.demoExample = example.id;
      button.textContent = example.label;
      return button;
    }));
  }

  function isValidDemoEndpoint(endpoint) {
    return endpoint &&
      typeof endpoint.label === "string" &&
      Number.isFinite(endpoint.latitude) &&
      Math.abs(endpoint.latitude) <= 90 &&
      Number.isFinite(endpoint.longitude) &&
      Math.abs(endpoint.longitude) <= 180;
  }

  function updateDemoMode() {
    demoExampleList.hidden = !demoToggle.checked;
    demoNotice.hidden = !demoToggle.checked;
    demoNotice.textContent = demoToggle.checked && demoRouteCatalog
      ? demoRouteCatalog.notice
      : "";
    resultsList.replaceChildren();
    results.dataset.state = "idle";
    resultsTitle.textContent = demoToggle.checked
      ? "Recorrido de ejemplo"
      : "¿A dónde quieres ir?";
    resultsDescription.textContent = demoToggle.checked
      ? "Carga los puntos de ejemplo o elige otros en el mapa para buscar alternativas."
      : "Selecciona tu origen y destino para encontrar opciones de ruta.";
    setMessage(demoToggle.checked
      ? "Recorrido de ejemplo activado; no representa transporte real."
      : "Recorrido de ejemplo desactivado; se utilizará el catálogo local de rutas verificadas.");
  }

  function isValidStoredSelection(selection) {
    const coordinates = selection?.coordinates;
    return selection &&
      typeof selection.label === "string" &&
      typeof selection.type === "string" &&
      Number.isFinite(coordinates?.latitude) &&
      Math.abs(coordinates.latitude) <= 90 &&
      Number.isFinite(coordinates?.longitude) &&
      Math.abs(coordinates.longitude) <= 180;
  }

  function restoreLastSearch() {
    if (new URLSearchParams(window.location.search).get("restaurar") !== "1") return false;
    try {
      const stored = sessionStorage.getItem("rutapp.lastRouteSearch");
      const search = stored ? JSON.parse(stored) : null;
      if (!search ||
          !isValidStoredSelection(search.origin) ||
          !isValidStoredSelection(search.destination) ||
          !Array.isArray(search.alternatives) ||
          search.alternatives.length === 0) {
        throw new Error("No se encontró una búsqueda anterior válida en esta pestaña.");
      }

      state.origin = search.origin;
      state.destination = search.destination;
      demoToggle.checked = search.dataMode === "demo";
      demoExampleList.hidden = !demoToggle.checked;
      originDisplay.value = state.origin.label;
      updateDestinationValue(state.destination.label, state.destination);
      renderAlternatives(search.alternatives, search.dataMode);
      setMessage("Se restauraron las alternativas de tu búsqueda anterior.");
      return true;
    } catch (error) {
      console.error("No se pudieron restaurar las alternativas de la búsqueda.", error);
      setMessage("No fue posible restaurar esta búsqueda. Indica el origen y destino para buscar de nuevo.", "error");
      return false;
    }
  }

  async function searchRoutes(event) {
    event.preventDefault();
    if (searchButton.disabled) return;
    setInputError(originError, "");
    setInputError(destinationError, "");
    setMessage("");

    let valid = true;
    if (!state.origin?.coordinates || !Number.isFinite(state.origin.coordinates.latitude) || !Number.isFinite(state.origin.coordinates.longitude)) {
      setInputError(originError, "Selecciona tu ubicación actual o un punto en el mapa.");
      valid = false;
    }
    const destinationCoordinate = plannerCoordinate(state.destination);
    const destinationIsVerified = Boolean(state.destination?.id && destinationCoordinate) ||
      (["map", "gps", "demo"].includes(state.destination?.type) && Boolean(destinationCoordinate));
    if (!destinationIsVerified) {
      setInputError(destinationError, "Selecciona un destino con coordenadas verificadas o elige el punto en el mapa.");
      valid = false;
    }
    if (!valid) {
      if (!state.origin?.coordinates) locateButton.focus();
      else destinationInput.focus();
      return;
    }

    searchButton.disabled = true;
    searchButton.setAttribute("aria-busy", "true");
    results.dataset.state = "loading";
    resultsTitle.textContent = "Buscando opciones…";
    resultsList.replaceChildren();
    const useDemo = demoToggle.checked;
    resultsDescription.textContent = useDemo
      ? "Calculando el recorrido aproximado."
      : "Comparando recorridos y conexiones verificadas.";
    demoNotice.hidden = !useDemo;
    demoNotice.textContent = useDemo
      ? demoRouteCatalog?.notice || "Recorrido aproximado. No representa una línea de transporte verificada."
      : "";
    try {
      sessionStorage.removeItem("rutapp.lastRouteSearch");
    } catch (error) {
      console.error("No se pudo limpiar la búsqueda anterior de esta pestaña.", error);
    }
    await routeDataPromise;
    if (useDemo) await demoRoutePromise;

    searchButton.disabled = false;
    searchButton.removeAttribute("aria-busy");
    if (!useDemo && routeCatalogError) {
      results.dataset.state = "empty";
      resultsTitle.textContent = "No se pudo cargar el archivo local de rutas";
      resultsDescription.textContent = "La búsqueda se detuvo porque data/rutas.json no está disponible o no tiene un formato válido.";
      setMessage("No se pudo leer el catálogo local de rutas. No se consultó ninguna base de datos.", "error");
      return;
    }
    if (useDemo && demoRouteError) {
      results.dataset.state = "empty";
      resultsTitle.textContent = "No se pudieron cargar los datos del recorrido";
      resultsDescription.textContent = "Comprueba el archivo local data/rutas-demo.json.";
      setMessage("El motor no se ejecutó porque faltan los datos del recorrido.", "error");
      return;
    }

    const activeRoutes = useDemo ? demoRouteCatalog.routes : routeCatalog;
    const result = RutAppRoutePlanner.search(
      activeRoutes,
      {
        label: state.origin.label,
        coordinates: plannerCoordinate(state.origin)
      },
      {
        label: state.destination.label,
        coordinates: destinationCoordinate
      },
      { dataMode: useDemo ? "demo" : "verified" }
    );

    if (result.error) {
      results.dataset.state = "empty";
      resultsTitle.textContent = "No se pudo iniciar la búsqueda";
      resultsDescription.textContent = result.error;
      return;
    }
    if (result.alternatives.length === 0) {
      results.dataset.state = "empty";
      const verifiedRoutes = activeRoutes.filter((route) => route.verificationStatus === "verified").length;
      const pendingRoutes = activeRoutes.length - verifiedRoutes;
      if (useDemo) {
        resultsTitle.textContent = "No hay conexión para estos puntos";
        resultsDescription.textContent = "Los puntos seleccionados no quedan conectados por los recorridos disponibles.";
      } else if (verifiedRoutes === 0 && (pendingRoutes > 0 || routeCatalogData?.signs?.length > 0)) {
        resultsTitle.textContent = "Hay carteles identificados, pero faltan datos geográficos";
        const signCount = routeCatalogData?.signs?.length || 0;
        resultsDescription.textContent = `${signCount} carteles conservados en el catálogo local. Para calcular viajes reales faltan geometrías, sentido de circulación y paradas verificadas.`;
      } else if (activeRoutes.length === 0) {
        resultsTitle.textContent = "El catálogo local no contiene rutas";
        resultsDescription.textContent = "No hay recorridos ni carteles registrados en data/rutas.json.";
      } else {
        resultsTitle.textContent = "Hay rutas verificadas, pero no conectan estos puntos";
        resultsDescription.textContent = "Ninguna ruta completa conecta origen y destino dentro de los límites de caminata configurados.";
      }
      return;
    }

    const alternatives = result.alternatives.map((trip) => ({
      ...trip,
      dataMode: useDemo ? "demo" : "verified"
    }));
    try {
      sessionStorage.setItem("rutapp.lastRouteSearch", JSON.stringify({
        origin: state.origin,
        destination: state.destination,
        dataMode: useDemo ? "demo" : "verified",
        alternatives
      }));
    } catch (error) {
      console.error("No se pudo guardar la búsqueda en esta pestaña.", error);
      setMessage("Las alternativas se muestran, pero no podrán recuperarse al volver desde el detalle.", "error");
    }
    renderAlternatives(alternatives, useDemo ? "demo" : "verified");
  }

  async function useDemoPoints(exampleId) {
    const example = demoExamples.find((item) => item.id === exampleId);
    if (!example) return;
    demoToggle.checked = true;
    updateDemoMode();
    setInputError(originError, "");
    setInputError(destinationError, "");
    showInitialResults();
    demoExampleList.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    setMessage("Cargando el recorrido de ejemplo…");
    await demoRoutePromise;
    demoExampleList.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
    if (demoRouteError || !demoRouteCatalog) {
      setMessage("No se pudieron cargar los datos del recorrido. Comprueba data/rutas-demo.json.", "error");
      return;
    }
    const exampleData = demoRouteCatalog.examples[example.id];
    const availableRouteIds = new Set(demoRouteCatalog.routes.map((route) => route.id));
    if (!exampleData ||
        !Array.isArray(exampleData.routeIds) ||
        !exampleData.routeIds.every((routeId) => availableRouteIds.has(routeId)) ||
        !isValidDemoEndpoint(exampleData.origin) ||
        !isValidDemoEndpoint(exampleData.destination)) {
      setMessage("El recorrido seleccionado no está disponible en data/rutas-demo.json.", "error");
      return;
    }
    state.origin = {
      type: "demo",
      label: exampleData.origin.label,
      coordinates: {
        latitude: exampleData.origin.latitude,
        longitude: exampleData.origin.longitude,
        precision: "coordenadas de ejemplo"
      }
    };
    state.destination = {
      type: "demo",
      label: exampleData.destination.label,
      coordinates: {
        latitude: exampleData.destination.latitude,
        longitude: exampleData.destination.longitude,
        precision: "coordenadas de ejemplo"
      }
    };
    originDisplay.value = state.origin.label;
    updateDestinationValue(state.destination.label, state.destination);
    setInputError(originError, "");
    setInputError(destinationError, "");
    persistOrigin();
    setMessage(`«${example.label}» cargado. Pulsa «Buscar ruta» para ver las alternativas.`);
  }

  function initializeDestinationFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const destinationId = params.get("destinoId");
    if (destinationId) {
      const place = places.find((item) => item.id === destinationId);
      if (place) {
        choosePlace(place);
      } else {
        setInputError(destinationError, "El destino recibido no existe en el catálogo turístico.");
      }
      return;
    }

    const initialText = params.get("destino");
    if (initialText) {
      const normalizedText = initialText.trim().toLocaleLowerCase("es");
      const matchingPlace = places.find((place) =>
        place.name.trim().toLocaleLowerCase("es") === normalizedText
      );
      if (matchingPlace) {
        choosePlace(matchingPlace);
        return;
      }
      destinationInput.value = initialText;
      clearDestination.hidden = false;
      renderSuggestions(initialText);
      if (state.destination) return;
      setMessage("Confirma el destino con una sugerencia o selecciona un punto en el mapa.");
    }
  }

  document.querySelector("#pick-origin").addEventListener("click", () => openMap("origin"));
  document.querySelector("#pick-destination").addEventListener("click", () => openMap("destination"));
  document.querySelector("#cancel-map").addEventListener("click", closeMap);
  mapConfirm.addEventListener("click", confirmMapPoint);
  locateButton.addEventListener("click", requestLocation);
  document.querySelector("#swap-fields").addEventListener("click", swapPlaces);
  demoToggle.addEventListener("change", updateDemoMode);
  demoExampleList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-demo-example]");
    if (button) useDemoPoints(button.dataset.demoExample);
  });
  document.querySelector("#clear-destination").addEventListener("click", () => {
    updateDestinationValue("");
    destinationInput.focus();
    setMessage("");
  });
  document.querySelector("#close-map").addEventListener("click", closeMap);
  destinationInput.addEventListener("input", () => {
    state.destination = null;
    clearDestination.hidden = destinationInput.value.length === 0;
    setInputError(destinationError, "");
    renderSuggestions(destinationInput.value);
  });
  destinationInput.addEventListener("focus", () => renderSuggestions(destinationInput.value));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".route-search__field-group--destination")) {
      suggestions.hidden = true;
    }
  });
  mapDialog.addEventListener("click", (event) => {
    if (event.target === mapDialog) closeMap();
  });
  form.addEventListener("submit", searchRoutes);
  const routeDataPromise = RutApp.loadRoutes()
    .then((data) => {
      routeCatalogData = data;
      routeCatalog = data.routes;
    })
    .catch((error) => {
      routeCatalogError = error;
      console.error("No se pudo cargar la base de recorridos.", error);
    });
  const demoRoutePromise = RutApp.loadDemoRoutes()
    .then((data) => {
      demoRouteCatalog = data;
      renderDemoExamples();
    })
    .catch((error) => {
      demoRouteError = error;
      console.error("No se pudieron cargar los datos del recorrido de ejemplo.", error);
    });
  window.addEventListener("storage", (event) => {
    if (event.key === "rutapp.routeOrigin" && !event.newValue) {
      if (["gps", "map"].includes(state.origin?.type)) {
        state.origin = null;
        originDisplay.value = "Mi ubicación";
      }
    }
  });

  RutApp.loadPlaces()
    .then((loadedPlaces) => {
      places = loadedPlaces;
      restoreOrigin();
      initializeDestinationFromUrl();
      restoreLastSearch();
    })
    .catch((error) => {
      console.error("No se pudo cargar el catálogo de destinos.", error);
      setMessage("No se pudo cargar el catálogo. Las sugerencias de lugares no están disponibles.", "error");
      restoreOrigin();
      initializeDestinationFromUrl();
      restoreLastSearch();
    });

  showInitialResults();
  setMessage("Cargando rutas locales…");
  routeDataPromise.then(() => {
    if (routeCatalogError) {
      results.dataset.state = "empty";
      resultsTitle.textContent = "No se pudo cargar el archivo local de rutas";
      resultsDescription.textContent = "Revisa data/rutas.json. No se consultó una base de datos ni se asumió que el catálogo estuviera vacío.";
      if (routeMessage.textContent === "Cargando rutas locales…") {
        setMessage("No se pudo leer data/rutas.json.", "error");
      }
      return;
    }
    if (routeMessage.textContent === "Cargando rutas locales…") {
      const verifiedCount = routeCatalog.filter((route) => route.verificationStatus === "verified").length;
      const signCount = routeCatalogData.signs?.length || 0;
      setMessage(verifiedCount > 0
        ? `${verifiedCount} recorridos locales verificados disponibles.`
        : `${signCount} carteles locales registrados; los recorridos necesitan verificación geográfica.`);
    }
  });
})();