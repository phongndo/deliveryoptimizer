import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearEditPageDraft,
  loadEditPageDraft,
  saveEditPageDraft,
} from "@/lib/session/editPageDraft";
import type { AddressCard, VehicleRow } from "@/app/edit/types/delivery";

const sessionStore = new Map<string, string>();

const sessionStorageMock = {
  getItem: vi.fn((key: string) => sessionStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStore.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    sessionStore.delete(key);
  }),
};

function makeVehicle(overrides: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: 1,
    locked: true,
    editingExisting: false,
    name: "Driver 1",
    startLocation: "123 Depot St, Davis, CA 95616, United States",
    cachedLocation: { lat: 38.5449, lng: -121.7405, state: "California" },
    type: "car",
    capacityUnit: "units",
    capacity: 10,
    available: true,
    departureTime: "09:00am",
    ...overrides,
  };
}

function makeAddress(overrides: Partial<AddressCard> = {}): AddressCard {
  return {
    id: 2,
    locked: true,
    editingExisting: false,
    recipientName: "",
    phoneNumber: "",
    recipientAddress: "456 Delivery Ave",
    timeBuffer: 0,
    deliveryTimeStart: "",
    deliveryTimeEnd: "",
    deliveryQuantity: 3,
    notes: "",
    ...overrides,
  };
}

describe("edit page draft", () => {
  beforeEach(() => {
    sessionStore.clear();
    vi.clearAllMocks();
    vi.stubGlobal("window", { sessionStorage: sessionStorageMock });
    vi.stubGlobal("sessionStorage", sessionStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists vehicle start address and cached coordinates", () => {
    const vehicle = makeVehicle();
    const address = makeAddress();

    saveEditPageDraft([vehicle], [address]);

    expect(loadEditPageDraft()).toEqual({
      vehicles: [vehicle],
      addresses: [address],
    });
  });

  it("loads older drafts without vehicle start location fields", () => {
    sessionStore.set(
      "editPageDraft",
      JSON.stringify({
        version: 1,
        vehicles: [
          {
            id: 1,
            locked: true,
            editingExisting: false,
            name: "Driver 1",
            type: "car",
            capacityUnit: "units",
            capacity: 10,
            available: true,
            departureTime: "09:00am",
          },
        ],
        addresses: [],
      }),
    );

    expect(loadEditPageDraft()?.vehicles[0]).toMatchObject({
      startLocation: "",
      cachedLocation: undefined,
    });
  });

  it("clears the stored draft", () => {
    saveEditPageDraft([makeVehicle()], []);
    clearEditPageDraft();

    expect(loadEditPageDraft()).toBeNull();
  });
});
