"use client";

import { useEffect, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { SUPPORTED_STATES } from "../constants/supportedRegions";
import OverlayFieldError from "./OverlayFieldError";
import {
  OVERLAY_BACKDROP,
  OVERLAY_BODY,
  OVERLAY_CANCEL_BTN,
  OVERLAY_CLOSE_BTN,
  OVERLAY_PRIMARY_BTN,
  OVERLAY_FIELD,
  OVERLAY_FOOTER,
  OVERLAY_FULL_FIELD,
  OVERLAY_HEADER,
  OVERLAY_INPUT,
  OVERLAY_INPUT_ERROR,
  OVERLAY_LABEL,
  OVERLAY_PANEL,
  OVERLAY_REQUIRED_STAR,
  OVERLAY_ROW,
  OVERLAY_SELECT,
  OVERLAY_SELECT_PLACEHOLDER,
  OVERLAY_SELECT_VALUE,
  OVERLAY_SELECT_WRAPPER,
  OVERLAY_SELECT_WRAPPER_ERROR,
  OVERLAY_SCROLL_BODY,
  OVERLAY_TITLE,
} from "../formStyles.v2";
import styles from "../edit.module.css";

const CLOSE_ICON = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CHEVRON_DOWN_ICON = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const COUNTRIES = ["United States"];

export type StartLocationAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
};

type VehicleStartLocationOverlayProps = {
  initialAddress?: Partial<StartLocationAddress>;
  onClose: () => void;
  onSave: (address: StartLocationAddress) => void;
};

export default function VehicleStartLocationOverlay({
  initialAddress,
  onClose,
  onSave,
}: VehicleStartLocationOverlayProps) {
  const panelRef = useFocusTrap<HTMLDivElement>(true);

  const [line1, setLine1] = useState(initialAddress?.line1 ?? "");
  const [line2, setLine2] = useState(initialAddress?.line2 ?? "");
  const [city, setCity] = useState(initialAddress?.city ?? "");
  const [state, setState] = useState(initialAddress?.state ?? "");
  const [zipCode, setZipCode] = useState(initialAddress?.zipCode ?? "");
  const [country, setCountry] = useState(initialAddress?.country ?? "");
  const [submitted, setSubmitted] = useState(false);

  const line1Error = submitted && !line1.trim();
  const cityError = submitted && !city.trim();
  const stateError = submitted && !state;
  const zipError = submitted && zipCode.length !== 5;
  const countryError = submitted && !country;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSave() {
    setSubmitted(true);
    if (!line1.trim() || !city.trim() || !state || zipCode.length !== 5 || !country) return;
    onSave({ line1, line2, city, state, zipCode, country });
  }

  return (
    <div
      className={OVERLAY_BACKDROP}
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className={OVERLAY_PANEL}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-location-overlay-title"
        tabIndex={-1}
      >
        <div className={OVERLAY_BODY}>
          {/* Header */}
          <div className={OVERLAY_HEADER}>
            <h2 id="start-location-overlay-title" className={OVERLAY_TITLE}>
              Enter starting address
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={OVERLAY_CLOSE_BTN}
              aria-label="Close"
            >
              {CLOSE_ICON}
            </button>
          </div>

          {/* Form fields */}
          <div className={OVERLAY_SCROLL_BODY}>
            {/* Address line 1 — full width */}
            <div className={OVERLAY_FULL_FIELD}>
              <label htmlFor="start-loc-line1" className={OVERLAY_LABEL}>
                Address line 1<span className={OVERLAY_REQUIRED_STAR} aria-hidden="true">*</span>
              </label>
              <input
                id="start-loc-line1"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="Street number and name"
                className={line1Error ? OVERLAY_INPUT_ERROR : OVERLAY_INPUT}
                aria-required="true"
                aria-invalid={line1Error}
              />
              {line1Error && <OverlayFieldError message="Enter an address" />}
            </div>

            {/* Address line 2 — full width, optional */}
            <div className={OVERLAY_FULL_FIELD}>
              <label htmlFor="start-loc-line2" className={OVERLAY_LABEL}>
                Address line 2
              </label>
              <input
                id="start-loc-line2"
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                placeholder="Apt/Suite/Unit"
                className={OVERLAY_INPUT}
              />
            </div>

            {/* City + State */}
            <div className={OVERLAY_ROW}>
              <div className={OVERLAY_FIELD}>
                <label htmlFor="start-loc-city" className={OVERLAY_LABEL}>
                  City<span className={OVERLAY_REQUIRED_STAR} aria-hidden="true">*</span>
                </label>
                <input
                  id="start-loc-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Enter"
                  className={cityError ? OVERLAY_INPUT_ERROR : OVERLAY_INPUT}
                  aria-required="true"
                  aria-invalid={cityError}
                />
                {cityError && <OverlayFieldError message="Enter a city" />}
              </div>

              <div className={OVERLAY_FIELD}>
                <label htmlFor="start-loc-state" className={OVERLAY_LABEL}>
                  State<span className={OVERLAY_REQUIRED_STAR} aria-hidden="true">*</span>
                </label>
                <div className={stateError ? OVERLAY_SELECT_WRAPPER_ERROR : OVERLAY_SELECT_WRAPPER}>
                  <span className={state ? OVERLAY_SELECT_VALUE : OVERLAY_SELECT_PLACEHOLDER}>
                    {state || "Select"}
                  </span>
                  <span className="pointer-events-none shrink-0 text-[var(--edit-text-primary)]">
                    {CHEVRON_DOWN_ICON}
                  </span>
                  <select
                    id="start-loc-state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className={OVERLAY_SELECT}
                    aria-required="true"
                    aria-invalid={stateError}
                  >
                    <option value="" disabled>Select</option>
                    {[...SUPPORTED_STATES].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                {stateError && <OverlayFieldError message="Enter a state" />}
              </div>
            </div>

            {/* Zip code + Country/region */}
            <div className={OVERLAY_ROW}>
              <div className={OVERLAY_FIELD}>
                <label htmlFor="start-loc-zip" className={OVERLAY_LABEL}>
                  Zip code<span className={OVERLAY_REQUIRED_STAR} aria-hidden="true">*</span>
                </label>
                <input
                  id="start-loc-zip"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  placeholder="Enter"
                  inputMode="numeric"
                  maxLength={5}
                  className={zipError ? OVERLAY_INPUT_ERROR : OVERLAY_INPUT}
                  aria-required="true"
                  aria-invalid={zipError}
                />
                {zipError && <OverlayFieldError message="Zip code must be 5 digits" />}
              </div>

              <div className={OVERLAY_FIELD}>
                <label htmlFor="start-loc-country" className={OVERLAY_LABEL}>
                  Country/region<span className={OVERLAY_REQUIRED_STAR} aria-hidden="true">*</span>
                </label>
                <div className={countryError ? OVERLAY_SELECT_WRAPPER_ERROR : OVERLAY_SELECT_WRAPPER}>
                  <span className={country ? OVERLAY_SELECT_VALUE : OVERLAY_SELECT_PLACEHOLDER}>
                    {country || "Select"}
                  </span>
                  <span className="pointer-events-none shrink-0 text-[var(--edit-text-primary)]">
                    {CHEVRON_DOWN_ICON}
                  </span>
                  <select
                    id="start-loc-country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className={OVERLAY_SELECT}
                    aria-required="true"
                    aria-invalid={countryError}
                  >
                    <option value="" disabled>Select</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {countryError && <OverlayFieldError message="Enter a valid region" />}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={OVERLAY_FOOTER}>
          <button type="button" onClick={onClose} className={OVERLAY_CANCEL_BTN}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className={`${OVERLAY_PRIMARY_BTN} ${styles.primaryBtnOverlay}`}>
            Optimize
          </button>
        </div>
      </div>
    </div>
  );
}
