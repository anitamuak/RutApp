((root, factory) => {
  const planner = factory();
  if (typeof module === "object" && module.exports) module.exports = planner;
  if (root) root.RutAppRoutePlanner = planner;
})(typeof globalThis === "object" ? globalThis : this, () => {
  const DEFAULT_OPTIONS = Object.freeze({
    maxTransfers: 2,
    maxAccessWalkMeters: 1200,
    maxTransferWalkMeters: 350,
    maxStopSnapMeters: 180,
    walkingSpeedKmh: 4.5,
    busSpeedKmh: 18,
    estimatedWaitMinutesPerBus: 5,
    walkingDistanceCorrection: 1.25,
    maxAlternatives: 5
  });

  function isCoordinate(point) {
    return Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 90 &&
      Math.abs(point[1]) <= 180;
  }

  function haversineMeters(first, second) {
    if (!isCoordinate(first) || !isCoordinate(second)) return Infinity;
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(second[0] - first[0]);
    const longitudeDelta = radians(second[1] - first[1]);
    const latitudeOne = radians(first[0]);
    const latitudeTwo = radians(second[0]);
    const value = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(latitudeOne) * Math.cos(latitudeTwo) *
      Math.sin(longitudeDelta / 2) ** 2;
    return 6371008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function projectPointToSegment(point, start, end) {
    const latitudeScale = 111320;
    const longitudeScale = latitudeScale * Math.cos(point[0] * Math.PI / 180);
    const project = ([latitude, longitude]) => [
      longitude * longitudeScale,
      latitude * latitudeScale
    ];
    const p = project(point);
    const a = project(start);
    const b = project(end);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const denominator = dx * dx + dy * dy;
    const fraction = denominator === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator));
    const projected = [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction
    ];
    return { point: projected, fraction, distanceMeters: haversineMeters(point, projected) };
  }

  function measureGeometry(geometry) {
    const cumulative = [0];
    for (let index = 1; index < geometry.length; index += 1) {
      cumulative.push(cumulative[index - 1] + haversineMeters(geometry[index - 1], geometry[index]));
    }
    return cumulative;
  }

  function projectStop(stop, geometry, cumulative, snapLimit) {
    const point = [stop.latitude, stop.longitude];
    let best = null;
    for (let index = 1; index < geometry.length; index += 1) {
      const projection = projectPointToSegment(point, geometry[index - 1], geometry[index]);
      if (!best || projection.distanceMeters < best.distanceMeters) {
        best = {
          distanceMeters: projection.distanceMeters,
          point: projection.point,
          chainageMeters: cumulative[index - 1] +
            (cumulative[index] - cumulative[index - 1]) * projection.fraction
        };
      }
    }
    return best && best.distanceMeters <= snapLimit ? best : null;
  }

  function sliceGeometry(geometry, cumulative, startMeters, endMeters) {
    if (endMeters < startMeters) return [];
    const pointAt = (chainage) => {
      if (chainage <= 0) return geometry[0];
      if (chainage >= cumulative[cumulative.length - 1]) return geometry[geometry.length - 1];
      for (let index = 1; index < cumulative.length; index += 1) {
        if (chainage <= cumulative[index]) {
          const length = cumulative[index] - cumulative[index - 1];
          const fraction = length === 0 ? 0 : (chainage - cumulative[index - 1]) / length;
          return [
            geometry[index - 1][0] + (geometry[index][0] - geometry[index - 1][0]) * fraction,
            geometry[index - 1][1] + (geometry[index][1] - geometry[index - 1][1]) * fraction
          ];
        }
      }
      return geometry[geometry.length - 1];
    };

    const points = [pointAt(startMeters)];
    for (let index = 1; index < geometry.length - 1; index += 1) {
      if (cumulative[index] > startMeters && cumulative[index] < endMeters) points.push(geometry[index]);
    }
    points.push(pointAt(endMeters));
    return points.filter((point, index) => index === 0 || haversineMeters(points[index - 1], point) > 0.1);
  }

  function prepareRoutes(routes, options) {
    const prepared = [];
    const rejected = [];
    const seenIds = new Set();

    for (const route of routes) {
      const reject = (reason) => rejected.push({ routeId: route?.id || null, reason });
      if (!route || typeof route.id !== "string" || seenIds.has(route.id)) {
        reject("Identificador de ruta ausente o duplicado.");
        continue;
      }
      seenIds.add(route.id);
      if (route.verificationStatus !== "verified") {
        reject("El recorrido no está verificado como transporte real.");
        continue;
      }
      if (typeof route.name !== "string" || !route.name.trim() ||
          typeof route.source !== "string" || !route.source.trim() ||
          typeof route.direction !== "string" || !route.direction.trim()) {
        reject("Falta el nombre, la fuente o el sentido verificado del recorrido.");
        continue;
      }
      if (!Array.isArray(route.geometry) || route.geometry.length < 2 ||
          route.geometry.some((point) => !isCoordinate(point))) {
        reject("La geometría del recorrido está ausente o incompleta.");
        continue;
      }
      if (!Array.isArray(route.stops) || route.stops.length < 2) {
        reject("Faltan puntos de abordaje y descenso.");
        continue;
      }

      const geometry = route.geometry;
      const cumulative = measureGeometry(geometry);
      if (!Number.isFinite(cumulative[cumulative.length - 1]) || cumulative[cumulative.length - 1] <= 0) {
        reject("La geometría no tiene una longitud válida.");
        continue;
      }

      const stops = [...route.stops]
        .filter((stop) => stop && typeof stop.id === "string" && stop.id.trim() &&
          typeof stop.name === "string" && stop.name.trim() &&
          Number.isFinite(stop.latitude) &&
          Number.isFinite(stop.longitude) &&
          isCoordinate([stop.latitude, stop.longitude]) &&
          Number.isFinite(stop.sequence))
        .sort((first, second) => first.sequence - second.sequence);
      if (stops.length < 2 || stops.length !== route.stops.length) {
        reject("Una o más paradas no tienen identificador, secuencia o coordenadas válidas.");
        continue;
      }
      if (new Set(stops.map((stop) => stop.id)).size !== stops.length ||
          new Set(stops.map((stop) => stop.sequence)).size !== stops.length) {
        reject("Las paradas tienen identificadores o secuencias duplicados.");
        continue;
      }

      const positionedStops = [];
      let previousChainage = -1;
      let invalidStop = false;
      for (const stop of stops) {
        const projected = projectStop(stop, geometry, cumulative, options.maxStopSnapMeters);
        if (!projected || projected.chainageMeters <= previousChainage) {
          invalidStop = true;
          break;
        }
        previousChainage = projected.chainageMeters;
        positionedStops.push({
          ...stop,
          coordinates: [stop.latitude, stop.longitude],
          chainageMeters: projected.chainageMeters
        });
      }
      if (invalidStop) {
        reject("Las paradas no siguen el sentido de la geometría o quedan lejos de ella.");
        continue;
      }

      const preparedRoute = {
        ...route,
        estimatedSpeedKmh: Number.isFinite(route.estimatedSpeedKmh) && route.estimatedSpeedKmh > 0
          ? route.estimatedSpeedKmh
          : options.busSpeedKmh,
        geometry,
        stops: positionedStops,
        cumulative,
        nodes: []
      };
      preparedRoute.nodes = positionedStops.map((stop) => ({
        id: `${route.id}:${stop.id}`,
        route: preparedRoute,
        stop
      }));
      prepared.push(preparedRoute);
    }
    return { routes: prepared, rejected };
  }

  function timeForWalk(distanceMeters, options) {
    return distanceMeters / 1000 / options.walkingSpeedKmh * 60;
  }

  function rideEdges(node) {
    const route = node.route;
    const stopIndex = route.nodes.findIndex((candidate) => candidate.id === node.id);
    const edges = [];
    for (let index = stopIndex + 1; index < route.nodes.length; index += 1) {
      const destination = route.nodes[index];
      const distanceMeters = destination.stop.chainageMeters - node.stop.chainageMeters;
      if (distanceMeters <= 0) continue;
      edges.push({
        type: "bus",
        from: node,
        to: destination,
        route,
        distanceMeters,
        durationMinutes: distanceMeters / 1000 / route.estimatedSpeedKmh * 60,
        geometry: sliceGeometry(route.geometry, route.cumulative, node.stop.chainageMeters, destination.stop.chainageMeters)
      });
    }
    return edges;
  }

  function buildJourney(origin, destination, originNode, terminalNode, edges, finalWalkMeters, options) {
    const segments = [];
    for (const edge of edges) {
      if (edge.type === "bus") {
        const last = segments[segments.length - 1];
        if (last?.type === "bus" && last.routeId === edge.route.id && last.to.id === edge.from.stop.id) {
          last.to = edge.to.stop;
          last.distanceMeters += edge.distanceMeters;
          last.durationMinutes += edge.durationMinutes;
          last.geometry = last.geometry.concat(edge.geometry.slice(1));
        } else {
          segments.push({
            type: "bus",
            routeId: edge.route.id,
            routeName: edge.route.name,
            poster: edge.route.poster || null,
            direction: edge.route.direction,
            from: edge.from.stop,
            to: edge.to.stop,
            distanceMeters: edge.distanceMeters,
            durationMinutes: edge.durationMinutes,
            geometry: edge.geometry
          });
        }
      } else {
        segments.push({
          type: "walk",
          from: edge.from.stop,
          to: edge.to.stop,
          distanceMeters: edge.distanceMeters,
          durationMinutes: edge.durationMinutes,
          purpose: "transfer"
        });
      }
    }

    const initialWalk = haversineMeters(origin.coordinates, originNode.stop.coordinates) *
      options.walkingDistanceCorrection;
    const finalWalk = finalWalkMeters * options.walkingDistanceCorrection;
    const itinerary = [{
      type: "origin",
      title: "Punto de partida",
      description: origin.label,
      coordinates: origin.coordinates
    }];
    if (initialWalk > 1) {
      itinerary.push({
        type: "walk",
        title: "Camina hasta el punto de abordaje",
        description: originNode.stop.name,
        distanceMeters: initialWalk,
        durationMinutes: timeForWalk(initialWalk, options),
        from: origin.coordinates,
        to: originNode.stop.coordinates,
        geometry: [origin.coordinates, originNode.stop.coordinates],
        schematic: true
      });
    }

    for (const segment of segments) {
      if (segment.type === "walk") {
        itinerary.push({
          type: "walk",
          title: "Camina al siguiente punto de abordaje",
          description: `${segment.from.name} → ${segment.to.name}`,
          distanceMeters: segment.distanceMeters * options.walkingDistanceCorrection,
          durationMinutes: timeForWalk(segment.distanceMeters * options.walkingDistanceCorrection, options),
          from: segment.from.coordinates,
          to: segment.to.coordinates,
          geometry: [segment.from.coordinates, segment.to.coordinates],
          schematic: true
        });
      } else {
        itinerary.push({
          type: "bus",
          title: `Toma el bus ${segment.routeName}`,
          description: `${segment.from.name} → ${segment.to.name}`,
          routeId: segment.routeId,
          routeName: segment.routeName,
          poster: segment.poster,
          direction: segment.direction,
          distanceMeters: segment.distanceMeters,
          durationMinutes: segment.durationMinutes,
          board: segment.from,
          alight: segment.to,
          geometry: segment.geometry,
          schematic: false
        });
      }
    }

    if (finalWalk > 1) {
      itinerary.push({
        type: "walk",
        title: "Camina hasta el destino",
        description: destination.label,
        distanceMeters: finalWalk,
        durationMinutes: timeForWalk(finalWalk, options),
        from: terminalNode.stop.coordinates,
        to: destination.coordinates,
        geometry: [terminalNode.stop.coordinates, destination.coordinates],
        schematic: true
      });
    }
    itinerary.push({
      type: "destination",
      title: "Destino final",
      description: destination.label,
      coordinates: destination.coordinates
    });

    const busSegments = segments.filter((segment) => segment.type === "bus");
    const transferSegments = segments.filter((segment) => segment.type === "walk");
    const walkingMeters = initialWalk + finalWalk + transferSegments.reduce(
      (total, segment) => total + segment.distanceMeters * options.walkingDistanceCorrection,
      0
    );
    const busMeters = busSegments.reduce((total, segment) => total + segment.distanceMeters, 0);
    const waitingMinutes = busSegments.length * options.estimatedWaitMinutesPerBus;
    const estimatedMinutes = itinerary.reduce((total, step) => total + (step.durationMinutes || 0), 0) + waitingMinutes;
    const routeIds = busSegments.map((segment) => segment.routeId);
    const id = `${routeIds.join("-")}-${busSegments.map((segment) => `${segment.from.id}-${segment.to.id}`).join("-")}`;

    return {
      id,
      origin: { label: origin.label, coordinates: origin.coordinates },
      destination: { label: destination.label, coordinates: destination.coordinates },
      routeIds,
      routeNames: busSegments.map((segment) => segment.routeName),
      buses: busSegments.length,
      transfers: Math.max(0, busSegments.length - 1),
      walkingDistanceMeters: Math.round(walkingMeters),
      busDistanceMeters: Math.round(busMeters),
      totalDistanceMeters: Math.round(walkingMeters + busMeters),
      estimatedMinutes: Math.ceil(estimatedMinutes),
      estimated: true,
      estimateNote: "Tiempo aproximado con velocidades configurables; no incluye tráfico, frecuencias ni información en tiempo real.",
      walkingNote: "Distancia peatonal estimada en línea geográfica con factor de corrección; no es una ruta de calles verificada.",
      segments,
      itinerary
    };
  }

  function search(routes, origin, destination, customOptions = {}) {
    const options = { ...DEFAULT_OPTIONS, ...customOptions };
    const rejected = [];
    if (!isCoordinate(origin?.coordinates) || !isCoordinate(destination?.coordinates)) {
      return { alternatives: [], rejected, error: "El origen y el destino requieren coordenadas geográficas válidas." };
    }
    if (!Array.isArray(routes)) {
      return { alternatives: [], rejected, error: "La base de datos de recorridos no tiene un formato válido." };
    }
    const prepared = prepareRoutes(routes, options);
    rejected.push(...prepared.rejected);
    const allNodes = prepared.routes.flatMap((route) => route.nodes);
    if (allNodes.length === 0) return { alternatives: [], rejected };

    const queue = [];
    for (const node of allNodes) {
      const accessDistance = haversineMeters(origin.coordinates, node.stop.coordinates);
      if (accessDistance <= options.maxAccessWalkMeters) {
        queue.push({
          node,
          edges: [],
          routeIds: [],
            onBusRoute: null,
            canTransfer: false,
            cost: timeForWalk(accessDistance * options.walkingDistanceCorrection, options),
            accessDistance
        });
      }
    }

    const bestCosts = new Map();
    const candidates = [];
    while (queue.length > 0) {
      queue.sort((first, second) => first.cost - second.cost);
      const current = queue.shift();
      const routeSequence = current.routeIds.join(",");
      const signature = `${current.node.id}|${routeSequence}|${current.onBusRoute || "walk"}`;
      if (current.cost > (bestCosts.get(signature) ?? Infinity)) continue;
      bestCosts.set(signature, current.cost);

      if (current.routeIds.length > 0 && current.onBusRoute) {
        const egressDistance = haversineMeters(current.node.stop.coordinates, destination.coordinates);
        if (egressDistance <= options.maxAccessWalkMeters) {
          const trip = buildJourney(
            origin,
            destination,
            current.edges[0]?.from || current.node,
            current.node,
            current.edges,
            egressDistance,
            options
          );
          const key = `${trip.routeIds.join(",")}|${trip.segments.filter((segment) => segment.type === "bus")
            .map((segment) => `${segment.from.id}>${segment.to.id}`).join(",")}`;
          if (!candidates.some((candidate) => candidate.key === key)) {
            candidates.push({ key, trip, cost: trip.estimatedMinutes });
          }
        }
      }

      for (const edge of rideEdges(current.node)) {
        const continuingRoute = current.onBusRoute === edge.route.id;
        if (current.routeIds.includes(edge.route.id) && !continuingRoute) continue;
        const routeIds = continuingRoute || current.routeIds.includes(edge.route.id)
          ? current.routeIds
          : [...current.routeIds, edge.route.id];
        const boardingPenalty = continuingRoute
          ? 0
          : options.estimatedWaitMinutesPerBus;
        const next = {
          node: edge.to,
          edges: [...current.edges, edge],
          routeIds,
          onBusRoute: edge.route.id,
          canTransfer: true,
          cost: current.cost + edge.durationMinutes + boardingPenalty,
          accessDistance: current.accessDistance
        };
        const nextSignature = `${next.node.id}|${next.routeIds.join(",")}|${next.onBusRoute}`;
        if (next.cost < (bestCosts.get(nextSignature) ?? Infinity)) queue.push(next);
      }

      if (current.canTransfer &&
          current.routeIds.length > 0 &&
          current.routeIds.length <= options.maxTransfers) {
        for (const transferNode of allNodes) {
          if (transferNode.route.id === current.node.route.id ||
              current.routeIds.includes(transferNode.route.id)) continue;
          const distanceMeters = haversineMeters(current.node.stop.coordinates, transferNode.stop.coordinates);
          if (distanceMeters > options.maxTransferWalkMeters) continue;
          const edge = {
            type: "walk",
            from: current.node,
            to: transferNode,
            distanceMeters,
            durationMinutes: timeForWalk(distanceMeters * options.walkingDistanceCorrection, options)
          };
          const next = {
            node: transferNode,
            edges: [...current.edges, edge],
            routeIds: current.routeIds,
            onBusRoute: null,
            canTransfer: false,
            cost: current.cost + edge.durationMinutes,
            accessDistance: current.accessDistance
          };
          const nextSignature = `${next.node.id}|${next.routeIds.join(",")}|walk`;
          if (next.cost < (bestCosts.get(nextSignature) ?? Infinity)) queue.push(next);
        }
      }
    }

    candidates.sort((first, second) =>
      first.cost - second.cost ||
      first.trip.transfers - second.trip.transfers ||
      first.trip.walkingDistanceMeters - second.trip.walkingDistanceMeters
    );
    return {
      alternatives: candidates.slice(0, options.maxAlternatives).map(({ trip }) => trip),
      rejected,
      options
    };
  }

  return Object.freeze({ DEFAULT_OPTIONS, haversineMeters, search });
});
