const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const blobPath = path.join(rootDir, ".sea", "sea-prep.blob");
const outputDir = path.join(rootDir, "release", "local-host");
const outputExePath = path.join(outputDir, "OutlookAiLocalHost.exe");

function resolveNodeExecutablePath() {
  if (process.env.SEA_NODE_EXE) {
    return path.resolve(process.env.SEA_NODE_EXE);
  }

  return process.execPath;
}

function runPostject(executablePath, blobFilePath) {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

  const args = [
    "--yes",
    "postject",
    executablePath,
    "NODE_SEA_BLOB",
    blobFilePath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ];

  const result = spawnSync(npxCommand, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`postject failed with exit code ${result.status}.`);
  }
}

function main() {
  if (process.platform !== "win32") {
    throw new Error(
      "SEA Windows packaging must run on Windows (win32). Build this package on a Windows machine."
    );
  }

  if (!fs.existsSync(blobPath)) {
    throw new Error(`SEA blob not found: ${blobPath}. Run npm run sea:blob first.`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const nodeExecutablePath = resolveNodeExecutablePath();
  if (!fs.existsSync(nodeExecutablePath)) {
    throw new Error(`Node executable not found: ${nodeExecutablePath}`);
  }

  fs.copyFileSync(nodeExecutablePath, outputExePath);
  runPostject(outputExePath, blobPath);

  process.stdout.write(`Created SEA executable at ${outputExePath}\n`);
}

main();
