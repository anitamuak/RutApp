(function () {
  const root = document.getElementById("confirm-route-root");

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  
function getSelectedTrip() {
  const tripId = new URLSearchParams(
    window.location.search
  ).get("id");

  if (!tripId) return null;

  try {
    const stored = sessionStorage.getItem(
      `rutapp.trip.${tripId}`
    );

    if (!stored) return null;

    const trip = JSON.parse(stored);

    return String(trip.id) === tripId ? trip : null;
  } catch (error) {
    console.error("No se pudo recuperar la ruta.", error);
    return null;
  }
}


  

  function renderEmpty() {
    root.replaceChildren();
    const page = make("section", "confirm-route-page");
    const card = make("section", "confirm-route-card");
    card.append(
      make("h1", "", "No se encontró la ruta"),
      make("p", "confirm-route-subtitle", "Vuelve a la búsqueda y selecciona una alternativa.")
    );

    const backLink = make("a", "secondary", "Volver a buscar");
    backLink.href = "buscar-ruta.html?restaurar=1";

    const actions = make("div", "confirm-route-actions");
    actions.append(backLink);
    card.append(actions);
    page.append(card);
    root.append(page);
  }

  
async function loadNearbyPlaces(trip, section) {
  const status = make(
    "p",
    "confirm-route-subtitle",
    "Buscando lugares de interés cercanos..."
  );
  section.append(status);

  // Solo usamos los trazados de los buses.
  const paths = trip.itinerary
    .filter(step =>
      step.type === "bus" &&
      Array.isArray(step.geometry)
    )
    .map(step => step.geometry);

  if (!paths.length) {
    status.textContent =
      "Este recorrido todavía no tiene un trazado disponible.";
    return;
  }

  try {
    const response = await fetch("../data/lugares.json");

    if (!response.ok) {
      throw new Error("No se pudo cargar el catálogo.");
    }

    const places = await response.json();

    // Reutilizamos el mismo cálculo de la pantalla del mapa.
    const nearby = window.RutAppNearbyPlaces
      .findPlacesNearPaths(places, paths, 500);

    if (!nearby.length) {
      status.textContent =
        "No encontramos lugares turísticos del catálogo a menos de 500 m del recorrido.";
      return;
    }

    let favoriteIds = new Set();

    try {
      const saved = JSON.parse(
        localStorage.getItem("rutapp.favorites") || "[]"
      );

      if (Array.isArray(saved)) {
        favoriteIds = new Set(saved.map(String));
      }
    } catch (error) {
      console.warn("No se pudieron leer los favoritos.", error);
    }

    status.textContent =
      `${nearby.length} lugar(es) a 500 m o menos del trazado.`;

    const list = make("div", "confirm-route-places");

    nearby.forEach(({ place, distance }) => {
      const card = make("article", "confirm-route-place");

      if (typeof place.imagen === "string" && place.imagen) {
        const image = make("img", "confirm-route-place__image");

        image.src = place.imagen.startsWith("../")
          ? place.imagen
          : `../${place.imagen}`;

        image.alt = place.nombre;
        image.loading = "lazy";

        image.addEventListener("error", () => image.remove());

        card.append(image);
      }

      const info = make("div", "confirm-route-place__info");

      info.append(
        make("h3", "", place.nombre),
        make(
          "p",
          "",
          place.categoriaEtiqueta || "Lugar turístico"
        ),
        make(
          "span",
          "confirm-route-place__distance",
          `A ${Math.round(distance)} m aprox. del recorrido`
        )
      );

      if (favoriteIds.has(String(place.id))) {
        info.append(
          make(
            "span",
            "confirm-route-place__favorite",
            "♥ En tus favoritos"
          )
        );
      }

      const link = make(
        "a",
        "confirm-route-place__link",
        "Ver lugar →"
      );

      link.href =
        `detalle-lugar.html?id=${encodeURIComponent(place.id)}`;

      info.append(link);
      card.append(info);
      list.append(card);
    });

    section.append(list);

    section.append(
      make(
        "p",
        "confirm-route-note",
        "La distancia es aproximada respecto al trazado del bus, no la distancia caminando. Los recorridos de demostración aún no están verificados."
      )
    );

  } catch (error) {
    console.error("Error cargando lugares cercanos:", error);

    status.textContent =
      "No se pudieron cargar los lugares cercanos.";
  }
}


  function render() {
    const trip = getSelectedTrip();

    if (!trip) {
      renderEmpty();
      return;
    }

    root.replaceChildren();

    const page = make("section", "confirm-route-page");

    const header = make("header", "confirm-route-header");

    const backButton = make("button", "confirm-route-back", "←");
    backButton.type = "button";
    backButton.addEventListener("click", () => {
      window.location.href = "buscar-ruta.html?restaurar=1";
    });

    const brand = make("div", "confirm-route-brand");
    const logo = make("img");
    logo.src = "../assets/images/logo.png";
    logo.alt = "RutApp";
    brand.append(
      logo,
      make("strong", "", "RutApp")
    );

    header.append(backButton, brand);

    const card = make("section", "confirm-route-card");
    card.append(
      make("h1", "", "Confirma tu ruta"),
      make(
        "p",
        "confirm-route-subtitle",
        `${trip.origin.label} → ${trip.destination.label}`
      )
    );

    const summary = make("section", "confirm-route-section");
    summary.append(
      make("h2", "", trip.routeNames.join(" → ")),
      make(
        "p",
        "confirm-route-subtitle",
        `${trip.buses} bus${trip.buses === 1 ? "" : "es"} · ${trip.transfers} transbordo${trip.transfers === 1 ? "" : "s"} · ${trip.estimatedMinutes} min aprox.`
      )
    );

    
    // Información ampliada antes de seleccionar la ruta.
    const previewInfo = make("section", "confirm-route-section");

    previewInfo.append(
      make("h2", "", "Información del recorrido")
    );

    const busSteps = trip.itinerary.filter(
      (step) => step.type === "bus"
    );

    const busList = make("div", "confirm-route-buses");

    busSteps.forEach((step, index) => {
      const busCard = make("article", "confirm-route-bus");

      busCard.append(
        make(
          "h3",
          "confirm-route-bus__title",
          `Bus ${index + 1}: ${step.routeName}`
        )
      );

      // Cartel de referencia del bus.
      const posterSection = make(
        "div",
        "confirm-route-media"
      );

      posterSection.append(
        make("h4", "", "Cartel del bus")
      );

      if (step.poster) {
        const poster = make(
          "img",
          "confirm-route-poster"
        );

        poster.src = step.poster;
        poster.alt = `Cartel ilustrativo de ${step.routeName}`;
        poster.loading = "lazy";

        poster.addEventListener("error", () => {
          poster.replaceWith(
            make("p", "confirm-route-placeholder", "Imagen de cartel no disponible")
          );
        });

        posterSection.append(poster);
      } else {
        posterSection.append(
          make(
            "p",
            "confirm-route-placeholder",
            "Cartel pendiente de asociar a este recorrido"
          )
        );
      }

      busCard.append(posterSection);

      // Fotografía ilustrativa del vehículo.
      // Solo está configurada para Universidad–Rodadero.
      if (step.routeId === "demo-unimag-rodadero") {
        const vehicleSection = make(
          "div",
          "confirm-route-media"
        );

        vehicleSection.append(
          make("h4", "", "Imagen del vehículo")
        );

        const busImage = make(
          "img",
          "confirm-route-vehicle"
        );

        busImage.src = "../assets/images/bus.jpg";
        busImage.alt = "Fotografía ilustrativa de un bus";
        busImage.loading = "lazy";

        vehicleSection.append(busImage);
        busCard.append(vehicleSection);
      }

      // Puntos de abordaje y descenso.
      const stops = make(
        "div",
        "confirm-route-stops"
      );

      const boarding = make(
        "div",
        "confirm-route-stop confirm-route-stop--boarding"
      );

      boarding.append(
        make("strong", "", "Punto de abordaje"),
        make("span", "", step.board.name)
      );

      const alighting = make(
        "div",
        "confirm-route-stop confirm-route-stop--alighting"
      );

      alighting.append(
        make("strong", "", "Punto de descenso"),
        make("span", "", step.alight.name)
      );

      stops.append(boarding, alighting);
      busCard.append(stops);

      busList.append(busCard);
    });

    previewInfo.append(busList);

    previewInfo.append(
      make(
        "p",
        "confirm-route-note",
        "Los carteles, vehículos y puntos de abordaje de los recorridos de demostración son referencias ilustrativas pendientes de verificación."
      )
    );


    const actions = make("div", "confirm-route-actions");

    const backLink = make("a", "secondary", "Volver");
    backLink.href = "buscar-ruta.html?restaurar=1";

    
const selectLink = make("a", "primary", "Seleccionar ruta");

selectLink.href = `detalle-ruta.html?id=${encodeURIComponent(trip.id)}`;

selectLink.addEventListener("click", (event) => {
  event.preventDefault();

  try {
    sessionStorage.setItem("rutapp.selectedTripId", trip.id);
    sessionStorage.setItem("rutapp.selectedTrip", JSON.stringify(trip));

    window.location.href = selectLink.href;
  } catch (error) {
    console.error("No se pudo seleccionar la ruta.", error);
    alert("No se pudo seleccionar la ruta. Inténtalo nuevamente.");
  }
});


    actions.append(backLink, selectLink);

    const note = make(
      "p",
      "confirm-route-note",
      "En el siguiente paso se mostrará el mapa completo y el detalle de cómo llegar."
    );

    
const nearbySection = make(
  "section",
  "confirm-route-section confirm-route-nearby"
);

nearbySection.append(
  make(
    "h2",
    "",
    "Lugares de interés cerca del recorrido"
  )
);

card.append(
  summary,
  previewInfo,
  nearbySection,
  actions,
  note
);

loadNearbyPlaces(trip, nearbySection);


    page.append(header, card);
    root.append(page);
  }

  render();
})();