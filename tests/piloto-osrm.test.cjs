const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const pilot = require("../data/piloto-ocean-buenavista.json");
const planner = require("../js/route-planner.js");

test("el piloto OSRM conserva geometría GeoJSON y su conversión a Leaflet", () => {
  const { route } = pilot;
  assert.equal(pilot.dataMode, "routing-pilot");
  assert.equal(pilot.provider.profile, "driving");
  assert.equal(route.geometryType, "LineString");
  assert.equal(route.pointCount, 123);
  assert.equal(route.geometryGeoJSON.length, route.pointCount);
  assert.equal(route.geometryLeaflet.length, route.pointCount);
  assert.ok(Number.isFinite(route.distanceMeters));
  assert.ok(Number.isFinite(route.durationSeconds));
  assert.deepEqual(pilot.origin.requestedLatitudeLongitude, [11.231819, -74.199806]);
  assert.deepEqual(
    pilot.destination.requestedLatitudeLongitude,
    [11.227316619856138, -74.17273804741345]
  );
  assert.ok(Number.isFinite(pilot.destination.snapDistanceMeters));

  route.geometryGeoJSON.forEach(([longitude, latitude], index) => {
    assert.ok(Math.abs(longitude) <= 180);
    assert.ok(Math.abs(latitude) <= 90);
    assert.deepEqual(route.geometryLeaflet[index], [latitude, longitude]);
  });

  assert.deepEqual(route.geometryLeaflet[0], pilot.origin.snappedLatitudeLongitude);
  assert.deepEqual(
    route.geometryLeaflet[route.geometryLeaflet.length - 1],
    pilot.destination.snappedLatitudeLongitude
  );
  assert.ok(
    Math.abs(
      planner.haversineMeters(
        pilot.origin.requestedLatitudeLongitude,
        pilot.origin.snappedLatitudeLongitude
      ) - pilot.origin.snapDistanceMeters
    ) < 1
  );
  assert.ok(
    Math.abs(
      planner.haversineMeters(
        pilot.destination.requestedLatitudeLongitude,
        pilot.destination.snappedLatitudeLongitude
      ) - pilot.destination.snapDistanceMeters
    ) < 1
  );
  assert.match(pilot.notice, /No representa una línea de bus ni paradas verificadas/);
});

test("la página piloto carga el resultado local y no consulta OSRM", () => {
  const pageScript = fs.readFileSync(
    require.resolve("../js/piloto-ocean-buenavista.js"),
    "utf8"
  );
  assert.match(pageScript, /fetch\("\.\.\/data\/piloto-ocean-buenavista\.json"\)/);
  assert.doesNotMatch(pageScript, /router\.project-osrm\.org/);
});
