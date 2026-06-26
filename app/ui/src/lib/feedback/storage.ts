import { randomUUID } from "node:crypto";

const metadataTokenUrl =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

type MetadataTokenResponse = {
  access_token?: string;
};

export type DecodedScreenshot = {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

export function decodeScreenshotDataUrl(dataUrl: string): DecodedScreenshot {
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Screenshot must be a PNG, JPEG, or WebP data URL.");
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 2_500_000) {
    throw new Error("Screenshot must be smaller than 2.5MB.");
  }

  return {
    bytes,
    mimeType: match[1] as DecodedScreenshot["mimeType"],
  };
}

export async function uploadFeedbackScreenshot(
  dataUrl: string,
  now = new Date(),
): Promise<{ bucket: string; objectName: string }> {
  const bucket = process.env.FEEDBACK_SCREENSHOT_BUCKET;
  if (!bucket) {
    throw new Error("Feedback screenshot bucket is not configured.");
  }

  const screenshot = decodeScreenshotDataUrl(dataUrl);
  const extension = screenshot.mimeType.split("/")[1].replace("jpeg", "jpg");
  const objectName = `feedback/screenshots/${formatDate(now)}/${randomUUID()}.${extension}`;
  const token = await getGoogleAccessToken();

  const response = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
      bucket,
    )}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": screenshot.mimeType,
      },
      body: new Uint8Array(screenshot.bytes),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to upload feedback screenshot.");
  }

  return { bucket, objectName };
}

export async function isFeedbackShutdownGuardActive(): Promise<boolean> {
  if (process.env.FEEDBACK_SHUTDOWN === "1") return true;

  const bucket = process.env.FEEDBACK_SCREENSHOT_BUCKET;
  if (!bucket) return false;

  try {
    const token = await getGoogleAccessToken();
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
        bucket,
      )}/o/${encodeURIComponent("feedback/guard/shutdown.json")}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return response.ok;
  } catch {
    return false;
  }
}

export async function writeFeedbackShutdownGuard(
  reason: string,
): Promise<void> {
  const bucket = process.env.FEEDBACK_SCREENSHOT_BUCKET;
  if (!bucket) return;

  const token = await getGoogleAccessToken();
  const body = JSON.stringify({
    reason,
    createdAt: new Date().toISOString(),
  });

  await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
      bucket,
    )}/o?uploadType=media&name=${encodeURIComponent("feedback/guard/shutdown.json")}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    },
  );
}

async function getGoogleAccessToken(): Promise<string> {
  const response = await fetch(metadataTokenUrl, {
    headers: { "Metadata-Flavor": "Google" },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google application access token.");
  }

  const json = (await response.json()) as MetadataTokenResponse;
  if (!json.access_token) {
    throw new Error(
      "Google metadata token response did not include an access token.",
    );
  }

  return json.access_token;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
