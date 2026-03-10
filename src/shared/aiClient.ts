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
  const response = await window.fetch(modelListEndpoint, {
    method: "GET",
    headers: buildHeaders(config),
  });

  const payload = (await response.json()) as ModelListResponse & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `Model list request failed with status ${response.status}`
    );
  }

  const rawModels = payload.models || payload.model_list || payload.data || [];
  const result = rawModels
    .map((item) => extractModelId(item))
    .filter((item): item is string => Boolean(item))
    .filter((item, index, array) => array.indexOf(item) === index)
    .sort();

  if (result.length === 0) {
    throw new Error("Model list response contained no usable model identifiers.");
  }

  return result;
}

export async function createChatCompletion(
  config: AiServiceConfig,
  messages: ChatMessage[]
): Promise<string> {
  const response = await window.fetch(config.endpoint, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      messages,
    }),
  });

  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    const errorMessage = payload.error?.message || `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI service returned no message content.");
  }

  return content.trim();
}
