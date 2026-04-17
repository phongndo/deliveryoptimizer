/**
 * Orchestrates the optimize flow: validate, geocode, submit an optimization
 * job, poll status, then fetch the completed result.
 */

import { useCallback, useState } from "react"

import { geocodeAddress } from "@/app/components/AddressGeocoder/utils/nominatim"

import { addressCardToDeliveryInput, vehicleRowToVehicleInput } from "../utils/optimizeMapper"
import type { AddressCard, CapacityUnit, LockedVehicleRow, VehicleRow } from "../types/delivery"

const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 120000

type OptimizationJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "expired"

type OptimizationJobStatusResponse = {
  job_id: string
  status: OptimizationJobState
  error?: string
}

function isLocked(v: VehicleRow): v is LockedVehicleRow {
  return v.locked && v.type !== "" && v.capacityUnit !== ""
}

function isOptimizationJobStatusResponse(
  value: unknown
): value is OptimizationJobStatusResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "job_id" in value &&
      typeof (value as { job_id?: unknown }).job_id === "string" &&
      "status" in value &&
      typeof (value as { status?: unknown }).status === "string"
  )
}

function readErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error
  }

  return fallback
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useOptimize(vehicles: VehicleRow[], addresses: AddressCard[]) {
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [geocodeFailedAddressIds, setGeocodeFailedAddressIds] = useState<number[]>([])
  const [geocodeFailedVehicleIds, setGeocodeFailedVehicleIds] = useState<number[]>([])
  const [optimizationJobId, setOptimizationJobId] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)

  const optimize = useCallback(async () => {
    setOptimizeError(null)
    setGeocodeFailedAddressIds([])
    setGeocodeFailedVehicleIds([])
    setOptimizationJobId(null)
    setResult(null)

    const unlockedVehicle = vehicles.find((v) => !v.locked)
    const unlockedAddress = addresses.find((a) => !a.locked)
    if (unlockedVehicle || unlockedAddress) {
      setOptimizeError("Please confirm all vehicles and addresses before optimizing.")
      return
    }

    const availableVehicles = vehicles.filter((v) => v.available)
    if (availableVehicles.length === 0) {
      setOptimizeError("At least one available vehicle is required.")
      return
    }
    if (addresses.length === 0) {
      setOptimizeError("At least one delivery address is required.")
      return
    }

    const lockedVehicles = availableVehicles.filter(isLocked)
    if (lockedVehicles.length !== availableVehicles.length) {
      setOptimizeError("One or more vehicles are missing type or capacity unit.")
      return
    }

    const units = [...new Set(availableVehicles.map((v) => v.capacityUnit))]
    if (units.length > 1) {
      setOptimizeError("All vehicles must use the same capacity unit to optimize.")
      return
    }
    const demandType = units[0] as CapacityUnit

    setIsOptimizing(true)
    try {
      const vehicleLocations: Map<number, { lat: number; lng: number }> = new Map()
      const failedVehicles: { id: number; location: string }[] = []
      for (const v of availableVehicles) {
        const loc = await geocodeAddress(v.startLocation)
        if (!loc) {
          failedVehicles.push({ id: v.id, location: v.startLocation })
        } else {
          vehicleLocations.set(v.id, loc)
        }
      }

      const addressLocations: Map<number, { lat: number; lng: number }> = new Map()
      const failedAddresses: { id: number; address: string }[] = []
      for (const a of addresses) {
        const loc = await geocodeAddress(a.recipientAddress)
        if (!loc) {
          failedAddresses.push({ id: a.id, address: a.recipientAddress })
        } else {
          addressLocations.set(a.id, loc)
        }
      }

      if (failedVehicles.length > 0 || failedAddresses.length > 0) {
        setGeocodeFailedVehicleIds(failedVehicles.map((f) => f.id))
        setGeocodeFailedAddressIds(failedAddresses.map((f) => f.id))
        const allFailed = [
          ...failedVehicles.map((f) => f.location),
          ...failedAddresses.map((f) => f.address),
        ]
        const shown = allFailed.slice(0, 3)
        const overflow = allFailed.length - shown.length
        const list = shown.map((s) => `"${s}"`).join(", ")
        const suffix = overflow > 0 ? `, and ${overflow} more` : ""
        setOptimizeError(`Could not geocode: ${list}${suffix}. Try more specific addresses.`)
        return
      }

      const vehicleInputs = lockedVehicles.map((v) =>
        vehicleRowToVehicleInput(v, vehicleLocations.get(v.id)!)
      )
      const deliveryInputs = addresses
        .map((a) =>
          addressCardToDeliveryInput(a, addressLocations.get(a.id)!, demandType)
        )
        .filter((d) => d !== undefined)

      const submitResponse = await fetch("/api/optimization-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicles: vehicleInputs, deliveries: deliveryInputs }),
      })
      const submitBody = await readJsonResponse(submitResponse)
      if (!submitResponse.ok) {
        setOptimizeError(
          readErrorMessage(submitBody, "Failed to create optimization job.")
        )
        return
      }
      if (!isOptimizationJobStatusResponse(submitBody)) {
        setOptimizeError("Received invalid optimization job response from server.")
        return
      }

      setOptimizationJobId(submitBody.job_id)

      const pollDeadline = Date.now() + POLL_TIMEOUT_MS
      while (Date.now() < pollDeadline) {
        const statusResponse = await fetch(
          `/api/optimization-jobs/${encodeURIComponent(submitBody.job_id)}`,
          { cache: "no-store" }
        )
        const statusBody = await readJsonResponse(statusResponse)
        if (!statusResponse.ok) {
          setOptimizeError(
            readErrorMessage(statusBody, "Failed to fetch optimization job status.")
          )
          return
        }
        if (!isOptimizationJobStatusResponse(statusBody)) {
          setOptimizeError("Received invalid optimization job status from server.")
          return
        }

        if (statusBody.status === "succeeded") {
          const resultResponse = await fetch(
            `/api/optimization-jobs/${encodeURIComponent(statusBody.job_id)}/result`,
            { cache: "no-store" }
          )
          const resultBody = await readJsonResponse(resultResponse)
          if (!resultResponse.ok) {
            setOptimizeError(
              readErrorMessage(resultBody, "Failed to fetch optimization job result.")
            )
            return
          }

          setResult(resultBody)
          return
        }

        if (
          statusBody.status === "failed" ||
          statusBody.status === "timed_out" ||
          statusBody.status === "expired"
        ) {
          setOptimizeError(
            statusBody.error ?? "Optimization job did not complete successfully."
          )
          return
        }

        await sleep(POLL_INTERVAL_MS)
      }

      setOptimizeError("Optimization timed out while waiting for the completed route.")
    } catch {
      setOptimizeError("Network error. Please check your connection and try again.")
    } finally {
      setIsOptimizing(false)
    }
  }, [vehicles, addresses])

  const clearOptimizeError = useCallback(() => {
    setOptimizeError(null)
  }, [])

  return {
    optimize,
    isOptimizing,
    optimizeError,
    clearOptimizeError,
    geocodeFailedAddressIds,
    geocodeFailedVehicleIds,
    optimizationJobId,
    result,
  }
}
