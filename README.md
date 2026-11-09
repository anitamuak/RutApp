# RutApp web

Aplicacion web en HTML, CSS y JavaScript nativos. Abre `index.html` para la bienvenida y usa Live Server para probar las pantallas que cargan `data/lugares.json` mediante `fetch`.

## Estructura actual

- `index.html` y `css/bienvenida.css`: bienvenida.
- `pages/inicio.html`, `css/inicio.css` y `js/inicio.js`: pantalla principal, formulario inicial de rutas y ubicacion del navegador.
- `pages/explorar.html`, `css/explorar.css` y `js/explorar.js`: catalogo, filtros y vista de favoritos.
- `pages/detalle-lugar.html`, `css/detalle-lugar.css` y `js/detalle-lugar.js`: detalle de un destino.
- `pages/buscar-ruta.html`, `css/buscar-ruta.css` y `js/buscar-ruta.js`: selección del origen y destino, validación y búsqueda de recorridos.
- `pages/detalle-ruta.html`, `css/detalle-ruta.css` y `js/detalle-ruta.js`: detalle del itinerario seleccionado con pasos y mapa.
- `pages/mas.html` y `css/mas.css`: accesos a las pantallas disponibles.
- `js/maps.js`: cargador de Leaflet y creación de mapas compartida por las pantallas con mapa.
- `css/global.css` y `js/global.js`: variables, estilos base y utilidades compartidas.
- `components/header.*` y `components/navbar.*`: cabecera y barra inferior como Web Components nativos.
- `data/lugares.json`: catalogo compartido. Las rutas de imagen son locales a `assets/images`.
- `data/rutas.json`: recorridos de transporte. Solo se calculan rutas con geometría, paradas ordenadas y estado de verificación explícito.
- `data/rutas-demo.json`: ejemplos optativos separados de los recorridos verificados, incluidos Universidad–Rodadero, Parque–Taganga, Ocean Mall–Buenavista y Universidad–La 30 → Rodadero · La paz.
- `js/route-planner.js`: motor de conexiones entre paradas, con recorridos dirigidos, caminatas de acceso/transbordo/salida y un máximo configurable de transbordos.
- `js/lugares-cercanos.js`: calcula y muestra, en el detalle del viaje, los lugares del catálogo a 500 m o menos del trazado del bus.

Los Web Components se definen en scripts clasicos con `defer` y renderizan su contenido al conectarse al documento. Cada pagina carga las hojas de estilo compartidas y las hojas especificas que necesita; no se necesita un sistema de compilacion.

## Ejecucion local

Abre el directorio con Live Server y carga `index.html`. La geolocalizacion del navegador solo funciona en un contexto seguro, normalmente HTTPS o `localhost`, y solo se solicita al pulsar el boton de ubicacion.

Los favoritos se guardan en `localStorage` del navegador. La ubicación GPS se solicita solo tras una acción explícita y se mantiene en `sessionStorage` durante la pestaña; no se envía al motor de rutas. Si el origen es la ubicación GPS, sus coordenadas se envían al servicio público de rutas peatonales `routing.openstreetmap.de` (OSRM, datos de OpenStreetMap) para dibujar la caminata por calles y andenes en el detalle del viaje. Si el servicio no responde, la caminata se muestra como línea recta esquemática.

## Apariencia

El tema claro/oscuro se controla desde **Más** y se guarda en `localStorage` con la clave `rutapp-theme`. `js/theme.js` se carga al inicio de cada documento, aplica el tema antes de renderizar la página y sincroniza los controles y pestañas abiertas. La paleta global está definida en `css/global.css`; las imágenes conservan sus colores originales y, en los mapas, solo las teselas se oscurecen en el tema oscuro.

## Búsqueda de transporte

La interfaz permite seleccionar el origen por GPS o mapa y el destino desde el catálogo o el mapa. El destino escrito se considera pendiente hasta que se selecciona una sugerencia reconocida. Los itinerarios calculados se conservan en `sessionStorage` para abrir su ficha en la misma pestaña.

`data/rutas.json` está vacío mientras no se disponga de geometrías, paradas, dirección de circulación y una fuente verificable para rutas reales de Santa Marta. Por ello, una búsqueda normal informa que no hay recorridos verificados y no inventa líneas ni alternativas. La casilla **Usar recorrido de ejemplo** activa por separado los candidatos de `data/rutas-demo.json`; siguen pendientes de verificación y no representan servicios reales. Sus geometrías de bus se guardan en el catálogo, por lo que la aplicación no consulta OSRM para los trazados de bus; solo lo consulta, en el detalle del viaje, para dibujar las caminatas. Los tiempos son ilustrativos, no tiempos de bus; la distancia y el tiempo de caminata son aproximaciones en línea recta, y el trazado dibujado intenta seguir calles y andenes con OSRM peatonal (OpenStreetMap) pero no es una navegación peatonal verificada y puede diferir de las cifras mostradas. La suite combina fixtures sintéticos con comprobaciones del catálogo demo; ninguno de esos datos es información de servicio.

Los mapas usan Leaflet 1.9.4 (cargado desde unpkg por `js/maps.js`) y teselas de OpenStreetMap, con atribución visible. No requieren clave de API, pero sí conexión a internet. En el tema oscuro las teselas se oscurecen con un filtro CSS en `css/global.css`. Los horarios y tarifas turísticas que no estén confirmados en el catálogo deben consultarse con su fuente responsable.