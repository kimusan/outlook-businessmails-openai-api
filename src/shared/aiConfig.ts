/* global Office, window */

import type { SupportedLanguage } from "./promptBuilders";

export type AuthMode = "umsToken" | "apiKey";

export interface AiServiceConfig {
  baseUri: string;
  chatCompletionsPath: string;
  modelListPath: string;
  tokenRefreshPath: string;
  model: string;
  temperature: number;
  authMode: AuthMode;
  umsToken: string;
  apiKey: string;
  preferredLanguage: SupportedLanguage;
}

export const DEFAULT_AI_CONFIG: AiServiceConfig = {
  baseUri: "",
  chatCompletionsPath: "/v1/chat/completions",
  modelListPath: "/v1/model_list",
  tokenRefreshPath: "/v1/token/refresh",
  model: "gpt-4o-mini",
  temperature: 0.4,
  authMode: "umsToken",
  umsToken: "",
  apiKey: "",
  preferredLanguage: "English",
};

const STORAGE_KEY = "outlookAiAssistant.aiConfig";

interface LegacyAiServiceConfig {
  endpoint?: string;
}

function getRoamingSettings(): Office.RoamingSettings | null {
  if (typeof Office === "undefined" || !Office.context || !Office.context.roamingSettings) {
    return null;
  }

  return Office.context.roamingSettings;
}

function normalizePath(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const candidate = raw || fallback;
  if (!candidate) {
    return fallback;
  }

  return candidate.startsWith("/") ? candidate : `/${candidate}`;
}

function normalizeBaseUri(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
}

function deriveFromLegacyEndpoint(
  endpoint: unknown
): Pick<AiServiceConfig, "baseUri" | "chatCompletionsPath"> | null {
  if (typeof endpoint !== "string" || !endpoint.trim()) {
    return null;
  }

  try {
    const url = new window.URL(endpoint.trim());
    const pathname = url.pathname.replace(/\/+$/, "");
    const match = pathname.match(/^(.*)\/v1(\/.*)?$/);
    if (!match) {
      return null;
    }

    const basePath = match[1] || "";
    const chatSuffix = match[2] || "/chat/completions";
    return {
      baseUri: `${url.origin}${basePath}`.replace(/\/+$/, ""),
      chatCompletionsPath: `/v1${chatSuffix}`,
    };
  } catch {
    return null;
  }
}

function normalizeConfig(
  input: Partial<AiServiceConfig & LegacyAiServiceConfig> | null | undefined
): AiServiceConfig {
  if (!input) {
    return { ...DEFAULT_AI_CONFIG };
  }

  const legacy = deriveFromLegacyEndpoint(input.endpoint);
  const authMode: AuthMode =
    input.authMode === "apiKey"
      ? "apiKey"
      : input.authMode === "umsToken"
        ? "umsToken"
        : input.apiKey && String(input.apiKey).trim()
          ? "apiKey"
          : "umsToken";

  return {
    baseUri: normalizeBaseUri(input.baseUri || legacy?.baseUri || DEFAULT_AI_CONFIG.baseUri),
    chatCompletionsPath: normalizePath(
      input.chatCompletionsPath || legacy?.chatCompletionsPath,
      DEFAULT_AI_CONFIG.chatCompletionsPath
    ),
    modelListPath: normalizePath(input.modelListPath, DEFAULT_AI_CONFIG.modelListPath),
    tokenRefreshPath: normalizePath(input.tokenRefreshPath, DEFAULT_AI_CONFIG.tokenRefreshPath),
    model: (input.model || DEFAULT_AI_CONFIG.model).trim(),
    temperature:
      typeof input.temperature === "number" ? input.temperature : DEFAULT_AI_CONFIG.temperature,
    authMode,
    umsToken: (input.umsToken || DEFAULT_AI_CONFIG.umsToken).trim(),
    apiKey: (input.apiKey || DEFAULT_AI_CONFIG.apiKey).trim(),
    preferredLanguage: (input.preferredLanguage &&
    ["English", "Korean", "Danish"].includes(input.preferredLanguage)
      ? input.preferredLanguage
      : DEFAULT_AI_CONFIG.preferredLanguage) as SupportedLanguage,
  };
}

export function loadAiServiceConfig(): AiServiceConfig {
  const roamingSettings = getRoamingSettings();
  if (roamingSettings) {
    const value = roamingSettings.get(STORAGE_KEY);
    if (value) {
      return normalizeConfig(value as Partial<AiServiceConfig & LegacyAiServiceConfig>);
    }
  }

  try {
    const localValue = window.localStorage.getItem(STORAGE_KEY);
    if (!localValue) {
      return { ...DEFAULT_AI_CONFIG };
    }

    return normalizeConfig(
      JSON.parse(localValue) as Partial<AiServiceConfig & LegacyAiServiceConfig>
    );
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export async function saveAiServiceConfig(config: AiServiceConfig): Promise<void> {
  const normalized = normalizeConfig(config);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore local storage issues and still attempt roaming settings.
  }

  const roamingSettings = getRoamingSettings();
  if (!roamingSettings) {
    return;
  }

  roamingSettings.set(STORAGE_KEY, normalized);

  await new Promise<void>((resolve, reject) => {
    roamingSettings.saveAsync((asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Succeeded) {
        resolve();
      } else {
        reject(new Error(asyncResult.error.message));
      }
    });
  });
}

export function validateAiServiceConfig(config: AiServiceConfig): string | null {
  if (!config.baseUri.trim()) {
    return "Base URI is required.";
  }

  try {
    const parsed = new window.URL(config.baseUri);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "Base URI must use http or https.";
    }
  } catch {
    return "Base URI must be a valid URL.";
  }

  if (!config.chatCompletionsPath.trim()) {
    return "Chat completions path is required.";
  }

  if (!config.modelListPath.trim()) {
    return "Model list path is required.";
  }

  if (config.authMode === "umsToken") {
    if (!config.tokenRefreshPath.trim()) {
      return "Token refresh path is required for UMS token mode.";
    }

    if (!config.umsToken.trim()) {
      return "UMS token is required.";
    }
  }

  if (config.authMode === "apiKey" && !config.apiKey.trim()) {
    return "API key is required.";
  }

  if (!config.model.trim()) {
    return "Model is required.";
  }

  if (!["English", "Korean", "Danish"].includes(config.preferredLanguage)) {
    return "Preferred language must be English, Korean, or Danish.";
  }

  return null;
}
