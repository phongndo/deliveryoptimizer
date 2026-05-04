"use client";

/**
 * One vehicle in the list: Figma desktop summary row or mobile card/form.
 *
 * The `layout` prop is kept because mobile vs desktop differ in real structure (stacked card vs
 * grid fragments), not only responsive CSS on one tree.
 */

import { useRef, type ReactNode } from "react";
import { TIME_OPTIONS } from "../constants/timeOptions";
import type { VehicleRow as VehicleRowType, VehicleType, CapacityUnit } from "../types/delivery";
import { capitalize } from "../utils/deliveryHelpers";
import {
  MOBILE_FIELD_LABEL,
  VEHICLE_AVAILABLE_SEGMENT_BUTTON,
  VEHICLE_AVAILABLE_SEGMENT_READ_ONLY_SPAN,
  VEHICLE_AVAILABLE_SEGMENT_ROW,
  VEHICLE_AVAILABLE_SEGMENT_THUMB,
  VEHICLE_AVAILABLE_SEGMENT_THUMB_NO,
  VEHICLE_AVAILABLE_SEGMENT_THUMB_YES,
  VEHICLE_AVAILABLE_SEGMENTED_TRACK,
  VEHICLE_AVAILABLE_SEGMENT_WRAPPER,
  VEHICLE_LOCKED_CELL,
  VEHICLE_MOBILE_CARD,
  VEHICLE_MOBILE_EDITING_CARD,
  VEHICLE_MOBILE_INPUT,
  VEHICLE_MOBILE_SELECT,
  VEHICLE_PILL_FULL_DANGER,
  VEHICLE_PILL_FULL_PRIMARY,
  VEHICLE_PILL_HALF,
  VEHICLE_PILL_HALF_DANGER,
  VEHICLE_MOBILE_AVAILABLE_LABEL,
  VEHICLE_MOBILE_AVAILABLE_ROW,
  VEHICLE_MOBILE_EDITING_ACTIONS,
  VEHICLE_MOBILE_LOCKED_ACTIONS,
  VEHICLE_MOBILE_LOCKED_TEXT,
  fieldBorder,
} from "../formStyles";
import {
  VEHICLE_ROW_CELL,
  VEHICLE_ROW_ACTIONS,
  VEHICLE_ROW_DELETE_ICON,
  VEHICLE_ROW_DESKTOP,
  VEHICLE_ROW_EDIT_ICON,
  VEHICLE_ROW_ICON,
  VEHICLE_ROW_ICON_BUTTON,
  VEHICLE_ROW_STATUS_BADGE_AVAILABLE,
  VEHICLE_ROW_STATUS_BADGE_UNAVAILABLE,
  VEHICLE_ROW_STATUS_CELL,
  VEHICLE_ROW_STATUS_TEXT_AVAILABLE,
  VEHICLE_ROW_STATUS_TEXT_UNAVAILABLE,
} from "../formStyles.v2";

type VehicleLayout = "desktop" | "mobile";

type VehicleRowProps = {
  layout?: VehicleLayout;
  vehicle: VehicleRowType;
  vehiclesCount: number;
  updateVehicle: <K extends keyof VehicleRowType>(id: number, key: K, value: VehicleRowType[K]) => void;
  deleteVehicle: (id: number) => void;
  unlockVehicle: (id: number) => void;
  confirmVehicle: (id: number) => void;
  onEditVehicle?: (vehicle: VehicleRowType) => void;
  vehicleTouched: boolean;
  geocodeFailed: boolean;
  outOfRegionFailed: boolean;
};

function MobileFieldLabel({ children }: { children: ReactNode }) {
  return <span className={MOBILE_FIELD_LABEL}>{children}</span>;
}

function AvailableSegmented({
  available,
  onChange,
}: {
  available: boolean;
  onChange?: (next: boolean) => void;
}) {
  const readOnly = onChange == null;
  const noRef = useRef<HTMLButtonElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    if (readOnly) return;
    const next = !available;
    onChange?.(next);
    // Move focus to the newly activated option after re-render
    requestAnimationFrame(() => {
      (next ? yesRef : noRef).current?.focus();
    });
  }

  const trackClass = `${VEHICLE_AVAILABLE_SEGMENTED_TRACK}${readOnly ? " pointer-events-none" : ""}`;
  const thumbClass = `${VEHICLE_AVAILABLE_SEGMENT_THUMB} ${available ? VEHICLE_AVAILABLE_SEGMENT_THUMB_YES : VEHICLE_AVAILABLE_SEGMENT_THUMB_NO}`;

  return (
    <div role="radiogroup" aria-readonly={readOnly} aria-label="Available" className={trackClass}>
      <div className={thumbClass} aria-hidden />
      <div className={VEHICLE_AVAILABLE_SEGMENT_ROW}>
        {readOnly ? (
          <>
            <span className={VEHICLE_AVAILABLE_SEGMENT_READ_ONLY_SPAN}>
              No
            </span>
            <span className={VEHICLE_AVAILABLE_SEGMENT_READ_ONLY_SPAN}>
              Yes
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              role="radio"
              aria-checked={!available}
              ref={noRef}
              className={VEHICLE_AVAILABLE_SEGMENT_BUTTON}
              onClick={() => onChange(false)}
              onKeyDown={handleKeyDown}
            >
              No
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={available}
              ref={yesRef}
              className={VEHICLE_AVAILABLE_SEGMENT_BUTTON}
              onClick={() => onChange(true)}
              onKeyDown={handleKeyDown}
            >
              Yes
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VehicleRow({
  layout = "desktop",
  vehicle: v,
  updateVehicle,
  deleteVehicle,
  unlockVehicle,
  confirmVehicle,
  onEditVehicle,
  vehicleTouched,
}: VehicleRowProps) {
  const nameInvalid = vehicleTouched && !v.name.trim();
  const typeInvalid = vehicleTouched && !v.type;
  const capMeasureInvalid = vehicleTouched && !v.capacityUnit;
  const capacityInvalid = vehicleTouched && v.capacity <= 0;
  const departureInvalid = vehicleTouched && !v.departureTime.trim();

  const inputClass = (invalid: boolean) => `${VEHICLE_MOBILE_INPUT} ${fieldBorder(invalid, "mobile")}`;
  const selectClass = (invalid: boolean) => `${VEHICLE_MOBILE_SELECT} ${fieldBorder(invalid, "mobile")}`;
  if (layout === "mobile") {
    // Locked read-only card
    if (v.locked) {
      return (
        <div className={VEHICLE_MOBILE_CARD}>
          <MobileFieldLabel>Name</MobileFieldLabel>
          <div className={VEHICLE_LOCKED_CELL}>
            <span className={VEHICLE_MOBILE_LOCKED_TEXT}>{v.name}</span>
          </div>
          <MobileFieldLabel>Type</MobileFieldLabel>
          <div className={VEHICLE_LOCKED_CELL}>
            <span className={VEHICLE_MOBILE_LOCKED_TEXT}>{capitalize(v.type)}</span>
          </div>
          <MobileFieldLabel>Capacity Unit</MobileFieldLabel>
          <div className={VEHICLE_LOCKED_CELL}>
            <span className={VEHICLE_MOBILE_LOCKED_TEXT}>{v.capacityUnit === "cubic_feet" ? "Cubic Feet" : capitalize(v.capacityUnit)}</span>
          </div>
          <MobileFieldLabel>Capacity</MobileFieldLabel>
          <div className={VEHICLE_LOCKED_CELL}>
            <span className={VEHICLE_MOBILE_LOCKED_TEXT}>{v.capacity}</span>
          </div>
          <div className={VEHICLE_MOBILE_AVAILABLE_ROW}>
            <span className={VEHICLE_MOBILE_AVAILABLE_LABEL}>Available</span>
            <div className={VEHICLE_AVAILABLE_SEGMENT_WRAPPER}>
              <AvailableSegmented available={v.available} />
            </div>
          </div>
          <MobileFieldLabel>Departure Time</MobileFieldLabel>
          <div className={VEHICLE_LOCKED_CELL}>
            <span className={VEHICLE_MOBILE_LOCKED_TEXT}>{v.departureTime}</span>
          </div>
          <div className={VEHICLE_MOBILE_LOCKED_ACTIONS}>
            <button
              type="button"
              onClick={() => unlockVehicle(v.id)}
              className={VEHICLE_PILL_HALF}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => deleteVehicle(v.id)}
              className={VEHICLE_PILL_HALF_DANGER}
            >
              Delete
            </button>
          </div>
        </div>
      );
    }

    // Editing (existing or new) shared fields; wrapper and actions differ by editingExisting
    return (
      <div className={v.editingExisting ? VEHICLE_MOBILE_EDITING_CARD : VEHICLE_MOBILE_CARD}>
        <MobileFieldLabel>Name</MobileFieldLabel>
        <input
          value={v.name}
          onChange={(e) => updateVehicle(v.id, "name", e.target.value)}
          className={`${inputClass(nameInvalid)} bg-white`}
          placeholder="Name"
          aria-label="Vehicle name"
        />
        <MobileFieldLabel>Type</MobileFieldLabel>
        <select
          value={v.type}
          onChange={(e) => updateVehicle(v.id, "type", e.target.value as VehicleType)}
          className={`${selectClass(typeInvalid)} bg-white`}
          aria-label="Vehicle type"
        >
          <option value="" disabled>
            Select
          </option>
          <option value="truck">Truck</option>
          <option value="car">Car</option>
          <option value="bicycle">Bicycle</option>
        </select>
        <MobileFieldLabel>Capacity Unit</MobileFieldLabel>
        <select
          value={v.capacityUnit}
          onChange={(e) => updateVehicle(v.id, "capacityUnit", e.target.value as CapacityUnit)}
          className={`${selectClass(capMeasureInvalid)} bg-white`}
          aria-label="Capacity unit"
        >
          <option value="" disabled>
            Select
          </option>
          <option value="units">Units</option>
          <option value="lbs">Lbs</option>
          <option value="kgs">Kgs</option>
          <option value="cubic_feet">Cubic Feet</option>
        </select>
        <MobileFieldLabel>Capacity</MobileFieldLabel>
        <input
          type="number"
          min={0}
          value={v.capacity || ""}
          onChange={(e) => updateVehicle(v.id, "capacity", e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
          className={`${inputClass(capacityInvalid)} bg-white`}
          placeholder=""
          aria-label="Vehicle capacity"
        />
        <div className={VEHICLE_MOBILE_AVAILABLE_ROW}>
          <span className={VEHICLE_MOBILE_AVAILABLE_LABEL}>Available</span>
          <div className={VEHICLE_AVAILABLE_SEGMENT_WRAPPER}>
            <AvailableSegmented
              available={v.available}
              onChange={(next) => updateVehicle(v.id, "available", next)}
            />
          </div>
        </div>
        <MobileFieldLabel>Departure time</MobileFieldLabel>
        <select
          value={v.departureTime}
          onChange={(e) => updateVehicle(v.id, "departureTime", e.target.value)}
          className={`${selectClass(departureInvalid)} bg-white`}
          aria-label="Departure time"
        >
          <option value="" disabled>
            Select
          </option>
          {TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {v.editingExisting ? (
          <div className={VEHICLE_MOBILE_EDITING_ACTIONS}>
            <button
              type="button"
              onClick={() => confirmVehicle(v.id)}
              className={VEHICLE_PILL_FULL_PRIMARY}
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => deleteVehicle(v.id)}
              className={VEHICLE_PILL_FULL_DANGER}
            >
              Delete
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => deleteVehicle(v.id)}
            className={`${VEHICLE_PILL_FULL_DANGER} mt-2`}
          >
            Delete
          </button>
        )}
      </div>
    );
  }

  // --- Desktop layout ---

  const statusBadge = v.available ? VEHICLE_ROW_STATUS_BADGE_AVAILABLE : VEHICLE_ROW_STATUS_BADGE_UNAVAILABLE;
  const statusText = v.available ? VEHICLE_ROW_STATUS_TEXT_AVAILABLE : VEHICLE_ROW_STATUS_TEXT_UNAVAILABLE;

  return (
    <div className={VEHICLE_ROW_DESKTOP}>
      <span className={VEHICLE_ROW_CELL}>{v.name}</span>
      <span className={VEHICLE_ROW_CELL}>{capitalize(v.type)}</span>
      <span className={VEHICLE_ROW_CELL}>{formatCapacity(v)}</span>
      <span className={VEHICLE_ROW_STATUS_CELL}>
        <span className={statusBadge}>
          <span className={statusText}>{v.available ? "Available" : "Unavailable"}</span>
        </span>
      </span>
      <span className={VEHICLE_ROW_CELL}>{v.departureTime}</span>
      <div className={VEHICLE_ROW_ACTIONS}>
        <button
          type="button"
          className={VEHICLE_ROW_ICON_BUTTON}
          onClick={() => onEditVehicle?.(v)}
          aria-label={`Edit ${v.name || "vehicle"}`}
          title="Edit"
        >
          <svg
            className={`${VEHICLE_ROW_ICON} ${VEHICLE_ROW_EDIT_ICON}`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M17.75 7.4 16.6 6.25 7.65 15.2v1.15H8.8L17.75 7.4Zm1.8-1.8a1.55 1.55 0 0 1 0 2.2l-9.9 9.9H6.3v-3.35l9.9-9.9a1.55 1.55 0 0 1 2.2 0l1.15 1.15ZM4 20h16v2H4v-2Z" />
          </svg>
        </button>
        <button
          type="button"
          className={VEHICLE_ROW_ICON_BUTTON}
          onClick={() => deleteVehicle(v.id)}
          aria-label={`Delete ${v.name || "vehicle"}`}
          title="Delete"
        >
          <svg
            className={`${VEHICLE_ROW_ICON} ${VEHICLE_ROW_DELETE_ICON}`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M7 21q-.825 0-1.412-.587Q5 19.825 5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.588 1.413Q17.825 21 17 21H7ZM17 6H7v13h10V6ZM9 17h2V8H9v9Zm4 0h2V8h-2v9Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatCapacity(vehicle: VehicleRowType): string {
  const unit =
    vehicle.capacityUnit === "cubic_feet"
      ? "cubic feet"
      : vehicle.capacityUnit;

  return [vehicle.capacity || "", unit].filter(Boolean).join(" ");
}
