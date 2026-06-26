import { describe, expect, it } from "vitest";

import { decodeScreenshotDataUrl } from "@/lib/feedback/storage";

describe("feedback screenshot decoding", () => {
  it("accepts supported image data URLs", () => {
    const decoded = decodeScreenshotDataUrl(
      `data:image/png;base64,${Buffer.from("fake-image").toString("base64")}`,
    );

    expect(decoded.mimeType).toBe("image/png");
    expect(decoded.bytes.toString()).toBe("fake-image");
  });

  it("rejects unsupported data URL types", () => {
    expect(() =>
      decodeScreenshotDataUrl(
        `data:text/plain;base64,${Buffer.from("x").toString("base64")}`,
      ),
    ).toThrow("Screenshot must be a PNG, JPEG, or WebP data URL.");
  });
});
