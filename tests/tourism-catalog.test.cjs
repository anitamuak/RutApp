const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const places = require("../data/lugares.json");
const imageCredits = require("../assets/images/places/credits.json");
const detailScript = fs.readFileSync(
  path.join(__dirname, "..", "js", "detalle-lugar.js"),
  "utf8"
);
const exploreScript = fs.readFileSync(
  path.join(__dirname, "..", "js", "explorar.js"),
  "utf8"
);
const globalScript = fs.readFileSync(
  path.join(__dirname, "..", "js", "global.js"),
  "utf8"
);

test("todas las fichas del catálogo tienen información de visita y fuentes HTTPS", () => {
  assert.equal(places.length, 24);
  assert.equal(new Set(places.map((place) => place.id)).size, places.length);

  places.forEach((place) => {
    assert.ok(place.descripcion, `${place.id} debe tener descripción`);
    assert.ok(place.horarios?.detalle, `${place.id} debe informar el estado del horario`);
    assert.ok(place.costos?.entrada, `${place.id} debe informar el estado de la tarifa`);
    assert.ok(place.tipoAcceso, `${place.id} debe informar sus condiciones de acceso`);
    assert.ok(place.mediosPago, `${place.id} debe informar el estado de medios de pago`);
    assert.ok(place.costosAdicionales, `${place.id} debe informar costos adicionales`);
    assert.ok(place.incluye, `${place.id} debe aclarar servicios incluidos`);
    assert.ok(place.recomendaciones?.length, `${place.id} debe tener recomendaciones`);
    assert.ok(place.fechaConsultaFuentes, `${place.id} debe tener fecha de consulta`);
    assert.ok(place.estadoVerificacion, `${place.id} debe explicar su verificación`);
    assert.ok(place.fuentesOficiales?.length, `${place.id} debe tener fuentes institucionales`);

    place.fuentesOficiales.forEach((source) => {
      assert.match(source.url, /^https:\/\//, `${place.id}: fuente sin HTTPS`);
      assert.ok(source.nombre, `${place.id}: fuente sin nombre`);
      assert.ok(source.alcance, `${place.id}: falta aclarar el alcance de la fuente`);
    });

    if (place.latitud !== undefined || place.longitud !== undefined) {
      assert.ok(Number.isFinite(place.latitud), `${place.id}: latitud inválida`);
      assert.ok(Number.isFinite(place.longitud), `${place.id}: longitud inválida`);
      assert.ok(Math.abs(place.latitud) <= 90, `${place.id}: latitud fuera de rango`);
      assert.ok(Math.abs(place.longitud) <= 180, `${place.id}: longitud fuera de rango`);
    }
  });
});

test("las fotografías locales referenciadas existen y las nuevas tienen atribución", () => {
  places.filter((place) => place.imagen).forEach((place) => {
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", place.imagen)),
      `${place.id}: no existe ${place.imagen}`
    );
  });

  assert.deepEqual(
    imageCredits.map((credit) => credit.placeId),
    ["playa-los-angeles", "playa-bello-horizonte", "playa-los-naranjos", "pozo-azul"]
  );
  imageCredits.forEach((credit) => {
    const place = places.find((record) => record.id === credit.placeId);
    assert.ok(place, `${credit.placeId}: lugar inexistente`);
    assert.equal(place.imagen, `assets/images/places/${credit.file}`);
    assert.match(credit.source, /^https:\/\//);
    assert.ok(credit.creator);
    assert.ok(credit.license);
    assert.ok(credit.authorization || credit.licenseUrl);
    assert.ok(fs.existsSync(path.join(__dirname, "..", place.imagen)));
  });
});

test("Explorar y detalle usan una alternativa accesible si falta o falla una fotografía", () => {
  assert.ok(
    fs.existsSync(path.join(__dirname, "..", "assets", "images", "places", "fotografia-no-disponible.svg"))
  );
  assert.match(globalScript, /function setPlaceImage/);
  assert.match(exploreScript, /RutApp\.setPlaceImage/);
  assert.match(detailScript, /RutApp\.setPlaceImage/);
});

test("la ficha del Museo del Oro distingue el horario publicado y el ingreso general gratuito", () => {
  const museum = places.find((place) => place.id === "museo-del-oro-tairona");
  assert.match(museum.horarios.detalle, /martes a sábado de 9:00 a\. m\. a 5:00 p\. m\./);
  assert.match(museum.horarios.detalle, /domingos de 10:00 a\. m\. a 3:00 p\. m\./);
  assert.match(museum.horarios.detalle, /no indica cuándo se actualizó/);
  assert.match(museum.costos.entrada, /^Gratis el ingreso general al museo/);
  assert.doesNotMatch(museum.recomendaciones.join(" "), /confirma .* tarifa/i);
});

test("playas públicas y parques urbanos indican acceso gratuito sin incluir servicios", () => {
  const freePlaces = places.filter((place) =>
    [
      "el-rodadero",
      "playa-blanca",
      "playa-grande-taganga",
      "playa-los-angeles",
      "playa-bello-horizonte",
      "playa-inca-inca",
      "parque-de-bolivar",
      "parque-de-los-novios",
      "camellon-de-la-bahia"
    ].includes(place.id)
  );
  assert.equal(freePlaces.length, 9);
  freePlaces.forEach((place) => {
    assert.match(place.costos.entrada, /^Gratis/);
  });
  assert.match(
    places.find((place) => place.id === "el-rodadero").costos.entrada,
    /No incluye transporte/
  );
});

test("los atractivos del Tayrona separan el requisito de entrada de la tarifa vigente", () => {
  const tayronaPlaces = places.filter((place) =>
    ["playa-cristal", "cabo-san-juan", "bahia-concha", "playa-los-naranjos", "parque-tayrona"].includes(place.id)
  );
  assert.equal(tayronaPlaces.length, 5);
  tayronaPlaces.forEach((place) => {
    assert.match(place.costos.entrada, /requiere boleto de entrada o paquete/);
    assert.match(place.costos.entrada, /no publica la tarifa vigente/);
    assert.doesNotMatch(place.costos.entrada, /^Gratis/);
    assert.match(place.horarios.detalle, /No se confirmó un horario vigente/);
  });
});

test("el detalle muestra fuentes, estado de verificación, consulta y medios de pago", () => {
  assert.match(detailScript, /fuentes institucionales consultadas/i);
  assert.match(detailScript, /estado de verificación/i);
  assert.match(detailScript, /Consulta de fuentes/);
  assert.match(detailScript, /Medios de pago/);
});
