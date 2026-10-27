(() => {
  const originInput = document.querySelector("#origin");
  const destinationInput = document.querySelector("#destination");
  const locateButton = document.querySelector("#locate-button");
  const swapButton = document.querySelector("#swap-button");
  const routeForm = document.querySelector("#route-form");
  const routeStatus = document.querySelector("#route-status");
  const featuredList = document.querySelector("#featured-list");
  let originCoordinates = null;
  let destinationCoordinates = null;
  let locationRequestPending = false;
  let locationRequestId = 0;

  function showLocationError(error) {
    if (error.code === 1) {
      RutApp.setStatus(routeStatus, "No se concedió el permiso de ubicación. Puedes escribir el origen manualmente.", "error");
    } else if (error.code === 2) {
      RutApp.setStatus(routeStatus, "El dispositivo no pudo determinar la ubicación. Inténtalo de nuevo o escribe el origen.", "error");
    } else if (error.code === 3) {
      RutApp.setStatus(routeStatus, "Se agotó el tiempo para obtener la ubicación. Inténtalo de nuevo.", "error");
    } else {
      RutApp.setStatus(routeStatus, "No fue posible obtener la ubicación. Inténtalo de nuevo o escribe el origen.", "error");
    }
  }

  function requestLocation() {
    if (locationRequestPending) return;

    if (!window.isSecureContext) {
      RutApp.setStatus(routeStatus, "La ubicación requiere una página segura (HTTPS o localhost). Puedes escribir el origen manualmente.", "error");
      return;
    }

    if (!("geolocation" in navigator)) {
      RutApp.setStatus(routeStatus, "Este navegador no admite geolocalización. Puedes escribir el origen manualmente.", "error");
      return;
    }

    locationRequestPending = true;
    const requestId = ++locationRequestId;
    locateButton.disabled = true;
    locateButton.setAttribute("aria-busy", "true");
    RutApp.setStatus(routeStatus, "Obteniendo ubicación…");

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (requestId !== locationRequestId) return;
          originCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          try {
            sessionStorage.setItem("rutapp.routeOrigin", JSON.stringify({
              type: "gps",
              label: "Ubicación obtenida",
              coordinates: originCoordinates
            }));
          } catch (error) {
            console.error("No se pudo conservar la ubicación para la búsqueda de rutas.", error);
          }
          originInput.value = "Ubicación obtenida";
          RutApp.setStatus(routeStatus, "Ubicación obtenida. Las coordenadas solo se conservan en esta página.");
          locationRequestPending = false;
          locateButton.disabled = false;
          locateButton.removeAttribute("aria-busy");
        },
        (error) => {
          if (requestId !== locationRequestId) return;
          originCoordinates = null;
          showLocationError(error);
          locationRequestPending = false;
          locateButton.disabled = false;
          locateButton.removeAttribute("aria-busy");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    } catch (error) {
      if (requestId !== locationRequestId) return;
      console.error("La solicitud de geolocalización falló.", error);
      locationRequestPending = false;
      locateButton.disabled = false;
      locateButton.removeAttribute("aria-busy");
      RutApp.setStatus(routeStatus, "No fue posible iniciar la solicitud de ubicación. Puedes escribir el origen manualmente.", "error");
    }
  }

  locateButton.addEventListener("click", requestLocation);
  originInput.addEventListener("input", () => {
    originCoordinates = null;
    try {
      sessionStorage.removeItem("rutapp.routeOrigin");
    } catch (error) {
      console.error("No se pudo borrar la ubicación guardada.", error);
    }
    if (locationRequestPending) {
      locationRequestPending = false;
      locationRequestId += 1;
      locateButton.disabled = false;
      locateButton.removeAttribute("aria-busy");
    }
    RutApp.setStatus(routeStatus, "");
  });
  destinationInput.addEventListener("input", () => {
    destinationCoordinates = null;
  });

  swapButton.addEventListener("click", () => {
    const origin = originInput.value.trim();
    const destination = destinationInput.value.trim();
    if (!origin || !destination) {
      RutApp.setStatus(routeStatus, "Escribe un origen y un destino para poder intercambiarlos.", "error");
      return;
    }

    originInput.value = destination;
    destinationInput.value = origin;
    [originCoordinates, destinationCoordinates] = [destinationCoordinates, originCoordinates];
    RutApp.setStatus(routeStatus, "Origen y destino intercambiados.");
  });

  routeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!destinationInput.value.trim()) {
      destinationInput.focus();
      RutApp.setStatus(routeStatus, "Escribe un destino antes de buscar una ruta.", "error");
      return;
    }
    if (!originInput.value.trim()) {
      originInput.focus();
      RutApp.setStatus(routeStatus, "Escribe un origen o solicita tu ubicación antes de buscar.", "error");
      return;
    }

    if (!window.isSecureContext && originInput.value === "Ubicación obtenida") {
      RutApp.setStatus(routeStatus, "La ubicación ya no está disponible en esta página. Elige un origen en Buscar ruta.", "error");
      return;
    }

    if (originCoordinates) {
      try {
        sessionStorage.setItem("rutapp.routeOrigin", JSON.stringify({
          type: "gps",
          label: "Ubicación obtenida",
          coordinates: originCoordinates
        }));
      } catch (error) {
        console.error("No se pudo conservar la ubicación para la búsqueda de rutas.", error);
      }
    }

    const params = new URLSearchParams();
    params.set("destino", destinationInput.value.trim());
    window.location.href = `buscar-ruta.html?${params.toString()}`;
  });

  function renderFeatured(places) {
    const featured = places.slice(0, 4);
    featuredList.replaceChildren(...featured.map((place) => {
      const card = document.createElement("article");
      card.className = "featured-card";
      const link = document.createElement("a");
      link.className = "featured-card__image-link";
      link.href = `detalle-lugar.html?id=${encodeURIComponent(place.id)}`;
      link.setAttribute("aria-label", `Ver ${place.name}`);

      if (place.image) {
        const image = document.createElement("img");
        image.className = "featured-card__image";
        image.src = `../${place.image}`;
        image.alt = place.name;
        image.loading = "lazy";
        image.addEventListener("error", () => {
          image.remove();
          link.classList.add("featured-card__image-link--empty");
        }, { once: true });
        link.append(image);
      } else {
        link.classList.add("featured-card__image-link--empty");
      }

      const name = document.createElement("a");
      name.className = "featured-card__name";
      name.href = link.href;
      name.textContent = place.name;
      card.append(link, name);
      return card;
    }));
  }

  RutApp.loadPlaces()
    .then(renderFeatured)
    .catch((error) => {
      console.error("No se pudieron cargar los lugares destacados.", error);
      featuredList.innerHTML = '<p class="empty-state">No se pudieron cargar los lugares. Recarga la página para volver a intentarlo.</p>';
    });
})();
