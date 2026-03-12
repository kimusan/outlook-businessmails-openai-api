/* global require */

import * as React from "react";
import {
  DefaultButton,
  Dropdown,
  IDropdownOption,
  MessageBar,
  MessageBarType,
  PrimaryButton,
  SpinButton,
  TextField,
} from "@fluentui/react";
import Progress from "./Progress";
import {
  getComposeTypeOrUnknown,
  getCurrentBodyText,
  getSelectedTextOrEmpty,
  insertTextAtCursor,
  setComposeBodyText,
  splitDraftAndThread,
} from "../../shared/outlookContext";
import {
  buildImproveDraftMessages,
  buildImproveReplyMessages,
  buildReplyDraftMessages,
  buildTranslationMessages,
  FormalityOption,
  LengthOption,
  SupportedLanguage,
  ToneOption,
} from "../../shared/promptBuilders";
import {
  AiServiceConfig,
  DEFAULT_AI_CONFIG,
  loadAiServiceConfig,
  saveAiServiceConfig,
  validateAiServiceConfig,
} from "../../shared/aiConfig";
import {
  createChatCompletion,
  getModelListEndpoint,
  getTokenRefreshEndpoint,
  isAiClientError,
  listAvailableModels,
  refreshAccessToken,
} from "../../shared/aiClient";

export interface AppProps {
  title: string;
  isOfficeInitialized: boolean;
}

type HostMode = "compose" | "read";
type Workflow = "replyDraft" | "improveDraft" | "improveReplyDraft" | "translate";
type ContentScope = "body" | "selection";

const toneOptions: IDropdownOption[] = [
  { key: "neutral", text: "Neutral" },
  { key: "friendly", text: "Friendly" },
  { key: "formal", text: "Formal" },
  { key: "concise", text: "Concise" },
];

const formalityOptions: IDropdownOption[] = [
  { key: "balanced", text: "Balanced" },
  { key: "informal", text: "Informal" },
  { key: "formal", text: "Formal" },
];

const lengthOptions: IDropdownOption[] = [
  { key: "short", text: "Short" },
  { key: "medium", text: "Medium" },
  { key: "long", text: "Long" },
];

const languageOptions: IDropdownOption[] = [
  { key: "English", text: "English" },
  { key: "Korean", text: "Korean" },
  { key: "Danish", text: "Danish" },
];

function detectHostMode(): HostMode {
  const url = new URL(window.location.href);
  const action = (url.searchParams.get("action") || "").toLowerCase();

  if (action === "compose") {
    return "compose";
  }

  return "read";
}

function loadInitialConfig(): AiServiceConfig {
  return { ...DEFAULT_AI_CONFIG, ...loadAiServiceConfig() };
}

function detectScopePreference(): ContentScope {
  const url = new URL(window.location.href);
  const scope = (url.searchParams.get("scope") || "").toLowerCase();
  return scope === "selection" ? "selection" : "body";
}

function detectInitialWorkflow(hostMode: HostMode): Workflow {
  const url = new URL(window.location.href);
  const workflow = (url.searchParams.get("workflow") || "").toLowerCase();

  if (hostMode === "read") {
    return "translate";
  }

  if (workflow === "replydraft") {
    return "replyDraft";
  }

  if (workflow === "improvedraft") {
    return "improveDraft";
  }

  if (workflow === "improvereplydraft") {
    return "improveReplyDraft";
  }

  if (workflow === "translate") {
    return "translate";
  }

  return "replyDraft";
}

function getWorkflowLabel(workflow: Workflow): string {
  if (workflow === "replyDraft") {
    return "Draft reply";
  }

  if (workflow === "improveDraft") {
    return "Improve draft";
  }

  if (workflow === "improveReplyDraft") {
    return "Improve reply draft";
  }

  return "Translate";
}

export default function App(props: AppProps) {
  const { title, isOfficeInitialized } = props;

  const hostMode = React.useMemo(() => detectHostMode(), []);
  const preferredScope = React.useMemo(() => detectScopePreference(), []);
  const initialConfig = React.useMemo(() => loadInitialConfig(), []);
  const [workflow, setWorkflow] = React.useState<Workflow>(() => detectInitialWorkflow(hostMode));
  const [config, setConfig] = React.useState<AiServiceConfig>(initialConfig);
  const [isConfigVisible, setIsConfigVisible] = React.useState<boolean>(
    () => validateAiServiceConfig(initialConfig) !== null
  );
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = React.useState<boolean>(false);
  const [modelListError, setModelListError] = React.useState<string>("");
  const [modelListInfo, setModelListInfo] = React.useState<string>("");
  const modelListEndpointPreview = React.useMemo(() => {
    try {
      return getModelListEndpoint(config.endpoint || "https://example.com/v1/chat/completions");
    } catch {
      return "Enter a valid endpoint URL to preview model list URL.";
    }
  }, [config.endpoint]);
  const tokenRefreshEndpointPreview = React.useMemo(() => {
    try {
      return getTokenRefreshEndpoint(config.endpoint || "https://example.com/v1/chat/completions");
    } catch {
      return "Enter a valid endpoint URL to preview token refresh URL.";
    }
  }, [config.endpoint]);
  const [tone, setTone] = React.useState<ToneOption>("neutral");
  const [formality, setFormality] = React.useState<FormalityOption>("balanced");
  const [length, setLength] = React.useState<LengthOption>("medium");
  const [direction, setDirection] = React.useState<string>("");
  const [targetLanguage, setTargetLanguage] = React.useState<SupportedLanguage>("English");
  const [resultText, setResultText] = React.useState<string>("");
  const [statusText, setStatusText] = React.useState<string>("");
  const [errorText, setErrorText] = React.useState<string>("");
  const [debugLog, setDebugLog] = React.useState<string[]>([]);
  const [isDebugVisible, setIsDebugVisible] = React.useState<boolean>(false);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = React.useState<boolean>(false);
  const [isCheckingApi, setIsCheckingApi] = React.useState<boolean>(false);
  const isConfigReady = validateAiServiceConfig(config) === null;

  if (!isOfficeInitialized) {
    return (
      <Progress
        title={title}
        logo={require("./../../../assets/logo-filled.png")}
        message="Please sideload your add-in to see app body."
      />
    );
  }

  const setError = (message: string) => {
    setStatusText("");
    setErrorText(message);
  };

  const setStatus = (message: string) => {
    setErrorText("");
    setStatusText(message);
  };

  const appendDebugLog = (title: string, detailObject?: unknown) => {
    const timestamp = new Date().toISOString();
    const detail = detailObject ? `\n${JSON.stringify(detailObject, null, 2)}` : "";
    const entry = `[${timestamp}] ${title}${detail}`;
    setDebugLog((previous) => [entry, ...previous].slice(0, 50));
  };

  const logError = (context: string, error: unknown) => {
    if (isAiClientError(error)) {
      appendDebugLog(`${context}: ${error.message}`, error.details);
      return;
    }

    if (error instanceof Error) {
      appendDebugLog(`${context}: ${error.message}`, { stack: error.stack });
      return;
    }

    appendDebugLog(`${context}: non-error thrown`, { value: String(error) });
  };

  const runAi = async (messages: { role: "system" | "user" | "assistant"; content: string }[]) => {
    const validationError = validateAiServiceConfig(config);
    if (validationError) {
      setIsConfigVisible(true);
      throw new Error(validationError);
    }

    return createChatCompletion(config, messages);
  };

  const onRefreshModels = React.useCallback(async () => {
    try {
      setModelListError("");
      setModelListInfo("");

      if (!config.endpoint.trim()) {
        setModelListError("Set endpoint first to fetch models.");
        return;
      }

      if (!config.umsToken.trim()) {
        setModelListError("Set UMS token first to fetch models.");
        return;
      }

      setIsLoadingModels(true);
      const models = await listAvailableModels(config);
      setAvailableModels(models);
      setModelListInfo(`Loaded ${models.length} models from API.`);
    } catch (error) {
      logError("Model list fetch failed", error);
      setAvailableModels([]);
      setModelListError((error as Error).message);
    } finally {
      setIsLoadingModels(false);
    }
  }, [config, logError]);

  const onCheckApiAndRefreshToken = React.useCallback(async () => {
    try {
      setModelListError("");
      setModelListInfo("");

      if (!config.endpoint.trim()) {
        throw new Error("Set endpoint first to check API.");
      }

      if (!config.umsToken.trim()) {
        throw new Error("Set UMS token first to check API.");
      }

      setIsCheckingApi(true);
      await refreshAccessToken(config, true);
      const models = await listAvailableModels(config);
      setAvailableModels(models);
      setModelListInfo(`API check succeeded. Token refreshed and ${models.length} models loaded.`);
      setStatus("API check succeeded and access token was refreshed.");
    } catch (error) {
      logError("API check failed", error);
      setModelListError((error as Error).message);
      setError((error as Error).message);
    } finally {
      setIsCheckingApi(false);
    }
  }, [config, logError]);

  const onSaveConfig = async () => {
    try {
      setIsSavingConfig(true);
      const validationError = validateAiServiceConfig(config);
      if (validationError) {
        throw new Error(validationError);
      }

      await saveAiServiceConfig(config);
      setStatus("Configuration saved.");
      await onRefreshModels();
      setIsConfigVisible(false);
    } catch (error) {
      logError("Configuration save failed", error);
      setError((error as Error).message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const onRunWorkflow = async () => {
    setErrorText("");
    setStatusText("");

    try {
      setIsLoading(true);

      if (workflow === "replyDraft") {
        if (!direction.trim()) {
          throw new Error("Direction is required for reply drafting.");
        }

        const bodyText = await getCurrentBodyText();
        const replyContext = splitDraftAndThread(bodyText);
        const threadText = replyContext.threadText || bodyText;

        if (!threadText.trim()) {
          throw new Error("Could not find a thread context to reply to.");
        }

        const output = await runAi(buildReplyDraftMessages(threadText, direction.trim(), tone, formality, length));
        setResultText(output);
        setStatus("Reply draft generated.");
      }

      if (workflow === "improveDraft") {
        if (preferredScope === "selection") {
          const selectedText = await getSelectedTextOrEmpty();
          if (selectedText.trim()) {
            const output = await runAi(buildImproveDraftMessages(selectedText, tone, formality, length));
            setResultText(output);
            setStatus("Selected text improved.");
            return;
          }
        }

        const bodyText = await getCurrentBodyText();
        const replyContext = splitDraftAndThread(bodyText);
        const draftText = replyContext.draftText || bodyText;

        if (!draftText.trim()) {
          throw new Error("No draft text found to improve.");
        }

        const output = await runAi(buildImproveDraftMessages(draftText, tone, formality, length));
        setResultText(output);
        setStatus("Draft improved.");
      }

      if (workflow === "improveReplyDraft") {
        const composeType = await getComposeTypeOrUnknown();
        const bodyText = await getCurrentBodyText();
        const replyContext = splitDraftAndThread(bodyText);
        const draftText = replyContext.draftText || "";
        const threadText = replyContext.threadText || bodyText;

        if (!draftText.trim()) {
          throw new Error("No reply draft text found. Add some draft text first.");
        }

        if (!threadText.trim()) {
          throw new Error("Could not detect referenced thread text for reply optimization.");
        }

        const output = await runAi(buildImproveReplyMessages(draftText, threadText, tone, formality, length));
        setResultText(output);
        if (composeType.toLowerCase().includes("reply") || replyContext.threadText) {
          setStatus("Reply draft improved with thread style context.");
        } else {
          setStatus("Reply-style draft improvement completed.");
        }
      }

      if (workflow === "translate") {
        let sourceText = await getCurrentBodyText();
        let usedSelection = false;

        if (preferredScope === "selection") {
          const selectedText = await getSelectedTextOrEmpty();
          if (selectedText.trim()) {
            sourceText = selectedText;
            usedSelection = true;
          }
        }

        if (!sourceText.trim()) {
          throw new Error("No email content found to translate.");
        }

        const output = await runAi(buildTranslationMessages(sourceText, targetLanguage));
        setResultText(output);
        setStatus(usedSelection ? `Selection translated to ${targetLanguage}.` : `Translation to ${targetLanguage} completed.`);
      }
    } catch (error) {
      logError(`Workflow ${workflow} failed`, error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const onApplyToDraft = async () => {
    try {
      if (!resultText.trim()) {
        throw new Error("No generated result is available to apply.");
      }

      if (hostMode !== "compose") {
        throw new Error("Apply action is available only in compose mode.");
      }

      if (workflow === "improveReplyDraft" || workflow === "replyDraft") {
        const originalBody = await getCurrentBodyText();
        const replyContext = splitDraftAndThread(originalBody);
        const combined = replyContext.threadText ? `${resultText}\n\n${replyContext.threadText}` : resultText;
        await setComposeBodyText(combined);
      } else {
        await setComposeBodyText(resultText);
      }

      setStatus("Draft body updated.");
    } catch (error) {
      logError("Apply to draft failed", error);
      setError((error as Error).message);
    }
  };

  const onInsertAtCursor = async () => {
    try {
      if (!resultText.trim()) {
        throw new Error("No generated result is available to insert.");
      }

      if (hostMode !== "compose") {
        throw new Error("Insert action is available only in compose mode.");
      }

      await insertTextAtCursor(resultText);
      setStatus("Result inserted at cursor.");
    } catch (error) {
      logError("Insert at cursor failed", error);
      setError((error as Error).message);
    }
  };

  return (
    <div className="ms-welcome">
      <main className="ms-welcome__main">
        <div className="taskpane-heading-row">
          <h2 className="ms-font-xl ms-fontWeight-semilight ms-fontColor-neutralPrimary">Outlook AI Assistant</h2>
          <DefaultButton onClick={() => setIsConfigVisible(!isConfigVisible)}>
            {isConfigVisible ? "Hide configuration" : "Configuration"}
          </DefaultButton>
        </div>
        <p className="ms-font-m">Mode: {hostMode === "compose" ? "Compose" : "Read"}</p>
        <p className="taskpane-config-state">
          Configuration status: <b>{isConfigReady ? "Ready" : "Setup required"}</b>
        </p>
        {preferredScope === "selection" && (
          <p className="taskpane-config-state">
            Quick action scope: <b>Selection first</b> (falls back to full draft/message if nothing is selected)
          </p>
        )}

        {isConfigVisible && (
          <div className="taskpane-section taskpane-config">
            <h3>AI Service Configuration</h3>
            <TextField
              label="Chat completions endpoint"
              value={config.endpoint}
              placeholder="https://internal-ai.example.com/v1/chat/completions"
              onChange={(_ev, value) => setConfig({ ...config, endpoint: value || "" })}
            />
            <TextField
              label="Model list endpoint"
              value={modelListEndpointPreview}
              readOnly
            />
            <TextField
              label="Token refresh endpoint"
              value={tokenRefreshEndpointPreview}
              readOnly
            />
            <TextField
              type="password"
              canRevealPassword
              revealPasswordAriaLabel="Show token"
              label="UMS token"
              value={config.umsToken}
              onChange={(_ev, value) => setConfig({ ...config, umsToken: value || "" })}
            />
            <div className="taskpane-actions">
              <DefaultButton onClick={onCheckApiAndRefreshToken} disabled={isCheckingApi}>
                {isCheckingApi ? "Checking API..." : "Check API & refresh token"}
              </DefaultButton>
              <DefaultButton onClick={onRefreshModels} disabled={isLoadingModels}>
                {isLoadingModels ? "Loading models..." : "Refresh model list"}
              </DefaultButton>
            </div>
            <p className="taskpane-config-state">
              Access token is fetched via `/v1/token/refresh` and kept only in memory.
            </p>
            {availableModels.length > 0 && (
              <Dropdown
                label="Available models"
                selectedKey={availableModels.includes(config.model) ? config.model : undefined}
                placeholder="Select a model from API list (optional)"
                options={availableModels.map((modelId) => ({ key: modelId, text: modelId }))}
                onChange={(_ev, option) => option && setConfig({ ...config, model: String(option.key) })}
              />
            )}
            <TextField
              label="Model (custom or selected)"
              value={config.model}
              onChange={(_ev, value) => setConfig({ ...config, model: value || "" })}
            />
            {modelListInfo && (
              <MessageBar messageBarType={MessageBarType.info} isMultiline={false}>
                {modelListInfo}
              </MessageBar>
            )}
            {modelListError && (
              <MessageBar messageBarType={MessageBarType.warning} isMultiline>
                Unable to load model list: {modelListError}. You can still enter a custom model manually.
              </MessageBar>
            )}
            <SpinButton
              label="Temperature"
              min={0}
              max={2}
              step={0.1}
              value={String(config.temperature)}
              onValidate={(value) => {
                const parsed = parseFloat(value || "0");
                const normalized = Number.isNaN(parsed) ? 0.4 : Math.max(0, Math.min(2, parsed));
                setConfig({ ...config, temperature: normalized });
                return normalized.toFixed(1);
              }}
            />
            <div className="taskpane-actions">
              <PrimaryButton onClick={onSaveConfig} disabled={isSavingConfig}>
                Save configuration
              </PrimaryButton>
              <DefaultButton onClick={() => setIsConfigVisible(false)}>Close</DefaultButton>
            </div>
          </div>
        )}

        {!isConfigVisible && !isConfigReady && (
          <MessageBar messageBarType={MessageBarType.warning} isMultiline={false}>
            AI configuration is incomplete. Open Configuration to continue.
          </MessageBar>
        )}

        <div className="taskpane-section">
          <h3>Workflow</h3>
          {hostMode === "compose" && (
            <Dropdown
              label="Choose action"
              selectedKey={workflow}
              options={[
                { key: "replyDraft", text: "Draft reply from thread + direction" },
                { key: "improveDraft", text: "Improve current draft" },
                { key: "improveReplyDraft", text: "Improve current reply draft (thread-aware)" },
                { key: "translate", text: "Translate current draft" },
              ]}
              onChange={(_ev, option) => option && setWorkflow(option.key as Workflow)}
            />
          )}

          {hostMode === "read" && (
            <Dropdown
              label="Choose action"
              selectedKey={workflow}
              options={[{ key: "translate", text: "Translate received email" }]}
              onChange={(_ev, option) => option && setWorkflow(option.key as Workflow)}
            />
          )}

          {workflow === "replyDraft" && (
            <TextField
              multiline
              rows={4}
              label="Direction for reply"
              placeholder="Example: confirm timeline, ask for final numbers by Friday, and keep the tone polite"
              value={direction}
              onChange={(_ev, value) => setDirection(value || "")}
            />
          )}

          {(workflow === "replyDraft" || workflow === "improveDraft" || workflow === "improveReplyDraft") && (
            <>
              <Dropdown
                label="Tone"
                selectedKey={tone}
                options={toneOptions}
                onChange={(_ev, option) => option && setTone(option.key as ToneOption)}
              />
              <Dropdown
                label="Formality"
                selectedKey={formality}
                options={formalityOptions}
                onChange={(_ev, option) => option && setFormality(option.key as FormalityOption)}
              />
              <Dropdown
                label="Length"
                selectedKey={length}
                options={lengthOptions}
                onChange={(_ev, option) => option && setLength(option.key as LengthOption)}
              />
            </>
          )}

          {workflow === "translate" && (
            <Dropdown
              label="Target language"
              selectedKey={targetLanguage}
              options={languageOptions}
              onChange={(_ev, option) => option && setTargetLanguage(option.key as SupportedLanguage)}
            />
          )}

          <PrimaryButton onClick={onRunWorkflow} disabled={isLoading}>
            Run {getWorkflowLabel(workflow)}
          </PrimaryButton>
        </div>

        {isLoading && <Progress title="Loading" message="The AI service is processing your request..." />}

        {statusText && (
          <MessageBar messageBarType={MessageBarType.success} isMultiline>
            {statusText}
          </MessageBar>
        )}

        {errorText && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {errorText} (open Debug log for technical details)
          </MessageBar>
        )}

        <div className="taskpane-section">
          <div className="taskpane-heading-row">
            <h3>Debug log</h3>
            <div className="taskpane-actions">
              <DefaultButton onClick={() => setIsDebugVisible(!isDebugVisible)}>
                {isDebugVisible ? "Hide" : "Show"}
              </DefaultButton>
              <DefaultButton onClick={() => setDebugLog([])} disabled={debugLog.length === 0}>
                Clear
              </DefaultButton>
            </div>
          </div>
          {isDebugVisible && (
            <TextField
              multiline
              rows={10}
              value={debugLog.length > 0 ? debugLog.join("\n\n-----\n\n") : "No log entries yet."}
              readOnly
            />
          )}
        </div>

        <div className="taskpane-section">
          <h3>Result</h3>
          <TextField
            multiline
            rows={12}
            value={resultText}
            onChange={(_ev, value) => setResultText(value || "")}
            placeholder="Generated result will appear here"
          />
          {hostMode === "compose" && (
            <div className="taskpane-actions">
              <PrimaryButton onClick={onApplyToDraft} disabled={!resultText.trim()}>
                Replace draft with result
              </PrimaryButton>
              <DefaultButton onClick={onInsertAtCursor} disabled={!resultText.trim()}>
                Insert result at cursor
              </DefaultButton>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
