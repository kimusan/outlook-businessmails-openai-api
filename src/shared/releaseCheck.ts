/* global fetch, AbortController, setTimeout, clearTimeout */

/*
 * GitHub release check for the add-in.
 *
 * Checks the repo's latest GitHub release and reports whether it is newer
 * than the running build. Designed for a corporate network where GitHub is
 * often unreachable: every failure path (network error, timeout, HTTP
 * error, 404 = no releases published yet, unparsable tag) resolves to null
 * - the caller shows nothing. The check is always the caller's to schedule
 * and throttle; this module never touches UI state.
 *
 * Release tags must follow vX.Y.Z (or X.Y.Z); anything else is ignored.
 */

export const GITHUB_REPO = "kimusan/outlook-businessmails-openai-api";
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

/* Default throttle: never check more often than this, even across taskpane
 * reopens (timestamp persisted in localStorage by the caller). */
export const RELEASE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface LatestReleaseInfo {
  /* Semver without the leading "v", e.g. "0.4.1". */
  version: string;
  /* Browser-facing page of the release (html_url from the API). */
  url: string;
  /* Release title/name, when GitHub has one. */
  name: string;
}

/* "v1.2.3" | "1.2.3" -> [1, 2, 3]; anything else -> null. */
export function parseVersionTag(tag: string): [number, number, number] | null {
  if (!tag) {
    return null;
  }
  const match = tag
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerReleaseTag(currentVersion: string, releaseTag: string): boolean {
  const current = parseVersionTag(currentVersion);
  const release = parseVersionTag(releaseTag);
  if (!current || !release) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (release[i] !== current[i]) {
      return release[i] > current[i];
    }
  }
  return false;
}

interface GithubReleaseResponse {
  tag_name?: unknown;
  html_url?: unknown;
  name?: unknown;
}

/*
 * Fetch the latest release, if any, that is newer than currentVersion.
 * Resolves null on every failure (see file header); never rejects.
 */
export async function fetchNewerRelease(
  currentVersion: string,
  fetchImpl: typeof fetch,
  timeoutMs = 8000
): Promise<LatestReleaseInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LATEST_RELEASE_API_URL, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      // 404 = no releases published yet; 403 = rate limit; corp proxies may
      // answer with anything. All mean "show nothing".
      return null;
    }

    const body = (await response.json()) as GithubReleaseResponse;
    const tagName = typeof body.tag_name === "string" ? body.tag_name : "";
    const htmlUrl = typeof body.html_url === "string" ? body.html_url : "";
    if (!tagName || !htmlUrl || !isNewerReleaseTag(currentVersion, tagName)) {
      return null;
    }

    return {
      version: tagName.trim().replace(/^v/i, ""),
      url: htmlUrl,
      name: typeof body.name === "string" ? body.name : "",
    };
  } catch {
    return null; // network error, DNS failure, timeout, invalid JSON
  } finally {
    clearTimeout(timer);
  }
}
