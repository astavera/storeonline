/**
 * Implements the delivery zone service workflow for the fulfillment feature.
 */

export type LngLat = readonly [number, number];

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: ReadonlyArray<ReadonlyArray<LngLat>>;
};

export type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: ReadonlyArray<ReadonlyArray<ReadonlyArray<LngLat>>>;
};

export type DeliveryGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

export type DeliveryRateRulePolicy = {
  id: string;
  active: boolean;
  priority: number;
  feeCents: number;
  minimumSubtotalCents?: number | null;
  maximumSubtotalCents?: number | null;
};

export type DeliveryZonePolicy = {
  id: string;
  locationId: string;
  versionId?: string;
  active: boolean;
  priority: number;
  activeDays: readonly string[];
  geometry: DeliveryGeometry;
  baseFeeCents: number;
  minimumOrderCents: number;
  maxDistanceMiles?: number | null;
  maxRouteMinutes?: number | null;
  rateRules?: readonly DeliveryRateRulePolicy[];
};

export type LocalDeliveryEvaluationInput = {
  locationId: string;
  serviceDay: string;
  point: LngLat;
  subtotalCents: number;
  distanceMiles?: number | null;
  routeMinutes?: number | null;
};

export const localDeliveryReasonCodes = [
  "ELIGIBLE",
  "INVALID_INPUT",
  "INVALID_ZONE_CONFIGURATION",
  "NO_ACTIVE_ZONE",
  "SERVICE_DAY_UNAVAILABLE",
  "OUTSIDE_ZONE",
  "MINIMUM_ORDER_NOT_MET",
  "ROUTE_METRICS_REQUIRED",
  "DISTANCE_EXCEEDED",
  "ROUTE_TIME_EXCEEDED"
] as const;

export type LocalDeliveryReasonCode = (typeof localDeliveryReasonCodes)[number];

export type LocalDeliveryEvaluation = {
  eligible: boolean;
  reasonCode: LocalDeliveryReasonCode;
  locationId: string;
  zoneId?: string;
  zoneVersionId?: string;
  feeCents?: number;
  details?: {
    minimumOrderCents?: number;
    maxDistanceMiles?: number;
    maxRouteMinutes?: number;
  };
};

type RingClassification = "outside" | "inside" | "boundary";

const COORDINATE_EPSILON = 1e-10;

export function pointInPolygon(point: LngLat, polygon: ReadonlyArray<LngLat>) {
  if (!isLngLat(point) || polygon.length < 3 || !polygon.every(isLngLat)) return false;
  return classifyPointInRing(point, polygon) !== "outside";
}

export function pointInDeliveryGeometry(
  point: LngLat,
  geometry: DeliveryGeometry,
  options: { includeOuterBoundary?: boolean } = {}
) {
  if (!isLngLat(point) || !isValidDeliveryGeometry(geometry)) return false;
  const includeOuterBoundary = options.includeOuterBoundary ?? true;

  if (geometry.type === "Polygon") {
    return pointInPolygonCoordinates(point, geometry.coordinates, includeOuterBoundary);
  }

  return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(point, polygon, includeOuterBoundary));
}

export function isValidDeliveryGeometry(value: unknown): value is DeliveryGeometry {
  if (!isRecord(value) || (value.type !== "Polygon" && value.type !== "MultiPolygon")) return false;

  if (value.type === "Polygon") {
    return isPolygonCoordinates(value.coordinates);
  }

  return Array.isArray(value.coordinates)
    && value.coordinates.length > 0
    && value.coordinates.every(isPolygonCoordinates);
}

export function evaluateLocalDelivery(
  input: LocalDeliveryEvaluationInput,
  zones: readonly DeliveryZonePolicy[]
): LocalDeliveryEvaluation {
  const baseResult = { locationId: input.locationId };
  if (!isValidEvaluationInput(input)) {
    return { ...baseResult, eligible: false, reasonCode: "INVALID_INPUT" };
  }

  const locationZones = zones.filter((zone) => zone.locationId === input.locationId);
  if (locationZones.some((zone) => !isValidZonePolicy(zone))) {
    return { ...baseResult, eligible: false, reasonCode: "INVALID_ZONE_CONFIGURATION" };
  }
  const validLocationZones = locationZones.filter(isValidZonePolicy);

  const activeZones = validLocationZones.filter((zone) => zone.active);
  if (activeZones.length === 0) {
    return { ...baseResult, eligible: false, reasonCode: "NO_ACTIVE_ZONE" };
  }

  const dayZones = activeZones.filter((zone) => zone.activeDays.includes(input.serviceDay));
  if (dayZones.length === 0) {
    return { ...baseResult, eligible: false, reasonCode: "SERVICE_DAY_UNAVAILABLE" };
  }

  const containingZones = dayZones
    .filter((zone) => pointInDeliveryGeometry(input.point, zone.geometry))
    .sort(comparePriorityThenId);
  if (containingZones.length === 0) {
    return { ...baseResult, eligible: false, reasonCode: "OUTSIDE_ZONE" };
  }

  const failures: LocalDeliveryEvaluation[] = [];
  for (const zone of containingZones) {
    const zoneResult = evaluateContainingZone(input, zone);
    if (zoneResult.eligible) return zoneResult;
    failures.push(zoneResult);
  }

  return failures[0] ?? { ...baseResult, eligible: false, reasonCode: "INVALID_ZONE_CONFIGURATION" };
}

export function deliveryFeeMustBeServerCalculated() {
  return true;
}

function evaluateContainingZone(
  input: LocalDeliveryEvaluationInput,
  zone: DeliveryZonePolicy
): LocalDeliveryEvaluation {
  const baseResult = {
    eligible: false,
    locationId: input.locationId,
    zoneId: zone.id,
    zoneVersionId: zone.versionId
  } as const;

  if (input.subtotalCents < zone.minimumOrderCents) {
    return {
      ...baseResult,
      reasonCode: "MINIMUM_ORDER_NOT_MET",
      details: { minimumOrderCents: zone.minimumOrderCents }
    };
  }

  if (zone.maxDistanceMiles != null) {
    if (input.distanceMiles == null) {
      return { ...baseResult, reasonCode: "ROUTE_METRICS_REQUIRED" };
    }
    if (input.distanceMiles > zone.maxDistanceMiles) {
      return {
        ...baseResult,
        reasonCode: "DISTANCE_EXCEEDED",
        details: { maxDistanceMiles: zone.maxDistanceMiles }
      };
    }
  }

  if (zone.maxRouteMinutes != null) {
    if (input.routeMinutes == null) {
      return { ...baseResult, reasonCode: "ROUTE_METRICS_REQUIRED" };
    }
    if (input.routeMinutes > zone.maxRouteMinutes) {
      return {
        ...baseResult,
        reasonCode: "ROUTE_TIME_EXCEEDED",
        details: { maxRouteMinutes: zone.maxRouteMinutes }
      };
    }
  }

  const feeCents = resolveDeliveryFee(zone, input.subtotalCents);
  if (feeCents == null) {
    return { ...baseResult, reasonCode: "INVALID_ZONE_CONFIGURATION" };
  }

  return {
    eligible: true,
    reasonCode: "ELIGIBLE",
    locationId: input.locationId,
    zoneId: zone.id,
    zoneVersionId: zone.versionId,
    feeCents
  };
}

function resolveDeliveryFee(zone: DeliveryZonePolicy, subtotalCents: number) {
  const activeRules = (zone.rateRules ?? []).filter((rule) => rule.active);
  if (activeRules.some((rule) => !isValidRateRule(rule))) return null;

  const matchingRule = activeRules
    .filter((rule) => rule.minimumSubtotalCents == null || subtotalCents >= rule.minimumSubtotalCents)
    .filter((rule) => rule.maximumSubtotalCents == null || subtotalCents <= rule.maximumSubtotalCents)
    .sort(comparePriorityThenId)[0];

  return matchingRule?.feeCents ?? zone.baseFeeCents;
}

function pointInPolygonCoordinates(
  point: LngLat,
  coordinates: ReadonlyArray<ReadonlyArray<LngLat>>,
  includeOuterBoundary: boolean
) {
  const outer = classifyPointInRing(point, coordinates[0]);
  if (outer === "outside" || (outer === "boundary" && !includeOuterBoundary)) return false;

  for (const hole of coordinates.slice(1)) {
    const holeResult = classifyPointInRing(point, hole);
    if (holeResult === "inside" || holeResult === "boundary") return false;
  }

  return true;
}

function classifyPointInRing(point: LngLat, ring: ReadonlyArray<LngLat>): RingClassification {
  const [x, y] = point;
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return "boundary";

    const [xi, yi] = currentPoint;
    const [xj, yj] = previousPoint;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside ? "inside" : "outside";
}

function pointOnSegment(point: LngLat, start: LngLat, end: LngLat) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const squaredLength = deltaX ** 2 + deltaY ** 2;
  if (squaredLength <= COORDINATE_EPSILON ** 2) {
    return Math.abs(point[0] - start[0]) <= COORDINATE_EPSILON
      && Math.abs(point[1] - start[1]) <= COORDINATE_EPSILON;
  }

  const crossProduct = (point[1] - start[1]) * (end[0] - start[0])
    - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(crossProduct) > COORDINATE_EPSILON) return false;

  const dotProduct = (point[0] - start[0]) * (end[0] - start[0])
    + (point[1] - start[1]) * (end[1] - start[1]);
  if (dotProduct < -COORDINATE_EPSILON) return false;

  return dotProduct <= squaredLength + COORDINATE_EPSILON;
}

function isPolygonCoordinates(value: unknown): value is ReadonlyArray<ReadonlyArray<LngLat>> {
  return Array.isArray(value) && value.length > 0 && value.every(isValidLinearRing);
}

function isValidLinearRing(value: unknown): value is ReadonlyArray<LngLat> {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isLngLat)) return false;
  const first = value[0];
  const last = value[value.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function isLngLat(value: unknown): value is LngLat {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function isValidEvaluationInput(input: LocalDeliveryEvaluationInput) {
  return input.locationId.length > 0
    && input.serviceDay.length > 0
    && isLngLat(input.point)
    && isNonnegativeInteger(input.subtotalCents)
    && isOptionalNonnegativeNumber(input.distanceMiles)
    && isOptionalNonnegativeNumber(input.routeMinutes);
}

function isValidZonePolicy(zone: DeliveryZonePolicy) {
  return zone.id.length > 0
    && zone.locationId.length > 0
    && Number.isInteger(zone.priority)
    && Array.isArray(zone.activeDays)
    && zone.activeDays.every((day) => typeof day === "string" && day.length > 0)
    && isValidDeliveryGeometry(zone.geometry)
    && isNonnegativeInteger(zone.baseFeeCents)
    && isNonnegativeInteger(zone.minimumOrderCents)
    && isOptionalNonnegativeNumber(zone.maxDistanceMiles)
    && isOptionalNonnegativeNumber(zone.maxRouteMinutes);
}

function isValidRateRule(rule: DeliveryRateRulePolicy) {
  const minimum = rule.minimumSubtotalCents;
  const maximum = rule.maximumSubtotalCents;
  return rule.id.length > 0
    && Number.isInteger(rule.priority)
    && isNonnegativeInteger(rule.feeCents)
    && (minimum == null || isNonnegativeInteger(minimum))
    && (maximum == null || isNonnegativeInteger(maximum))
    && (minimum == null || maximum == null || minimum <= maximum);
}

function isOptionalNonnegativeNumber(value: number | null | undefined) {
  return value == null || (Number.isFinite(value) && value >= 0);
}

function isNonnegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

function comparePriorityThenId<T extends { id: string; priority: number }>(left: T, right: T) {
  return right.priority - left.priority || left.id.localeCompare(right.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
