const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const blobPath = path.join(rootDir, ".sea", "sea-prep.blob");
const outputDir = path.join(rootDir, "release", "local-host");
const outputExePath = path.join(outputDir, "OutlookAiLocalHost.exe");
const SEA_FUSE_ID = "fce680ab2cc467b6e072b8b5df1996b2";
const DEFAULT_SENTINEL_FUSE = `NODE_SEA_FUSE_${SEA_FUSE_ID}`;
const DEFAULT_POSTJECT_PACKAGE = "postject@1.0.0-alpha.6";

function resolveNodeExecutablePath() {
  if (process.env.SEA_NODE_EXE) {
    return path.resolve(process.env.SEA_NODE_EXE);
  }

  return process.execPath;
}

function resolveNpmRunner() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      argsPrefix: [npmExecPath, "exec"],
    };
  }

  const nodeDir = path.dirname(process.execPath);
  const npmCmdPath = process.platform === "win32"
    ? path.join(nodeDir, "npm.cmd")
    : path.join(nodeDir, "npm");
  if (fs.existsSync(npmCmdPath)) {
    return {
      command: npmCmdPath,
      argsPrefix: ["exec"],
    };
  }

  throw new Error(
    "Unable to locate npm executable for postject injection. Ensure npm is available when running sea:package."
  );
}

function resolveSentinelFuse() {
  return process.env.SEA_SENTINEL_FUSE || DEFAULT_SENTINEL_FUSE;
}

async function runPostject(executablePath, blobFilePath) {
  const blobBuffer = fs.readFileSync(blobFilePath);
  const sentinelFuse = resolveSentinelFuse();

  const postjectArgs = [
    executablePath,
    "NODE_SEA_BLOB",
    blobFilePath,
    "--sentinel-fuse",
    sentinelFuse,
  ];

  const npmRunner = resolveNpmRunner();
  const postjectPackage = process.env.POSTJECT_PACKAGE || DEFAULT_POSTJECT_PACKAGE;
  const command = npmRunner.command;
  const args = [
    ...npmRunner.argsPrefix,
    "--yes",
    "--package",
    postjectPackage,
    "--",
    "postject",
    ...postjectArgs,
  ];

  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(`postject execution failed to start: ${result.error.message}`);
  }

  if (result.status !== 0 || result.signal) {
    const exitCode = result.status === null ? "null" : String(result.status);
    const signal = result.signal ? `, signal ${result.signal}` : "";
    const nodeVersion = process.version;
    const isNode22Plus = /^v(?:22|23|24|25|26)/.test(nodeVersion);
    const hint = isNode22Plus
      ? `\n\nThis "Aborted()" error is a known incompatibility between postject alpha.6 and Node.js v22+.\n` +
        `postject is compiled with Emscripten and crashes on Node.js >= 22.\n` +
        `Use Node.js v20 or v21 for the build (v20.20.1 works). Set SEA_NODE_EXE to point at a compatible node.exe:\n\n` +
        `  set SEA_NODE_EXE=C:\\nodejs\\node.exe\n` +
        `  npm run package:local:win\n`
      : "";
    throw new Error(`postject failed with exit code ${exitCode}${signal}.${hint}`);
  }
}

async function main() {
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
  await runPostject(outputExePath, blobPath);

  process.stdout.write(`Created SEA executable at ${outputExePath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
