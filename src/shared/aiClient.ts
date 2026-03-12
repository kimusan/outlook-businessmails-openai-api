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
}

export interface AiClientErrorDetails {
  operation: "chatCompletion" | "modelList";
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

export function isAiClientError(error: unknown): error is AiClientError {
  return Boolean(
    error && typeof error === "object" && (error as AiClientError).name === "AiClientError"
  );
}

function buildHeaders(config: AiServiceConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!config.apiKey) {
    return headers;
  }

  if (config.authMode === "bearer") {
    const prefix = config.apiKeyPrefix.trim();
    const authValue = prefix.length > 0 ? `${prefix} ${config.apiKey}` : `Bearer ${config.apiKey}`;
    headers.Authorization = authValue;
  }

  if (config.authMode === "customHeader") {
    const headerName = config.apiKeyHeader.trim();
    const prefix = config.apiKeyPrefix.trim();
    headers[headerName] = prefix.length > 0 ? `${prefix} ${config.apiKey}` : config.apiKey;
  }

  return headers;
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

export function getModelListEndpoint(chatCompletionsEndpoint: string): string {
  const url = new window.URL(chatCompletionsEndpoint.trim());
  const pathname = url.pathname.replace(/\/+$/, "");
  const match = pathname.match(/^(.*)\/v1(?:\/.*)?$/);

  if (match) {
    const prefix = match[1] || "";
    url.pathname = `${prefix}/v1/model_list`;
  } else {
    url.pathname = "/v1/model_list";
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function listAvailableModels(config: AiServiceConfig): Promise<string[]> {
  const modelListEndpoint = getModelListEndpoint(config.endpoint);
  let response: any;
  try {
    response = await window.fetch(modelListEndpoint, {
      method: "GET",
      headers: buildHeaders(config),
    });
  } catch (error) {
    throw new AiClientError("Model list request failed before receiving a response.", {
      operation: "modelList",
      url: modelListEndpoint,
      method: "GET",
      underlyingError: (error as Error).message,
    });
  }

  const responseBody = await parseResponseBody(response);
  let payload: (ModelListResponse & { error?: { message?: string } }) | null = null;
  try {
    payload = responseBody
      ? (JSON.parse(responseBody) as unknown as ModelListResponse & {
          error?: { message?: string };
        })
      : null;
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

  let response: any;
  try {
    response = await window.fetch(config.endpoint, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(requestPayload),
    });
  } catch (error) {
    throw new AiClientError("Chat completion request failed before receiving a response.", {
      operation: "chatCompletion",
      url: config.endpoint,
      method: "POST",
      requestPayloadSummary: {
        model: requestPayload.model,
        temperature: requestPayload.temperature,
        messageCount: requestPayload.messages.length,
      },
      underlyingError: (error as Error).message,
    });
  }

  const responseBody = await parseResponseBody(response);
  let payload: ChatCompletionResponse | null = null;
  try {
    payload = responseBody ? (JSON.parse(responseBody) as unknown as ChatCompletionResponse) : null;
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
