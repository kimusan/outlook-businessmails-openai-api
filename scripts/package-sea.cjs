const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const blobPath = path.join(rootDir, ".sea", "sea-prep.blob");
const outputDir = path.join(rootDir, "release", "local-host");
const outputExePath = path.join(outputDir, "OutlookAiLocalHost.exe");
const SEA_FUSE_ID = "fce680ab2cc467b6e072b8b5df1996b2";

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

function resolveLocalPostjectCommand() {
  const localBin = process.platform === "win32"
    ? path.join(rootDir, "node_modules", ".bin", "postject.cmd")
    : path.join(rootDir, "node_modules", ".bin", "postject");

  return fs.existsSync(localBin) ? localBin : null;
}

function resolveSentinelFuse(executablePath) {
  const executableContents = fs.readFileSync(executablePath).toString("latin1");
  const candidates = [
    `NODE_SEA_FUSE_${SEA_FUSE_ID}`,
    `POSTJECT_SENTINEL_${SEA_FUSE_ID}`,
    `NODE_JS_FUSE_${SEA_FUSE_ID}`,
  ];

  for (const candidate of candidates) {
    if (executableContents.includes(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `The selected node executable does not contain a known SEA sentinel fuse (${candidates.join(
      ", "
    )}). Use SEA_NODE_EXE to point at an official Node.js node.exe binary that supports SEA.`
  );
}

async function runPostject(executablePath, blobFilePath) {
  const blobBuffer = fs.readFileSync(blobFilePath);
  const sentinelFuse = resolveSentinelFuse(executablePath);
  let moduleInjectionError = null;

  try {
    const postject = require("postject");
    if (postject && typeof postject.inject === "function") {
      await postject.inject(executablePath, "NODE_SEA_BLOB", blobBuffer, {
        sentinelFuse,
        overwrite: true,
      });
      return;
    }
  } catch (error) {
    moduleInjectionError = error;
  }

  if (moduleInjectionError && moduleInjectionError.code !== "MODULE_NOT_FOUND") {
    process.stderr.write(
      `postject module API failed (${moduleInjectionError.message}); trying CLI fallback...\n`
    );
  }

  const localPostject = resolveLocalPostjectCommand();

  const postjectArgs = [
    executablePath,
    "NODE_SEA_BLOB",
    blobFilePath,
    "--sentinel-fuse",
    sentinelFuse,
  ];

  let command = "";
  let args = [];

  if (localPostject) {
    command = localPostject;
    args = postjectArgs;
  } else {
    const npmRunner = resolveNpmRunner();
    command = npmRunner.command;
    args = [...npmRunner.argsPrefix, "--yes", "postject", ...postjectArgs];
  }

  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    const modulePart = moduleInjectionError && moduleInjectionError.code !== "MODULE_NOT_FOUND"
      ? ` Module error: ${moduleInjectionError.message}.`
      : "";
    throw new Error(`postject execution failed to start: ${result.error.message}.${modulePart}`);
  }

  if (result.status !== 0 || result.signal) {
    const exitCode = result.status === null ? "null" : String(result.status);
    const signal = result.signal ? `, signal ${result.signal}` : "";
    const modulePart = moduleInjectionError && moduleInjectionError.code !== "MODULE_NOT_FOUND"
      ? ` Module error: ${moduleInjectionError.message}.`
      : "";
    throw new Error(`postject failed with exit code ${exitCode}${signal}.${modulePart}`);
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
