const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const releaseDir = path.join(rootDir, "release");
const runtimeDir = path.join(releaseDir, "local-host");
const packageJsonPath = path.join(rootDir, "package.json");

function readPackageVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return packageJson.version || "0.0.0";
}

function ensureReleaseArtifacts() {
  if (!fs.existsSync(runtimeDir)) {
    throw new Error(`Missing runtime directory: ${runtimeDir}. Run npm run package:local:win first.`);
  }

  const requiredPaths = [
    "OutlookAiLocalHost.exe",
    "manifest.xml",
    "host-config.json",
    "start-hidden.vbs",
    "trust-local-cert.cmd",
    "install-startup.cmd",
    "remove-startup.cmd",
    "README-LOCAL-DEPLOYMENT.md",
    path.join("www", "taskpane.html"),
    path.join("certs", "dev-ca.crt"),
    path.join("certs", "localhost.pem"),
    path.join("certs", "localhost-key.pem"),
  ];

  const missing = requiredPaths
    .map((relativePath) => ({
      relativePath,
      absolutePath: path.join(runtimeDir, relativePath),
    }))
    .filter((item) => !fs.existsSync(item.absolutePath));

  if (missing.length > 0) {
    const missingText = missing.map((item) => `- ${item.relativePath}`).join("\n");
    throw new Error(`Missing required release artifacts:\n${missingText}\nRun npm run package:local:win first.`);
  }
}

function runPowerShellZip(sourceDirectory, destinationZip) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `if (Test-Path -LiteralPath '${destinationZip}') { Remove-Item -LiteralPath '${destinationZip}' -Force }`,
    `Compress-Archive -Path '${sourceDirectory}' -DestinationPath '${destinationZip}' -Force`,
  ].join("; ");

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(`Failed to launch PowerShell for zip creation: ${result.error.message}`);
  }

  if (result.status !== 0 || result.signal) {
    const exitCode = result.status === null ? "null" : String(result.status);
    const signal = result.signal ? `, signal ${result.signal}` : "";
    throw new Error(`PowerShell zip creation failed with exit code ${exitCode}${signal}.`);
  }
}

function runZipCommand(sourceDirectory, destinationZip) {
  const zipResult = spawnSync("zip", ["-r", "-q", destinationZip, path.basename(sourceDirectory)], {
    cwd: path.dirname(sourceDirectory),
    stdio: "inherit",
    shell: false,
  });

  if (zipResult.error) {
    throw new Error(
      `Failed to create zip archive and PowerShell is not available: ${zipResult.error.message}`
    );
  }

  if (zipResult.status !== 0 || zipResult.signal) {
    const exitCode = zipResult.status === null ? "null" : String(zipResult.status);
    const signal = zipResult.signal ? `, signal ${zipResult.signal}` : "";
    throw new Error(`zip command failed with exit code ${exitCode}${signal}.`);
  }
}

function createReleaseZip() {
  const version = readPackageVersion();
  const zipName = `outlook-ai-local-host-v${version}.zip`;
  const destinationZip = path.join(releaseDir, zipName);

  fs.mkdirSync(releaseDir, { recursive: true });

  if (process.platform === "win32") {
    runPowerShellZip(runtimeDir, destinationZip);
  } else {
    runZipCommand(runtimeDir, destinationZip);
  }

  process.stdout.write(`Created release archive: ${destinationZip}\n`);
}

function main() {
  ensureReleaseArtifacts();
  createReleaseZip();
}

main();
