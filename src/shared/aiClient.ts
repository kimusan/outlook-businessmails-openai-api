/* global window, navigator */

import { AiServiceConfig } from "./aiConfig";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface ModelListResponse {
  models?: Array<string | { id?: string; name?: string; model?: string }>;
  data?: Array<string | { id?: string; name?: string; model?: string }>;
  model_list?: Array<string | { id?: string; name?: string; model?: string }>;
  error?: {
    message?: string;
  };
}

interface TokenRefreshResponse {
  access_token?: string;
  error?: {
    message?: string;
  };
}

export interface AiClientErrorDetails {
  operation: "chatCompletion" | "modelList" | "tokenRefresh";
  url: string;
  method: "GET" | "POST";
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  fetchMode?: "cors" | "same-origin" | "no-cors";
  fetchCredentials?: "omit" | "same-origin" | "include";
  usedLocalProxy?: boolean;
  localProxyUrl?: string;
  proxyTargetUrl?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  requestAttempts?: RequestAttemptDebug[];
  requestPayloadSummary?: Record<string, unknown>;
  underlyingError?: string;
  networkDiagnostics?: NetworkDiagnostics;
}

export class AiClientError extends Error {
  details: AiClientErrorDetails;

  constructor(message: string, details: AiClientErrorDetails) {
    super(message);
    this.name = "AiClientError";
    this.details = details;
  }
}

interface AuthorizedRequest {
  operation: "chatCompletion" | "modelList";
  url: string;
  method: "GET" | "POST";
  body?: string;
  requestPayloadSummary?: Record<string, unknown>;
}

export interface RequestAttemptDebug {
  url: string;
  method: "GET" | "POST";
  requestHeaders: Record<string, string>;
  requestBody?: string;
  fetchMode?: "cors" | "same-origin" | "no-cors";
  fetchCredentials?: "omit" | "same-origin" | "include";
  usedLocalProxy?: boolean;
  localProxyUrl?: string;
  proxyTargetUrl?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  networkError?: string;
  networkDiagnostics?: NetworkDiagnostics;
}

interface FetchWithAuthResult {
  response: any;
  requestAttempt: RequestAttemptDebug;
  requestAttempts: RequestAttemptDebug[];
}

interface NetworkDiagnostics {
  pageOrigin?: string;
  targetOrigin?: string;
  targetProtocol?: string;
  isCrossOrigin?: boolean;
  isSecureContext?: boolean;
  navigatorOnline?: boolean;
  likelyCauses?: string[];
}

interface ResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers: {
    forEach: (callback: (value: string, key: string) => void) => void;
    get: (name: string) => string | null;
  };
  text: () => Promise<string>;
}

interface FetchExecutionContext {
  fetchMode: "cors" | "same-origin" | "no-cors";
  fetchCredentials: "omit" | "same-origin" | "include";
  usedLocalProxy: boolean;
  localProxyUrl?: string;
  proxyTargetUrl?: string;
}

interface FetchExecutionResult {
  response: ResponseLike;
  context: FetchExecutionContext;
}

const accessTokenCache = new Map<string, string>();

export function isAiClientError(error: unknown): error is AiClientError {
  return Boolean(
    error && typeof error === "object" && (error as AiClientError).name === "AiClientError"
  );
}

function normalizeApiPath(path: string): string {
  const trimmed = (path || "").trim();
  if (!trimmed) {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function joinBaseUriAndPath(baseUri: string, endpointPath: string): string {
  const url = new window.URL(baseUri.trim());
  const basePath = url.pathname.replace(/\/+$/, "");
  const normalizedEndpointPath = normalizeApiPath(endpointPath);
  url.pathname = `${basePath}${normalizedEndpointPath}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getChatCompletionEndpoint(config: AiServiceConfig): string {
  return joinBaseUriAndPath(config.baseUri, config.chatCompletionsPath);
}

export function getModelListEndpoint(config: AiServiceConfig): string {
  return joinBaseUriAndPath(config.baseUri, config.modelListPath);
}

export function getTokenRefreshEndpoint(config: AiServiceConfig): string {
  return joinBaseUriAndPath(config.baseUri, config.tokenRefreshPath);
}

function buildCacheKey(config: AiServiceConfig): string {
  return `${config.baseUri.trim()}::${config.tokenRefreshPath.trim()}::${config.umsToken.trim()}`;
}

function getCachedAccessToken(config: AiServiceConfig): string | null {
  const cached = accessTokenCache.get(buildCacheKey(config));
  return cached && cached.trim() ? cached : null;
}

function cacheAccessToken(config: AiServiceConfig, accessToken: string): void {
  accessTokenCache.set(buildCacheKey(config), accessToken.trim());
}

function truncateForLog(input: string, maxLength: number): string {
  if (!input) {
    return "";
  }

  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength)}... [truncated]`;
}

function serializeHeaders(headers: any): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers || typeof headers.forEach !== "function") {
    return result;
  }

  headers.forEach((value: string, key: string) => {
    result[key] = value;
  });

  return result;
}

function buildNetworkDiagnostics(url: string): NetworkDiagnostics {
  const diagnostics: NetworkDiagnostics = {
    isSecureContext:
      typeof window !== "undefined" && typeof window.isSecureContext === "boolean"
        ? window.isSecureContext
        : undefined,
    navigatorOnline:
      typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
        ? navigator.onLine
        : undefined,
  };

  try {
    if (typeof window !== "undefined" && window.location) {
      diagnostics.pageOrigin = window.location.origin;
    }
  } catch {
    // Ignore location extraction issues.
  }

  try {
    const parsed = new window.URL(url);
    diagnostics.targetOrigin = parsed.origin;
    diagnostics.targetProtocol = parsed.protocol;
    diagnostics.isCrossOrigin = diagnostics.pageOrigin
      ? diagnostics.pageOrigin !== parsed.origin
      : undefined;
  } catch {
    // Ignore target URL parsing issues.
  }

  const likelyCauses: string[] = [];
  if (diagnostics.navigatorOnline === false) {
    likelyCauses.push("Browser reports offline network state.");
  }

  if (diagnostics.isCrossOrigin) {
    likelyCauses.push(
      "Cross-origin request: server must allow CORS (Access-Control-Allow-Origin and auth headers)."
    );
  }

  if (diagnostics.pageOrigin?.startsWith("https://") && diagnostics.targetProtocol === "http:") {
    likelyCauses.push("Mixed-content block: HTTPS add-in cannot call HTTP API.");
  }

  if (diagnostics.isSecureContext === false) {
    likelyCauses.push("Browser context is not secure; some fetch/auth features may be blocked.");
  }

  if (diagnostics.targetProtocol === "https:") {
    likelyCauses.push(
      "If this endpoint uses a private/self-signed cert, ensure WebView2 trusts the certificate chain."
    );
  }

  diagnostics.likelyCauses = likelyCauses;
  return diagnostics;
}

function shouldRouteThroughLocalProxy(targetUrl: string): boolean {
  try {
    const parsedTarget = new window.URL(targetUrl);
    const pageOrigin = window.location.origin;
    const isCrossOrigin = parsedTarget.origin !== pageOrigin;
    const isMixedContent =
      window.location.protocol === "https:" && parsedTarget.protocol === "http:";
    return isCrossOrigin || isMixedContent;
  } catch {
    return false;
  }
}

function buildResponseLikeFromProxy(payload: {
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body?: string;
  ok?: boolean;
}): ResponseLike {
  const headerMap = payload.headers || {};
  const headers = {
    forEach(callback: (value: string, key: string) => void) {
      Object.entries(headerMap).forEach(([key, value]) => callback(value, key));
    },
    get(name: string) {
      const lookup = name.toLowerCase();
      const match = Object.keys(headerMap).find((key) => key.toLowerCase() === lookup);
      return match ? headerMap[match] : null;
    },
  };

  return {
    ok:
      typeof payload.ok === "boolean" ? payload.ok : payload.status >= 200 && payload.status < 300,
    status: payload.status,
    statusText: payload.statusText || "",
    headers,
    text: async () => payload.body || "",
  };
}

async function executeBrowserFetch(
  url: string,
  init: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
  }
): Promise<FetchExecutionResult> {
  const directFetchMode = "cors" as const;
  const directCredentials = "omit" as const;

  if (!shouldRouteThroughLocalProxy(url)) {
    const directResponse = await window.fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      mode: directFetchMode,
      credentials: directCredentials,
    });

    return {
      response: directResponse as ResponseLike,
      context: {
        fetchMode: directFetchMode,
        fetchCredentials: directCredentials,
        usedLocalProxy: false,
      },
    };
  }

  const localProxyUrl = new window.URL("/proxy/fetch", window.location.origin).toString();
  const proxyFetchMode = "same-origin" as const;
  const proxyCredentials = "omit" as const;
  const proxyRequest = {
    url,
    method: init.method,
    headers: init.headers,
    body: init.body,
  };

  const proxyResponse = await window.fetch(localProxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(proxyRequest),
    mode: proxyFetchMode,
    credentials: proxyCredentials,
  });

  const proxyResponseBody = await proxyResponse.text();
  if (!proxyResponse.ok) {
    throw new Error(
      `Local proxy endpoint failed with status ${proxyResponse.status}: ${truncateForLog(
        proxyResponseBody,
        1000
      )}`
    );
  }

  let parsed: any = null;
  try {
    parsed = proxyResponseBody ? JSON.parse(proxyResponseBody) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed.status !== "number") {
    throw new Error("Local proxy returned an invalid response payload.");
  }

  const responseLike = buildResponseLikeFromProxy({
    status: parsed.status,
    statusText: String(parsed.statusText || ""),
    headers: parsed.headers && typeof parsed.headers === "object" ? parsed.headers : {},
    body: typeof parsed.body === "string" ? parsed.body : "",
    ok: typeof parsed.ok === "boolean" ? parsed.ok : undefined,
  });

  return {
    response: responseLike,
    context: {
      fetchMode: proxyFetchMode,
      fetchCredentials: proxyCredentials,
      usedLocalProxy: true,
      localProxyUrl,
      proxyTargetUrl: url,
    },
  };
}

async function parseResponseBody(response: any): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function extractModelId(
  item: string | { id?: string; name?: string; model?: string }
): string | null {
  if (typeof item === "string") {
    return item.trim() || null;
  }

  if (item.id && item.id.trim()) {
    return item.id.trim();
  }

  if (item.model && item.model.trim()) {
    return item.model.trim();
  }

  if (item.name && item.name.trim()) {
    return item.name.trim();
  }

  return null;
}

export async function refreshAccessToken(
  config: AiServiceConfig,
  forceRefresh = false
): Promise<string> {
  if (config.authMode === "apiKey") {
    const directApiKey = config.apiKey.trim();
    if (!directApiKey) {
      throw new AiClientError("API key is required when using API key authentication mode.", {
        operation: "tokenRefresh",
        url: getChatCompletionEndpoint(config),
        method: "POST",
        requestPayloadSummary: {
          authMode: config.authMode,
          hasApiKey: false,
        },
      });
    }

    return directApiKey;
  }

  const cachedToken = forceRefresh ? null : getCachedAccessToken(config);
  if (cachedToken) {
    return cachedToken;
  }

  const refreshEndpoint = getTokenRefreshEndpoint(config);
  const umsToken = config.umsToken.trim();
  const requestHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const requestBody = `ums_token=${encodeURIComponent(umsToken)}`;
  const networkDiagnostics = buildNetworkDiagnostics(refreshEndpoint);
  if (!umsToken) {
    throw new AiClientError("UMS token is required to refresh access token.", {
      operation: "tokenRefresh",
      url: refreshEndpoint,
      method: "POST",
      requestHeaders,
      requestBody,
      networkDiagnostics,
      requestPayloadSummary: {
        hasUmsToken: false,
        forcedRefresh: forceRefresh,
      },
    });
  }

  let response: ResponseLike;
  let fetchContext: FetchExecutionContext = {
    fetchMode: "cors",
    fetchCredentials: "omit",
    usedLocalProxy: false,
  };
  try {
    const execution = await executeBrowserFetch(refreshEndpoint, {
      method: "POST",
      headers: requestHeaders as Record<string, string>,
      body: requestBody,
    });
    response = execution.response;
    fetchContext = execution.context;
  } catch (error) {
    throw new AiClientError("Token refresh request failed before receiving a response.", {
      operation: "tokenRefresh",
      url: refreshEndpoint,
      method: "POST",
      requestHeaders,
      requestBody,
      fetchMode: fetchContext.fetchMode,
      fetchCredentials: fetchContext.fetchCredentials,
      usedLocalProxy: fetchContext.usedLocalProxy,
      localProxyUrl: fetchContext.localProxyUrl,
      proxyTargetUrl: fetchContext.proxyTargetUrl,
      networkDiagnostics,
      requestPayloadSummary: {
        hasUmsToken: true,
        forcedRefresh: forceRefresh,
      },
      underlyingError: (error as Error).message,
    });
  }

  const responseBody = await parseResponseBody(response);
  let payload: TokenRefreshResponse | null = null;
  try {
    payload = responseBody ? (JSON.parse(responseBody) as TokenRefreshResponse) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AiClientError(
      payload?.error?.message || `Token refresh request failed with status ${response.status}`,
      {
        operation: "tokenRefresh",
        url: refreshEndpoint,
        method: "POST",
        requestHeaders,
        requestBody,
        fetchMode: fetchContext.fetchMode,
        fetchCredentials: fetchContext.fetchCredentials,
        usedLocalProxy: fetchContext.usedLocalProxy,
        localProxyUrl: fetchContext.localProxyUrl,
        proxyTargetUrl: fetchContext.proxyTargetUrl,
        networkDiagnostics,
        status: response.status,
        statusText: response.statusText,
        responseHeaders: serializeHeaders(response.headers),
        responseBody: truncateForLog(responseBody, 4000),
        requestPayloadSummary: {
          hasUmsToken: true,
          forcedRefresh: forceRefresh,
        },
      }
    );
  }

  const accessToken = payload?.access_token?.trim();
  if (!accessToken) {
    throw new AiClientError("Token refresh response did not include access_token.", {
      operation: "tokenRefresh",
      url: refreshEndpoint,
      method: "POST",
      requestHeaders,
      requestBody,
      fetchMode: fetchContext.fetchMode,
      fetchCredentials: fetchContext.fetchCredentials,
      usedLocalProxy: fetchContext.usedLocalProxy,
      localProxyUrl: fetchContext.localProxyUrl,
      proxyTargetUrl: fetchContext.proxyTargetUrl,
      networkDiagnostics,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: serializeHeaders(response.headers),
      responseBody: truncateForLog(responseBody, 4000),
      requestPayloadSummary: {
        hasUmsToken: true,
        forcedRefresh: forceRefresh,
      },
    });
  }

  cacheAccessToken(config, accessToken);
  return accessToken;
}

async function fetchWithAuth(
  config: AiServiceConfig,
  request: AuthorizedRequest
): Promise<FetchWithAuthResult> {
  const requestAttempts: RequestAttemptDebug[] = [];

  const execute = async (accessToken: string): Promise<FetchWithAuthResult> => {
    const requestHeaders: Record<string, string> = {
      ...(request.method === "POST" ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
    };
    const networkDiagnostics = buildNetworkDiagnostics(request.url);
    let fetchContext: FetchExecutionContext = {
      fetchMode: "cors",
      fetchCredentials: "omit",
      usedLocalProxy: false,
    };

    const attempt: RequestAttemptDebug = {
      url: request.url,
      method: request.method,
      requestHeaders,
      requestBody: request.body,
      fetchMode: fetchContext.fetchMode,
      fetchCredentials: fetchContext.fetchCredentials,
      usedLocalProxy: fetchContext.usedLocalProxy,
      networkDiagnostics,
    };
    requestAttempts.push(attempt);

    try {
      const execution = await executeBrowserFetch(request.url, {
        method: request.method,
        headers: requestHeaders,
        body: request.body,
      });
      const response = execution.response;
      fetchContext = execution.context;
      attempt.fetchMode = fetchContext.fetchMode;
      attempt.fetchCredentials = fetchContext.fetchCredentials;
      attempt.usedLocalProxy = fetchContext.usedLocalProxy;
      attempt.localProxyUrl = fetchContext.localProxyUrl;
      attempt.proxyTargetUrl = fetchContext.proxyTargetUrl;

      attempt.status = response.status;
      attempt.statusText = response.statusText;
      attempt.responseHeaders = serializeHeaders(response.headers);

      return {
        response,
        requestAttempt: attempt,
        requestAttempts,
      };
    } catch (error) {
      attempt.networkError = (error as Error).message;
      throw new AiClientError(`${request.operation} request failed before receiving a response.`, {
        operation: request.operation,
        url: request.url,
        method: request.method,
        requestHeaders,
        requestBody: request.body,
        fetchMode: fetchContext.fetchMode,
        fetchCredentials: fetchContext.fetchCredentials,
        usedLocalProxy: fetchContext.usedLocalProxy,
        localProxyUrl: fetchContext.localProxyUrl,
        proxyTargetUrl: fetchContext.proxyTargetUrl,
        networkDiagnostics,
        requestAttempts,
        requestPayloadSummary: request.requestPayloadSummary,
        underlyingError: (error as Error).message,
      });
    }
  };

  let accessToken = await refreshAccessToken(config);
  let execution = await execute(accessToken);
  let response = execution.response;

  if ((response.status === 401 || response.status === 403) && config.authMode === "umsToken") {
    accessToken = await refreshAccessToken(config, true);
    execution = await execute(accessToken);
    response = execution.response;
  }

  return execution;
}

export async function listAvailableModels(config: AiServiceConfig): Promise<string[]> {
  const modelListEndpoint = getModelListEndpoint(config);
  const { response, requestAttempt, requestAttempts } = await fetchWithAuth(config, {
    operation: "modelList",
    url: modelListEndpoint,
    method: "GET",
  });

  const responseBody = await parseResponseBody(response);
  let payload: ModelListResponse | null = null;
  try {
    payload = responseBody ? (JSON.parse(responseBody) as ModelListResponse) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AiClientError(
      payload?.error?.message || `Model list request failed with status ${response.status}`,
      {
        operation: "modelList",
        url: modelListEndpoint,
        method: "GET",
        requestHeaders: requestAttempt.requestHeaders,
        requestBody: requestAttempt.requestBody,
        fetchMode: requestAttempt.fetchMode,
        fetchCredentials: requestAttempt.fetchCredentials,
        usedLocalProxy: requestAttempt.usedLocalProxy,
        localProxyUrl: requestAttempt.localProxyUrl,
        proxyTargetUrl: requestAttempt.proxyTargetUrl,
        status: response.status,
        statusText: response.statusText,
        responseHeaders: requestAttempt.responseHeaders,
        responseBody: truncateForLog(responseBody, 4000),
        networkDiagnostics: requestAttempt.networkDiagnostics,
        requestAttempts,
      }
    );
  }

  if (!payload) {
    throw new AiClientError("Model list response was not valid JSON.", {
      operation: "modelList",
      url: modelListEndpoint,
      method: "GET",
      requestHeaders: requestAttempt.requestHeaders,
      requestBody: requestAttempt.requestBody,
      fetchMode: requestAttempt.fetchMode,
      fetchCredentials: requestAttempt.fetchCredentials,
      usedLocalProxy: requestAttempt.usedLocalProxy,
      localProxyUrl: requestAttempt.localProxyUrl,
      proxyTargetUrl: requestAttempt.proxyTargetUrl,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: requestAttempt.responseHeaders,
      responseBody: truncateForLog(responseBody, 4000),
      networkDiagnostics: requestAttempt.networkDiagnostics,
      requestAttempts,
    });
  }

  const rawModels = payload.models || payload.model_list || payload.data || [];
  const result = rawModels
    .map((item) => extractModelId(item))
    .filter((item): item is string => Boolean(item))
    .filter((item, index, array) => array.indexOf(item) === index)
    .sort();

  if (result.length === 0) {
    throw new AiClientError("Model list response contained no usable model identifiers.", {
      operation: "modelList",
      url: modelListEndpoint,
      method: "GET",
      requestHeaders: requestAttempt.requestHeaders,
      requestBody: requestAttempt.requestBody,
      fetchMode: requestAttempt.fetchMode,
      fetchCredentials: requestAttempt.fetchCredentials,
      usedLocalProxy: requestAttempt.usedLocalProxy,
      localProxyUrl: requestAttempt.localProxyUrl,
      proxyTargetUrl: requestAttempt.proxyTargetUrl,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: requestAttempt.responseHeaders,
      responseBody: truncateForLog(responseBody, 4000),
      networkDiagnostics: requestAttempt.networkDiagnostics,
      requestAttempts,
    });
  }

  return result;
}

export async function createChatCompletion(
  config: AiServiceConfig,
  messages: ChatMessage[]
): Promise<string> {
  const chatCompletionEndpoint = getChatCompletionEndpoint(config);
  const requestPayload = {
    model: config.model,
    temperature: config.temperature,
    messages,
  };

  const { response, requestAttempt, requestAttempts } = await fetchWithAuth(config, {
    operation: "chatCompletion",
    url: chatCompletionEndpoint,
    method: "POST",
    body: JSON.stringify(requestPayload),
    requestPayloadSummary: {
      model: requestPayload.model,
      temperature: requestPayload.temperature,
      messageCount: requestPayload.messages.length,
    },
  });

  const responseBody = await parseResponseBody(response);
  let payload: ChatCompletionResponse | null = null;
  try {
    payload = responseBody ? (JSON.parse(responseBody) as ChatCompletionResponse) : null;
  } catch {
    payload = null;
  }

  if (!payload) {
    throw new AiClientError("Chat completion response was not valid JSON.", {
      operation: "chatCompletion",
      url: chatCompletionEndpoint,
      method: "POST",
      requestHeaders: requestAttempt.requestHeaders,
      requestBody: requestAttempt.requestBody,
      fetchMode: requestAttempt.fetchMode,
      fetchCredentials: requestAttempt.fetchCredentials,
      usedLocalProxy: requestAttempt.usedLocalProxy,
      localProxyUrl: requestAttempt.localProxyUrl,
      proxyTargetUrl: requestAttempt.proxyTargetUrl,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: requestAttempt.responseHeaders,
      responseBody: truncateForLog(responseBody, 4000),
      networkDiagnostics: requestAttempt.networkDiagnostics,
      requestAttempts,
      requestPayloadSummary: {
        model: requestPayload.model,
        temperature: requestPayload.temperature,
        messageCount: requestPayload.messages.length,
      },
    });
  }

  if (!response.ok) {
    const errorMessage = payload.error?.message || `Request failed with status ${response.status}`;
    throw new AiClientError(errorMessage, {
      operation: "chatCompletion",
      url: chatCompletionEndpoint,
      method: "POST",
      requestHeaders: requestAttempt.requestHeaders,
      requestBody: requestAttempt.requestBody,
      fetchMode: requestAttempt.fetchMode,
      fetchCredentials: requestAttempt.fetchCredentials,
      usedLocalProxy: requestAttempt.usedLocalProxy,
      localProxyUrl: requestAttempt.localProxyUrl,
      proxyTargetUrl: requestAttempt.proxyTargetUrl,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: requestAttempt.responseHeaders,
      responseBody: truncateForLog(responseBody, 4000),
      networkDiagnostics: requestAttempt.networkDiagnostics,
      requestAttempts,
      requestPayloadSummary: {
        model: requestPayload.model,
        temperature: requestPayload.temperature,
        messageCount: requestPayload.messages.length,
      },
    });
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new AiClientError("AI service returned no message content.", {
      operation: "chatCompletion",
      url: chatCompletionEndpoint,
      method: "POST",
      requestHeaders: requestAttempt.requestHeaders,
      requestBody: requestAttempt.requestBody,
      fetchMode: requestAttempt.fetchMode,
      fetchCredentials: requestAttempt.fetchCredentials,
      usedLocalProxy: requestAttempt.usedLocalProxy,
      localProxyUrl: requestAttempt.localProxyUrl,
      proxyTargetUrl: requestAttempt.proxyTargetUrl,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: requestAttempt.responseHeaders,
      responseBody: truncateForLog(responseBody, 4000),
      networkDiagnostics: requestAttempt.networkDiagnostics,
      requestAttempts,
      requestPayloadSummary: {
        model: requestPayload.model,
        temperature: requestPayload.temperature,
        messageCount: requestPayload.messages.length,
      },
    });
  }

  return content.trim();
}
