const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const planner = require("../js/route-planner.js");
const routeCatalog = require("../data/rutas.json");

const point = (longitude, latitude = 0) => [latitude, longitude];

function route(id, start, end, extra = {}) {
  const longitudeStep = (end - start) / 2;
  return {
    id,
    name: `Ruta ${id}`,
    direction: "fixture: ida",
    verificationStatus: "verified",
    source: "fixture://synthetic-test-only",
    geometry: [point(start), point(start + longitudeStep), point(end)],
    stops: [
      { id: `${id}-1`, name: `${id} parada 1`, sequence: 1, latitude: 0, longitude: start },
      { id: `${id}-2`, name: `${id} parada 2`, sequence: 2, latitude: 0, longitude: start + longitudeStep },
      { id: `${id}-3`, name: `${id} parada 3`, sequence: 3, latitude: 0, longitude: end }
    ],
    ...extra
  };
}

const options = {
  maxAccessWalkMeters: 300,
  maxTransferWalkMeters: 180,
  walkingDistanceCorrection: 1,
  estimatedWaitMinutesPerBus: 0
};

test("calcula un viaje directo sobre la geometría y en el sentido de circulación", () => {
  const result = planner.search(
    [route("A", 0, 0.004)],
    { label: "Origen", coordinates: point(0.0002, 0.0001) },
    { label: "Destino", coordinates: point(0.0038, 0.0001) },
    options
  );

  assert.ok(result.alternatives.length >= 1);
  assert.equal(result.alternatives[0].buses, 1);
  assert.equal(result.alternatives[0].transfers, 0);
  assert.ok(result.alternatives[0].busDistanceMeters > 300);
  assert.equal(result.alternatives[0].itinerary.filter((step) => step.type === "bus").length, 1);
});

test("encuentra una conexión de dos rutas con un transbordo peatonal cercano", () => {
  const result = planner.search(
    [route("A", 0, 0.004), route("B", 0.0041, 0.008)],
    { label: "Origen", coordinates: point(0.0001) },
    { label: "Destino", coordinates: point(0.0079) },
    options
  );

  assert.ok(result.alternatives.length > 0);
  assert.equal(result.alternatives[0].buses, 2);
  assert.equal(result.alternatives[0].transfers, 1);
  assert.equal(result.alternatives[0].routeIds.length, 2);
  assert.ok(result.alternatives[0].itinerary.some((step) => step.title === "Camina al siguiente punto de abordaje"));
});

test("encuentra un viaje con dos transbordos sin repetir rutas", () => {
  const result = planner.search(
    [route("A", 0, 0.004), route("B", 0.0041, 0.008), route("C", 0.0081, 0.012)],
    { label: "Origen", coordinates: point(0.0001) },
    { label: "Destino", coordinates: point(0.0119) },
    options
  );

  const trip = result.alternatives.find((alternative) => alternative.buses === 3);
  assert.ok(trip);
  assert.equal(trip.transfers, 2);
  assert.equal(new Set(trip.routeIds).size, trip.routeIds.length);
});

test("no genera alternativa si no hay recorridos reales completos", () => {
  const result = planner.search(
    [],
    { label: "Origen", coordinates: point(0) },
    { label: "Destino", coordinates: point(0.001) }
  );
  assert.deepEqual(result.alternatives, []);
});

test("descarta rutas no verificadas y geometría incompleta", () => {
  const incomplete = route("incomplete", 0, 0.004, { geometry: [point(0)] });
  const unverified = route("unverified", 0, 0.004, { verificationStatus: "pending" });
  const result = planner.search(
    [incomplete, unverified],
    { label: "Origen", coordinates: point(0) },
    { label: "Destino", coordinates: point(0.004) },
    options
  );

  assert.equal(result.alternatives.length, 0);
  assert.equal(result.rejected.length, 2);
});

test("rechaza coordenadas de entrada no válidas", () => {
  const result = planner.search(
    [route("A", 0, 0.004)],
    { label: "Origen", coordinates: [200, 200] },
    { label: "Destino", coordinates: point(0.004) }
  );
  assert.equal(result.error, "El origen y el destino requieren coordenadas geográficas válidas.");
});

test("no inventa una conexión cuando dos rutas quedan fuera del límite caminable", () => {
  const result = planner.search(
    [route("A", 0, 0.004), route("B", 0.02, 0.024)],
    { label: "Origen", coordinates: point(0.0001) },
    { label: "Destino", coordinates: point(0.0239) },
    options
  );
  assert.deepEqual(result.alternatives, []);
});

test("incluye geometría real del bus y separa los segmentos peatonales esquemáticos", () => {
  const result = planner.search(
    [route("A", 0, 0.004)],
    { label: "Origen", coordinates: point(0.0002, 0.0001) },
    { label: "Destino", coordinates: point(0.0038, 0.0001) },
    options
  );
  const trip = result.alternatives[0];
  const busStep = trip.itinerary.find((step) => step.type === "bus");
  assert.ok(busStep.geometry.length >= 2);
  assert.equal(busStep.schematic, false);
  assert.ok(trip.itinerary.filter((step) => step.type === "walk").every((step) => step.schematic));
  assert.match(trip.walkingNote, /no es una ruta de calles verificada/);
});

test("devuelve alternativas de rutas directas diferentes para el mismo par de puntos", () => {
  const result = planner.search(
    [
      route("A", 0, 0.004),
      route("B", 0, 0.004, { name: "Ruta B" })
    ],
    { label: "Origen", coordinates: point(0.0001) },
    { label: "Destino", coordinates: point(0.0039) },
    { ...options, maxAlternatives: 10 }
  );

  assert.ok(result.alternatives.length >= 2);
  assert.ok(result.alternatives.every((trip) => trip.buses === 1 && trip.transfers === 0));
  assert.ok(new Set(result.alternatives.map((trip) => trip.routeIds[0])).size >= 2);
});

test("mantiene alternativas directas y con transbordo cuando ambas son válidas", () => {
  const result = planner.search(
    [
      route("DIRECT", 0, 0.008),
      route("A", 0, 0.004),
      route("B", 0.0041, 0.008)
    ],
    { label: "Origen", coordinates: point(0.0001) },
    { label: "Destino", coordinates: point(0.0079) },
    { ...options, maxAlternatives: 20 }
  );

  assert.ok(result.alternatives.some((trip) => trip.buses === 1 && trip.transfers === 0));
  assert.ok(result.alternatives.some((trip) => trip.buses === 2 && trip.transfers === 1));
});

test("no ofrece rutas si el origen o el destino quedan fuera del acceso caminable", () => {
  const routes = [route("A", 0, 0.004)];
  const originTooFar = planner.search(
    routes,
    { label: "Origen lejano", coordinates: point(0.05) },
    { label: "Destino", coordinates: point(0.0039) },
    options
  );
  const destinationTooFar = planner.search(
    routes,
    { label: "Origen", coordinates: point(0.0001) },
    { label: "Destino lejano", coordinates: point(0.05) },
    options
  );

  assert.deepEqual(originTooFar.alternatives, []);
  assert.deepEqual(destinationTooFar.alternatives, []);
});

test("no permite viajar en contra del sentido de circulación de una ruta", () => {
  const result = planner.search(
    [route("reverse", 0.004, 0)],
    { label: "Origen", coordinates: point(0.00005) },
    { label: "Destino", coordinates: point(0.00395) },
    { ...options, maxAccessWalkMeters: 100 }
  );

  assert.deepEqual(result.alternatives, []);
});

test("elimina caminos duplicados y rechaza rutas con paradas duplicadas", () => {
  const duplicateRoute = route("A", 0, 0.004);
  const duplicatedStopSequence = route("B", 0, 0.004);
  duplicatedStopSequence.stops[1].sequence = duplicatedStopSequence.stops[0].sequence;
  const result = planner.search(
    [duplicateRoute, { ...duplicateRoute }, duplicatedStopSequence],
    { label: "Origen", coordinates: point(0.0001) },
    { label: "Destino", coordinates: point(0.0039) },
    { ...options, maxAlternatives: 20 }
  );

  assert.equal(result.rejected.length, 2);
  assert.ok(result.alternatives.length > 0);
  assert.equal(new Set(result.alternatives.map((trip) => trip.id)).size, result.alternatives.length);
  assert.ok(result.alternatives.every((trip) => trip.routeIds.length === 1 && trip.routeIds[0] === "A"));
});

test("distancias, tiempos y datos serializados corresponden a los pasos del itinerario", () => {
  const result = planner.search(
    [route("A", 0, 0.004)],
    { label: "Origen", coordinates: point(0.0002) },
    { label: "Destino", coordinates: point(0.0038) },
    options
  );
  const trip = result.alternatives[0];
  const walkingDistance = trip.itinerary
    .filter((step) => step.type === "walk")
    .reduce((total, step) => total + step.distanceMeters, 0);
  const busDistance = trip.itinerary
    .filter((step) => step.type === "bus")
    .reduce((total, step) => total + step.distanceMeters, 0);
  const expectedMinutes = trip.itinerary
    .reduce((total, step) => total + (step.durationMinutes || 0), 0);

  assert.equal(trip.walkingDistanceMeters, Math.round(walkingDistance));
  assert.equal(trip.busDistanceMeters, Math.round(busDistance));
  assert.equal(trip.totalDistanceMeters, trip.walkingDistanceMeters + trip.busDistanceMeters);
  assert.equal(trip.estimatedMinutes, Math.ceil(expectedMinutes));
  assert.doesNotThrow(() => JSON.stringify(trip));
  assert.equal(JSON.parse(JSON.stringify(trip)).id, trip.id);
});

test("el catálogo conserva los carteles originales sin promoverlos a rutas verificadas", () => {
  const signIds = routeCatalog.signs.map((sign) => sign.id);

  assert.equal(new Set(signIds).size, signIds.length);
  assert.equal(routeCatalog.signs.length, 8);
  assert.deepEqual(routeCatalog.routes, []);
  routeCatalog.signs.forEach((sign) => {
    assert.equal(sign.verificationStatus, "pending");
    assert.ok(sign.observedLabels.length > 0);
    assert.ok(fs.existsSync(path.resolve(__dirname, "..", "pages", sign.image)));
  });
});
