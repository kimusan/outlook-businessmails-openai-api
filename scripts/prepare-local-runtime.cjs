const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const outputDir = path.join(rootDir, "release", "local-host");
const webOutputDir = path.join(outputDir, "www");
const scriptOutputDir = path.join(outputDir, "scripts");
const windowsScriptsDir = path.join(rootDir, "scripts", "windows");

const port = Number(process.env.LOCAL_HOST_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid LOCAL_HOST_PORT value: ${process.env.LOCAL_HOST_PORT}`);
}

function resetDirectory(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirectoryRecursively(sourceDir, targetDir, shouldSkip) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (shouldSkip(sourcePath, entry)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectoryRecursively(sourcePath, targetPath, shouldSkip);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copyRuntimeScripts() {
  const scriptFilesToCopy = [
    "start-hidden.vbs",
    "install-startup.ps1",
    "remove-startup.ps1",
    "trust-local-cert.ps1",
  ];
  const launcherFilesToCopy = ["install-startup.cmd", "remove-startup.cmd", "trust-local-cert.cmd"];

  fs.mkdirSync(scriptOutputDir, { recursive: true });

  for (const fileName of scriptFilesToCopy) {
    const sourcePath = path.join(windowsScriptsDir, fileName);
    const targetPath = fileName === "start-hidden.vbs"
      ? path.join(outputDir, fileName)
      : path.join(scriptOutputDir, fileName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing runtime helper script: ${sourcePath}`);
    }

    fs.copyFileSync(sourcePath, targetPath);
  }

  for (const fileName of launcherFilesToCopy) {
    const sourcePath = path.join(windowsScriptsDir, fileName);
    const targetPath = path.join(outputDir, fileName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing runtime launcher script: ${sourcePath}`);
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function writeHostConfig() {
  const hostConfigPath = path.join(outputDir, "host-config.json");
  const payload = {
    host: "127.0.0.1",
    port,
    staticDir: "www",
    certDir: "certs",
    logDir: "logs",
  };

  fs.writeFileSync(hostConfigPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeRuntimeNotes() {
  const notesPath = path.join(outputDir, "README-LOCAL-DEPLOYMENT.md");
  const notes = [
    "# Outlook AI Local Host Release",
    "",
    "This folder is a self-contained local deployment for the Outlook web add-in host.",
    "",
    "## What is included",
    "",
    "- `OutlookAiLocalHost.exe`",
    "  - The local HTTPS host process for the add-in (packaged via Node SEA).",
    "- `manifest.xml`",
    "  - The Outlook add-in manifest that points to local URLs.",
    "- `www/`",
    "  - Static production frontend assets served by the local host.",
    "- `certs/`",
    "  - TLS files for `https://localhost` (`dev-ca.crt`, `localhost.pem`, `localhost-key.pem`).",
    "- `start-hidden.vbs`",
    "  - Starts `OutlookAiLocalHost.exe` without a visible console window.",
    "- `trust-local-cert.cmd`",
    "  - One-click import of local certificates for the current user.",
    "- `install-startup.cmd` / `remove-startup.cmd`",
    "  - Add/remove auto-start at Windows logon (current user Startup folder).",
    "- `scripts/`",
    "  - PowerShell helper implementations used by the `.cmd` wrappers.",
    "",
    "## End-user setup (no npm required)",
    "",
    "1. Run `trust-local-cert.cmd`",
    "   - Why: Outlook/WebView requires trusted HTTPS certs for localhost content.",
    "2. Run `start-hidden.vbs`",
    "   - Why: Starts the local host silently in the background.",
    "3. In Outlook, sideload `manifest.xml`",
    "   - Why: Registers add-in commands/taskpane against local host URLs.",
    "4. Optional: run `install-startup.cmd`",
    "   - Why: Automatically start the local host each time user logs in.",
    "",
    "## Validation",
    "",
    "- Open health endpoint:",
    `  - https://localhost:${port}/health`,
    "- If this works without TLS warning, host and certificate are ready.",
    "",
    "## Troubleshooting",
    "",
    "- Add-in fails to load in Outlook:",
    "  - Re-run `trust-local-cert.cmd`.",
    "  - Fully restart Outlook and WebView2 (`OUTLOOK.EXE`, `msedgewebview2.exe`).",
    "- Host startup issue:",
    "  - Check `logs/host.log`.",
    "- Port conflict:",
    "  - Rebuild release with a different `LOCAL_HOST_PORT`.",
    "",
  ].join("\n");

  fs.writeFileSync(notesPath, notes, "utf8");
}

function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Missing dist directory at ${distDir}. Run npm run build:web first.`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  resetDirectory(webOutputDir);
  resetDirectory(scriptOutputDir);
  fs.mkdirSync(path.join(outputDir, "logs"), { recursive: true });

  copyDirectoryRecursively(distDir, webOutputDir, (sourcePath, entry) => {
    if (!entry.isFile()) {
      return false;
    }

    return /manifest.*\.xml$/i.test(path.basename(sourcePath));
  });

  copyRuntimeScripts();
  writeHostConfig();
  writeRuntimeNotes();

  process.stdout.write(`Prepared local runtime layout in ${outputDir}\n`);
}

main();
