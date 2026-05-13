"use client";

import { useLayoutEffect, useRef, useState } from "react";
import AddressOverlay, { type LocationAddress } from "./AddressOverlay";
import { TIME_OPTIONS } from "../constants/timeOptions";
import type { AddressCard as AddressCardType } from "../types/delivery";
import {
  ADDRESS_CARD_ROOT_BASE,
  GEOCODE_ERROR_LOCKED,
  ACCORDION_TRIGGER,
  CONFIRM_PILL_MOBILE,
  MOBILE_ADDRESS_INPUT_BASE,
  MOBILE_ADDRESS_LOCKED_ROW,
  MOBILE_ADDRESS_NOTES_AREA,
  MOBILE_ADDRESS_NOTES_TEXTAREA,
  MOBILE_DELETE_TEXT,
  MOBILE_FIELD_LABEL,
  PILL_ROW_HALF_DANGER,
  PILL_ROW_HALF_NEUTRAL,
  fieldBorder,
} from "../formStyles";
import {
  ADDRESS_ROW_EDIT_ROOT,
  ADDRESS_ROW_EDIT_LEFT,
  ADDRESS_ROW_EDIT_COLS,
  ADDRESS_ROW_RECIPIENT_COL,
  ADDRESS_ROW_NAME_ROW,
  ADDRESS_ROW_FIELD_INPUT,
  ADDRESS_ROW_ADDR_WRAP,
  ADDRESS_ROW_ADDR_GRADIENT,
  ADDRESS_ROW_ADDR_TRIGGER_TEXT,
  ADDRESS_ROW_ADDR_TRIGGER_PLACEHOLDER,
  ADDRESS_ROW_STEPPER_CONTAINER,
  ADDRESS_ROW_EST_GROUP,
  ADDRESS_ROW_TIME_GROUP,
  ADDRESS_ROW_TIME_SELECT_WRAP,
  ADDRESS_ROW_TIME_SELECT,
  ADDRESS_ROW_NOTES_WRAP,
  ADDRESS_ROW_NOTES_TEXTAREA,
  ADDRESS_ROW_ACTIONS,
  ADDRESS_ROW_LOCKED_RECIPIENT_COL,
  ADDRESS_ROW_LOCKED_PLAIN_TEXT,
  ADDRESS_ROW_LOCKED_FIELD_BTN,
  ADDRESS_ROW_LOCKED_CELL_DELIVERY_EST,
  ADDRESS_ROW_LOCKED_NOTES_BTN,
  ADDRESS_ROW_LOCKED_NOTES_TEXT,
  MOBILE_LOCKED_CLICKABLE,
} from "../formStyles.v2";
import { EditIconButton, ConfirmIconButton, DeleteIconButton } from "./RowIconButtons";

function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function parseRecipientAddress(addr: string): Partial<LocationAddress> {
  const parts = addr.split(", ");
  if (parts.length < 4) return {};
  const country = parts[parts.length - 1];
  const stateZip = parts[parts.length - 2];
  const city = parts[parts.length - 3];
  const lastSpace = stateZip.lastIndexOf(" ");
  const state = lastSpace > -1 ? stateZip.slice(0, lastSpace) : "";
  const zipCode = lastSpace > -1 ? stateZip.slice(lastSpace + 1) : stateZip;
  const line1 = parts[0];
  const line2 = parts.length >= 5 ? parts[1] : "";
  return { line1, line2, city, state, zipCode, country };
}

type AddressCardProps = {
  address: AddressCardType;
  addressesCount: number;
  updateAddress: <K extends keyof AddressCardType>(id: number, key: K, value: AddressCardType[K]) => void;
  deleteAddress: (id: number) => void;
  unlockAddress: (id: number) => void;
  confirmAddress: (id: number) => void;
  addressTouched: boolean;
  geocodeFailed: boolean;
  outOfRegionFailed: boolean;
};

function StepperInput({
  value,
  min = 0,
  ariaLabel,
  onIncrement,
  onDecrement,
  onChange,
}: {
  value: number;
  min?: number;
  ariaLabel: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`${ADDRESS_ROW_STEPPER_CONTAINER} w-[72px]`}>
      <input
        type="number"
        min={min}
        value={value || ""}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          onChange(Number.isNaN(parsed) ? min : Math.max(min, parsed));
        }}
        aria-label={ariaLabel}
        className="flex-1 min-w-0 bg-transparent outline-none text-[16px] leading-[1.5] text-[var(--edit-text-primary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <div className="flex flex-col shrink-0">
        <button type="button" onClick={onIncrement} aria-label={`Increase ${ariaLabel}`} className="cursor-pointer focus:outline-none">
          <svg viewBox="0 0 24 12" width="24" height="12">
            <path fill="none" className="stroke-[var(--edit-stone-200)]" d="M6 0.5H18C21.0376 0.5 23.5 2.96243 23.5 6V11.5H0.5V6C0.5 2.96243 2.96243 0.5 6 0.5Z" />
            <path className="fill-[var(--edit-primary-icon)]" d="M12 5.39189L8.93333 8.5L8 7.55405L12 3.5L16 7.55405L15.0667 8.5L12 5.39189Z" />
          </svg>
        </button>
        <button type="button" onClick={onDecrement} aria-label={`Decrease ${ariaLabel}`} className="cursor-pointer focus:outline-none">
          <svg viewBox="0 0 24 12" width="24" height="12">
            <path fill="none" className="stroke-[var(--edit-stone-200)]" d="M18 11.5H6C2.96243 11.5 0.5 9.03757 0.5 6V0.5H23.5V6C23.5 9.03757 21.0376 11.5 18 11.5Z" />
            <path className="fill-[var(--edit-primary-icon)]" d="M12 6.60811L8.93333 3.5L8 4.44595L12 8.5L16 4.44595L15.0667 3.5L12 6.60811Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function AutoResizeNotesTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter notes"
      aria-label="Notes"
      rows={1}
      className={ADDRESS_ROW_NOTES_TEXTAREA}
    />
  );
}

export default function AddressCard({
  address: a,
  addressesCount,
  updateAddress,
  deleteAddress,
  unlockAddress,
  confirmAddress,
  addressTouched,
  geocodeFailed,
  outOfRegionFailed,
}: AddressCardProps) {
  const [manualExpanded, setManualExpanded] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const expanded = !a.locked || manualExpanded;

  const startIdx = TIME_OPTIONS.indexOf(a.deliveryTimeStart);
  const endIdx = TIME_OPTIONS.indexOf(a.deliveryTimeEnd);

  const addrInvalid = geocodeFailed || (addressTouched && !a.recipientAddress.trim());
  const qtyInvalid = addressTouched && a.deliveryQuantity <= 0;

  const mobileInputClass = (invalid: boolean) =>
    `${MOBILE_ADDRESS_INPUT_BASE} ${fieldBorder(invalid, "mobile")}`;

  const mobileSelectClass = (invalid: boolean) =>
    `${MOBILE_ADDRESS_INPUT_BASE} ${fieldBorder(invalid, "mobile")} cursor-pointer select-chevron`;

  const displayAddr = a.recipientAddress.trim() || a.recipientName.trim() || "Address";
  const panelId = `addr-panel-${a.id}`;

  return (
    <>
      {/* ── Desktop hi-fi layout ── */}
      <div className="hidden lg:block">
        <div className={ADDRESS_ROW_EDIT_ROOT}>
          {/* Left: all columns */}
          <div className={ADDRESS_ROW_EDIT_LEFT}>
            {/* Data columns */}
            <div className={ADDRESS_ROW_EDIT_COLS}>
              {a.locked ? (
                <>
                  {/* Recipient column — locked */}
                  <div className={ADDRESS_ROW_LOCKED_RECIPIENT_COL}>
                    {(a.recipientName || a.phoneNumber) && (
                      <button type="button" onClick={() => unlockAddress(a.id)} className={`${ADDRESS_ROW_LOCKED_PLAIN_TEXT} ${ADDRESS_ROW_LOCKED_FIELD_BTN}`}>
                        {[a.recipientName, a.phoneNumber].filter(Boolean).join(", ")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { unlockAddress(a.id); setOverlayOpen(true); }}
                      className={`${ADDRESS_ROW_LOCKED_PLAIN_TEXT} ${ADDRESS_ROW_LOCKED_FIELD_BTN}${geocodeFailed || outOfRegionFailed ? ` ${GEOCODE_ERROR_LOCKED}` : ""}`}
                    >
                      {a.recipientAddress || "—"}
                    </button>
                  </div>

                  {/* Quantity — locked */}
                  <button type="button" onClick={() => unlockAddress(a.id)} className={`${ADDRESS_ROW_LOCKED_PLAIN_TEXT} ${ADDRESS_ROW_LOCKED_FIELD_BTN} w-[72px] shrink-0`}>
                    {a.deliveryQuantity}
                  </button>

                  {/* Delivery estimation — locked */}
                  <button type="button" onClick={() => unlockAddress(a.id)} className={ADDRESS_ROW_LOCKED_CELL_DELIVERY_EST}>
                    {a.timeBuffer > 0 ? `${a.timeBuffer} minutes` : "—"}
                  </button>

                  {/* Delivery time — locked */}
                  <button type="button" onClick={() => unlockAddress(a.id)} className={`${ADDRESS_ROW_LOCKED_PLAIN_TEXT} ${ADDRESS_ROW_LOCKED_FIELD_BTN} w-[247px] shrink-0`}>
                    {a.deliveryTimeStart && a.deliveryTimeEnd
                      ? `${a.deliveryTimeStart} – ${a.deliveryTimeEnd}`
                      : a.deliveryTimeStart || a.deliveryTimeEnd || "—"}
                  </button>

                  {/* Notes — locked */}
                  <button type="button" onClick={() => unlockAddress(a.id)} className={ADDRESS_ROW_LOCKED_NOTES_BTN}>
                    <span className={ADDRESS_ROW_LOCKED_NOTES_TEXT}>
                      {a.notes || "—"}
                    </span>
                  </button>
                </>
              ) : (
                <>
                  {/* Recipient column — edit */}
                  <div className={ADDRESS_ROW_RECIPIENT_COL}>
                    <div className={ADDRESS_ROW_NAME_ROW}>
                      <input
                        value={a.recipientName}
                        onChange={(e) => updateAddress(a.id, "recipientName", e.target.value)}
                        placeholder="First and last name"
                        aria-label="Recipient name"
                        maxLength={50}
                        className={`${ADDRESS_ROW_FIELD_INPUT} flex-1`}
                      />
                      <input
                        value={a.phoneNumber}
                        onChange={(e) => updateAddress(a.id, "phoneNumber", formatPhoneNumber(e.target.value))}
                        placeholder="123-456-7890"
                        aria-label="Phone number"
                        type="tel"
                        inputMode="numeric"
                        maxLength={12}
                        className={`${ADDRESS_ROW_FIELD_INPUT} flex-1`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setOverlayOpen(true)}
                      className={`${ADDRESS_ROW_ADDR_WRAP}${addrInvalid ? " border-[var(--edit-error-border)]" : ""}`}
                      aria-label="Edit recipient address"
                    >
                      <span className={ADDRESS_ROW_ADDR_TRIGGER_TEXT}>
                        {a.recipientAddress || <span className={ADDRESS_ROW_ADDR_TRIGGER_PLACEHOLDER}>Enter address</span>}
                      </span>
                      <div className={ADDRESS_ROW_ADDR_GRADIENT} aria-hidden>
                        <svg viewBox="0 0 24 24" width="24" height="24">
                          <path
                            className="fill-[var(--edit-primary-icon)]"
                            d="M14.6 12L10 7.4L11.4 6L17.4 12L11.4 18L10 16.6L14.6 12Z"
                          />
                        </svg>
                      </div>
                    </button>
                  </div>

                  {/* Quantity — edit */}
                  <StepperInput
                    value={a.deliveryQuantity}
                    min={1}
                    ariaLabel="Delivery quantity"
                    onChange={(v) => updateAddress(a.id, "deliveryQuantity", v)}
                    onIncrement={() => updateAddress(a.id, "deliveryQuantity", (a.deliveryQuantity || 0) + 1)}
                    onDecrement={() => updateAddress(a.id, "deliveryQuantity", Math.max(1, (a.deliveryQuantity || 1) - 1))}
                  />

                  {/* Delivery estimation — edit */}
                  <div className={ADDRESS_ROW_EST_GROUP}>
                    <StepperInput
                      value={a.timeBuffer}
                      min={0}
                      ariaLabel="Delivery estimation in minutes"
                      onChange={(v) => updateAddress(a.id, "timeBuffer", v)}
                      onIncrement={() => updateAddress(a.id, "timeBuffer", (a.timeBuffer || 0) + 1)}
                      onDecrement={() => updateAddress(a.id, "timeBuffer", Math.max(0, (a.timeBuffer || 0) - 1))}
                    />
                    <span className="font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)]">minutes</span>
                  </div>

                  {/* Delivery time — edit */}
                  <div className={ADDRESS_ROW_TIME_GROUP}>
                    <div className={ADDRESS_ROW_TIME_SELECT_WRAP}>
                      <select
                        value={a.deliveryTimeStart}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          updateAddress(a.id, "deliveryTimeStart", newStart);
                          if (endIdx !== -1 && TIME_OPTIONS.indexOf(newStart) >= endIdx) {
                            updateAddress(a.id, "deliveryTimeEnd", "");
                          }
                        }}
                        aria-label="Delivery time start"
                        className={ADDRESS_ROW_TIME_SELECT}
                      >
                        <option value="">Start</option>
                        {TIME_OPTIONS.filter((_, i) => endIdx === -1 || i < endIdx).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)] pointer-events-none truncate flex-1">
                        {a.deliveryTimeStart || "Start"}
                      </span>
                      <svg viewBox="0 0 24 24" width="24" height="24" className="rotate-90 shrink-0 pointer-events-none" aria-hidden>
                        <path className="fill-[var(--edit-primary-icon)]" d="M14.6 12L10 7.4L11.4 6L17.4 12L11.4 18L10 16.6L14.6 12Z" />
                      </svg>
                    </div>
                    <span className="font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)]" aria-hidden>–</span>
                    <div className={ADDRESS_ROW_TIME_SELECT_WRAP}>
                      <select
                        value={a.deliveryTimeEnd}
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          updateAddress(a.id, "deliveryTimeEnd", newEnd);
                          if (startIdx !== -1 && TIME_OPTIONS.indexOf(newEnd) <= startIdx) {
                            updateAddress(a.id, "deliveryTimeStart", "");
                          }
                        }}
                        aria-label="Delivery time end"
                        className={ADDRESS_ROW_TIME_SELECT}
                      >
                        <option value="">End</option>
                        {TIME_OPTIONS.filter((_, i) => startIdx === -1 || i > startIdx).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)] pointer-events-none truncate flex-1">
                        {a.deliveryTimeEnd || "End"}
                      </span>
                      <svg viewBox="0 0 24 24" width="24" height="24" className="rotate-90 shrink-0 pointer-events-none" aria-hidden>
                        <path className="fill-[var(--edit-primary-icon)]" d="M14.6 12L10 7.4L11.4 6L17.4 12L11.4 18L10 16.6L14.6 12Z" />
                      </svg>
                    </div>
                  </div>

                  {/* Notes — edit */}
                  <div className={ADDRESS_ROW_NOTES_WRAP}>
                    <AutoResizeNotesTextarea
                      value={a.notes}
                      onChange={(value) => updateAddress(a.id, "notes", value)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className={ADDRESS_ROW_ACTIONS}>
            {a.locked ? (
              <EditIconButton onClick={() => unlockAddress(a.id)} />
            ) : (
              <ConfirmIconButton onClick={() => confirmAddress(a.id)} />
            )}
            <DeleteIconButton onClick={() => deleteAddress(a.id)} />
          </div>
        </div>
      </div>

      {/* ── Mobile accordion ── */}
      <div className={`${ADDRESS_CARD_ROOT_BASE} lg:hidden`}>
        <button
          type="button"
          onClick={() => {
            if (a.locked) {
              setManualExpanded((e) => !e);
            } else {
              setManualExpanded(false);
            }
          }}
          aria-expanded={expanded}
          aria-controls={panelId}
          className={ACCORDION_TRIGGER}
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-black truncate">{displayAddr}</div>
          </div>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            className={`shrink-0 text-black transition-transform mt-0.5 ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {expanded && (
          <div id={panelId} role="region" className="p-4 space-y-3">
            {a.locked ? (
              <>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Name</span>
                  <button type="button" onClick={() => unlockAddress(a.id)} className={`${MOBILE_ADDRESS_LOCKED_ROW} ${MOBILE_LOCKED_CLICKABLE}`}>
                    <span className="text-sm text-black truncate">{a.recipientName || "—"}</span>
                  </button>
                </div>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Phone</span>
                  <button type="button" onClick={() => unlockAddress(a.id)} className={`${MOBILE_ADDRESS_LOCKED_ROW} ${MOBILE_LOCKED_CLICKABLE}`}>
                    <span className="text-sm text-black truncate">{a.phoneNumber || "—"}</span>
                  </button>
                </div>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Address</span>
                  <button type="button" onClick={() => { unlockAddress(a.id); setOverlayOpen(true); }} className={`${MOBILE_ADDRESS_LOCKED_ROW} ${MOBILE_LOCKED_CLICKABLE}${geocodeFailed || outOfRegionFailed ? ` ${GEOCODE_ERROR_LOCKED}` : ""}`}>
                    <span className="text-sm text-black truncate">{a.recipientAddress}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={MOBILE_FIELD_LABEL}>Delivery estimation</span>
                    <button type="button" onClick={() => unlockAddress(a.id)} className={`${MOBILE_ADDRESS_LOCKED_ROW} ${MOBILE_LOCKED_CLICKABLE}`}>
                      <span className="text-sm text-black truncate">{a.timeBuffer > 0 ? `${a.timeBuffer} min` : "—"}</span>
                    </button>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className={MOBILE_FIELD_LABEL}>Delivery time</span>
                    <button type="button" onClick={() => unlockAddress(a.id)} className={`${MOBILE_ADDRESS_LOCKED_ROW} ${MOBILE_LOCKED_CLICKABLE}`}>
                      <span className="text-sm text-black truncate">
                        {a.deliveryTimeStart && a.deliveryTimeEnd
                          ? `${a.deliveryTimeStart} – ${a.deliveryTimeEnd}`
                          : a.deliveryTimeStart || a.deliveryTimeEnd || "—"}
                      </span>
                    </button>
                  </div>
                </div>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Quantity</span>
                  <button type="button" onClick={() => unlockAddress(a.id)} className={`${MOBILE_ADDRESS_LOCKED_ROW} ${MOBILE_LOCKED_CLICKABLE}`}>
                    <span className="text-sm text-black truncate">{a.deliveryQuantity}</span>
                  </button>
                </div>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Notes</span>
                  <button type="button" onClick={() => unlockAddress(a.id)} className={`${MOBILE_ADDRESS_NOTES_AREA} ${MOBILE_LOCKED_CLICKABLE}`}>
                    <span className="text-sm text-black leading-6 line-clamp-6">{a.notes}</span>
                  </button>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => unlockAddress(a.id)} className={PILL_ROW_HALF_NEUTRAL}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deleteAddress(a.id)} disabled={addressesCount <= 1} className={PILL_ROW_HALF_DANGER}>
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Name</span>
                  <input
                    value={a.recipientName}
                    onChange={(e) => updateAddress(a.id, "recipientName", e.target.value)}
                    placeholder="First and last name"
                    aria-label="Recipient name"
                    className={mobileInputClass(false)}
                  />
                </div>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Phone</span>
                  <input
                    value={a.phoneNumber}
                    onChange={(e) => updateAddress(a.id, "phoneNumber", formatPhoneNumber(e.target.value))}
                    placeholder="123-456-7890"
                    aria-label="Phone number"
                    type="tel"
                    inputMode="numeric"
                    maxLength={12}
                    className={mobileInputClass(false)}
                  />
                </div>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Address</span>
                  <button
                    type="button"
                    onClick={() => setOverlayOpen(true)}
                    className={`${mobileInputClass(addrInvalid)} text-left cursor-pointer w-full`}
                    aria-label="Edit recipient address"
                  >
                    {a.recipientAddress || <span className={ADDRESS_ROW_ADDR_TRIGGER_PLACEHOLDER}>Address</span>}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={MOBILE_FIELD_LABEL}>Delivery estimation</span>
                    <input
                      type="number"
                      min={0}
                      value={a.timeBuffer || ""}
                      onChange={(e) => updateAddress(a.id, "timeBuffer", parseInt(e.target.value, 10) || 0)}
                      aria-label="Delivery estimation in minutes"
                      placeholder="0"
                      className={mobileInputClass(false)}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={MOBILE_FIELD_LABEL}>Delivery time</span>
                    <div className="flex items-center gap-1 w-full min-w-0">
                      <select
                        value={a.deliveryTimeStart}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          updateAddress(a.id, "deliveryTimeStart", newStart);
                          if (endIdx !== -1 && TIME_OPTIONS.indexOf(newStart) >= endIdx) {
                            updateAddress(a.id, "deliveryTimeEnd", "");
                          }
                        }}
                        className={`${mobileSelectClass(false)} flex-1 min-w-0`}
                        aria-label="Delivery time start"
                      >
                        <option value="">None</option>
                        {TIME_OPTIONS.filter((_, i) => endIdx === -1 || i < endIdx).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="shrink-0 text-zinc-400 text-xs" aria-hidden>–</span>
                      <select
                        value={a.deliveryTimeEnd}
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          updateAddress(a.id, "deliveryTimeEnd", newEnd);
                          if (startIdx !== -1 && TIME_OPTIONS.indexOf(newEnd) <= startIdx) {
                            updateAddress(a.id, "deliveryTimeStart", "");
                          }
                        }}
                        className={`${mobileSelectClass(false)} flex-1 min-w-0`}
                        aria-label="Delivery time end"
                      >
                        <option value="">None</option>
                        {TIME_OPTIONS.filter((_, i) => startIdx === -1 || i > startIdx).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Quantity</span>
                  <input
                    type="number"
                    min={0}
                    value={a.deliveryQuantity || ""}
                    onChange={(e) =>
                      updateAddress(a.id, "deliveryQuantity", e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)
                    }
                    aria-label="Delivery quantity"
                    className={mobileInputClass(qtyInvalid)}
                  />
                </div>
                <div>
                  <span className={MOBILE_FIELD_LABEL}>Notes</span>
                  <textarea
                    value={a.notes}
                    onChange={(e) => updateAddress(a.id, "notes", e.target.value)}
                    aria-label="Notes"
                    rows={5}
                    className={MOBILE_ADDRESS_NOTES_TEXTAREA}
                  />
                </div>
                {a.editingExisting && (
                  <button type="button" onClick={() => confirmAddress(a.id)} className={CONFIRM_PILL_MOBILE}>
                    Confirm
                  </button>
                )}
                <hr className="border-zinc-200" />
                <button
                  type="button"
                  onClick={() => deleteAddress(a.id)}
                  disabled={addressesCount <= 1}
                  className={MOBILE_DELETE_TEXT}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {overlayOpen && (
        <AddressOverlay
          heading="Enter Address"
          initialAddress={parseRecipientAddress(a.recipientAddress)}
          onClose={() => setOverlayOpen(false)}
          onSave={(addr: LocationAddress) => {
            const parts = [addr.line1];
            if (addr.line2.trim()) parts.push(addr.line2);
            parts.push(addr.city, `${addr.state} ${addr.zipCode}`, addr.country);
            updateAddress(a.id, "recipientAddress", parts.join(", "));
            setOverlayOpen(false);
          }}
        />
      )}
    </>
  );
}
