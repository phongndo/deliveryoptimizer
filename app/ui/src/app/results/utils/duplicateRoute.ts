import type { Route } from "../types";

/**
 * driverPhoneNumber/lastSentAt are reset because the copy is an unassigned
 * vehicle/driver slot, not the source's driver — carrying them over would
 * show a stale "Sent" badge and risk sending to the wrong driver.
 */
export function duplicateRoute(source: Route, suffix: string): Route {
  return {
    ...source,
    vehicleId: `${source.vehicleId}-copy-${suffix}`,
    driverName: `${source.driverName} (copy)`,
    driverPhoneNumber: undefined,
    lastSentAt: undefined,
    stops: source.stops.map((stop, stopIndex) => ({
      ...stop,
      id: `${stop.id}-copy-${suffix}-${stopIndex}`,
    })),
  };
}
