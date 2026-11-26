// Plain-assert Node tests for src/shared/releaseCheck.ts: semver tag
// parsing/comparison and the never-throwing latest-release fetch (GitHub may
// be unreachable on corp networks, have no releases yet, or rate-limit).

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));

function transpile(relPath, outName) {
  const source = readFileSync(path.join(here, "..", relPath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2019 },
  });
  const outDir = path.join(tmpdir(), "release-check-test");
  mkdirSync(outDir, { recursive: true });
  const modulePath = path.join(outDir, outName);
  writeFileSync(modulePath, outputText);
  return pathToFileURL(modulePath).href;
}

const {
  fetchNewerRelease,
  isNewerReleaseTag,
  LATEST_RELEASE_API_URL,
  parseVersionTag,
  RELEASE_CHECK_INTERVAL_MS,
} = await import(transpile("src/shared/releaseCheck.ts", "releaseCheck.mjs"));

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("releaseCheck: GitHub release check (silent on every failure)");

// --- parseVersionTag --------------------------------------------------------
{
  assert.deepEqual(parseVersionTag("v1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseVersionTag("1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseVersionTag("V2.0.0"), [2, 0, 0]);
  assert.equal(parseVersionTag(""), null);
  assert.equal(parseVersionTag("latest"), null);
  assert.equal(parseVersionTag("v1.2"), null, "partial semver ignored");
  assert.equal(parseVersionTag("v2026.11.25.1"), null, "four components ignored");
  assert.equal(parseVersionTag("v1.2.3-beta"), null, "prerelease suffix ignored");
  ok("parseVersionTag accepts vX.Y.Z only");
}

// --- isNewerReleaseTag ------------------------------------------------------
{
  assert.ok(isNewerReleaseTag("0.0.1", "v0.0.2"));
  assert.ok(isNewerReleaseTag("0.0.1", "v1.0.0"));
  assert.ok(isNewerReleaseTag("1.2.9", "v1.3.0"));
  assert.ok(!isNewerReleaseTag("1.3.0", "v1.2.9"), "older release is not newer");
  assert.ok(!isNewerReleaseTag("1.2.3", "v1.2.3"), "same version is not newer");
  assert.ok(!isNewerReleaseTag("1.2.3", "not-a-version"), "unparsable tag ignored");
  assert.ok(!isNewerReleaseTag("bad", "v1.0.0"), "unparsable current version ignored");
  ok("isNewerReleaseTag compares semver strictly");
}

// --- fetchNewerRelease: happy path -----------------------------------------
{
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        tag_name: "v0.4.1",
        html_url: "https://github.com/kimusan/outlook-businessmails-openai-api/releases/tag/v0.4.1",
        name: "Release 0.4.1",
      }),
    };
  };
  const release = await fetchNewerRelease("0.4.0", fetchImpl);
  ok("newer release fetched with version + url");
  assert.equal(release.version, "0.4.1");
  assert.equal(release.name, "Release 0.4.1");
  assert.match(release.url, /releases\/tag\/v0\.4\.1/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, LATEST_RELEASE_API_URL);
  assert.ok(calls[0].init.signal, "request carries an abort signal (timeout support)");

  const same = await fetchNewerRelease("0.4.1", fetchImpl);
  assert.equal(same, null, "same version -> no notification");
  const older = await fetchNewerRelease("0.5.0", fetchImpl);
  assert.equal(older, null, "older release -> no notification");
  ok("current/older releases resolve to null");
}

// --- fetchNewerRelease: failure paths all silent ----------------------------
{
  const notOk = async () => ({ ok: false, status: 404, json: async () => ({}) });
  assert.equal(await fetchNewerRelease("0.0.1", notOk), null, "404 (no releases yet)");
  const rateLimited = async () => ({ ok: false, status: 403, json: async () => ({}) });
  assert.equal(await fetchNewerRelease("0.0.1", rateLimited), null, "403 rate limit");
  const networkError = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal(await fetchNewerRelease("0.0.1", networkError), null, "network error");
  const badJson = async () => ({ ok: true, json: async () => JSON.parse("not json") });
  assert.equal(await fetchNewerRelease("0.0.1", badJson), null, "invalid JSON body");
  const wrongShape = async () => ({ ok: true, json: async () => ({ surprise: true }) });
  assert.equal(await fetchNewerRelease("0.0.1", wrongShape), null, "unexpected body shape");
  const unreachableTag = async () => ({
    ok: true,
    json: async () => ({ tag_name: "latest-stable", html_url: "https://x" }),
  });
  assert.equal(await fetchNewerRelease("0.0.1", unreachableTag), null, "non-semver tag");
  ok("404/403/network/JSON/shape failures all resolve null, never throw");
}

// --- fetchNewerRelease: timeout aborts a hung request ------------------------
{
  const hungFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () =>
        reject(new Error("aborted like a real fetch would"))
      );
    });
  const started = Date.now();
  const release = await fetchNewerRelease("0.0.1", hungFetch, 50);
  assert.equal(release, null);
  assert.ok(Date.now() - started < 5000, "resolves via the abort timer, not by hanging");
  ok("hung request is aborted by the timeout and resolves null");
}

// --- throttle constant sanity ------------------------------------------------
{
  assert.equal(RELEASE_CHECK_INTERVAL_MS, 6 * 60 * 60 * 1000, "6 hours");
  ok("release check throttle is a few hours (6h)");
}

console.log(`\n${passed}/${passed} checks passed`);
