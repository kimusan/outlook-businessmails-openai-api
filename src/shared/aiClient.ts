/* global window */

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
  status?: number;
  statusText?: string;
  responseBody?: string;
  requestPayloadSummary?: Record<string, unknown>;
  underlyingError?: string;
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

const accessTokenCache = new Map<string, string>();

export function isAiClientError(error: unknown): error is AiClientError {
  return Boolean(
    error && typeof error === "object" && (error as AiClientError).name === "AiClientError"
  );
}

function buildCacheKey(config: AiServiceConfig): string {
  return `${config.endpoint.trim()}::${config.umsToken.trim()}`;
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

function deriveV1Endpoint(chatCompletionsEndpoint: string, suffix: string): string {
  const url = new window.URL(chatCompletionsEndpoint.trim());
  const pathname = url.pathname.replace(/\/+$/, "");
  const match = pathname.match(/^(.*)\/v1(?:\/.*)?$/);

  if (match) {
    const prefix = match[1] || "";
    url.pathname = `${prefix}/v1/${suffix}`;
  } else {
    url.pathname = `/v1/${suffix}`;
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getModelListEndpoint(chatCompletionsEndpoint: string): string {
  return deriveV1Endpoint(chatCompletionsEndpoint, "model_list");
}

export function getTokenRefreshEndpoint(chatCompletionsEndpoint: string): string {
  return deriveV1Endpoint(chatCompletionsEndpoint, "token/refresh");
}

export async function refreshAccessToken(
  config: AiServiceConfig,
  forceRefresh = false
): Promise<string> {
  const cachedToken = forceRefresh ? null : getCachedAccessToken(config);
  if (cachedToken) {
    return cachedToken;
  }

  const refreshEndpoint = getTokenRefreshEndpoint(config.endpoint);
  const umsToken = config.umsToken.trim();
  if (!umsToken) {
    throw new AiClientError("UMS token is required to refresh access token.", {
      operation: "tokenRefresh",
      url: refreshEndpoint,
      method: "POST",
      requestPayloadSummary: {
        hasUmsToken: false,
        forcedRefresh: forceRefresh,
      },
    });
  }

  let response: any;
  try {
    response = await window.fetch(refreshEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: `ums_token=${encodeURIComponent(umsToken)}`,
    });
  } catch (error) {
    throw new AiClientError("Token refresh request failed before receiving a response.", {
      operation: "tokenRefresh",
      url: refreshEndpoint,
      method: "POST",
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
        status: response.status,
        statusText: response.statusText,
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
      status: response.status,
      statusText: response.statusText,
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

async function fetchWithAuth(config: AiServiceConfig, request: AuthorizedRequest): Promise<any> {
  const execute = async (accessToken: string): Promise<any> => {
    try {
      return await window.fetch(request.url, {
        method: request.method,
        headers: {
          ...(request.method === "POST" ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${accessToken}`,
        },
        body: request.body,
      });
    } catch (error) {
      throw new AiClientError(`${request.operation} request failed before receiving a response.`, {
        operation: request.operation,
        url: request.url,
        method: request.method,
        requestPayloadSummary: request.requestPayloadSummary,
        underlyingError: (error as Error).message,
      });
    }
  };

  let accessToken = await refreshAccessToken(config);
  let response = await execute(accessToken);

  if (response.status === 401 || response.status === 403) {
    accessToken = await refreshAccessToken(config, true);
    response = await execute(accessToken);
  }

  return response;
}

export async function listAvailableModels(config: AiServiceConfig): Promise<string[]> {
  const modelListEndpoint = getModelListEndpoint(config.endpoint);
  const response = await fetchWithAuth(config, {
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
        status: response.status,
        statusText: response.statusText,
        responseBody: truncateForLog(responseBody, 4000),
      }
    );
  }

  if (!payload) {
    throw new AiClientError("Model list response was not valid JSON.", {
      operation: "modelList",
      url: modelListEndpoint,
      method: "GET",
      status: response.status,
      statusText: response.statusText,
      responseBody: truncateForLog(responseBody, 4000),
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
      status: response.status,
      statusText: response.statusText,
      responseBody: truncateForLog(responseBody, 4000),
    });
  }

  return result;
}

export async function createChatCompletion(
  config: AiServiceConfig,
  messages: ChatMessage[]
): Promise<string> {
  const requestPayload = {
    model: config.model,
    temperature: config.temperature,
    messages,
  };

  const response = await fetchWithAuth(config, {
    operation: "chatCompletion",
    url: config.endpoint,
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
      url: config.endpoint,
      method: "POST",
      status: response.status,
      statusText: response.statusText,
      responseBody: truncateForLog(responseBody, 4000),
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
      url: config.endpoint,
      method: "POST",
      status: response.status,
      statusText: response.statusText,
      responseBody: truncateForLog(responseBody, 4000),
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
      url: config.endpoint,
      method: "POST",
      status: response.status,
      statusText: response.statusText,
      responseBody: truncateForLog(responseBody, 4000),
      requestPayloadSummary: {
        model: requestPayload.model,
        temperature: requestPayload.temperature,
        messageCount: requestPayload.messages.length,
      },
    });
  }

  return content.trim();
}
