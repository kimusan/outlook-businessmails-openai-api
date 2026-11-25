/*
 * Dev-server twin of the /proxy/fetch route implemented in local-host/sea-main.cjs.
 *
 * The taskpane routes every cross-origin (or mixed-content) AI request through
 * POST /proxy/fetch on its own origin (see shouldRouteThroughLocalProxy in
 * src/shared/aiClient.ts). The packaged SEA host serves that route, but the
 * webpack dev server does not - without this middleware every AI call fails
 * with "Local proxy endpoint failed with status 404" when the add-in is served
 * via `npm run dev-server` / start.bat (office-addin-debugging).
 *
 * The wire protocol mirrors handleProxyFetch in sea-main.cjs exactly so the
 * client cannot tell the two apart.
 */

const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024;

function respondJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.setHeader("Cache-Control", "no-store");
  response.end(body);
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
    respondJson(response, 405, { error: "Method Not Allowed" });
    return;
  }

  let rawBody = "";
  try {
    rawBody = await readRequestBody(request, MAX_PROXY_BODY_BYTES);
  } catch (error) {
    respondJson(response, 413, { error: error.message });
    return;
  }

  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
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

  const contentType = String(upstreamResponse.headers.get("content-type") || "").toLowerCase();
  const isSseStream = contentType.includes("text/event-stream");

  if (isSseStream && upstreamResponse.ok && upstreamResponse.body) {
    response.statusCode = upstreamResponse.status;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");

    try {
      const reader = upstreamResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        response.write(value);
      }
    } catch {
      // Upstream cut the stream; the client handles truncated SSE.
    } finally {
      response.end();
    }
    return;
  }

  let upstreamBody = "";
  try {
    upstreamBody = await upstreamResponse.text();
  } catch {
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

function createDevProxyMiddleware() {
  return (request, response, next) => {
    let pathname = "";
    try {
      pathname = new URL(request.url || "/", "http://localhost").pathname;
    } catch {
      pathname = "";
    }

    if (pathname === "/proxy/fetch") {
      handleProxyFetch(request, response).catch(() => {
        if (!response.headersSent) {
          respondJson(response, 500, { error: "Proxy handler crashed." });
        } else {
          response.end();
        }
      });
      return;
    }

    next();
  };
}

module.exports = { createDevProxyMiddleware };
