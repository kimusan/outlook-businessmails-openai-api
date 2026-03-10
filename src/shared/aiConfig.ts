/* global Office, window */

export type AuthMode = "bearer" | "customHeader" | "none";

export interface AiServiceConfig {
  endpoint: string;
  model: string;
  temperature: number;
  authMode: AuthMode;
  apiKey: string;
  apiKeyHeader: string;
  apiKeyPrefix: string;
}

export const DEFAULT_AI_CONFIG: AiServiceConfig = {
  endpoint: "",
  model: "gpt-4o-mini",
  temperature: 0.4,
  authMode: "bearer",
  apiKey: "",
  apiKeyHeader: "api-key",
  apiKeyPrefix: "",
};

const STORAGE_KEY = "outlookAiAssistant.aiConfig";

function getRoamingSettings(): Office.RoamingSettings | null {
  if (typeof Office === "undefined" || !Office.context || !Office.context.roamingSettings) {
    return null;
  }

  return Office.context.roamingSettings;
}

function normalizeConfig(input: Partial<AiServiceConfig> | null | undefined): AiServiceConfig {
  if (!input) {
    return { ...DEFAULT_AI_CONFIG };
  }

  return {
    endpoint: (input.endpoint || DEFAULT_AI_CONFIG.endpoint).trim(),
    model: (input.model || DEFAULT_AI_CONFIG.model).trim(),
    temperature:
      typeof input.temperature === "number" ? input.temperature : DEFAULT_AI_CONFIG.temperature,
    authMode: (input.authMode || DEFAULT_AI_CONFIG.authMode) as AuthMode,
    apiKey: input.apiKey || DEFAULT_AI_CONFIG.apiKey,
    apiKeyHeader: (input.apiKeyHeader || DEFAULT_AI_CONFIG.apiKeyHeader).trim(),
    apiKeyPrefix: (input.apiKeyPrefix || DEFAULT_AI_CONFIG.apiKeyPrefix).trim(),
  };
}

export function loadAiServiceConfig(): AiServiceConfig {
  const roamingSettings = getRoamingSettings();
  if (roamingSettings) {
    const value = roamingSettings.get(STORAGE_KEY);
    if (value) {
      return normalizeConfig(value as Partial<AiServiceConfig>);
    }
  }

  try {
    const localValue = window.localStorage.getItem(STORAGE_KEY);
    if (!localValue) {
      return { ...DEFAULT_AI_CONFIG };
    }

    return normalizeConfig(JSON.parse(localValue) as Partial<AiServiceConfig>);
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
  if (!config.endpoint.trim()) {
    return "Endpoint URL is required.";
  }

  if (!config.model.trim()) {
    return "Model is required.";
  }

  if (config.authMode !== "none" && !config.apiKey.trim()) {
    return "API key is required for selected auth mode.";
  }

  if (config.authMode === "customHeader" && !config.apiKeyHeader.trim()) {
    return "API key header name is required for custom header auth mode.";
  }

  return null;
}
