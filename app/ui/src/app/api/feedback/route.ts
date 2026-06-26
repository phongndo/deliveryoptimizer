import { NextResponse } from "next/server";

import { createFeedbackIssue } from "@/lib/feedback/github";
import { feedbackPayloadSchema } from "@/lib/feedback/schema";
import { verifyRecaptchaToken } from "@/lib/feedback/security";
import {
  isFeedbackShutdownGuardActive,
  uploadFeedbackScreenshot,
  writeFeedbackShutdownGuard,
} from "@/lib/feedback/storage";

export const runtime = "nodejs";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimits = new Map<string, RateLimitEntry>();
let acceptedToday = { date: todayKey(), count: 0 };
let inMemoryShutdown = false;

export async function POST(req: Request) {
  if (process.env.FEEDBACK_ENABLED === "0" || inMemoryShutdown) {
    return feedbackUnavailable();
  }

  if (await isFeedbackShutdownGuardActive()) {
    inMemoryShutdown = true;
    return feedbackUnavailable();
  }

  const clientIp = getClientIp(req);
  if (!consumeRateLimit(clientIp)) {
    return NextResponse.json(
      {
        error: "Feedback is temporarily rate limited. Please try again later.",
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON format." },
      { status: 400 },
    );
  }

  const parsed = feedbackPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message || "Feedback payload is invalid." },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  if (payload.company?.trim()) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const recaptcha = await verifyRecaptchaToken(
    payload.recaptchaToken,
    clientIp,
  );
  if (!recaptcha.ok) {
    return NextResponse.json(
      { error: "Feedback could not be verified. Please try again later." },
      { status: 403 },
    );
  }

  try {
    const screenshot = payload.screenshot
      ? await uploadFeedbackScreenshot(payload.screenshot.dataUrl)
      : undefined;
    const issueUrl = await createFeedbackIssue(payload, screenshot);
    await recordAcceptedFeedback();

    return NextResponse.json({ ok: true, issueUrl }, { status: 201 });
  } catch (error) {
    console.error("feedback submission failed", error);
    return NextResponse.json(
      { error: "Feedback could not be submitted right now." },
      { status: 502 },
    );
  }
}

function feedbackUnavailable() {
  return NextResponse.json(
    { error: "Feedback reporting is temporarily disabled." },
    { status: 503 },
  );
}

function consumeRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const windowMs = Number(
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS ?? "600000",
  );
  const maxRequests = Number(process.env.FEEDBACK_RATE_LIMIT_MAX ?? "5");
  const entry = rateLimits.get(clientIp);

  if (!entry || entry.resetAt <= now) {
    rateLimits.set(clientIp, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

async function recordAcceptedFeedback(): Promise<void> {
  const currentDate = todayKey();
  if (acceptedToday.date !== currentDate) {
    acceptedToday = { date: currentDate, count: 0 };
  }

  acceptedToday.count += 1;
  const threshold = Number(
    process.env.FEEDBACK_DAILY_SHUTDOWN_THRESHOLD ?? "100",
  );
  if (acceptedToday.count >= threshold) {
    inMemoryShutdown = true;
    await writeFeedbackShutdownGuard("daily feedback threshold exceeded");
  }
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
