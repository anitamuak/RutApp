const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const planner = require("../js/route-planner.js");
const routeCatalog = require("../data/rutas.json");
const demoRouteCatalog = require("../data/rutas-demo.json");
const routingPilot = require("../data/piloto-ocean-buenavista.json");
const candidateComparison = require("../data/comparacion-candidatas-unimag.json");

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

test("la directa Universidad–Rodadero usa la candidata guardada y termina en la playa", () => {
  demoRouteCatalog.routes.forEach((demoRoute) => {
    assert.equal(demoRoute.dataMode, "demo");
    assert.equal(demoRoute.verificationStatus, "pending");
  });
  const route = demoRouteCatalog.routes.find((item) => item.id === "demo-unimag-rodadero");
  assert.ok(route);
  assert.equal(route.name, "Universidad–Rodadero");
  assert.equal(route.dataMode, "demo");
  assert.equal(route.verificationStatus, "pending");
  assert.match(route.source, /OSRM demo server.*sin puntos intermedios/);
  assert.equal(route.profile, "driving");
  assert.equal(route.routing.provider, "OSRM demo server");
  assert.equal(route.routing.pointCount, 198);
  assert.equal(route.routing.distanceMeters, 8810.5);
  assert.equal(route.routing.durationSeconds, 636.8);
  assert.equal(route.routing.legs.length, 1);
  assert.equal(route.routing.legs[0].distanceMeters, 8810.5);
  assert.equal(route.routing.legs[0].durationSeconds, 636.8);
  assert.equal(route.generatedAt, "2026-11-07T00:07:44.066Z");
  assert.match(route.routing.requestUrl, /radiuses=100;100$/);
  assert.equal(route.routing.waypoints.length, 2);
  assert.deepEqual(route.geometry[0], route.routing.waypoints[0].snappedLatitudeLongitude);
  assert.deepEqual(route.geometry.at(-1), route.routing.waypoints[1].snappedLatitudeLongitude);
  assert.equal(route.geometry.length, 198);
  assert.deepEqual(route.geometry, route.geometry.map(([latitude, longitude]) => [latitude, longitude]));
  assert.deepEqual(route.reviewWarnings, []);
  assert.deepEqual(demoRouteCatalog.examples.unimagRodadero.origin, {
    label: "Universidad del Magdalena",
    latitude: 11.226246,
    longitude: -74.187361
  });
  assert.deepEqual(demoRouteCatalog.examples.unimagRodadero.destination, {
    label: "Playa El Rodadero",
    latitude: 11.203639,
    longitude: -74.227686
  });
  assert.deepEqual(route.geometry.at(-1), [11.203642, -74.227526]);
  assert.equal(route.stops.length, 2);
  assert.equal(new Set(route.stops.map((stop) => stop.id)).size, 2);
  assert.deepEqual(route.stops.map((stop) => stop.sequence), [1, 2]);
  assert.equal(route.stops[0].name, "Universidad del Magdalena · abordaje ilustrativo confirmado para el prototipo");
  assert.deepEqual(
    [route.stops[0].latitude, route.stops[0].longitude],
    [11.226444, -74.187304]
  );
  assert.deepEqual(
    [route.stops[1].latitude, route.stops[1].longitude],
    [11.203642, -74.227526]
  );
  assert.match(demoRouteCatalog.notice, /Recorridos aproximados/);
  assert.doesNotMatch(demoRouteCatalog.notice, /académicos|demostración/i);
  assert.match(demoRouteCatalog.notice, /No representan servicios de transporte verificados/);
});

test("solo el modo demo admite el fixture pendiente y produce un viaje directo con toda su geometría", () => {
  const route = demoRouteCatalog.routes.find((item) => item.id === "demo-unimag-rodadero");
  const example = demoRouteCatalog.examples.unimagRodadero;
  const origin = {
    label: example.origin.label,
    coordinates: [example.origin.latitude, example.origin.longitude]
  };
  const destination = {
    label: example.destination.label,
    coordinates: [example.destination.latitude, example.destination.longitude]
  };
  const realSearch = planner.search([route], origin, destination, options);
  assert.deepEqual(realSearch.alternatives, []);
  const verifiedFixtureInDemoMode = planner.search(
    [{ ...route, verificationStatus: "verified" }],
    origin,
    destination,
    { ...options, dataMode: "demo" }
  );
  assert.deepEqual(verifiedFixtureInDemoMode.alternatives, []);

  const demoSearch = planner.search([route], origin, destination, { ...options, dataMode: "demo" });
  assert.equal(demoSearch.alternatives.length, 1);
  const [trip] = demoSearch.alternatives;
  assert.equal(trip.buses, 1);
  assert.equal(trip.transfers, 0);
  assert.deepEqual(trip.routeIds, ["demo-unimag-rodadero"]);
  const busStep = trip.itinerary.find((step) => step.type === "bus");
  assert.deepEqual(busStep.geometry, route.geometry);
  assert.deepEqual(busStep.board.coordinates, [11.226444, -74.187304]);
  assert.deepEqual(busStep.alight.coordinates, [11.203642, -74.227526]);
  assert.equal(busStep.generatedAt, route.generatedAt);
  assert.ok(trip.estimatedMinutes > 0);
  assert.notEqual(trip.estimatedMinutes, Math.ceil(route.routing.durationSeconds / 60));
  assert.ok(trip.itinerary.some((step) =>
    step.type === "walk" && step.title === "Camina hasta el destino" &&
    step.to[0] === example.destination.latitude &&
    step.to[1] === example.destination.longitude
  ));
});

test("el ejemplo demo conserva la directa y conecta la candidata completa A→B en Rodadero", () => {
  const directRoute = demoRouteCatalog.routes.find((route) => route.id === "demo-unimag-rodadero");
  const lineA = demoRouteCatalog.routes.find((route) => route.id === "demo-unimag-rodadero-a");
  const lineB = demoRouteCatalog.routes.find((route) => route.id === "demo-unimag-rodadero-b");
  const example = demoRouteCatalog.examples.unimagRodadero;
  const origin = {
    label: example.origin.label,
    coordinates: [example.origin.latitude, example.origin.longitude]
  };
  const destination = {
    label: example.destination.label,
    coordinates: [example.destination.latitude, example.destination.longitude]
  };
  const result = planner.search(
    [directRoute, lineA, lineB],
    origin,
    destination,
    { ...options, maxAccessWalkMeters: 1500, dataMode: "demo", maxAlternatives: 10 }
  );
  const directTrip = result.alternatives.find((trip) =>
    trip.routeIds.length === 1 && trip.routeIds[0] === directRoute.id
  );
  const transferTrip = result.alternatives.find((trip) =>
    trip.routeIds.length === 2 && trip.routeIds[0] === lineA.id && trip.routeIds[1] === lineB.id
  );

  assert.ok(directTrip);
  assert.equal(directTrip.buses, 1);
  assert.equal(directTrip.transfers, 0);
  assert.ok(transferTrip);
  assert.deepEqual(transferTrip.routeNames, ["Universidad–La 30", "Rodadero · La paz"]);
  assert.equal(transferTrip.buses, 2);
  assert.equal(transferTrip.transfers, 1);
  assert.deepEqual(
    transferTrip.routeIds,
    ["demo-unimag-rodadero-a", "demo-unimag-rodadero-b"]
  );

  const busSteps = transferTrip.itinerary.filter((step) => step.type === "bus");
  assert.equal(lineA.dataMode, "demo");
  assert.equal(lineB.dataMode, "demo");
  assert.equal(lineA.verificationStatus, "pending");
  assert.equal(lineB.verificationStatus, "pending");
  assert.equal(lineA.profile, "driving");
  assert.equal(lineB.profile, "driving");
  assert.equal(lineA.name, "Universidad–La 30");
  assert.equal(lineB.name, "Rodadero · La paz");
  assert.equal(
    transferTrip.routeNames.join(" → "),
    "Universidad–La 30 → Rodadero · La paz"
  );
  assert.match(lineA.routing.requestUrl, /radiuses=100;100$/);
  assert.match(lineB.routing.requestUrl, /radiuses=100;100;100$/);
  assert.match(lineA.routing.requestUrl, /overview=full&geometries=geojson&steps=false/);
  assert.match(lineB.routing.requestUrl, /overview=full&geometries=geojson&steps=false/);
  assert.equal(lineA.routing.generatedAt, lineA.generatedAt);
  assert.equal(lineB.routing.generatedAt, lineB.generatedAt);
  assert.equal(lineA.routing.attribution, lineA.attribution);
  assert.equal(lineB.routing.attribution, lineB.attribution);
  assert.match(busSteps[0].alight.name, /^Conexión Rodadero · demostración/);
  assert.match(busSteps[1].board.name, /^Conexión Rodadero · demostración/);
  assert.deepEqual(busSteps[0].alight.coordinates, [11.206649, -74.226054]);
  assert.deepEqual(busSteps[0].alight.coordinates, busSteps[1].board.coordinates);
  assert.deepEqual(lineA.geometry.at(-1), lineB.geometry[0]);
  assert.deepEqual(busSteps[0].geometry, lineA.geometry);
  assert.deepEqual(busSteps[1].geometry, lineB.geometry);
  assert.equal(lineA.geometry.length, 259);
  assert.equal(lineB.geometry.length, 11);
  assert.deepEqual(lineA.geometry[0], [11.226444, -74.187304]);
  assert.deepEqual(lineB.geometry[0], [11.206649, -74.226054]);
  assert.deepEqual(lineB.geometry.at(-1), [11.203642, -74.227526]);
  assert.equal(lineA.routing.pointCount, 259);
  assert.equal(lineB.routing.pointCount, 11);
  assert.equal(lineA.routing.distanceMeters, 8014);
  assert.equal(lineB.routing.distanceMeters, 468.1);
  assert.equal(lineA.routing.waypoints[1].snapDistanceMeters, 14.18439954);
  assert.equal(lineB.routing.waypoints[1].snapDistanceMeters, 80.55624474);
  assert.equal(lineB.routing.waypoints[1].name, "Carrera 1 / Calle 6");
  assert.deepEqual(
    lineA.routing.waypoints.map((waypoint) => waypoint.requestedLatitudeLongitude),
    [[11.226444, -74.187304], [11.2067699, -74.2260969]]
  );
  assert.deepEqual(
    lineB.routing.waypoints.map((waypoint) => waypoint.requestedLatitudeLongitude),
    [
      [11.2067699, -74.2260969],
      [11.2060406, -74.2284964],
      [11.2036394, -74.2276856]
    ]
  );
  assert.deepEqual(
    lineB.routing.waypoints[1].snappedLatitudeLongitude,
    [11.206072, -74.227759]
  );
  assert.ok(transferTrip.reviewWarnings.some((warning) => warning.includes("80,6 m")));
  const accessWalk = transferTrip.itinerary.find((step) =>
    step.type === "walk" && step.title === "Camina hasta el punto de abordaje"
  );
  assert.ok(accessWalk);
  assert.deepEqual(accessWalk.to, [11.226444, -74.187304]);
  assert.ok(
    transferTrip.itinerary.some((step) =>
      step.type === "walk" &&
      step.title.startsWith("Cambia de bus en Conexión Rodadero") &&
      step.from[0] === step.to[0] &&
      step.from[1] === step.to[1]
    ),
    "la conexión ajustada debe conservar el cambio de bus en el mismo punto"
  );
  assert.match(
    transferTrip.itinerary.find((step) => step.title.startsWith("Cambia de bus"))?.title || "",
    /Conexión Rodadero/
  );
  assert.match(
    transferTrip.itinerary.find((step) => step.title.startsWith("Cambia de bus"))?.description || "",
    /Rodadero · La paz/
  );
  assert.notEqual(
    transferTrip.estimatedMinutes,
    Math.ceil((lineA.routing.durationSeconds + lineB.routing.durationSeconds) / 60)
  );
  assert.ok(
    result.alternatives.every((trip) =>
      !trip.routeIds.includes(lineA.id) || trip.routeIds.join(",") === `${lineA.id},${lineB.id}`
    ),
    "no debe ofrecer Universidad–La 30 con una caminata hasta el destino"
  );
});

test("el corredor demo continúa rechazado en búsquedas normales", () => {
  const example = demoRouteCatalog.examples.unimagRodadero;
  const demoRoutes = demoRouteCatalog.routes.filter((route) =>
    ["demo-unimag-rodadero", "demo-unimag-rodadero-a", "demo-unimag-rodadero-b"].includes(route.id)
  );
  const result = planner.search(
    demoRoutes,
    {
      label: example.origin.label,
      coordinates: [example.origin.latitude, example.origin.longitude]
    },
    {
      label: example.destination.label,
      coordinates: [example.destination.latitude, example.destination.longitude]
    },
    options
  );
  assert.deepEqual(result.alternatives, []);
  assert.equal(result.rejected.length, demoRoutes.length);
  assert.ok(result.rejected.every(({ reason }) => /no está verificado/.test(reason)));
});

test("una búsqueda demo sin conexión devuelve cero alternativas", () => {
  const route = demoRouteCatalog.routes.find((item) => item.id === "demo-unimag-rodadero");
  const example = demoRouteCatalog.examples.unimagRodadero;
  const result = planner.search(
    [route],
    {
      label: example.origin.label,
      coordinates: [example.origin.latitude, example.origin.longitude]
    },
    {
      label: "Destino no conectado",
      coordinates: [
        example.unconnectedDestination.latitude,
        example.unconnectedDestination.longitude
      ]
    },
    { ...options, dataMode: "demo" }
  );
  assert.deepEqual(result.alternatives, []);
});

test("Parque de los Novios–Taganga conserva acceso a pie y geometría OSRM del bus", () => {
  const example = demoRouteCatalog.examples.parqueTaganga;
  const route = demoRouteCatalog.routes.find((item) => item.id === "demo-parque-taganga");
  assert.ok(example);
  assert.deepEqual(example.routeIds, ["demo-parque-taganga"]);
  assert.deepEqual(example.origin, {
    label: "Parque de los Novios",
    latitude: 11.242192,
    longitude: -74.21328
  });
  assert.deepEqual(example.destination, {
    label: "Playa de Taganga",
    latitude: 11.26848,
    longitude: -74.189575
  });
  assert.ok(route);
  assert.equal(route.name, "Kra 11 Taganga");
  assert.equal(route.dataMode, "demo");
  assert.equal(route.verificationStatus, "pending");
  assert.match(route.source, /OSRM demo server.*perfil driving/);
  assert.match(route.source, /Kra 11 Taganga.*no está verificada/);
  assert.equal(route.profile, "driving");
  assert.equal(route.routing.provider, "OSRM demo server");
  assert.equal(route.routing.pointCount, 195);
  assert.equal(route.routing.distanceMeters, 5029.1);
  assert.equal(route.routing.durationSeconds, 473.1);
  assert.equal(route.stops.length, 2);
  assert.deepEqual(route.stops.map((stop) => stop.id), [
    "demo-parque-taganga-boarding",
    "demo-parque-taganga-alighting"
  ]);
  assert.equal(route.stops[0].name, "Calle 20 con Carrera 5 · abordaje de demostración");
  assert.equal(route.stops[1].name, "Playa de Taganga · descenso de demostración");
  assert.deepEqual(
    [route.stops[0].latitude, route.stops[0].longitude],
    route.routing.waypoints[0].snappedLatitudeLongitude
  );
  assert.deepEqual(
    [route.stops[1].latitude, route.stops[1].longitude],
    route.routing.waypoints[1].snappedLatitudeLongitude
  );
  assert.ok(route.geometry.length > 2);
  assert.deepEqual(route.geometry[0], route.routing.waypoints[0].snappedLatitudeLongitude);
  assert.deepEqual(route.geometry.at(-1), route.routing.waypoints[1].snappedLatitudeLongitude);

  const origin = {
    label: example.origin.label,
    coordinates: [example.origin.latitude, example.origin.longitude]
  };
  const destination = {
    label: example.destination.label,
    coordinates: [example.destination.latitude, example.destination.longitude]
  };
  const result = planner.search(
    [route],
    origin,
    destination,
    { ...options, dataMode: "demo" }
  );
  assert.equal(result.alternatives.length, 1);
  const [trip] = result.alternatives;
  assert.equal(trip.buses, 1);
  assert.equal(trip.transfers, 0);
  assert.deepEqual(trip.routeIds, ["demo-parque-taganga"]);
  assert.ok(trip.walkingDistanceMeters > 0);

  const walkSteps = trip.itinerary.filter((step) => step.type === "walk");
  const accessWalk = walkSteps[0];
  assert.ok(accessWalk);
  assert.equal(accessWalk.title, "Camina hasta el punto de abordaje");
  assert.ok(accessWalk.distanceMeters > 0);
  assert.ok(accessWalk.durationMinutes > 0);
  assert.deepEqual(accessWalk.from, origin.coordinates);
  assert.deepEqual(accessWalk.to, route.routing.waypoints[0].snappedLatitudeLongitude);

  const busStep = trip.itinerary.find((step) => step.type === "bus");
  assert.ok(busStep);
  assert.equal(busStep.board.name, route.stops[0].name);
  assert.equal(busStep.alight.name, route.stops[1].name);
  assert.deepEqual(busStep.board.coordinates, route.routing.waypoints[0].snappedLatitudeLongitude);
  assert.deepEqual(busStep.alight.coordinates, route.routing.waypoints[1].snappedLatitudeLongitude);
  assert.deepEqual(busStep.geometry, route.geometry);
  assert.equal(busStep.generatedAt, route.generatedAt);
  assert.equal(busStep.attribution, route.attribution);
  assert.equal(trip.itinerary.filter((step) => step.type === "bus").length, 1);
  assert.ok(walkSteps.length >= 1);
  if (walkSteps.length > 1) {
    assert.equal(walkSteps[1].title, "Camina hasta el destino");
    assert.deepEqual(walkSteps[1].from, route.routing.waypoints[1].snappedLatitudeLongitude);
    assert.deepEqual(walkSteps[1].to, destination.coordinates);
  }
  assert.notEqual(trip.estimatedMinutes, Math.ceil(route.routing.durationSeconds / 60));

  const normalSearch = planner.search([route], origin, destination, options);
  assert.deepEqual(normalSearch.alternatives, []);
  assert.equal(normalSearch.rejected.length, 1);
  assert.equal(normalSearch.rejected.length, 1);
});

test("Ocean Mall–Buenavista conserva dos geometrías OSRM distintas y completas", () => {
  const example = demoRouteCatalog.examples.oceanBuenavista;
  const expectedGeometries = {
    "demo-ocean-buenavista-osrm": routingPilot.route.geometryLeaflet
  };
  const routeIds = ["demo-ocean-buenavista-osrm", "demo-ocean-buenavista-libertador"];
  const routes = demoRouteCatalog.routes.filter((route) => routeIds.includes(route.id));
  assert.ok(example);
  assert.deepEqual(example.routeIds, routeIds);
  assert.deepEqual(example.origin, {
    label: "CC Ocean Mall",
    latitude: 11.231819,
    longitude: -74.199806
  });
  assert.deepEqual(example.destination, {
    label: "CC Buenavista",
    latitude: 11.227316619856138,
    longitude: -74.17273804741345
  });
  assert.equal(routes.length, 2);

  routes.forEach((route) => {
    assert.equal(route.dataMode, "demo");
    assert.equal(route.verificationStatus, "pending");
    assert.equal(route.stops.length, 2);
    assert.deepEqual(route.stops.map((stop) => stop.sequence), [1, 2]);
    assert.deepEqual(route.stops.map((stop) => stop.id), [
      `${route.id}-boarding`,
      `${route.id}-alighting`
    ]);
    assert.deepEqual(
      [route.stops[0].latitude, route.stops[0].longitude],
      route.geometry[0]
    );
    assert.deepEqual(
      [route.stops[1].latitude, route.stops[1].longitude],
      route.geometry[route.geometry.length - 1]
    );
  });
  const osrmRoute = routes.find((route) => route.id === "demo-ocean-buenavista-osrm");
  assert.equal(osrmRoute.name, "Ocean Mall–Buenavista · calles 29 y 24");
  assert.equal(osrmRoute.geometry.length, 123);
  assert.deepEqual(osrmRoute.geometry, expectedGeometries[osrmRoute.id]);
  assert.equal(osrmRoute.sourcePilot, "data/piloto-ocean-buenavista.json");
  assert.equal(osrmRoute.generatedAt, routingPilot.generatedAt);
  assert.match(osrmRoute.source, /OSRM demo server.*perfil driving/);
  assert.match(osrmRoute.source, /no representa una línea de bus ni un servicio verificado/i);
  assert.match(osrmRoute.attribution, /OSRM.*OpenStreetMap contributors.*ODbL/);
  assert.deepEqual(
    [osrmRoute.stops[0].latitude, osrmRoute.stops[0].longitude],
    routingPilot.origin.snappedLatitudeLongitude
  );
  assert.deepEqual(
    [osrmRoute.stops[1].latitude, osrmRoute.stops[1].longitude],
    routingPilot.destination.snappedLatitudeLongitude
  );
  const approximateRoute = routes.find((route) => route.id === "demo-ocean-buenavista-libertador");
  assert.equal(approximateRoute.name, "Ocean Mall–Buenavista · Avenida El Libertador");
  assert.equal(approximateRoute.geometry.length, 234);
  assert.equal(approximateRoute.profile, "driving");
  assert.equal(approximateRoute.routing.provider, "OSRM demo server");
  assert.equal(approximateRoute.routing.pointCount, 234);
  assert.equal(approximateRoute.routing.distanceMeters, 7966);
  assert.equal(approximateRoute.routing.durationSeconds, 883);
  assert.equal(approximateRoute.generatedAt, approximateRoute.routing.generatedAt);
  assert.match(approximateRoute.source, /OSRM demo server.*perfil driving/);
  assert.match(approximateRoute.attribution, /OSRM.*OpenStreetMap contributors.*ODbL/);
  assert.ok(approximateRoute.routing.waypoints.every((waypoint) =>
    waypoint.snapDistanceMeters <= 120
  ));
  assert.notDeepEqual(
    approximateRoute.geometry,
    osrmRoute.geometry,
    "la alternativa no debe duplicar la geometría del piloto OSRM integrado"
  );
  assert.deepEqual(
    approximateRoute.geometry[0],
    approximateRoute.routing.waypoints[0].snappedLatitudeLongitude
  );
  assert.deepEqual(
    approximateRoute.geometry.at(-1),
    approximateRoute.routing.waypoints.at(-1).snappedLatitudeLongitude
  );

  const origin = {
    label: example.origin.label,
    coordinates: [example.origin.latitude, example.origin.longitude]
  };
  const destination = {
    label: example.destination.label,
    coordinates: [example.destination.latitude, example.destination.longitude]
  };
  const result = planner.search(
    demoRouteCatalog.routes,
    origin,
    destination,
    { ...options, dataMode: "demo", maxAlternatives: 20 }
  );
  assert.equal(result.alternatives.length, 2);
  assert.deepEqual(
    result.alternatives.map((trip) => trip.routeIds[0]).sort(),
    [...routeIds].sort()
  );
  result.alternatives.forEach((trip) => {
    assert.equal(trip.buses, 1);
    assert.equal(trip.transfers, 0);
    assert.deepEqual(trip.origin, {
      label: example.origin.label,
      coordinates: [example.origin.latitude, example.origin.longitude]
    });
    assert.deepEqual(trip.destination, {
      label: example.destination.label,
      coordinates: [example.destination.latitude, example.destination.longitude]
    });
    assert.deepEqual(
      trip.itinerary.find((step) => step.type === "bus").geometry,
      routes.find((route) => route.id === trip.routeIds[0]).geometry
    );
  });
  const osrmTrip = result.alternatives.find((trip) =>
    trip.routeIds.includes("demo-ocean-buenavista-osrm")
  );
  const osrmBus = osrmTrip.itinerary.find((step) => step.type === "bus");
  const walks = osrmTrip.itinerary.filter((step) => step.type === "walk");
  assert.equal(osrmTrip.estimatedMinutes > 0, true);
  assert.notEqual(
    osrmTrip.estimatedMinutes,
    Math.ceil(routingPilot.route.durationSeconds / 60)
  );
  assert.equal(osrmTrip.routeNames[0], osrmRoute.name);
  assert.equal(osrmBus.source, osrmRoute.source);
  assert.equal(osrmBus.attribution, osrmRoute.attribution);
  assert.equal(osrmBus.generatedAt, routingPilot.generatedAt);
  assert.deepEqual(osrmBus.board.coordinates, routingPilot.origin.snappedLatitudeLongitude);
  assert.deepEqual(osrmBus.alight.coordinates, routingPilot.destination.snappedLatitudeLongitude);
  assert.deepEqual(osrmBus.geometry, routingPilot.route.geometryLeaflet);
  assert.equal(walks.length, 2);
  assert.ok(walks.every((step) => step.distanceMeters > 0));
  assert.deepEqual(walks[0].from, [example.origin.latitude, example.origin.longitude]);
  assert.deepEqual(walks[0].to, routingPilot.origin.snappedLatitudeLongitude);
  assert.deepEqual(walks[1].from, routingPilot.destination.snappedLatitudeLongitude);
  assert.deepEqual(walks[1].to, [example.destination.latitude, example.destination.longitude]);
  assert.ok(
    walks[1].distanceMeters > 0 &&
      planner.haversineMeters(walks[1].from, walks[1].to) <= 52,
    "la caminata de salida es un conector geográfico, no distancia peatonal por calles"
  );
  const manualTrip = result.alternatives.find((trip) =>
    trip.routeIds.includes("demo-ocean-buenavista-libertador")
  );
  assert.equal(manualTrip.buses, 1);
  assert.equal(manualTrip.transfers, 0);
  assert.notEqual(manualTrip.estimatedMinutes, Math.ceil(883 / 60));
  assert.ok(
    result.alternatives.every((trip) =>
      trip.routeIds.length === 1 && routeIds.includes(trip.routeIds[0])
    ),
    "las dos alternativas deben permanecer separadas, sin transbordos entre ellas"
  );

  const normalSearch = planner.search(routes, origin, destination, options);
  assert.deepEqual(normalSearch.alternatives, []);
  assert.equal(normalSearch.rejected.length, 2);
  assert.ok(normalSearch.rejected.some((rejected) =>
    rejected.routeId === "demo-ocean-buenavista-osrm"
  ));
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
