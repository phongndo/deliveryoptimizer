import { createSign } from "node:crypto";

export type RecaptchaResult = {
  ok: boolean;
  reason?: string;
  score?: number;
};

type RecaptchaSiteVerifyResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
};

export async function verifyRecaptchaToken(
  token: string | undefined,
  remoteIp: string | undefined,
): Promise<RecaptchaResult> {
  const secret = process.env.FEEDBACK_RECAPTCHA_SECRET;
  if (!secret) return { ok: true };
  if (!token) return { ok: false, reason: "missing_recaptcha_token" };

  const params = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) params.set("remoteip", remoteIp);

  try {
    const response = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
    );

    if (!response.ok) return { ok: false, reason: "recaptcha_unavailable" };

    const result = (await response.json()) as RecaptchaSiteVerifyResponse;
    const minScore = Number(process.env.FEEDBACK_RECAPTCHA_MIN_SCORE ?? "0.5");
    if (!result.success) {
      return {
        ok: false,
        reason: result["error-codes"]?.join(",") || "recaptcha_failed",
        score: result.score,
      };
    }
    if (typeof result.score === "number" && result.score < minScore) {
      return {
        ok: false,
        reason: "recaptcha_score_too_low",
        score: result.score,
      };
    }

    return { ok: true, score: result.score };
  } catch {
    return { ok: false, reason: "recaptcha_unavailable" };
  }
}

export function createGitHubAppJwt(
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const appId = process.env.FEEDBACK_GITHUB_APP_ID;
  const privateKey = process.env.FEEDBACK_GITHUB_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );

  if (!appId || !privateKey) {
    throw new Error("GitHub App credentials are not configured.");
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 540,
      iss: appId,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey, "base64url");

  return `${unsigned}.${signature}`;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}
