import type { AddressCard, VehicleRow } from "@/app/edit/types/delivery";

type DraftVehicle = Omit<VehicleRow, "startLocation" | "cachedLocation"> &
  Partial<Pick<VehicleRow, "startLocation" | "cachedLocation">>;

type EditPageDraft = {
  version: 1;
  vehicles: DraftVehicle[];
  addresses: AddressCard[];
};

const DRAFT_KEY = "editPageDraft";

export function saveEditPageDraft(
  vehicles: VehicleRow[],
  addresses: AddressCard[],
): void {
  if (typeof window === "undefined") return;
  try {
    const draft: EditPageDraft = {
      version: 1,
      vehicles: vehicles.map((v) => ({
        id: v.id,
        locked: v.locked,
        editingExisting: v.editingExisting,
        name: v.name,
        type: v.type,
        capacityUnit: v.capacityUnit,
        capacity: v.capacity,
        available: v.available,
        departureTime: v.departureTime,
        startLocation: v.startLocation,
        cachedLocation: v.cachedLocation,
      })),
      addresses,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Silently ignore QuotaExceededError and other storage errors.
  }
}

export function loadEditPageDraft(): {
  vehicles: VehicleRow[];
  addresses: AddressCard[];
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as EditPageDraft).version !== 1 ||
      !Array.isArray((parsed as EditPageDraft).vehicles) ||
      !Array.isArray((parsed as EditPageDraft).addresses)
    ) {
      return null;
    }

    const draft = parsed as EditPageDraft;
    const vehicles: VehicleRow[] = draft.vehicles.map((v) => ({
      ...v,
      startLocation: v.startLocation ?? "",
      cachedLocation: v.cachedLocation,
    }));

    return { vehicles, addresses: draft.addresses };
  } catch {
    return null;
  }
}

export function clearEditPageDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
