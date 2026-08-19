const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const blobPath = path.join(rootDir, ".sea", "sea-prep.blob");
const outputDir = path.join(rootDir, "release", "local-host");
const outputExePath = path.join(outputDir, "OutlookAiLocalHost.exe");
const psInjectorScript = path.join(rootDir, "scripts", "windows", "inject-sea-blob.ps1");
const SEA_FUSE_ID = "fce680ab2cc467b6e072b8b5df1996b2";
const DEFAULT_SENTINEL_FUSE = `NODE_SEA_FUSE_${SEA_FUSE_ID}`;
const DEFAULT_POSTJECT_PACKAGE = "postject@1.0.0-alpha.6";

function resolveNodeExecutablePath() {
  if (process.env.SEA_NODE_EXE) {
    return path.resolve(process.env.SEA_NODE_EXE);
  }

  return process.execPath;
}

function resolveSentinelFuse() {
  return process.env.SEA_SENTINEL_FUSE || DEFAULT_SENTINEL_FUSE;
}

/**
 * Strips PE digital signature (Authenticode) from the executable.
 * Official node.exe binaries are signed, which causes injection tools (or LIEF)
 * to fail with corruption warnings or abort.
 */
function removeDigitalSignature(executablePath) {
  // 1. Try signtool if available on Windows
  if (process.platform === "win32") {
    try {
      const signtoolResult = spawnSync("signtool", ["remove", "/s", executablePath], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      if (signtoolResult.status === 0) {
        process.stderr.write("Removed digital signature using signtool.\n");
        return true;
      }
    } catch {
      // signtool not found in PATH; fall back to PE header stripping
    }
  }

  // 2. Strip signature directory entry in PE header directly
  try {
    const buf = fs.readFileSync(executablePath);
    if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) {
      return false; // Not a valid MZ/PE file
    }

    const peOffset = buf.readUInt32LE(0x3c);
    if (peOffset + 0x18 > buf.length || buf.readUInt32LE(peOffset) !== 0x00004550) {
      return false; // Not a valid PE
    }

    const magic = buf.readUInt16LE(peOffset + 24);
    const is64 = magic === 0x20b; // PE32+ (64-bit)
    const is32 = magic === 0x10b; // PE32 (32-bit)
    if (!is64 && !is32) {
      return false;
    }

    // Optional header DataDirectory: index 4 is Certificate Table (IMAGE_DIRECTORY_ENTRY_SECURITY)
    const dirOffset = peOffset + 24 + (is64 ? 112 : 96) + 4 * 8;
    if (dirOffset + 8 > buf.length) {
      return false;
    }

    const certVA = buf.readUInt32LE(dirOffset);
    const certSize = buf.readUInt32LE(dirOffset + 4);

    if (certVA !== 0 || certSize !== 0) {
      // Clear Certificate Table directory entry
      buf.writeUInt32LE(0, dirOffset);
      buf.writeUInt32LE(0, dirOffset + 4);

      // Clear CheckSum in Optional Header
      const checksumOffset = peOffset + 24 + 64;
      buf.writeUInt32LE(0, checksumOffset);

      // If the certificate table is at the very end of the file, truncate it
      let outBuf = buf;
      if (certVA + certSize === buf.length) {
        outBuf = buf.subarray(0, certVA);
      }

      fs.writeFileSync(executablePath, outBuf);
      process.stderr.write("Stripped PE digital signature header from executable.\n");
      return true;
    }
  } catch (err) {
    process.stderr.write(`Warning: Could not check/strip PE signature: ${err.message}\n`);
  }

  return false;
}

/**
 * Injects SEA blob using native Windows Win32 API (BeginUpdateResourceW / UpdateResourceW)
 * via PowerShell. This avoids Emscripten / WebAssembly memory crashes in postject.
 */
function injectViaPowerShell(executablePath, blobFilePath, sentinelFuse) {
  process.stderr.write(
    "Injecting SEA blob via Windows native Win32 UpdateResource (PowerShell)...\n"
  );

  const psArgs = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    psInjectorScript,
    "-ExePath",
    executablePath,
    "-BlobPath",
    blobFilePath,
    "-SentinelFuse",
    sentinelFuse,
  ];

  const result = spawnSync("powershell", psArgs, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(`PowerShell Win32 injection failed to launch: ${result.error.message}`);
  }

  if (result.status !== 0 || result.signal) {
    const exitCode = result.status === null ? "null" : String(result.status);
    const signal = result.signal ? `, signal ${result.signal}` : "";
    throw new Error(`PowerShell Win32 injection failed with exit code ${exitCode}${signal}.`);
  }
}

/**
 * Injects SEA blob using postject CLI.
 */
function injectViaPostject(executablePath, blobFilePath, sentinelFuse) {
  const nodeExe = resolveNodeExecutablePath();

  process.stderr.write(`Using node.exe for postject: ${nodeExe}\n`);
  const versionResult = spawnSync(nodeExe, ["-v"], { stdio: ["pipe", "pipe", "pipe"] });
  if (versionResult.status === 0) {
    process.stderr.write(`Node version: ${versionResult.stdout.toString().trim()}\n`);
  }

  const postjectArgs = [
    executablePath,
    "NODE_SEA_BLOB",
    blobFilePath,
    "--sentinel-fuse",
    sentinelFuse,
    "--overwrite",
  ];

  const postjectCliPath = path.join(rootDir, "node_modules", "postject", "dist", "cli.js");
  const postjectBinPath = path.join(rootDir, "node_modules", ".bin", "postject.cmd");

  let postjectCommand;
  let postjectCmdArgs;

  if (fs.existsSync(postjectCliPath)) {
    process.stderr.write(`Using local postject: ${postjectCliPath}\n`);
    postjectCommand = nodeExe;
    postjectCmdArgs = [postjectCliPath, ...postjectArgs];
  } else if (fs.existsSync(postjectBinPath)) {
    process.stderr.write(`Using local postject bin: ${postjectBinPath}\n`);
    postjectCommand = postjectBinPath;
    postjectCmdArgs = [...postjectArgs];
  } else {
    process.stderr.write("postject not found in node_modules, installing via npm...\n");
    const postjectPackage = process.env.POSTJECT_PACKAGE || DEFAULT_POSTJECT_PACKAGE;
    const npmExecPath = process.env.npm_execpath;
    if (npmExecPath && fs.existsSync(npmExecPath)) {
      postjectCommand = nodeExe;
      postjectCmdArgs = [
        npmExecPath,
        "exec",
        "--yes",
        "--package",
        postjectPackage,
        "--",
        "postject",
        ...postjectArgs,
      ];
    } else {
      const nodeDir = path.dirname(nodeExe);
      const npmCmdPath =
        process.platform === "win32" ? path.join(nodeDir, "npm.cmd") : path.join(nodeDir, "npm");
      postjectCommand = npmCmdPath;
      postjectCmdArgs = [
        "exec",
        "--yes",
        "--package",
        postjectPackage,
        "--",
        "postject",
        ...postjectArgs,
      ];
    }
  }

  const result = spawnSync(postjectCommand, postjectCmdArgs, {
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
    throw new Error(`postject failed with exit code ${exitCode}${signal}.`);
  }
}

/**
 * Verifies that the sentinel fuse has been flipped to 1 in the executable.
 */
function verifySentinelFuse(executablePath, sentinelFuse) {
  const buf = fs.readFileSync(executablePath);
  const activeFuse = `${sentinelFuse}:1`;
  const inactiveFuse = `${sentinelFuse}:0`;

  if (buf.includes(activeFuse)) {
    process.stderr.write("Verified SEA sentinel fuse is active (:1).\n");
    return true;
  }

  if (buf.includes(inactiveFuse)) {
    throw new Error(
      "Sentinel fuse was found but is inactive (:0). Injection did not activate the SEA blob."
    );
  }

  throw new Error(`Sentinel fuse '${sentinelFuse}' was not found in the executable.`);
}

async function injectSeaBlob(executablePath, blobFilePath) {
  const sentinelFuse = resolveSentinelFuse();

  // Strip digital signature first
  removeDigitalSignature(executablePath);

  // On Windows, use the native PowerShell Win32 resource injector as the primary method
  // because postject (Emscripten WebAssembly) has known memory/abort crashes on Windows PE files.
  if (process.platform === "win32" && fs.existsSync(psInjectorScript)) {
    try {
      injectViaPowerShell(executablePath, blobFilePath, sentinelFuse);
      verifySentinelFuse(executablePath, sentinelFuse);
      return;
    } catch (psError) {
      process.stderr.write(
        `PowerShell injection failed (${psError.message}), falling back to postject...\n`
      );
    }
  }

  // Fallback / non-Windows: use postject
  try {
    injectViaPostject(executablePath, blobFilePath, sentinelFuse);
    verifySentinelFuse(executablePath, sentinelFuse);
  } catch (postjectError) {
    // If postject failed on Windows, try PowerShell as fallback
    if (process.platform === "win32" && fs.existsSync(psInjectorScript)) {
      process.stderr.write(
        `postject failed (${postjectError.message}), retrying via PowerShell Win32 injector...\n`
      );
      injectViaPowerShell(executablePath, blobFilePath, sentinelFuse);
      verifySentinelFuse(executablePath, sentinelFuse);
      return;
    }
    throw postjectError;
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
  await injectSeaBlob(outputExePath, blobPath);

  process.stdout.write(`Created SEA executable at ${outputExePath}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  removeDigitalSignature,
  verifySentinelFuse,
  injectSeaBlob,
  resolveNodeExecutablePath,
  resolveSentinelFuse,
};
