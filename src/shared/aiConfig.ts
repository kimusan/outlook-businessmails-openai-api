/* global Office, window, globalThis */

import {
  DEFAULT_PROMPT_TEMPLATES,
  mergePromptTemplates,
  type PromptTemplates,
  type SupportedLanguage,
} from "./promptBuilders";

export type AuthMode = "umsToken" | "apiKey";

export interface AiServiceConfig {
  baseUri: string;
  chatCompletionsPath: string;
  modelListPath: string;
  tokenRefreshPath: string;
  promptTemplates: PromptTemplates;
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
  promptTemplates: { ...DEFAULT_PROMPT_TEMPLATES },
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

interface RuntimeStorageLike {
  getItem: (key: string) => Promise<string | null | undefined>;
  setItem: (key: string, value: string) => Promise<void>;
}

function getRuntimeStorage(): RuntimeStorageLike | null {
  const runtimeStorage = (globalThis as { OfficeRuntime?: { storage?: unknown } }).OfficeRuntime
    ?.storage as Partial<RuntimeStorageLike> | undefined;

  if (
    !runtimeStorage ||
    typeof runtimeStorage.getItem !== "function" ||
    typeof runtimeStorage.setItem !== "function"
  ) {
    return null;
  }

  return runtimeStorage as RuntimeStorageLike;
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
    promptTemplates: mergePromptTemplates(input.promptTemplates),
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

function parseStoredConfig(rawValue: unknown): AiServiceConfig | null {
  if (!rawValue) {
    return null;
  }

  try {
    if (typeof rawValue === "string") {
      return normalizeConfig(
        JSON.parse(rawValue) as Partial<AiServiceConfig & LegacyAiServiceConfig>
      );
    }

    if (typeof rawValue === "object") {
      return normalizeConfig(rawValue as Partial<AiServiceConfig & LegacyAiServiceConfig>);
    }
  } catch {
    return null;
  }

  return null;
}

export function loadAiServiceConfig(): AiServiceConfig {
  const roamingSettings = getRoamingSettings();
  if (roamingSettings) {
    const roamingConfig = parseStoredConfig(roamingSettings.get(STORAGE_KEY));
    if (roamingConfig) {
      return roamingConfig;
    }
  }

  try {
    const localConfig = parseStoredConfig(window.localStorage.getItem(STORAGE_KEY));
    if (localConfig) {
      return localConfig;
    }
  } catch {
    // Ignore local storage failures.
  }

  return { ...DEFAULT_AI_CONFIG };
}

export async function loadAiServiceConfigAsync(): Promise<AiServiceConfig> {
  const runtimeStorage = getRuntimeStorage();
  if (runtimeStorage) {
    try {
      const runtimeConfig = parseStoredConfig(await runtimeStorage.getItem(STORAGE_KEY));
      if (runtimeConfig) {
        return runtimeConfig;
      }
    } catch {
      // Ignore runtime storage failures and continue with synchronous fallbacks.
    }
  }

  return loadAiServiceConfig();
}

export async function saveAiServiceConfig(config: AiServiceConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  const serialized = JSON.stringify(normalized);
  let persisted = false;
  let lastError: Error | null = null;

  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
    persisted = true;
  } catch (error) {
    lastError = error as Error;
  }

  const runtimeStorage = getRuntimeStorage();
  if (runtimeStorage) {
    try {
      await runtimeStorage.setItem(STORAGE_KEY, serialized);
      persisted = true;
    } catch (error) {
      lastError = error as Error;
    }
  }

  const roamingSettings = getRoamingSettings();
  if (roamingSettings) {
    try {
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
      persisted = true;
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (!persisted) {
    throw lastError || new Error("Unable to persist configuration in available local stores.");
  }
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
