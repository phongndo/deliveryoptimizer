// app/edit/page.tsx
"use client";

/**
 * Delivery edit screen: wires vehicle and address state into sections and pagination.
 */

import styles from "@/app/edit/edit.module.css";
import Navbar from "@/app/edit/components/layout/navbar/Navbar";
import MobileNavbar from "@/app/edit/components/layout/navbar/MobileNavbar";
import MobileSidebar from "@/app/edit/components/layout/sidebar/MobileSidebar";
import OptimizingModal from "@/app/edit/components/shared/OptimizingModal";
import Sidebar from "@/app/edit/components/layout/sidebar/Sidebar";
import SidebarEditButton from "@/app/edit/components/layout/sidebar/SidebarEditButton";
import SidebarResultsButton from "@/app/edit/components/layout/sidebar/SidebarResultsButton";
import {
  PAGE_V2_ROOT,
  PAGE_V2_BODY,
  PAGE_V2_MAIN,
  ADDRESS_SECTION_WITH_PAGINATION,
} from "@/app/edit/formStyles.v2";
import VehicleSection from "@/app/edit/components/vehicle/VehicleSection";
import AddressSection from "@/app/edit/components/address/AddressSection";
import AddressPagination from "@/app/edit/components/address/AddressPagination";
import AddressPaginationMobile from "@/app/edit/components/address/AddressPaginationMobile";
import EditPageFooter from "@/app/edit/components/layout/footer/EditPageFooter";
import MobileEditPageFooter from "@/app/edit/components/layout/footer/MobileEditPageFooter";
import MobileBottomBar from "@/app/edit/components/layout/navbar/MobileBottomBar";
import { useVehicles } from "@/app/edit/hooks/useVehicles";
import { useAddresses } from "@/app/edit/hooks/useAddresses";
import { useOptimize } from "@/app/edit/hooks/useOptimize";
import {
  parseAddressUpload,
  useCSVUpload,
} from "@/app/edit/hooks/useCSVUpload";
import { useCallback, useEffect, useState } from "react";
import type { AddressCard } from "@/app/edit/types/delivery";
import { loadSessionFromFile } from "@/lib/session/importSession";
import { downloadSessionSave } from "@/lib/session/exportSession";
import {
  mapEditStateToOptimizeRequest,
  mapOptimizeRequestToEditState,
} from "@/app/edit/utils/sessionMapper";
import { useRouter } from "next/navigation";
import AddressOverlay, {
  type LocationAddress,
} from "@/app/edit/components/address/AddressOverlay";

type StoredUploadFile = {
  name: string;
  content: string;
};

export default function Page() {
  const router = useRouter();
  const vehicleState = useVehicles();
  const addressState = useAddresses();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { importVehicles } = vehicleState;
  const { importAddresses } = addressState;
  const {
    optimize,
    isOptimizing,
    optimizeError,
    clearOptimizeError,
    needsDepotAddress,
    dismissDepotAddressPrompt,
    geocodeFailedAddressIds,
    geocodeFailedVehicleIds,
    outOfRegionAddressIds,
    outOfRegionVehicleIds,
  } = useOptimize(
    vehicleState.vehicles,
    addressState.addresses,
    vehicleState.cacheVehicleLocation,
    addressState.cacheAddressLocation,
  );

  const { handleCSVUpload, csvError, clearCsvError } = useCSVUpload({
    importAddresses: addressState.importAddresses,
  });

  useEffect(() => {
    let cancelled = false;

    const hydrateImportedState = async () => {
      const storedSavePointFile = sessionStorage.getItem("savePointFile");
      if (storedSavePointFile) {
        try {
          const savedFile = parseStoredUploadFile(
            storedSavePointFile,
            "save point",
          );
          const session = await loadSessionFromFile(
            new File([savedFile.content], savedFile.name, {
              type: "application/json",
            }),
          );
          const importedState = mapOptimizeRequestToEditState(session);

          if (cancelled) return;

          importVehicles(importedState.vehicles);
          importAddresses(importedState.addresses);
          sessionStorage.removeItem("savePointFile");
          return;
        } catch (error) {
          if (!cancelled) {
            setSessionError(
              error instanceof Error
                ? error.message
                : "Failed to import the saved session.",
            );
          }
          return;
        }
      }

      const storedAddressFiles = sessionStorage.getItem("addressFiles");
      if (!storedAddressFiles) return;

      try {
        const uploads = parseStoredAddressFiles(storedAddressFiles);
        const importedAddresses: AddressCard[] = [];

        for (const upload of uploads) {
          importedAddresses.push(
            ...(await parseAddressUpload(upload.name, upload.content)),
          );
        }

        if (cancelled) return;

        importAddresses(reindexAddresses(importedAddresses));
        sessionStorage.removeItem("addressFiles");
      } catch (error) {
        if (!cancelled) {
          setSessionError(
            error instanceof Error
              ? error.message
              : "Failed to import the uploaded addresses.",
          );
        }
      }
    };

    void hydrateImportedState();

    return () => {
      cancelled = true;
    };
  }, [importAddresses, importVehicles]);

  const handleImportSession = useCallback(() => {
    router.push("/welcome");
  }, [router]);

  const handleExportSession = useCallback(async () => {
    setSessionError(null);

    try {
      const request = await mapEditStateToOptimizeRequest(
        vehicleState.vehicles,
        addressState.addresses,
      );
      const result = downloadSessionSave(request);

      if (!result.ok) {
        throw result.error;
      }
    } catch (error) {
      setSessionError(
        error instanceof Error
          ? error.message
          : "Failed to export the session state.",
      );
    }
  }, [addressState.addresses, vehicleState.vehicles]);

  const clearSessionError = useCallback(() => {
    setSessionError(null);
  }, []);

  const handleStartLocationSave = useCallback(
    (addr: LocationAddress) => {
      const parts = [addr.line1];
      if (addr.line2.trim()) parts.push(addr.line2);
      parts.push(addr.city, `${addr.state} ${addr.zipCode}`, addr.country);
      const formattedAddress = parts.join(", ");
      void optimize(formattedAddress);
    },
    [optimize],
  );

  return (
    <div className={`${PAGE_V2_ROOT} ${styles.root}`}>
      <OptimizingModal isOpen={isOptimizing} />
      {needsDepotAddress && (
        <AddressOverlay
          heading="Enter starting location for all driver routes"
          onClose={dismissDepotAddressPrompt}
          onSave={handleStartLocationSave}
        />
      )}
      <MobileSidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <MobileBottomBar
        onOptimize={() => void optimize()}
        onSave={handleExportSession}
        onExport={handleExportSession}
        isOptimizing={isOptimizing}
      />
      <MobileNavbar onMenuClick={() => setIsMobileMenuOpen(true)} />
      <Navbar
        onImportSession={handleImportSession}
        onExportSession={handleExportSession}
        onOptimize={() => void optimize()}
        isOptimizing={isOptimizing}
        error={sessionError ?? optimizeError ?? csvError}
        onClearError={() => {
          clearSessionError();
          clearOptimizeError();
          clearCsvError();
        }}
      />
      <div className={PAGE_V2_BODY}>
        <Sidebar>
          <SidebarEditButton />
          <SidebarResultsButton />
        </Sidebar>
        <main className={PAGE_V2_MAIN}>
          <VehicleSection
            {...vehicleState}
            geocodeFailedVehicleIds={geocodeFailedVehicleIds}
            outOfRegionVehicleIds={outOfRegionVehicleIds}
          />
          <div className={ADDRESS_SECTION_WITH_PAGINATION}>
            <AddressSection
              {...addressState}
              geocodeFailedIds={geocodeFailedAddressIds}
              outOfRegionIds={outOfRegionAddressIds}
              onCSVUpload={handleCSVUpload}
            />
            <AddressPagination {...addressState} />
            <AddressPaginationMobile {...addressState} />
          </div>
          <EditPageFooter />
          <MobileEditPageFooter />
        </main>
      </div>
    </div>
  );
}

function parseStoredUploadFile(
  rawValue: string,
  label: string,
): StoredUploadFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(`Invalid ${label} upload payload.`);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as StoredUploadFile).name !== "string" ||
    typeof (parsed as StoredUploadFile).content !== "string"
  ) {
    throw new Error(`Invalid ${label} upload payload.`);
  }

  return parsed as StoredUploadFile;
}

function parseStoredAddressFiles(rawValue: string): StoredUploadFile[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("Invalid address upload payload.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid address upload payload.");
  }

  return parsed.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as StoredUploadFile).name !== "string" ||
      typeof (entry as StoredUploadFile).content !== "string"
    ) {
      throw new Error("Invalid address upload payload.");
    }

    return entry as StoredUploadFile;
  });
}

function reindexAddresses(
  addresses: ReturnType<typeof mapOptimizeRequestToEditState>["addresses"],
) {
  return addresses.map((address, index) => ({
    ...address,
    id: index + 1,
  }));
}
