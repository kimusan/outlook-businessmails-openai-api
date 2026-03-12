/* global Office, window */

import type { SupportedLanguage } from "./promptBuilders";

export interface AiServiceConfig {
  endpoint: string;
  model: string;
  temperature: number;
  umsToken: string;
  preferredLanguage: SupportedLanguage;
}

export const DEFAULT_AI_CONFIG: AiServiceConfig = {
  endpoint: "",
  model: "gpt-4o-mini",
  temperature: 0.4,
  umsToken: "",
  preferredLanguage: "English",
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
    umsToken: (input.umsToken || DEFAULT_AI_CONFIG.umsToken).trim(),
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

  if (!config.umsToken.trim()) {
    return "UMS token is required.";
  }

  if (!["English", "Korean", "Danish"].includes(config.preferredLanguage)) {
    return "Preferred language must be English, Korean, or Danish.";
  }

  return null;
}
