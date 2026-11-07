const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const comparison = require("../data/comparacion-candidatas-unimag.json");
const catalog = require("../data/rutas-demo.json");

test("la comparación local conserva las dos candidatas y marca los desvíos", () => {
  assert.equal(comparison.cases.length, 2);
  const direct = comparison.cases.find((item) => item.id === "direct");
  const lineA = comparison.cases.find((item) => item.id === "line-a");
  assert.ok(direct);
  assert.ok(lineA);
  const integratedDirect = catalog.routes.find((route) => route.id === "demo-unimag-rodadero");
  const integratedLineA = catalog.routes.find((route) => route.id === "demo-unimag-rodadero-a");
  assert.equal(direct.manual.length, 8);
  assert.equal(lineA.manual.length, 6);
  assert.notDeepEqual(direct.manual, integratedDirect.geometry);
  assert.notDeepEqual(lineA.manual, integratedLineA.geometry);
  assert.notDeepEqual(integratedDirect.geometry, direct.candidate.geometryLeaflet);
  assert.equal(integratedDirect.geometry.length, 198);
  assert.equal(integratedDirect.routing.distanceMeters, 8810.5);
  assert.notDeepEqual(integratedLineA.geometry, lineA.candidate.geometryLeaflet);
  assert.equal(integratedLineA.geometry.length, 259);
  assert.equal(integratedLineA.routing.distanceMeters, 8014);

  assert.equal(direct.candidate.pointCount, 324);
  assert.equal(direct.candidate.distanceMeters, 9181.4);
  assert.equal(direct.candidate.waypoints.length, 5);
  assert.deepEqual(
    direct.candidate.legs.filter((leg) => leg.flagged).map((leg) => [leg.fromPoint, leg.toPoint]),
    [[2, 3], [3, 4]]
  );
  assert.equal(lineA.candidate.pointCount, 500);
  assert.equal(lineA.candidate.distanceMeters, 21501.2);
  assert.equal(lineA.candidate.waypoints.length, 6);
  assert.ok(lineA.candidate.waypoints[4].snapDistanceMeters > 120);
  assert.deepEqual(
    lineA.candidate.legs.filter((leg) => leg.flagged).map((leg) => [leg.fromPoint, leg.toPoint]),
    [[2, 3], [3, 4]]
  );

  for (const item of comparison.cases) {
    const candidate = item.candidate;
    assert.equal(candidate.geometryGeoJSON.length, candidate.pointCount);
    assert.equal(candidate.geometryLeaflet.length, candidate.pointCount);
    candidate.geometryGeoJSON.forEach(([longitude, latitude], index) => {
      assert.deepEqual(candidate.geometryLeaflet[index], [latitude, longitude]);
    });
    assert.deepEqual(candidate.geometryLeaflet[0], candidate.waypoints[0].snappedLatitudeLongitude);
    assert.deepEqual(
      candidate.geometryLeaflet.at(-1),
      candidate.waypoints.at(-1).snappedLatitudeLongitude
    );
    assert.ok(candidate.waypoints.every((waypoint) =>
      Number.isFinite(waypoint.snapDistanceMeters)
    ));
  }
});

test("la página compara datos locales y no ejecuta consultas de rutas", () => {
  const pageScript = fs.readFileSync(
    require.resolve("../js/comparacion-candidatas-unimag.js"),
    "utf8"
  );
  assert.match(pageScript, /fetch\("\.\.\/data\/comparacion-candidatas-unimag\.json"\)/);
  assert.doesNotMatch(pageScript, /router\.project-osrm\.org/);
});
