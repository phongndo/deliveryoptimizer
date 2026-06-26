import { describe, expect, it } from "vitest";

import {
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  feedbackLabelsForCategory,
} from "@/lib/feedback/issue";
import type { FeedbackPayload } from "@/lib/feedback/schema";

const basePayload: FeedbackPayload = {
  category: "bug",
  message: "The route map does not redraw after I move a stop.",
  reproductionSteps: "Open results, enable edit mode, drag a stop, then save.",
  contactEmail: "dispatcher@example.com",
  diagnostics: {
    path: "/results",
    userAgent: "Mozilla/5.0 Test Browser",
    viewport: "1440x900",
    devicePixelRatio: 2,
    locale: "en-US",
    timeZone: "America/Los_Angeles",
    timestamp: "2026-05-14T12:00:00.000Z",
    lastClientError: "Map redraw failed",
  },
};

describe("feedback issue formatting", () => {
  it("builds a scoped title from category and message", () => {
    expect(buildFeedbackIssueTitle(basePayload)).toBe(
      "[Feedback][Bug] The route map does not redraw after I move a stop",
    );
  });

  it("uses a provided title when present", () => {
    expect(
      buildFeedbackIssueTitle({
        ...basePayload,
        title: "Cannot save edited route",
      }),
    ).toBe("Cannot save edited route");
  });

  it("formats the issue body with diagnostics and private screenshot location", () => {
    const body = buildFeedbackIssueBody(basePayload, {
      bucket: "feedback-private",
      objectName: "feedback/screenshots/2026-05-14/example.jpg",
    });

    expect(body).toContain("## Feedback");
    expect(body).toContain("The route map does not redraw");
    expect(body).toContain("## Reproduction steps");
    expect(body).toContain(
      "Private object: gs://feedback-private/feedback/screenshots/2026-05-14/example.jpg",
    );
    expect(body).toContain("- Path: /results");
    expect(body).toContain("- Last client error: Map redraw failed");
  });

  it("maps feedback categories to existing repository labels", () => {
    expect(feedbackLabelsForCategory("bug")).toEqual(["bug", "front-end"]);
    expect(feedbackLabelsForCategory("enhancement")).toEqual([
      "enhancement",
      "front-end",
    ]);
    expect(feedbackLabelsForCategory("general")).toEqual(["front-end"]);
    expect(feedbackLabelsForCategory("question")).toEqual([
      "question",
      "front-end",
    ]);
  });
});
