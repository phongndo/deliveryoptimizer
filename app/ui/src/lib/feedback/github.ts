import {
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  feedbackLabelsForCategory,
  type ScreenshotReference,
} from "./issue";
import type { FeedbackPayload } from "./schema";
import { createGitHubAppJwt } from "./security";

type InstallationTokenResponse = {
  token?: string;
};

type GitHubIssueResponse = {
  html_url?: string;
};

export async function createFeedbackIssue(
  payload: FeedbackPayload,
  screenshot?: ScreenshotReference,
): Promise<string> {
  const repository = process.env.FEEDBACK_GITHUB_REPO;
  const installationId = process.env.FEEDBACK_GITHUB_INSTALLATION_ID;

  if (!repository || !installationId) {
    throw new Error("Feedback GitHub repository is not configured.");
  }

  const appJwt = createGitHubAppJwt();
  const tokenResponse = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!tokenResponse.ok) {
    throw new Error("Failed to create GitHub installation token.");
  }

  const tokenJson = (await tokenResponse.json()) as InstallationTokenResponse;
  if (!tokenJson.token) {
    throw new Error(
      "GitHub installation token response did not include a token.",
    );
  }

  const issueResponse = await fetch(
    `https://api.github.com/repos/${repository}/issues`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenJson.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: buildFeedbackIssueTitle(payload),
        body: buildFeedbackIssueBody(payload, screenshot),
        labels: feedbackLabelsForCategory(payload.category),
      }),
    },
  );

  if (!issueResponse.ok) {
    throw new Error("Failed to create GitHub issue.");
  }

  const issueJson = (await issueResponse.json()) as GitHubIssueResponse;
  if (!issueJson.html_url) {
    throw new Error("GitHub issue response did not include a URL.");
  }

  return issueJson.html_url;
}
