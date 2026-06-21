// Results page: route list + map

"use client";

import {
  default as React,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { NAVBAR_V2_LOGO, NAVBAR_V2_ROOT } from "../edit/formStyles.v2";
import styles from "../edit/edit.module.css";
import MobileSidebar from "../components/sidebar/MobileSidebar";
import ExportEditWarningModal from "./components/ExportEditWarningModal";
import ExportRoutesModal from "./components/ExportRoutesModal";
import SendRoutesModal from "./components/SendRoutesModal";
import MapComponent from "./components/Map";
import MobileResultsNavbar from "./components/MobileResultsNavbar";
import ResultsBottomSheet from "./components/ResultsBottomSheet";
import NavSidebar from "@/app/components/sidebar/Sidebar";
import SidebarEditButton from "@/app/components/sidebar/SidebarEditButton";
import SidebarResultsButton from "@/app/components/sidebar/SidebarResultsButton";
import Sidebar from "./components/Sidebar";
import { mockRouteToRoute } from "./data/mockRouteLoader";
import mockRouteData from "./data/mock_route.json";
import {
  RESULTS_MOBILE_EDIT_BANNER_MESSAGE,
  RESULTS_MOBILE_EDIT_PILL,
} from "./formStyles.mobile";
import type { PendingPinMove, Route } from "./types";
import { downloadRoutesAsJsonFiles } from "./utils/downloadRouteJson";
import { duplicateRoute } from "./utils/duplicateRoute";

// Dev-only QA tooling (see the ?mock=1 branch below) must never run in production.
const MOCK_DATA_ENABLED = process.env.NODE_ENV !== "production";

type RouteLoadResult = { routes: Route[]; error: string | null };

const EMPTY_ROUTE_LOAD_RESULT: RouteLoadResult = { routes: [], error: null };

let cachedRouteLoadKey = "";
let cachedRouteLoadResult: RouteLoadResult = EMPTY_ROUTE_LOAD_RESULT;

function readInitialRoutes(): RouteLoadResult {
  if (typeof window === "undefined") {
    return EMPTY_ROUTE_LOAD_RESULT;
  }
  const forceMock = MOCK_DATA_ENABLED
    ? new URLSearchParams(window.location.search).get("mock")
    : null;
  // Intentionally not removed after reading (unlike the old page): this is re-read on
  // every "storage"/"optimize-results-updated" event via useSyncExternalStore, so
  // deleting it here would break that subscription.
  const stored = sessionStorage.getItem("optimizeResults");
  const cacheKey = forceMock === "1" ? "mock" : `stored:${stored ?? ""}`;

  if (cacheKey === cachedRouteLoadKey) {
    return cachedRouteLoadResult;
  }

  // Dev-only demo: ?mock=1 loads fixture routes for visual QA without running optimize.
  if (forceMock === "1") {
    cachedRouteLoadKey = cacheKey;
    cachedRouteLoadResult = {
      routes: [mockRouteToRoute(mockRouteData)],
      error: null,
    };
    return cachedRouteLoadResult;
  }

  if (!stored) {
    // No prior optimize run for this session (e.g. /results visited directly): there is
    // nothing to show, so the page falls through to its normal empty-routes UI.
    cachedRouteLoadKey = cacheKey;
    cachedRouteLoadResult = EMPTY_ROUTE_LOAD_RESULT;
    return cachedRouteLoadResult;
  }

  try {
    const parsed = JSON.parse(stored) as Route[];
    cachedRouteLoadKey = cacheKey;
    cachedRouteLoadResult = { routes: parsed, error: null };
    return cachedRouteLoadResult;
  } catch {
    cachedRouteLoadKey = cacheKey;
    cachedRouteLoadResult = {
      routes: [],
      error:
        "Could not read saved route data. Please run optimize again from the edit page.",
    };
    return cachedRouteLoadResult;
  }
}

function subscribeToRouteStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener("optimize-results-updated", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("optimize-results-updated", onChange);
  };
}

export default function ResultsPage() {
  const routeLoadResult = useSyncExternalStore(
    subscribeToRouteStorage,
    readInitialRoutes,
    () => EMPTY_ROUTE_LOAD_RESULT,
  );
  const [draftRoutes, setDraftRoutes] = useState<Route[] | null>(null);
  const routes = draftRoutes ?? routeLoadResult.routes;
  const error = routeLoadResult.error;
  const routesRef = useRef(routes);
  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingPinMove, setPendingPinMove] = useState<PendingPinMove | null>(
    null,
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [sendRoutesOpen, setSendRoutesOpen] = useState(false);
  const [pendingWarningAction, setPendingWarningAction] = useState<
    "export" | "send" | null
  >(null);

  const setRoutes = useCallback((update: React.SetStateAction<Route[]>) => {
    setDraftRoutes((prev) => {
      const baseRoutes = prev ?? routesRef.current;
      return typeof update === "function" ? update(baseRoutes) : update;
    });
  }, []);

  const updateStopNote = useCallback(
    (routeId: string, stopId: string, note: string) => {
      setRoutes((prev) =>
        prev.map((route) => {
          if (route.vehicleId !== routeId) return route;
          return {
            ...route,
            stops: route.stops.map((s) =>
              s.id === stopId ? { ...s, note } : s,
            ),
          };
        }),
      );
    },
    [setRoutes],
  );

  const handleRouteDistanceUpdate = useCallback(
    (vehicleId: string, distanceMi: number) => {
      setRoutes((prev) => {
        const next = prev.map((route) =>
          route.vehicleId === vehicleId && route.distanceMi !== distanceMi
            ? { ...route, distanceMi }
            : route,
        );
        return next.every((r, i) => r === prev[i]) ? prev : next;
      });
    },
    [setRoutes],
  );

  const handleEditModeChange = useCallback((value: boolean) => {
    setIsEditMode(value);
    if (!value) setPendingPinMove(null);
    if (value) setIsSheetExpanded(true);
  }, []);

  const savePendingPinMove = useCallback(() => {
    if (!pendingPinMove) return;
    setRoutes((prev) =>
      prev.map((route) =>
        route.vehicleId !== pendingPinMove.vehicleId
          ? route
          : {
              ...route,
              stops: route.stops.map((s) =>
                s.id !== pendingPinMove.stopId
                  ? s
                  : { ...s, lat: pendingPinMove.lat, lng: pendingPinMove.lng },
              ),
            },
      ),
    );
    setPendingPinMove(null);
  }, [pendingPinMove, setRoutes]);

  const handlePendingPinMove = useCallback(
    (vehicleId: string, stopId: string, lat: number, lng: number) => {
      setPendingPinMove({ vehicleId, stopId, lat, lng });
    },
    [],
  );

  const cancelPendingPinMove = useCallback(() => setPendingPinMove(null), []);

  const exitEditMode = useCallback(() => {
    handleEditModeChange(false);
  }, [handleEditModeChange]);

  const handleMobileCancel = useCallback(() => {
    if (pendingPinMove != null) {
      cancelPendingPinMove();
    } else {
      exitEditMode();
    }
  }, [pendingPinMove, cancelPendingPinMove, exitEditMode]);

  const handleExportClick = useCallback(() => {
    if (isEditMode || pendingPinMove != null) {
      setPendingWarningAction("export");
      return;
    }
    setExportOpen(true);
  }, [isEditMode, pendingPinMove]);

  const handleSendRoutesClick = useCallback(() => {
    if (isEditMode || pendingPinMove != null) {
      setPendingWarningAction("send");
      return;
    }
    setSendRoutesOpen(true);
  }, [isEditMode, pendingPinMove]);

  const handleDoneEditingForWarning = useCallback(() => {
    handleEditModeChange(false);
    setPendingWarningAction((action) => {
      if (action === "export") setExportOpen(true);
      if (action === "send") setSendRoutesOpen(true);
      return null;
    });
  }, [handleEditModeChange]);

  const handleExportSingleRoute = useCallback(
    (vehicleId: string) => {
      if (isEditMode || pendingPinMove != null) {
        setPendingWarningAction("export");
        return;
      }
      const routeIndex = routes.findIndex((r) => r.vehicleId === vehicleId);
      if (routeIndex === -1) return;
      downloadRoutesAsJsonFiles(routes, (_, i) => i === routeIndex);
    },
    [routes, isEditMode, pendingPinMove],
  );

  const updateDriverPhone = useCallback(
    (vehicleId: string, phone: string) => {
      setRoutes((prev) =>
        prev.map((route) =>
          route.vehicleId === vehicleId
            ? { ...route, driverPhoneNumber: phone }
            : route,
        ),
      );
    },
    [setRoutes],
  );

  const markRoutesSent = useCallback(
    (vehicleIds: string[], sentAtIso: string) => {
      const sentIds = new Set(vehicleIds);
      setRoutes((prev) =>
        prev.map((route) =>
          sentIds.has(route.vehicleId)
            ? { ...route, lastSentAt: sentAtIso }
            : route,
        ),
      );
    },
    [setRoutes],
  );

  const handleDuplicateRoute = useCallback(
    (vehicleId: string) => {
      setRoutes((prev) => {
        const routeIndex = prev.findIndex((r) => r.vehicleId === vehicleId);
        if (routeIndex === -1) return prev;
        const source = prev[routeIndex]!;
        const suffix = Date.now().toString(36);
        const copy = duplicateRoute(source, suffix);
        return [
          ...prev.slice(0, routeIndex + 1),
          copy,
          ...prev.slice(routeIndex + 1),
        ];
      });
    },
    [setRoutes],
  );

  const handleDeleteRoute = useCallback(
    (vehicleId: string) => {
      setRoutes((prev) => prev.filter((r) => r.vehicleId !== vehicleId));
      if (pendingPinMove?.vehicleId === vehicleId) {
        setPendingPinMove(null);
      }
    },
    [pendingPinMove, setRoutes],
  );

  return (
    <main
      className={`h-screen flex flex-col overflow-hidden font-sans-manrope ${styles.root}`}
    >
      <ExportRoutesModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        routes={routes}
      />
      <SendRoutesModal
        isOpen={sendRoutesOpen}
        onClose={() => setSendRoutesOpen(false)}
        routes={routes}
        onUpdateDriverPhone={updateDriverPhone}
        onSendComplete={markRoutesSent}
      />
      <ExportEditWarningModal
        isOpen={pendingWarningAction !== null}
        onClose={() => setPendingWarningAction(null)}
        onDoneEditing={handleDoneEditingForWarning}
        warningMessage={
          pendingWarningAction === "send"
            ? "Unable to send routes while currently editing"
            : "Unable to export while currently editing"
        }
        bodyMessage={
          pendingWarningAction === "send"
            ? "Please save your changes before sending routes. This ensures the routes you send match your current view."
            : "Please save your changes before exporting routes. This ensures the exported data matches your current view."
        }
      />
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm w-80 space-y-4">
            <p className="text-sm text-zinc-700">{error}</p>
            <a
              href="/edit"
              className="inline-flex w-full items-center justify-center rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-500"
            >
              Go back to edit
            </a>
          </div>
        </div>
      )}{" "}
      {/* Map container switched to h-screen and added overflow hidden so the page is forced to be exactly one screen tall, whereas before the page was allowed to get taller than browser window leading to a long scroll */}
      <MobileSidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <header
        className={`${NAVBAR_V2_ROOT} hidden lg:flex shrink-0 border-b border-[var(--edit-stone-200)]`}
      >
        <p className={NAVBAR_V2_LOGO}>DELIVERY OPTIMIZER</p>
        <div className="ml-auto flex items-center gap-2">
          {pendingPinMove != null && (
            <>
              <button
                type="button"
                onClick={cancelPendingPinMove}
                className="h-9 px-4 rounded-[6px] border border-[var(--edit-stone-700)] font-semibold text-sm text-[var(--edit-text-primary)] hover:bg-[var(--edit-secondary-btn-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePendingPinMove}
                className="h-9 px-4 rounded-[6px] bg-[var(--edit-btn-primary)] font-semibold text-sm text-[var(--edit-text-primary)] hover:brightness-[0.97]"
              >
                Save
              </button>
            </>
          )}
        </div>
      </header>
      <div className="hidden lg:flex flex-1 min-h-0">
        <NavSidebar>
          <SidebarEditButton />
          <SidebarResultsButton />
        </NavSidebar>
        {/* Hi-fi routes panel width (28rem); always visible on desktop */}
        <div className="shrink-0 h-full w-[28rem] overflow-hidden">
          <Sidebar
            routes={routes}
            isEditMode={isEditMode}
            onEditModeChange={handleEditModeChange}
            onUpdateStopNote={updateStopNote}
            onExportAllRoutes={handleExportClick}
            onSendRoutes={handleSendRoutesClick}
            onExportRoute={handleExportSingleRoute}
            onDuplicateRoute={handleDuplicateRoute}
            onDeleteRoute={handleDeleteRoute}
          />
        </div>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="relative flex-1 min-h-0 w-full overflow-hidden">
            {isEditMode && (
              <p className={RESULTS_MOBILE_EDIT_PILL} role="status">
                {RESULTS_MOBILE_EDIT_BANNER_MESSAGE}
              </p>
            )}
            <MapComponent
              routes={routes}
              isEditMode={isEditMode}
              pendingPinMove={pendingPinMove}
              onPendingPinMove={handlePendingPinMove}
              onRouteDistanceUpdate={handleRouteDistanceUpdate}
            />
          </div>
        </div>
      </div>
      <div className="lg:hidden relative flex flex-1 min-h-0 flex-col">
        <MobileResultsNavbar
          onMenuClick={() => setIsMobileMenuOpen(true)}
          showCancel={pendingPinMove != null}
          onSave={savePendingPinMove}
          onCancel={handleMobileCancel}
          saveDisabled={isEditMode && pendingPinMove == null}
        />
        <div className="relative flex flex-1 min-h-0 flex-col">
          {isEditMode && (
            <p className={RESULTS_MOBILE_EDIT_PILL} role="status">
              {RESULTS_MOBILE_EDIT_BANNER_MESSAGE}
            </p>
          )}
          <div className="flex-1 min-h-0 w-full overflow-hidden">
            <MapComponent
              routes={routes}
              isEditMode={isEditMode}
              pendingPinMove={pendingPinMove}
              onPendingPinMove={handlePendingPinMove}
              onRouteDistanceUpdate={handleRouteDistanceUpdate}
            />
          </div>
        </div>
        <ResultsBottomSheet
          routes={routes}
          isExpanded={isSheetExpanded}
          onExpandedChange={setIsSheetExpanded}
          isEditMode={isEditMode}
          onEditModeChange={handleEditModeChange}
          onExportClick={handleExportClick}
          onSendRoutesClick={handleSendRoutesClick}
          onUpdateStopNote={updateStopNote}
          onExportRoute={handleExportSingleRoute}
          onDuplicateRoute={handleDuplicateRoute}
          onDeleteRoute={handleDeleteRoute}
        />
      </div>
    </main>
  );
}
