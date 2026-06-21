import { describe, it, expect } from "vitest";
import { duplicateRoute } from "@/app/results/utils/duplicateRoute";
import type { Route } from "@/app/results/types";

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    vehicleId: "vehicle-1",
    driverName: "Jim",
    stops: [
      {
        id: "stop-1",
        address: "123 Main St",
        lat: 1,
        lng: 2,
        sequence: 0,
        capacityUsed: 1,
        timeWindow: { kind: "at", time: "11:00" },
        note: "",
      },
    ],
    ...overrides,
  };
}

describe("duplicateRoute", () => {
  it("clears lastSentAt and driverPhoneNumber on the copy", () => {
    const source = makeRoute({
      driverPhoneNumber: "+14155551234",
      lastSentAt: "2026-01-01T00:00:00.000Z",
    });

    const copy = duplicateRoute(source, "abc123");

    expect(copy.lastSentAt).toBeUndefined();
    expect(copy.driverPhoneNumber).toBeUndefined();
  });

  it("renames vehicleId, driverName, and stop ids with the given suffix", () => {
    const source = makeRoute();

    const copy = duplicateRoute(source, "abc123");

    expect(copy.vehicleId).toBe("vehicle-1-copy-abc123");
    expect(copy.driverName).toBe("Jim (copy)");
    expect(copy.stops[0].id).toBe("stop-1-copy-abc123-0");
  });

  it("carries over other route fields unchanged", () => {
    const source = makeRoute({
      distanceMi: 12.5,
      estimatedTimeMinutes: 45,
      geometry: [{ lat: 1, lng: 2 }],
      vehicleType: "Van",
    });

    const copy = duplicateRoute(source, "abc123");

    expect(copy.distanceMi).toBe(12.5);
    expect(copy.estimatedTimeMinutes).toBe(45);
    expect(copy.geometry).toEqual([{ lat: 1, lng: 2 }]);
    expect(copy.vehicleType).toBe("Van");
  });
});
