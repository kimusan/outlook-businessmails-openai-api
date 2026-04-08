const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "127.0.0.1";
const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function resolveInstallDir() {
  if (process.env.OUTLOOK_AI_HOST_INSTALL_DIR) {
    return path.resolve(process.env.OUTLOOK_AI_HOST_INSTALL_DIR);
  }

  const fromExecutable = path.dirname(process.execPath);
  if (process.execPath.toLowerCase().endsWith(".exe")) {
    return fromExecutable;
  }

  return path.resolve(__dirname, "..");
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse JSON file at ${filePath}: ${error.message}`);
  }
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

const installDir = resolveInstallDir();
const runtimeConfigPath = path.join(installDir, "host-config.json");
const fallbackRuntimeConfigPath = path.resolve(__dirname, "..", "release", "local-host", "host-config.json");
let runtimeRootDir = installDir;
let runtimeConfig = readJsonFile(runtimeConfigPath);

if (!runtimeConfig) {
  runtimeConfig = readJsonFile(fallbackRuntimeConfigPath);
  if (runtimeConfig) {
    runtimeRootDir = path.dirname(fallbackRuntimeConfigPath);
  }
}

runtimeConfig = runtimeConfig || {};

const logDir = path.join(runtimeRootDir, runtimeConfig.logDir || "logs");
ensureDirectory(logDir);
const logFilePath = path.join(logDir, "host.log");

function log(level, message, details) {
  const timestamp = new Date().toISOString();
  const detailPart = details ? ` ${JSON.stringify(details)}` : "";
  const line = `[${timestamp}] [${level}] ${message}${detailPart}`;

  try {
    fs.appendFileSync(logFilePath, `${line}\n`, "utf8");
  } catch (error) {
    // Intentionally ignore file logging errors to avoid crashes from log I/O issues.
  }

  if (process.env.OUTLOOK_AI_HOST_DEBUG === "1") {
    process.stdout.write(`${line}\n`);
  }
}

function resolveStaticDirectory() {
  if (process.env.OUTLOOK_AI_HOST_ASSETS_DIR) {
    return path.resolve(process.env.OUTLOOK_AI_HOST_ASSETS_DIR);
  }

  const packagedDir = path.join(runtimeRootDir, runtimeConfig.staticDir || "www");
  if (fs.existsSync(packagedDir)) {
    return packagedDir;
  }

  const preparedRuntimeDir = path.resolve(__dirname, "..", "release", "local-host", "www");
  if (fs.existsSync(preparedRuntimeDir)) {
    return preparedRuntimeDir;
  }

  // Development fallback when running this file with node directly.
  return path.resolve(__dirname, "..", "dist");
}

function resolveCertPath(fileName, envVarName) {
  if (process.env[envVarName]) {
    return path.resolve(process.env[envVarName]);
  }

  const certDir = path.join(runtimeRootDir, runtimeConfig.certDir || "certs");
  const certInInstallDir = path.join(certDir, fileName);
  if (fs.existsSync(certInInstallDir)) {
    return certInInstallDir;
  }

  return path.resolve(__dirname, "..", "release", "local-host", "certs", fileName);
}

function loadHttpsOptions() {
  const keyPath = resolveCertPath("localhost-key.pem", "OUTLOOK_AI_HOST_CERT_KEY_PATH");
  const certPath = resolveCertPath("localhost.pem", "OUTLOOK_AI_HOST_CERT_PATH");

  if (!fs.existsSync(keyPath)) {
    throw new Error(`Missing HTTPS private key: ${keyPath}`);
  }

  if (!fs.existsSync(certPath)) {
    throw new Error(`Missing HTTPS certificate: ${certPath}`);
  }

  return {
    key: fs.readFileSync(keyPath, "utf8"),
    cert: fs.readFileSync(certPath, "utf8"),
  };
}

function normalizeRequestPath(urlPathname) {
  if (urlPathname === "/") {
    return "taskpane.html";
  }

  let decoded = "";
  try {
    decoded = decodeURIComponent(urlPathname);
  } catch {
    return null;
  }
  const sanitized = decoded.replace(/^[/\\]+/, "");
  const normalized = path.normalize(sanitized);

  if (!normalized || normalized === ".") {
    return "taskpane.html";
  }

  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return null;
  }

  return normalized;
}

function respondJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] || "application/octet-stream";
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error(`Request body exceeded ${maxBytes} bytes.`));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function sanitizeProxyRequestHeaders(input) {
  const headers = {};
  if (!input || typeof input !== "object") {
    return headers;
  }

  const disallowed = new Set([
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
    "accept-encoding",
    "origin",
    "referer",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-dest",
  ]);

  Object.entries(input).forEach(([key, value]) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (!normalizedKey || disallowed.has(normalizedKey)) {
      return;
    }

    if (typeof value !== "string") {
      return;
    }

    headers[normalizedKey] = value;
  });

  return headers;
}

async function handleProxyFetch(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, {
      "Content-Type": "application/json; charset=utf-8",
      Allow: "POST",
    });
    response.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  let rawBody = "";
  try {
    rawBody = await readRequestBody(request, MAX_PROXY_BODY_BYTES);
  } catch (error) {
    log("warn", "Proxy request body read failed", { error: error.message });
    respondJson(response, 413, { error: error.message });
    return;
  }

  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch (error) {
    respondJson(response, 400, { error: "Invalid JSON payload." });
    return;
  }

  const targetUrl = payload && typeof payload.url === "string" ? payload.url.trim() : "";
  const method = payload && typeof payload.method === "string" ? payload.method.toUpperCase() : "";
  const body = payload && typeof payload.body === "string" ? payload.body : undefined;

  if (!targetUrl) {
    respondJson(response, 400, { error: "Missing target URL." });
    return;
  }

  if (method !== "GET" && method !== "POST") {
    respondJson(response, 400, { error: "Unsupported method. Only GET and POST are allowed." });
    return;
  }

  let parsedTargetUrl = null;
  try {
    parsedTargetUrl = new URL(targetUrl);
  } catch {
    respondJson(response, 400, { error: "Target URL is invalid." });
    return;
  }

  if (parsedTargetUrl.protocol !== "http:" && parsedTargetUrl.protocol !== "https:") {
    respondJson(response, 400, { error: "Target URL must use http or https." });
    return;
  }

  const headers = sanitizeProxyRequestHeaders(payload.headers);

  let upstreamResponse = null;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      body: method === "POST" ? body : undefined,
      redirect: "follow",
    });
  } catch (error) {
    log("warn", "Proxy upstream request failed", {
      targetUrl,
      method,
      error: error.message,
    });
    respondJson(response, 502, {
      error: "Proxy upstream request failed before receiving a response.",
      detail: error.message,
    });
    return;
  }

  const responseHeaders = {};
  upstreamResponse.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  let upstreamBody = "";
  try {
    upstreamBody = await upstreamResponse.text();
  } catch (error) {
    upstreamBody = "";
  }

  respondJson(response, 200, {
    ok: upstreamResponse.ok,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
    body: upstreamBody,
  });
}

function createRequestHandler(staticDir, port) {
  return (request, response) => {
    const method = request.method || "GET";
    const requestUrl = new URL(request.url || "/", `https://localhost:${port}`);

    if (requestUrl.pathname === "/proxy/fetch") {
      void handleProxyFetch(request, response);
      return;
    }

    if (requestUrl.pathname === "/health") {
      respondJson(response, 200, {
        status: "ok",
        service: "outlook-ai-local-host",
        port,
        staticDir,
        time: new Date().toISOString(),
      });
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, {
        "Content-Type": "text/plain; charset=utf-8",
        Allow: "GET, HEAD",
      });
      response.end("Method Not Allowed");
      return;
    }

    const relativePath = normalizeRequestPath(requestUrl.pathname);
    if (!relativePath) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const absolutePath = path.resolve(staticDir, relativePath);
    const staticDirWithSeparator = `${path.resolve(staticDir)}${path.sep}`;
    if (absolutePath !== path.resolve(staticDir) && !absolutePath.startsWith(staticDirWithSeparator)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    let filePath = absolutePath;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (!fs.existsSync(filePath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    const contentType = getContentType(filePath);
    // Use no-store for local deployment to avoid stale Outlook/WebView bundles
    // when taskpane asset filenames are stable across builds.
    const cacheControl = "no-cache, no-store, must-revalidate";

    try {
      const fileBuffer = fs.readFileSync(filePath);
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": fileBuffer.length,
        "Cache-Control": cacheControl,
        Pragma: "no-cache",
        Expires: "0",
      });

      if (method === "HEAD") {
        response.end();
      } else {
        response.end(fileBuffer);
      }
    } catch (error) {
      log("error", "Failed to read static file", { filePath, error: error.message });
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Internal Server Error");
    }
  };
}

function parsePort(value) {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsed;
}

function main() {
  const staticDir = resolveStaticDirectory();
  const port = parsePort(process.env.LOCAL_HOST_PORT || runtimeConfig.port || DEFAULT_PORT);
  const host = runtimeConfig.host || DEFAULT_HOST;

  if (!fs.existsSync(staticDir)) {
    throw new Error(`Static assets directory does not exist: ${staticDir}`);
  }

  const httpsOptions = loadHttpsOptions();
  const requestHandler = createRequestHandler(staticDir, port);
  const server = https.createServer(httpsOptions, requestHandler);

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      log("error", `Port ${port} is already in use.`, { port, host });
    } else {
      log("error", "HTTPS server failed to start.", {
        port,
        host,
        error: error ? error.message : "Unknown error",
      });
    }

    process.exitCode = 1;
    process.exit();
  });

  server.listen(port, host, () => {
    log("info", "Outlook AI local host started.", {
      host,
      port,
      staticDir,
      certPath: resolveCertPath("localhost.pem", "OUTLOOK_AI_HOST_CERT_PATH"),
      keyPath: resolveCertPath("localhost-key.pem", "OUTLOOK_AI_HOST_CERT_KEY_PATH"),
    });
  });

  process.on("SIGINT", () => {
    log("info", "Received SIGINT; shutting down.");
    server.close(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    log("info", "Received SIGTERM; shutting down.");
    server.close(() => process.exit(0));
  });
}

process.on("uncaughtException", (error) => {
  log("error", "Uncaught exception in local host process.", {
    error: error ? error.message : "Unknown error",
    stack: error && error.stack ? error.stack : null,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection in local host process.", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});

main();
