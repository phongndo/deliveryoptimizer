import { describe, it, expect } from "vitest";
import { hasCachedLocationWithState } from "@/app/edit/utils/deliveryHelpers";
import type { AddressCard } from "@/app/edit/types/delivery";

function makeAddress(overrides: Partial<AddressCard> = {}): AddressCard {
  return {
    id: 1,
    locked: true,
    editingExisting: false,
    recipientName: "",
    phoneNumber: "",
    recipientAddress: "123 Main St",
    timeBuffer: 0,
    deliveryTimeStart: "",
    deliveryTimeEnd: "",
    deliveryQuantity: 3,
    notes: "",
    ...overrides,
  };
}

describe("hasCachedLocationWithState", () => {
  it("imported address with null state falls through to geocode", () => {
    expect(
      hasCachedLocationWithState(
        makeAddress({
          cachedLocation: { lat: 38.5449, lng: -121.7405, state: null },
        }),
      ),
    ).toBe(false);
  });

  it("geocoded address with a known state is reused", () => {
    expect(
      hasCachedLocationWithState(
        makeAddress({
          cachedLocation: {
            lat: 38.5449,
            lng: -121.7405,
            state: "California",
          },
        }),
      ),
    ).toBe(true);
  });

  it("no cachedLocation falls through to geocode", () => {
    expect(hasCachedLocationWithState(makeAddress())).toBe(false);
  });
});
