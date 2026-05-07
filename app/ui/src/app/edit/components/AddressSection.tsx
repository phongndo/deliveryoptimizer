"use client";

/**
 * Addresses region: toolbar (find / add / import) and a stacked list of delivery cards for the current page.
 */

import { useRef } from "react";
import AddressCard from "./AddressCard";
import type { AddressCard as AddressCardType } from "../types/delivery";
import {
  ADDRESS_EMPTY_STATE,
  ADDRESS_LIST_WRAP,
  ADDRESS_TOOLBAR_DESKTOP,
  ADDRESS_TOOLBAR_MOBILE_WRAP,
} from "../formStyles";
import AddressSearchBar from "./AddressSearchBar";
import {
  ADDRESS_SECTION_HEADER,
  ADDRESS_SECTION_HEADING,
  ADDRESS_SECTION_SUBHEADING,
  ADDRESS_BTN_V2_DESKTOP_ENABLED,
  ADDRESS_BTN_V2_DESKTOP_DISABLED,
  ADDRESS_BTN_V2_MOBILE_ENABLED,
  ADDRESS_BTN_V2_MOBILE_DISABLED,
} from "../formStyles.v2";

type AddressSectionProps = {
  addressesOnCurrentPage: AddressCardType[];
  addressesCount: number;
  addAddress: () => void;
  updateAddress: <K extends keyof AddressCardType>(id: number, key: K, value: AddressCardType[K]) => void;
  deleteAddress: (id: number) => void;
  unlockAddress: (id: number) => void;
  confirmAddress: (id: number) => void;
  touchedIds: Set<number>;
  allAddressesLocked: boolean;
  activeAddressIsValid: boolean;
  geocodeFailedIds: number[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  outOfRegionIds: number[];
  onCSVUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function AddressSection({
  addressesOnCurrentPage,
  addressesCount,
  addAddress,
  updateAddress,
  deleteAddress,
  unlockAddress,
  confirmAddress,
  touchedIds,
  allAddressesLocked,
  activeAddressIsValid,
  geocodeFailedIds,
  searchQuery,
  setSearchQuery,
  outOfRegionIds,
  onCSVUpload,
}: AddressSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addEnabled = allAddressesLocked || activeAddressIsValid;

  return (
    <section>
      <div className={ADDRESS_SECTION_HEADER}>
        <h2 className={ADDRESS_SECTION_HEADING}>Delivery addresses</h2>
        <p className={ADDRESS_SECTION_SUBHEADING}>Upload or manually add addresses</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          onCSVUpload(e);
          e.target.value = "";
        }}
        className="hidden"
        aria-hidden
      />

      {/* Mobile: Add first, then Import, then search full-width */}
      <div className={ADDRESS_TOOLBAR_MOBILE_WRAP}>
        <button
          type="button"
          disabled={!addEnabled}
          onClick={addAddress}
          className={addEnabled ? ADDRESS_BTN_V2_MOBILE_ENABLED : ADDRESS_BTN_V2_MOBILE_DISABLED}
        >
          Add address
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={ADDRESS_BTN_V2_MOBILE_ENABLED}
        >
          Import
        </button>
        <AddressSearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* Desktop: Search left, spacer, Add right */}
      <div className={ADDRESS_TOOLBAR_DESKTOP}>
        <AddressSearchBar value={searchQuery} onChange={setSearchQuery} className="shrink-0 w-56 xl:w-72" />
        <div className="flex-1 min-w-0" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={ADDRESS_BTN_V2_DESKTOP_ENABLED}
        >
          Import
        </button>
        <button
          type="button"
          disabled={!addEnabled}
          onClick={addAddress}
          className={addEnabled ? ADDRESS_BTN_V2_DESKTOP_ENABLED : ADDRESS_BTN_V2_DESKTOP_DISABLED}
        >
          Add address
        </button>
      </div>

      {/* Mobile: spaced cards; desktop: single divided panel */}
      {searchQuery.trim() !== "" && addressesOnCurrentPage.length === 0 ? (
        <div className={ADDRESS_EMPTY_STATE}>
          No Addresses Found
        </div>
      ) : (
        <div className={ADDRESS_LIST_WRAP}>
          {addressesOnCurrentPage.map((a) => (
            <AddressCard
              key={`address-${a.id}`}
              address={a}
              addressesCount={addressesCount}
              updateAddress={updateAddress}
              deleteAddress={deleteAddress}
              unlockAddress={unlockAddress}
              confirmAddress={confirmAddress}
              addressTouched={touchedIds.has(a.id)}
              geocodeFailed={geocodeFailedIds.includes(a.id)}
              outOfRegionFailed={outOfRegionIds.includes(a.id)}
          />
          ))}
        </div>
      )}
    </section>
  );
}
