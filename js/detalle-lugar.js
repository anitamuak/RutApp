(() => {
  const root = document.querySelector("#place-detail");
  const placeId = new URLSearchParams(window.location.search).get("id");
  const unavailableMessage = "Consultar información oficial";
  let place = null;

  const icons = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4"/></svg>',
    location: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18m4-14c-.7-1-2-1.5-4-1.5-2.2 0-3.5 1-3.5 2.6 0 4 7 1.5 7 5.7 0 1.7-1.5 2.7-3.7 2.7-1.8 0-3.3-.6-4.3-1.8"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="4"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    bus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14l2 5v9a1 1 0 0 1-1 1h-1v1h-2v-1H7v1H5v-1H4a1 1 0 0 1-1-1v-9l2-5Zm0 5h14l-1.3-3H6.3L5 10Zm1.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm11 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>'
  };

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setMessage(message, kind = "info") {
    const element = document.querySelector("#place-detail-message");
    if (!element) return;
    element.textContent = message;
    element.dataset.kind = kind;
  }

  function getDirectionsUrl() {
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    const destination = place.coordinates
      ? `${place.coordinates.lat},${place.coordinates.lon}`
      : `${place.name}, ${place.location}`;
    url.searchParams.set("destination", destination);
    try {
      const savedOrigin = sessionStorage.getItem("rutapp.routeOrigin");
      const origin = savedOrigin ? JSON.parse(savedOrigin) : null;
      if (Number.isFinite(origin?.coordinates?.latitude) &&
          Number.isFinite(origin?.coordinates?.longitude)) {
        url.searchParams.set(
          "origin",
          `${origin.coordinates.latitude},${origin.coordinates.longitude}`
        );
      }
    } catch (error) {
      console.error("No se pudo leer el origen guardado para Cómo llegar.", error);
    }
    return url.href;
  }

  function syncFavoriteButtons() {
    const isFavorite = RutApp.getFavorites().includes(place.id);
    root.querySelectorAll("[data-favorite-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", String(isFavorite));
      button.setAttribute("aria-label", isFavorite
        ? `Quitar ${place.name} de favoritos`
        : `Agregar ${place.name} a favoritos`);
      const label = button.querySelector("[data-favorite-label]");
      if (label) label.textContent = isFavorite ? "Quitar de favoritos" : "Agregar a favoritos";
    });
  }

  function createHero() {
    const hero = make("section", "place-detail__hero");
    hero.setAttribute("aria-label", `Fotografía de ${place.name}`);
    if (place.image) {
      const image = make("img", "place-detail__image");
      image.src = `../${place.image}`;
      image.alt = place.name;
      image.addEventListener("error", () => {
        image.hidden = true;
        image.alt = "";
      }, { once: true });
      hero.append(image);
    }

    const topbar = make("div", "place-detail__topbar");
    const back = make("a", "place-detail__back");
    back.href = "explorar.html";
    back.setAttribute("aria-label", "Volver al catálogo");
    back.innerHTML = icons.back;
    back.addEventListener("click", (event) => {
      if (window.history.length > 1) {
        event.preventDefault();
        window.history.back();
      }
    });

    const brand = make("a", "place-detail__brand");
    brand.href = "inicio.html";
    brand.innerHTML = '<img src="../assets/images/logo.png" alt=""><span class="place-detail__brand-copy"><strong>RutApp</strong><small>Santa Marta en tu ruta</small></span>';

    const actions = make("div", "place-detail__hero-actions");
    const favorite = make("button", "place-detail__icon-button place-detail__favorite-top");
    favorite.type = "button";
    favorite.dataset.favoriteToggle = "";
    favorite.setAttribute("aria-label", "Agregar a favoritos");
    favorite.innerHTML = icons.heart;
    favorite.addEventListener("click", toggleFavorite);

    const share = make("button", "place-detail__icon-button");
    share.type = "button";
    share.setAttribute("aria-label", `Compartir ${place.name}`);
    share.title = "Compartir lugar";
    share.innerHTML = icons.share;
    share.addEventListener("click", sharePlace);

    actions.append(favorite, share);
    topbar.append(back, brand, actions);

    const label = make("div", "place-detail__hero-label");
    label.innerHTML = icons.location;
    label.append(make("span", "", place.name));
    hero.append(topbar, label);
    return hero;
  }

  function createFact(icon, title, value) {
    const fact = make("div", "place-detail__fact");
    const iconWrapper = make("span", "place-detail__fact-icon");
    iconWrapper.innerHTML = icon;
    fact.append(iconWrapper, make("strong", "", title), make("span", "", value || unavailableMessage));
    return fact;
  }

  function createMapSection() {
    const section = make("section", "place-detail__location-section");
    section.append(make("h2", "", "Ubicación"));
    if (!place.coordinates) {
      const note = make("p", "place-detail__map-note", "No hay coordenadas verificadas para mostrar un marcador de este lugar. Puedes buscar su nombre en el mapa.");
      const search = make("a", "place-detail__map-button", "Buscar en Google Maps");
      search.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.location}`)}`;
      search.target = "_blank";
      search.rel = "noopener noreferrer";
      section.append(note, search);
      return section;
    }

    const mapShell = make("div", "place-detail__map");
    const mapCanvas = make("div", "place-detail__map-canvas");
    mapCanvas.id = "place-map";
    mapCanvas.setAttribute("role", "application");
    mapCanvas.setAttribute("aria-label", `Mapa interactivo de ${place.name}`);

    const directions = make("a", "place-detail__map-button");
    directions.href = getDirectionsUrl();
    directions.target = "_blank";
    directions.rel = "noopener noreferrer";
    directions.innerHTML = `${icons.location}<span>Cómo llegar</span>`;
    mapShell.append(mapCanvas, directions);
    section.append(mapShell);

    const precision = place.coordinates.precision;
    const coordinateNote = precision && precision !== "sitio"
      ? `El marcador representa una ubicación aproximada (${precision}), no una entrada exacta.`
      : "La ubicación procede del catálogo de RutApp. Confirma los accesos y condiciones antes de viajar.";
    section.append(make("p", "place-detail__map-note", coordinateNote));
    if (place.coordinates.source) {
      const source = make("a", "place-detail__coordinate-source", "Ver punto en OpenStreetMap");
      source.href = place.coordinates.source;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      section.append(source);
    }

    requestAnimationFrame(() => {
      const maps = window.RutAppGoogleMaps;
      if (!maps) {
        mapCanvas.replaceWith(make("p", "place-detail__map-state", "No está disponible el cargador de Google Maps."));
        setMessage("No se pudo iniciar el mapa de Google.", "error");
        return;
      }

      maps.load()
        .then((googleMaps) => {
          if (!mapCanvas.isConnected) return;
          const position = { lat: place.coordinates.lat, lng: place.coordinates.lon };
          const placeMap = maps.createMap(googleMaps, mapCanvas, {
            center: position,
            zoom: place.coordinates.zoom || 15,
            scrollwheel: false,
            fullscreenControl: false
          });
          const marker = new googleMaps.Marker({
            map: placeMap,
            position,
            title: place.name
          });
          const info = new googleMaps.InfoWindow({
            content: make("span", "", place.name)
          });
          marker.addListener("click", () => info.open({ map: placeMap, anchor: marker }));
          info.open({ map: placeMap, anchor: marker });
        })
        .catch((error) => {
          console.error("No se pudo cargar Google Maps para el lugar.", error);
          mapCanvas.replaceWith(make("p", "place-detail__map-state", error.message));
          setMessage(error.message, "error");
        });
    });

    return section;
  }

  function createBody() {
    const body = make("div", "place-detail__body");
    const titleRow = make("div", "place-detail__title-row");
    titleRow.append(make("h1", "place-detail__title", place.name));
    const badge = make("span", "place-detail__badge");
    badge.innerHTML = `${icons.sun}<span>Lugar turístico</span>`;
    titleRow.append(badge);

    const category = make("p", "place-detail__category");
    category.innerHTML = icons.location;
    category.append(make("span", "", place.categoryLabel));

    const description = make("p", "place-detail__description", place.description);
    const facts = make("div", "place-detail__facts");
    facts.append(
      createFact(icons.clock, "Horario", place.details?.schedule),
      createFact(icons.ticket, "Entrada", place.details?.admission),
      createFact(icons.camera, "Ideal para", place.details?.idealFor || place.categoryLabel),
      createFact(icons.star, "Recomendado", place.details?.recommended)
    );

    const actions = make("div", "place-detail__actions");
    const favorite = make("button", "place-detail__action place-detail__action--favorite");
    favorite.type = "button";
    favorite.dataset.favoriteToggle = "";
    favorite.innerHTML = `${icons.heart}<span data-favorite-label>Agregar a favoritos</span>`;
    favorite.addEventListener("click", toggleFavorite);

    const route = make("a", "place-detail__action place-detail__action--route");
    route.href = `buscar-ruta.html?destinoId=${encodeURIComponent(place.id)}`;
    route.innerHTML = `${icons.bus}<span>Buscar ruta a este lugar</span>`;
    actions.append(favorite, route);

    const visit = make("section", "place-detail__visit-info");
    visit.append(make("h2", "", "Información para la visita"));
    appendInfoRow(visit, "Tipo de acceso", place.tipoAcceso);
    appendInfoRow(visit, "Costos adicionales", place.costosAdicionales);
    appendInfoRow(visit, "Servicios incluidos", place.incluye || "No hay servicios incluidos confirmados en el catálogo.");
    if (place.costos?.tarifas?.length) {
      appendInfoRow(visit, "Tarifas", place.costos.tarifas.join(" · "));
    }
    const sourceRow = make("div", "place-detail__info-row");
    sourceRow.append(make("strong", "", "Fuente oficial"));
    if (place.fuenteOficial) {
      const source = make("a", "", "Consultar información del responsable");
      source.href = place.fuenteOficial;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      sourceRow.append(source);
    } else {
      sourceRow.append(make("span", "", "No hay una fuente oficial registrada."));
    }
    visit.append(sourceRow);
    appendInfoRow(
      visit,
      "Verificación de tarifas y horarios",
      place.fechaVerificacion
        ? `Comprobado el ${place.fechaVerificacion}.`
        : "Pendiente: no se pudo confirmar información vigente de tarifas y horarios."
    );
    if (Array.isArray(place.recomendaciones) && place.recomendaciones.length) {
      appendInfoRow(visit, "Recomendaciones", place.recomendaciones.join(" "));
    }

    body.append(titleRow, category, description, facts, visit, createMapSection(), actions);
    const message = make("p", "place-detail__message");
    message.id = "place-detail-message";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    body.append(message);
    return body;
  }

  function appendInfoRow(parent, label, value) {
    const row = make("div", "place-detail__info-row");
    row.append(make("strong", "", label), make("span", "", value || "Consultar información oficial."));
    parent.append(row);
  }

  function toggleFavorite() {
    try {
      const isFavorite = RutApp.toggleFavorite(place.id);
      syncFavoriteButtons();
      setMessage(isFavorite ? "Lugar añadido a tus favoritos." : "Lugar eliminado de tus favoritos.");
    } catch (error) {
      console.error("No se pudo actualizar favoritos.", error);
      setMessage("No se pudieron guardar los favoritos en este dispositivo.", "error");
    }
  }

  async function sharePlace() {
    const url = new URL(`detalle-lugar.html?id=${encodeURIComponent(place.id)}`, window.location.href).href;
    const shareData = { title: `RutApp · ${place.name}`, text: `${place.name} — ${place.location}`, url };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setMessage("Lugar compartido.");
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("No se pudo compartir el lugar.", error);
          setMessage("No se pudo compartir el lugar. Puedes copiar el enlace desde la barra del navegador.", "error");
        }
      }
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = make("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("El navegador no permitió copiar el enlace.");
      }
      setMessage("Enlace copiado al portapapeles.");
    } catch (error) {
      console.error("No se pudo copiar el enlace.", error);
      setMessage("No se pudo copiar automáticamente. Copia el enlace de esta página desde el navegador.", "error");
    }
  }

  function showNotFound(message) {
    root.replaceChildren();
    const error = make("section", "place-detail__error");
    error.append(make("h1", "", "No encontramos este lugar"), make("p", "", message));
    const link = make("a", "", "Volver al catálogo turístico");
    link.href = "explorar.html";
    error.append(link);
    root.append(error);
  }

  window.addEventListener("rutapp:favorites-change", () => {
    if (!place) return;
    try {
      syncFavoriteButtons();
    } catch (error) {
      console.error("No se pudieron sincronizar favoritos.", error);
    }
  });
  window.addEventListener("storage", () => {
    if (!place) return;
    try {
      syncFavoriteButtons();
    } catch (error) {
      console.error("No se pudieron sincronizar favoritos.", error);
    }
  });

  if (!placeId) {
    showNotFound("La URL no incluye un identificador de destino.");
  } else {
    RutApp.loadPlaces()
      .then((places) => {
        place = places.find((item) => item.id === placeId);
        if (!place) {
          showNotFound("El identificador no existe en el catálogo compartido.");
          return;
        }
        document.title = `RutApp | ${place.name}`;
        root.replaceChildren(createHero(), createBody());
        syncFavoriteButtons();
      })
      .catch((error) => {
        console.error("No se pudo cargar el detalle del lugar.", error);
        showNotFound("No se pudo cargar el catálogo. Comprueba que la página se esté ejecutando mediante Live Server y vuelve a intentarlo.");
      });
  }
})();
