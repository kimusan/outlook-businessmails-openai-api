/* global window, navigator */

import { AiServiceConfig } from "./aiConfig";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string } | string>;
    };
    delta?: {
      content?: string | Array<{ type?: string; text?: string } | string>;
      reasoning_content?: string;
      reasoning?: string;
    };
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface ModelListResponse {
  models?: Array<string | ModelListItem>;
  data?: Array<string | ModelListItem>;
  model_list?: Array<string | ModelListItem>;
  error?: {
    message?: string;
  };
}

interface ModelListItem {
  id?: string;
  name?: string;
  model?: string;
  capabilities?: unknown;
  tooling?: unknown;
  tools?: unknown;
  modalities?: unknown;
  features?: unknown;
  [key: string]: unknown;
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

interface AbortSignalLike {
  aborted: boolean;
  addEventListener?: (type: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener?: (type: string, listener: (...args: unknown[]) => void) => void;
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

export interface AvailableModel {
  id: string;
  capabilities: string[];
  displayLabel: string;
}

interface StreamedChatCompletionParseResult {
  content: string;
  reasoningContent: string;
  chunkCount: number;
  parsedChunkCount: number;
  parseErrorCount: number;
  hadDoneSentinel: boolean;
  errorMessage?: string;
}

type TokenRefreshPayloadMode = "formUrlEncoded" | "json";

export type ChatCompletionProgressStage =
  | "requestStarted"
  | "responseReceived"
  | "streamDetected"
  | "reasoningOnlyDetected"
  | "reasoningFollowUpStarted"
  | "reasoningFollowUpCompleted"
  | "finalAnswerCleanupStarted"
  | "finalAnswerCleanupCompleted";

export interface ChatCompletionProgressEvent {
  stage: ChatCompletionProgressStage;
  detail?: Record<string, unknown>;
}

export interface CreateChatCompletionOptions {
  onProgress?: (event: ChatCompletionProgressEvent) => void;
  allowReasoningFollowUp?: boolean;
  allowFinalAnswerCleanup?: boolean;
  signal?: AbortSignalLike;
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
    signal?: AbortSignalLike;
  }
): Promise<FetchExecutionResult> {
  const directFetchMode = "cors" as const;
  const directCredentials = "omit" as const;

  if (!shouldRouteThroughLocalProxy(url)) {
    const directResponse = await window.fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal as any,
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
    signal: init.signal as any,
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

function shouldRetryTokenRefreshWithJson(
  status: number,
  responseBody: string,
  payload: TokenRefreshResponse | null
): boolean {
  if (status !== 400 && status !== 415 && status !== 422) {
    return false;
  }

  const lowerBody = responseBody.toLowerCase();
  const lowerErrorMessage = payload?.error?.message?.toLowerCase() || "";
  const hint =
    lowerBody.includes("dictionary") ||
    lowerBody.includes("object") ||
    lowerBody.includes("unprocessable") ||
    lowerBody.includes("application/json") ||
    lowerBody.includes("json") ||
    lowerErrorMessage.includes("dictionary") ||
    lowerErrorMessage.includes("object") ||
    lowerErrorMessage.includes("application/json") ||
    lowerErrorMessage.includes("json");

  return hint || status === 422;
}

function isAbortError(error: unknown): boolean {
  const candidate = error as { name?: string; message?: string } | null;
  if (!candidate) {
    return false;
  }

  const name = (candidate.name || "").toLowerCase();
  const message = (candidate.message || "").toLowerCase();
  return name === "aborterror" || message.includes("aborted") || message.includes("canceled");
}

function extractModelId(item: string | ModelListItem): string | null {
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

function extractCapabilityValues(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => extractCapabilityValues(entry))
      .map((part) => part.toLowerCase())
      .filter(Boolean);
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, flag]) => flag === true || flag === "true" || flag === 1)
      .map(([key]) => key.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
}

function extractModelCapabilities(item: string | ModelListItem): string[] {
  if (typeof item === "string") {
    return [];
  }

  const capabilities = [
    ...extractCapabilityValues(item.capabilities),
    ...extractCapabilityValues(item.tooling),
    ...extractCapabilityValues(item.tools),
    ...extractCapabilityValues(item.modalities),
    ...extractCapabilityValues(item.features),
  ]
    .map((capability) => capability.replace(/[_-]+/g, " ").trim())
    .filter(Boolean);

  return capabilities.filter((value, index, array) => array.indexOf(value) === index);
}

function buildModelDisplayLabel(id: string, capabilities: string[]): string {
  if (capabilities.length === 0) {
    return id;
  }

  const shown = capabilities.slice(0, 4);
  const suffix = capabilities.length > shown.length ? ", ..." : "";
  return `${id} (${shown.join(", ")}${suffix})`;
}

function contentLooksLikePlanning(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const planningPatterns = [
    /^analy[sz]e\b/,
    /^plan\b/,
    /^i (will|can|am going to)\b/,
    /^let'?s\b/,
    /^here(?:'| i)s (my|the) plan\b/,
    /^first,?\s/i,
    /^step\s+\d+/,
  ];

  return planningPatterns.some((pattern) => pattern.test(normalized));
}

function stripThinkingBlocks(content: string): string {
  let output = content;

  output = output.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  output = output.replace(/```(?:thinking|reasoning|analysis)[\s\S]*?```/gi, "");

  return output.trim();
}

function stripPlanningPreamble(content: string): string {
  const planningLinePatterns = [
    /^analy[sz]e\b/i,
    /^plan\b/i,
    /^i (will|can|am going to)\b/i,
    /^let'?s\b/i,
    /^here(?:'| i)s (my|the) plan\b/i,
    /^first,?\s/i,
    /^step\s+\d+\b/i,
  ];

  const strippedThinking = stripThinkingBlocks(content);
  const lines = strippedThinking.split(/\r?\n/);
  let startIndex = 0;

  while (
    startIndex < lines.length &&
    planningLinePatterns.some((pattern) => pattern.test(lines[startIndex].trim()))
  ) {
    startIndex += 1;
  }

  return lines.slice(startIndex).join("\n").trim();
}

function normalizeChatContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  content.forEach((item) => {
    if (typeof item === "string") {
      parts.push(item);
      return;
    }

    if (!item || typeof item !== "object") {
      return;
    }

    if (typeof item.text === "string") {
      parts.push(item.text);
    }
  });

  return parts.join("");
}

function extractTextFromChatCompletionPayload(payload: ChatCompletionResponse | null): string {
  if (!payload || !Array.isArray(payload.choices)) {
    return "";
  }

  const pieces: string[] = [];
  payload.choices.forEach((choice) => {
    const messageContent = normalizeChatContent(choice?.message?.content);
    if (messageContent) {
      pieces.push(messageContent);
    }

    const deltaContent = normalizeChatContent(choice?.delta?.content);
    if (deltaContent) {
      pieces.push(deltaContent);
    }

    if (typeof choice?.text === "string" && choice.text) {
      pieces.push(choice.text);
    }
  });

  return pieces.join("");
}

function emitChatProgress(
  options: CreateChatCompletionOptions | undefined,
  stage: ChatCompletionProgressStage,
  detail?: Record<string, unknown>
): void {
  if (!options || typeof options.onProgress !== "function") {
    return;
  }

  try {
    options.onProgress({ stage, detail });
  } catch {
    // Ignore progress callback errors and keep AI call flow running.
  }
}

function buildReasoningFollowUpMessages(
  originalMessages: ChatMessage[],
  reasoningContent: string
): ChatMessage[] {
  const finalizeSystemMessage: ChatMessage = {
    role: "system",
    content:
      "You are preparing a final user-facing answer. Return only the final answer content, no chain-of-thought or internal reasoning.",
  };

  const finalizeUserMessage: ChatMessage = {
    role: "user",
    content:
      "Provide the final answer now using the context below.\n\n" +
      "Original request/context:\n" +
      originalMessages.map((message) => `[${message.role}] ${message.content}`).join("\n\n") +
      "\n\nReasoning/context notes:\n" +
      reasoningContent +
      "\n\nReturn final answer only.",
  };

  return [finalizeSystemMessage, finalizeUserMessage];
}

function buildFinalAnswerCleanupMessages(
  originalMessages: ChatMessage[],
  draftContent: string
): ChatMessage[] {
  const systemMessage: ChatMessage = {
    role: "system",
    content:
      "You clean assistant drafts. Return only the final user-facing output. Remove planning text, analysis notes, and preambles. Keep links/formatting where relevant.",
  };
  const userMessage: ChatMessage = {
    role: "user",
    content:
      "Original request context:\n" +
      originalMessages.map((message) => `[${message.role}] ${message.content}`).join("\n\n") +
      "\n\nDraft output to clean:\n" +
      draftContent +
      "\n\nReturn final answer only.",
  };

  return [systemMessage, userMessage];
}

function parseStreamedChatCompletionBody(
  responseBody: string
): StreamedChatCompletionParseResult | null {
  if (!responseBody || !/^\s*data:/m.test(responseBody)) {
    return null;
  }

  const lines = responseBody.split(/\r?\n/);
  let chunkCount = 0;
  let parsedChunkCount = 0;
  let parseErrorCount = 0;
  let hadDoneSentinel = false;
  let errorMessage: string | undefined;
  const contentPieces: string[] = [];
  const reasoningPieces: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      return;
    }

    const dataPayload = trimmed.slice(5).trimStart();
    if (!dataPayload) {
      return;
    }

    if (dataPayload === "[DONE]") {
      hadDoneSentinel = true;
      return;
    }

    chunkCount += 1;
    let parsedChunk: ChatCompletionResponse | null = null;
    try {
      parsedChunk = JSON.parse(dataPayload) as ChatCompletionResponse;
      parsedChunkCount += 1;
    } catch {
      parseErrorCount += 1;
      return;
    }

    if (!errorMessage && parsedChunk?.error?.message) {
      errorMessage = parsedChunk.error.message;
    }

    if (!parsedChunk?.choices || !Array.isArray(parsedChunk.choices)) {
      return;
    }

    parsedChunk.choices.forEach((choice) => {
      const deltaContent = normalizeChatContent(choice?.delta?.content);
      if (deltaContent) {
        contentPieces.push(deltaContent);
      }

      const messageContent = normalizeChatContent(choice?.message?.content);
      if (messageContent) {
        contentPieces.push(messageContent);
      }

      if (typeof choice?.text === "string" && choice.text) {
        contentPieces.push(choice.text);
      }

      if (typeof choice?.delta?.reasoning_content === "string" && choice.delta.reasoning_content) {
        reasoningPieces.push(choice.delta.reasoning_content);
      } else if (typeof choice?.delta?.reasoning === "string" && choice.delta.reasoning) {
        reasoningPieces.push(choice.delta.reasoning);
      }
    });
  });

  return {
    content: contentPieces.join(""),
    reasoningContent: reasoningPieces.join(""),
    chunkCount,
    parsedChunkCount,
    parseErrorCount,
    hadDoneSentinel,
    errorMessage,
  };
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
  const networkDiagnostics = buildNetworkDiagnostics(refreshEndpoint);
  const requestAttempts: RequestAttemptDebug[] = [];
  if (!umsToken) {
    throw new AiClientError("UMS token is required to refresh access token.", {
      operation: "tokenRefresh",
      url: refreshEndpoint,
      method: "POST",
      requestHeaders: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      requestBody: "ums_token=[missing]",
      networkDiagnostics,
      requestAttempts,
      requestPayloadSummary: {
        hasUmsToken: false,
        forcedRefresh: forceRefresh,
        attemptedPayloadModes: [],
      },
    });
  }

  const makeTokenRefreshRequest = async (
    payloadMode: TokenRefreshPayloadMode
  ): Promise<{
    response: ResponseLike;
    responseBody: string;
    payload: TokenRefreshResponse | null;
    requestHeaders: Record<string, string>;
    requestBody: string;
    fetchContext: FetchExecutionContext;
    requestAttempt: RequestAttemptDebug;
  }> => {
    const requestHeaders: Record<string, string> = {
      Accept: "application/json",
      "Content-Type":
        payloadMode === "json" ? "application/json" : "application/x-www-form-urlencoded",
    };
    const requestBody =
      payloadMode === "json"
        ? JSON.stringify({ ums_token: umsToken })
        : `ums_token=${encodeURIComponent(umsToken)}`;
    let fetchContext: FetchExecutionContext = {
      fetchMode: "cors",
      fetchCredentials: "omit",
      usedLocalProxy: false,
    };

    const requestAttempt: RequestAttemptDebug = {
      url: refreshEndpoint,
      method: "POST",
      requestHeaders,
      requestBody,
      fetchMode: fetchContext.fetchMode,
      fetchCredentials: fetchContext.fetchCredentials,
      usedLocalProxy: fetchContext.usedLocalProxy,
      networkDiagnostics,
    };
    requestAttempts.push(requestAttempt);

    let response: ResponseLike;
    try {
      const execution = await executeBrowserFetch(refreshEndpoint, {
        method: "POST",
        headers: requestHeaders,
        body: requestBody,
      });
      response = execution.response;
      fetchContext = execution.context;
      requestAttempt.fetchMode = fetchContext.fetchMode;
      requestAttempt.fetchCredentials = fetchContext.fetchCredentials;
      requestAttempt.usedLocalProxy = fetchContext.usedLocalProxy;
      requestAttempt.localProxyUrl = fetchContext.localProxyUrl;
      requestAttempt.proxyTargetUrl = fetchContext.proxyTargetUrl;
    } catch (error) {
      requestAttempt.networkError = (error as Error).message;
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
        requestAttempts,
        requestPayloadSummary: {
          hasUmsToken: true,
          forcedRefresh: forceRefresh,
          attemptedPayloadModes: requestAttempts.map((attempt) =>
            attempt.requestHeaders["Content-Type"] === "application/json"
              ? "json"
              : "formUrlEncoded"
          ),
        },
        underlyingError: (error as Error).message,
      });
    }

    requestAttempt.status = response.status;
    requestAttempt.statusText = response.statusText;
    requestAttempt.responseHeaders = serializeHeaders(response.headers);

    const responseBody = await parseResponseBody(response);
    let payload: TokenRefreshResponse | null = null;
    try {
      payload = responseBody ? (JSON.parse(responseBody) as TokenRefreshResponse) : null;
    } catch {
      payload = null;
    }

    return {
      response,
      responseBody,
      payload,
      requestHeaders,
      requestBody,
      fetchContext,
      requestAttempt,
    };
  };

  const firstAttempt = await makeTokenRefreshRequest("formUrlEncoded");
  let finalAttempt = firstAttempt;

  if (
    !firstAttempt.response.ok &&
    shouldRetryTokenRefreshWithJson(
      firstAttempt.response.status,
      firstAttempt.responseBody,
      firstAttempt.payload
    )
  ) {
    finalAttempt = await makeTokenRefreshRequest("json");
  }

  if (!finalAttempt.response.ok) {
    throw new AiClientError(
      finalAttempt.payload?.error?.message ||
        `Token refresh request failed with status ${finalAttempt.response.status}`,
      {
        operation: "tokenRefresh",
        url: refreshEndpoint,
        method: "POST",
        requestHeaders: finalAttempt.requestHeaders,
        requestBody: finalAttempt.requestBody,
        fetchMode: finalAttempt.fetchContext.fetchMode,
        fetchCredentials: finalAttempt.fetchContext.fetchCredentials,
        usedLocalProxy: finalAttempt.fetchContext.usedLocalProxy,
        localProxyUrl: finalAttempt.fetchContext.localProxyUrl,
        proxyTargetUrl: finalAttempt.fetchContext.proxyTargetUrl,
        networkDiagnostics,
        status: finalAttempt.response.status,
        statusText: finalAttempt.response.statusText,
        responseHeaders: serializeHeaders(finalAttempt.response.headers),
        responseBody: truncateForLog(finalAttempt.responseBody, 4000),
        requestAttempts,
        requestPayloadSummary: {
          hasUmsToken: true,
          forcedRefresh: forceRefresh,
          attemptedPayloadModes: requestAttempts.map((attempt) =>
            attempt.requestHeaders["Content-Type"] === "application/json"
              ? "json"
              : "formUrlEncoded"
          ),
        },
      }
    );
  }

  const accessToken = finalAttempt.payload?.access_token?.trim();
  if (!accessToken) {
    throw new AiClientError("Token refresh response did not include access_token.", {
      operation: "tokenRefresh",
      url: refreshEndpoint,
      method: "POST",
      requestHeaders: finalAttempt.requestHeaders,
      requestBody: finalAttempt.requestBody,
      fetchMode: finalAttempt.fetchContext.fetchMode,
      fetchCredentials: finalAttempt.fetchContext.fetchCredentials,
      usedLocalProxy: finalAttempt.fetchContext.usedLocalProxy,
      localProxyUrl: finalAttempt.fetchContext.localProxyUrl,
      proxyTargetUrl: finalAttempt.fetchContext.proxyTargetUrl,
      networkDiagnostics,
      status: finalAttempt.response.status,
      statusText: finalAttempt.response.statusText,
      responseHeaders: serializeHeaders(finalAttempt.response.headers),
      responseBody: truncateForLog(finalAttempt.responseBody, 4000),
      requestAttempts,
      requestPayloadSummary: {
        hasUmsToken: true,
        forcedRefresh: forceRefresh,
        attemptedPayloadModes: requestAttempts.map((attempt) =>
          attempt.requestHeaders["Content-Type"] === "application/json" ? "json" : "formUrlEncoded"
        ),
      },
    });
  }

  cacheAccessToken(config, accessToken);
  return accessToken;
}

async function fetchWithAuth(
  config: AiServiceConfig,
  request: AuthorizedRequest,
  signal?: AbortSignalLike
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
        signal,
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
      if (isAbortError(error)) {
        throw new AiClientError("Request cancelled by user.", {
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

export async function listAvailableModels(config: AiServiceConfig): Promise<AvailableModel[]> {
  const modelListEndpoint = getModelListEndpoint(config);
  const { response, requestAttempt, requestAttempts } = await fetchWithAuth(
    config,
    {
      operation: "modelList",
      url: modelListEndpoint,
      method: "GET",
    },
    undefined
  );

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
  const modelMap = new Map<string, AvailableModel>();
  rawModels.forEach((item) => {
    const id = extractModelId(item);
    if (!id) {
      return;
    }

    const capabilities = extractModelCapabilities(item);
    const existing = modelMap.get(id);
    if (!existing) {
      modelMap.set(id, {
        id,
        capabilities,
        displayLabel: buildModelDisplayLabel(id, capabilities),
      });
      return;
    }

    const mergedCapabilities = [...existing.capabilities, ...capabilities].filter(
      (value, index, array) => array.indexOf(value) === index
    );
    modelMap.set(id, {
      id,
      capabilities: mergedCapabilities,
      displayLabel: buildModelDisplayLabel(id, mergedCapabilities),
    });
  });
  const result = Array.from(modelMap.values()).sort((a, b) => a.id.localeCompare(b.id));

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
  messages: ChatMessage[],
  options?: CreateChatCompletionOptions
): Promise<string> {
  const chatCompletionEndpoint = getChatCompletionEndpoint(config);
  const requestPayload = {
    model: config.model,
    temperature: config.temperature,
    stream: false,
    messages,
  };

  emitChatProgress(options, "requestStarted", {
    model: requestPayload.model,
    messageCount: requestPayload.messages.length,
  });

  const { response, requestAttempt, requestAttempts } = await fetchWithAuth(
    config,
    {
      operation: "chatCompletion",
      url: chatCompletionEndpoint,
      method: "POST",
      body: JSON.stringify(requestPayload),
      requestPayloadSummary: {
        model: requestPayload.model,
        temperature: requestPayload.temperature,
        messageCount: requestPayload.messages.length,
      },
    },
    options?.signal
  );

  const responseBody = await parseResponseBody(response);
  const responseContentType = requestAttempt.responseHeaders?.["content-type"] || "";
  const streamedResult = parseStreamedChatCompletionBody(responseBody);
  emitChatProgress(options, "responseReceived", {
    status: response.status,
    contentType: responseContentType,
    usedLocalProxy: requestAttempt.usedLocalProxy,
  });
  if (streamedResult) {
    emitChatProgress(options, "streamDetected", {
      chunkCount: streamedResult.chunkCount,
      parsedChunkCount: streamedResult.parsedChunkCount,
      parseErrorCount: streamedResult.parseErrorCount,
    });
  }

  let payload: ChatCompletionResponse | null = null;
  try {
    payload = responseBody ? (JSON.parse(responseBody) as ChatCompletionResponse) : null;
  } catch {
    payload = null;
  }

  if (!payload && !streamedResult) {
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
        responseContentType,
        streamDetected: false,
      },
    });
  }

  if (!response.ok) {
    const errorMessage =
      payload?.error?.message ||
      streamedResult?.errorMessage ||
      `Request failed with status ${response.status}`;
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
        responseContentType,
        streamDetected: Boolean(streamedResult),
        streamChunkCount: streamedResult?.chunkCount,
        streamParsedChunkCount: streamedResult?.parsedChunkCount,
        streamParseErrorCount: streamedResult?.parseErrorCount,
      },
    });
  }

  const payloadContent = extractTextFromChatCompletionPayload(payload);
  const streamContent = streamedResult?.content || "";
  const streamReasoning = streamedResult?.reasoningContent || "";
  const content = payloadContent || streamContent;

  if (!content && streamReasoning) {
    emitChatProgress(options, "reasoningOnlyDetected", {
      reasoningPreview: truncateForLog(streamReasoning, 160),
      reasoningLength: streamReasoning.length,
    });

    if (options?.allowReasoningFollowUp !== false) {
      emitChatProgress(options, "reasoningFollowUpStarted", {
        reasoningLength: streamReasoning.length,
      });
      const followUpMessages = buildReasoningFollowUpMessages(messages, streamReasoning);
      try {
        const followUpResult = await createChatCompletion(config, followUpMessages, {
          ...options,
          allowReasoningFollowUp: false,
          allowFinalAnswerCleanup: false,
        });
        emitChatProgress(options, "reasoningFollowUpCompleted", {
          outputLength: followUpResult.trim().length,
        });
        if (followUpResult.trim()) {
          return followUpResult.trim();
        }
      } catch (error) {
        throw new AiClientError(
          "Reasoning-only response was returned and automatic finalization did not produce final content.",
          {
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
              responseContentType,
              streamDetected: Boolean(streamedResult),
              streamChunkCount: streamedResult?.chunkCount,
              streamParsedChunkCount: streamedResult?.parsedChunkCount,
              streamParseErrorCount: streamedResult?.parseErrorCount,
              reasoningPreview: truncateForLog(streamReasoning, 240),
            },
            underlyingError: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    throw new AiClientError(
      "Model returned reasoning/thinking text but no final assistant content. Use a non-reasoning model or adjust model settings to return final content.",
      {
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
          responseContentType,
          streamDetected: Boolean(streamedResult),
          streamChunkCount: streamedResult?.chunkCount,
          streamParsedChunkCount: streamedResult?.parsedChunkCount,
          streamParseErrorCount: streamedResult?.parseErrorCount,
          reasoningPreview: truncateForLog(streamReasoning, 240),
        },
      }
    );
  }

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
        responseContentType,
        streamDetected: Boolean(streamedResult),
        streamChunkCount: streamedResult?.chunkCount,
        streamParsedChunkCount: streamedResult?.parsedChunkCount,
        streamParseErrorCount: streamedResult?.parseErrorCount,
      },
    });
  }

  if (content && options?.allowFinalAnswerCleanup !== false && contentLooksLikePlanning(content)) {
    const locallyCleaned = stripPlanningPreamble(content);
    if (locallyCleaned && !contentLooksLikePlanning(locallyCleaned)) {
      return locallyCleaned;
    }

    emitChatProgress(options, "finalAnswerCleanupStarted", {
      contentPreview: truncateForLog(content, 160),
    });

    const cleanupMessages = buildFinalAnswerCleanupMessages(messages, content);
    const cleaned = await createChatCompletion(config, cleanupMessages, {
      ...options,
      allowReasoningFollowUp: false,
      allowFinalAnswerCleanup: false,
    });

    emitChatProgress(options, "finalAnswerCleanupCompleted", {
      outputLength: cleaned.trim().length,
    });

    if (cleaned.trim()) {
      return cleaned.trim();
    }
  }

  return content.trim();
}
