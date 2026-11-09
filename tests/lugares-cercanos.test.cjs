const test = require("node:test");
const assert = require("node:assert/strict");
const nearby = require("../js/lugares-cercanos.js");

// Línea de bus recta hacia el este, sobre el paralelo 11°N.
const path = [[11, -74.2], [11, -74.19], [11, -74.18]];
const place = (id, latitud, longitud) => ({ id, nombre: id, latitud, longitud });

test("incluye lugares dentro del radio y los ordena por cercanía", () => {
  const result = nearby.findPlacesNearPaths(
    [place("lejos", 11.006, -74.19), place("cerca", 11.001, -74.19), place("sobre", 11, -74.185)],
    [path], 500
  );
  assert.deepEqual(result.map((r) => r.place.id), ["sobre", "cerca"]);
  assert.ok(result[1].distance > 100 && result[1].distance < 120);
});

test("mide la distancia al segmento y no solo a los vértices", () => {
  const d = nearby.distanceToPathMeters([11.001, -74.195], path);
  assert.ok(d < 115, `distancia ${d}`);
});

test("ignora lugares sin coordenadas y rutas sin geometría", () => {
  assert.deepEqual(nearby.findPlacesNearPaths([{ id: "x", nombre: "x" }], [path]), []);
  assert.deepEqual(nearby.findPlacesNearPaths([place("a", 11, -74.19)], [[[11, -74.19]]]), []);
});

test("con el catálogo real no inventa coincidencias lejos del recorrido", () => {
  const catalog = require("../data/lugares.json");
  const far = [[0, 0], [0, 0.01]];
  assert.deepEqual(nearby.findPlacesNearPaths(catalog, [far]), []);
});

test("la ruta demo solo muestra lugares de Explorar cercanos con coordenadas", () => {
  const catalog = require("../data/lugares.json");
  const route = require("../data/rutas-demo.json").routes.find(
    (item) => item.id === "demo-unimag-rodadero"
  );
  const result = nearby.findPlacesNearPaths(catalog, [route.geometry], 500);

  assert.deepEqual(result.map(({ place }) => place.id), [
    "museo-del-oro-tairona",
    "parque-de-bolivar",
    "el-rodadero",
    "centro-historico",
    "camellon-de-la-bahia",
    "marina-santa-marta",
    "catedral-santa-marta",
    "parque-de-los-novios"
  ]);
  assert.ok(result.every(({ distance }) => distance < 100));
  assert.ok(result.every(({ place }) =>
    Number.isFinite(place.latitud) && Number.isFinite(place.longitud)
  ));

  const newlyLocatedIds = [
    "playa-grande-taganga",
    "sierra-nevada",
    "quinta-san-pedro"
  ];
  assert.ok(newlyLocatedIds.every((id) =>
    Number.isFinite(catalog.find((place) => place.id === id)?.latitud) &&
    Number.isFinite(catalog.find((place) => place.id === id)?.longitud)
  ));
  assert.ok(newlyLocatedIds.every((id) =>
    !result.some(({ place }) => place.id === id)
  ));
});

test("actualiza el pin y la vista previa al cambiar un favorito", async () => {
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.attributes = {};
      this.textContent = "";
      this.className = "";
    }

    append(...elements) {
      this.children.push(...elements);
    }

    setAttribute(name, value) {
      this.attributes[name] = value;
    }

    addEventListener() {}
  }

  const originals = new Map(
    ["document", "fetch", "localStorage", "window"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)
    ])
  );
  const listeners = new Map();
  const mapSection = {
    parentElement: { querySelector: () => null },
    after() {}
  };
  const markers = [];

  globalThis.document = { createElement: (tag) => new Element(tag) };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [place("near", 11, -74.19)]
  });
  globalThis.localStorage = { getItem: () => "[]" };
  globalThis.window = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name)
  };

  const map = {
    getContainer: () => ({ closest: () => mapSection }),
    setView() {},
    getZoom: () => 12
  };
  const leaflet = {
    divIcon: (options) => options,
    marker: (_point, options) => {
      const marker = {
        icon: options.icon,
        addTo: () => marker,
        bindPopup: (popup) => {
          marker.popup = popup;
          return marker;
        },
        openPopup() {},
        setIcon: (icon) => {
          marker.icon = icon;
        }
      };
      markers.push(marker);
      return marker;
    }
  };

  try {
    await nearby.show(leaflet, map, {
      itinerary: [{ type: "bus", geometry: path }]
    });

    assert.equal(markers.length, 1);
    assert.doesNotMatch(markers[0].icon.html, /is-favorite/);
    listeners.get("rutapp:favorites-change")({
      detail: { favorites: ["near"] }
    });

    assert.match(markers[0].icon.html, /is-favorite/);
    assert.match(markers[0].popup.children[0].children[1].textContent, /Favorito guardado/);
    listeners.get("rutapp:favorites-change")({ detail: { favorites: [] } });
    assert.doesNotMatch(markers[0].icon.html, /is-favorite/);
  } finally {
    originals.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
});
