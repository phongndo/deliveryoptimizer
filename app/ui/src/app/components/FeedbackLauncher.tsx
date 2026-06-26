"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";

import {
  feedbackCategoryLabels,
  type FeedbackCategory,
  type FeedbackPayload,
} from "@/lib/feedback/schema";

import styles from "./FeedbackLauncher.module.css";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (
        siteKey: string,
        options: { action: string },
      ) => Promise<string>;
    };
  }
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; issueUrl?: string }
  | { kind: "error"; message: string };

type ScreenshotState = {
  dataUrl: string;
  name: string;
};

type FeedbackResponse = {
  ok?: boolean;
  issueUrl?: string;
  error?: string;
};

const categories: FeedbackCategory[] = [
  "bug",
  "enhancement",
  "general",
  "question",
];

export default function FeedbackLauncher() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [company, setCompany] = useState("");
  const [screenshot, setScreenshot] = useState<ScreenshotState | null>(null);
  const [lastClientError, setLastClientError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const canSubmit = useMemo(
    () => submitState.kind !== "submitting" && message.trim().length >= 8,
    [message, submitState.kind],
  );
  const shouldClearFooter = pathname === "/" || pathname === "/welcome";

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_FEEDBACK_RECAPTCHA_SITE_KEY;
    if (!siteKey || document.querySelector("script[data-feedback-recaptcha]"))
      return;

    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.feedbackRecaptcha = "true";
    document.head.append(script);
  }, []);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setLastClientError(event.message || "Unhandled client error");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      setLastClientError(
        reason instanceof Error ? reason.message : String(reason),
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  const resetAndClose = useCallback(() => {
    setIsOpen(false);
    setSubmitState({ kind: "idle" });
  }, []);

  const captureScreenshot = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setSubmitState({
        kind: "error",
        message: "Screenshot capture is not supported in this browser.",
      });
      return;
    }

    setSubmitState({ kind: "idle" });
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      await new Promise<void>((resolve) => {
        if (video.videoWidth > 0) {
          resolve();
          return;
        }
        video.onloadedmetadata = () => resolve();
      });

      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        1600 / Math.max(video.videoWidth, video.videoHeight),
      );
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Screenshot canvas could not be created.");

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      setScreenshot({
        dataUrl,
        name: `feedback-screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError")
        return;
      setSubmitState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Screenshot capture failed.",
      });
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const submitFeedback = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;

      setSubmitState({ kind: "submitting" });

      try {
        const payload: FeedbackPayload = {
          category,
          message: message.trim(),
          reproductionSteps: reproductionSteps.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          diagnostics: buildDiagnostics(lastClientError),
          screenshot: screenshot
            ? {
                dataUrl: screenshot.dataUrl,
                name: screenshot.name,
              }
            : undefined,
          recaptchaToken: await getRecaptchaToken(),
          company,
        };

        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await response.json()) as FeedbackResponse;

        if (!response.ok) {
          throw new Error(json.error || "Feedback could not be submitted.");
        }

        setMessage("");
        setReproductionSteps("");
        setContactEmail("");
        setScreenshot(null);
        setSubmitState({ kind: "success", issueUrl: json.issueUrl });
      } catch (error) {
        setSubmitState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Feedback could not be submitted.",
        });
      }
    },
    [
      canSubmit,
      category,
      company,
      contactEmail,
      lastClientError,
      message,
      reproductionSteps,
      screenshot,
    ],
  );

  return (
    <>
      <button
        type="button"
        className={`${styles.launcher} ${
          shouldClearFooter ? styles.launcherAboveFooter : ""
        }`}
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label="Report bug or feedback"
      >
        <span className={styles.mark} aria-hidden="true">
          <Image
            className={styles.markIcon}
            src="/Manage/warning.svg"
            alt=""
            width={24}
            height={24}
          />
        </span>
        <span className={styles.launcherLabel} aria-hidden="true">
          Report bug / feedback
        </span>
      </button>

      {isOpen && (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={resetAndClose}
        >
          <section
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.header}>
              <div>
                <h2 className={styles.title} id="feedback-title">
                  Report a bug or feedback
                </h2>
                <p className={styles.subtitle}>
                  Send a bug, enhancement, or note without leaving your route
                  work.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.closeButton}
                onClick={resetAndClose}
                aria-label="Close feedback form"
              >
                &times;
              </button>
            </div>

            <form className={styles.form} onSubmit={submitFeedback}>
              <div className={styles.label}>
                Type
                <div
                  className={styles.segmented}
                  role="radiogroup"
                  aria-label="Feedback type"
                >
                  {categories.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="radio"
                      aria-checked={category === item}
                      className={`${styles.segment} ${
                        category === item ? styles.segmentActive : ""
                      }`}
                      onClick={() => setCategory(item)}
                    >
                      {feedbackCategoryLabels[item]}
                    </button>
                  ))}
                </div>
              </div>

              <label className={styles.label}>
                What happened?
                <textarea
                  className={styles.textarea}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={4000}
                  placeholder="Describe what you expected, what happened, or what would make this better."
                  required
                />
              </label>

              <label className={styles.label}>
                How can we reproduce it?{" "}
                <span className={styles.optional}>Optional</span>
                <textarea
                  className={styles.textarea}
                  value={reproductionSteps}
                  onChange={(event) => setReproductionSteps(event.target.value)}
                  maxLength={3000}
                  placeholder="Steps, page, route state, or anything you tried before refreshing."
                />
              </label>

              <label className={styles.label}>
                Contact email <span className={styles.optional}>Optional</span>
                <input
                  className={styles.input}
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  type="email"
                  maxLength={254}
                  placeholder="you@example.com"
                />
              </label>

              <label className={styles.honeypot}>
                Company
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                />
              </label>

              <div className={styles.screenshotRow}>
                <p className={styles.screenshotText}>
                  Screenshot is optional. Your browser will ask what to share
                  before anything is captured.
                </p>
                <button
                  type="button"
                  className={styles.captureButton}
                  onClick={() => void captureScreenshot()}
                  disabled={submitState.kind === "submitting"}
                >
                  Capture
                </button>
              </div>

              {screenshot && (
                <div className={styles.preview}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshot.dataUrl}
                    alt="Feedback screenshot preview"
                  />
                  <div className={styles.previewActions}>
                    <span className={styles.previewName}>
                      {screenshot.name}
                    </span>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => setScreenshot(null)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {submitState.kind === "error" && (
                <div
                  className={`${styles.status} ${styles.statusError}`}
                  role="alert"
                >
                  {submitState.message}
                </div>
              )}
              {submitState.kind === "success" && (
                <div
                  className={`${styles.status} ${styles.statusSuccess}`}
                  role="status"
                >
                  Feedback submitted
                  {submitState.issueUrl ? (
                    <>
                      {" "}
                      <a
                        href={submitState.issueUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View issue
                      </a>
                    </>
                  ) : null}
                </div>
              )}

              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={resetAndClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={!canSubmit}
                >
                  {submitState.kind === "submitting"
                    ? "Sending..."
                    : "Send feedback"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function buildDiagnostics(
  lastClientError: string | null,
): FeedbackPayload["diagnostics"] {
  const { pathname, hash } = window.location;
  return {
    path: `${pathname}${hash}`,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
    lastClientError: lastClientError || undefined,
  };
}

async function getRecaptchaToken(): Promise<string | undefined> {
  const siteKey = process.env.NEXT_PUBLIC_FEEDBACK_RECAPTCHA_SITE_KEY;
  if (!siteKey || !window.grecaptcha) return undefined;

  return new Promise((resolve, reject) => {
    window.grecaptcha?.ready(() => {
      window.grecaptcha
        ?.execute(siteKey, { action: "feedback_submit" })
        .then(resolve)
        .catch(reject);
    });
  });
}
