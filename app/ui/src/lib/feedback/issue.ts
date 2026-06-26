import {
  feedbackCategoryLabels,
  type FeedbackCategory,
  type FeedbackPayload,
} from "./schema";

export type ScreenshotReference = {
  bucket: string;
  objectName: string;
};

const categoryLabels: Record<FeedbackCategory, string[]> = {
  bug: ["bug", "front-end"],
  enhancement: ["enhancement", "front-end"],
  general: ["front-end"],
  question: ["question", "front-end"],
};

export function feedbackLabelsForCategory(
  category: FeedbackCategory,
): string[] {
  return categoryLabels[category];
}

export function buildFeedbackIssueTitle(payload: FeedbackPayload): string {
  if (payload.title?.trim()) return payload.title.trim();

  const firstSentence =
    payload.message.replace(/\s+/g, " ").split(/[.!?]/)[0]?.trim() ||
    "User feedback";
  const truncated =
    firstSentence.length > 72
      ? `${firstSentence.slice(0, 69).trim()}...`
      : firstSentence;

  return `[Feedback][${feedbackCategoryLabels[payload.category]}] ${truncated}`;
}

export function buildFeedbackIssueBody(
  payload: FeedbackPayload,
  screenshot?: ScreenshotReference,
): string {
  const diagnostics = payload.diagnostics;
  const parts = [
    "## Feedback",
    payload.message.trim(),
    "",
    "## Category",
    feedbackCategoryLabels[payload.category],
  ];

  if (payload.reproductionSteps?.trim()) {
    parts.push("", "## Reproduction steps", payload.reproductionSteps.trim());
  }

  if (payload.contactEmail?.trim()) {
    parts.push("", "## Contact", payload.contactEmail.trim());
  }

  if (screenshot) {
    parts.push(
      "",
      "## Screenshot",
      `Private object: gs://${screenshot.bucket}/${screenshot.objectName}`,
    );
  }

  parts.push(
    "",
    "## Browser diagnostics",
    formatDiagnostic("Path", diagnostics.path),
    formatDiagnostic("Timestamp", diagnostics.timestamp),
    formatDiagnostic("Viewport", diagnostics.viewport),
    formatDiagnostic(
      "Device pixel ratio",
      diagnostics.devicePixelRatio == null
        ? undefined
        : String(diagnostics.devicePixelRatio),
    ),
    formatDiagnostic("Locale", diagnostics.locale),
    formatDiagnostic("Time zone", diagnostics.timeZone),
    formatDiagnostic("User agent", diagnostics.userAgent),
    formatDiagnostic("Last client error", diagnostics.lastClientError),
  );

  return parts.filter((part) => part !== "").join("\n");
}

function formatDiagnostic(label: string, value: string | undefined): string {
  const cleanValue = value?.trim();
  return `- ${label}: ${cleanValue || "not captured"}`;
}
