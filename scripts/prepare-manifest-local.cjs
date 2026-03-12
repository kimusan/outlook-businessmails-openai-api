const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const sourceManifestPath = path.join(rootDir, "manifest.xml");
const outputDir = path.join(rootDir, "release", "local-host");
const outputManifestPath = path.join(outputDir, "manifest.xml");

const port = Number(process.env.LOCAL_HOST_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid LOCAL_HOST_PORT value: ${process.env.LOCAL_HOST_PORT}`);
}

const baseUrl = `https://localhost:${port}/`;
const cacheBust = process.env.LOCAL_HOST_CACHE_BUST || Date.now().toString();

function appendCacheBust(url) {
  if (/[?&](?:amp;)?cb=/.test(url)) {
    return url;
  }

  const separator = url.includes("?") ? "&amp;" : "?";
  return `${url}${separator}cb=${encodeURIComponent(cacheBust)}`;
}

function main() {
  if (!fs.existsSync(sourceManifestPath)) {
    throw new Error(`Source manifest not found: ${sourceManifestPath}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const manifestXml = fs.readFileSync(sourceManifestPath, "utf8");

  const rewritten = manifestXml
    .replace(/https:\/\/localhost(?::\d+)?\//g, baseUrl)
    .replace(
      /<AppDomain>https:\/\/localhost(?::\d+)?<\/AppDomain>/g,
      `<AppDomain>https://localhost:${port}</AppDomain>`
    )
    .replace(
      /https:\/\/localhost:\d+\/(?:taskpane|commands)\.html(?:[^"]*)?/g,
      (url) => appendCacheBust(url)
    );

  fs.writeFileSync(outputManifestPath, rewritten, "utf8");

  process.stdout.write(`Prepared local manifest at ${outputManifestPath}\n`);
  process.stdout.write(`Using base URL ${baseUrl}\n`);
  process.stdout.write(`Using cache bust token ${cacheBust}\n`);
}

main();
