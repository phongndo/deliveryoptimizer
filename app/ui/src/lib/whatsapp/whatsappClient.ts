import type { SendRouteItem } from "@/lib/validation/whatsapp.schema";

const MOCK_LATENCY_MS = Number(process.env.WHATSAPP_MOCK_LATENCY_MS ?? 600);

export type WhatsAppSendResult = {
  vehicleId: string;
  status: "sent";
  whatsappMessageId: string;
};

/**
 * Always mocks the WhatsApp send for now: logs what would be sent and simulates send
 * latency. Real Cloud API integration is a separate future task. Callers depend on a
 * per-route result array so that future implementation can report partial failures
 * without changing this function's contract.
 */
export async function sendRoutesToWhatsApp(
  items: SendRouteItem[],
): Promise<WhatsAppSendResult[]> {
  for (const item of items) {
    console.log(
      `[whatsapp:mock] would send route ${item.vehicleId} to ${item.driverPhoneNumber}`,
      JSON.stringify(item.route),
    );
  }

  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));

  return items.map((item) => ({
    vehicleId: item.vehicleId,
    status: "sent" as const,
    whatsappMessageId: `mock-${item.vehicleId}-${Date.now().toString(36)}`,
  }));
}
