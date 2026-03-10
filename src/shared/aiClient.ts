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
