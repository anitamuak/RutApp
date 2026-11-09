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
