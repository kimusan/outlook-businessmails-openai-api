/* global require, Office, window, navigator */

import * as React from "react";
import {
  DefaultButton,
  Dialog,
  DialogFooter,
  DialogType,
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
  buildChatMessages,
  buildImproveDraftMessages,
  buildImproveReplyMessages,
  buildReplyDraftMessages,
  buildSummaryMessages,
  buildTranslationMessages,
  DEFAULT_PROMPT_TEMPLATES,
  FormalityOption,
  LengthOption,
  PROMPT_TEMPLATE_DEFINITIONS,
  PromptTemplateKey,
  SupportedLanguage,
  ToneOption,
} from "../../shared/promptBuilders";
import {
  AuthMode,
  AiServiceConfig,
  DEFAULT_AI_CONFIG,
  loadAiServiceConfig,
  saveAiServiceConfig,
  validateAiServiceConfig,
} from "../../shared/aiConfig";
import {
  createChatCompletion,
  getChatCompletionEndpoint,
  getModelListEndpoint,
  getTokenRefreshEndpoint,
  isAiClientError,
  listAvailableModels,
  refreshAccessToken,
} from "../../shared/aiClient";
import {
  ResultDialogOutgoingMessage,
  ResultDialogPayload,
} from "../../shared/dialogMessages";
import { formatStructuredTextAsHtml } from "../../shared/richText";

export interface AppProps {
  title: string;
  isOfficeInitialized: boolean;
}

type HostMode = "compose" | "read";
type Workflow = "replyDraft" | "improveDraft" | "improveReplyDraft" | "translate" | "summary";
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
  const action = (url.searchParams.get("action") || "").toLowerCase();

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

  if (workflow === "summary") {
    return "summary";
  }

  if (hostMode === "read") {
    return action === "summary" ? "summary" : "translate";
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

  if (workflow === "summary") {
    return "Summarize";
  }

  return "Translate";
}

function parseDialogMessage(raw: string): ResultDialogOutgoingMessage | null {
  try {
    const parsed = JSON.parse(raw) as ResultDialogOutgoingMessage;
    if (parsed.type === "ready" || parsed.type === "close") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function createDialogPayload(
  title: string,
  workflowLabel: string,
  language: string,
  text: string
): ResultDialogPayload {
  return {
    type: "resultPayload",
    title,
    workflow: workflowLabel,
    language,
    generatedAt: new Date().toISOString(),
    text,
  };
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
  const [tone, setTone] = React.useState<ToneOption>("neutral");
  const [formality, setFormality] = React.useState<FormalityOption>("balanced");
  const [length, setLength] = React.useState<LengthOption>("medium");
  const [direction, setDirection] = React.useState<string>("");
  const [targetLanguage, setTargetLanguage] = React.useState<SupportedLanguage>(
    initialConfig.preferredLanguage
  );
  const [resultText, setResultText] = React.useState<string>("");
  const [latestPayload, setLatestPayload] = React.useState<ResultDialogPayload | null>(null);
  const [statusText, setStatusText] = React.useState<string>("");
  const [errorText, setErrorText] = React.useState<string>("");
  const [debugLog, setDebugLog] = React.useState<string[]>([]);
  const [isDebugVisible, setIsDebugVisible] = React.useState<boolean>(false);
  const [isPromptEditorVisible, setIsPromptEditorVisible] = React.useState<boolean>(false);
  const [selectedPromptTemplateKey, setSelectedPromptTemplateKey] = React.useState<PromptTemplateKey>(
    "replyDraftSystem"
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = React.useState<boolean>(false);
  const [isCheckingApi, setIsCheckingApi] = React.useState<boolean>(false);
  const [chatQuestion, setChatQuestion] = React.useState<string>("");
  const [chatResponse, setChatResponse] = React.useState<string>("");
  const [isChatLoading, setIsChatLoading] = React.useState<boolean>(false);
  const dialogRef = React.useRef<Office.Dialog | null>(null);
  const isConfigReady = validateAiServiceConfig(config) === null;

  const chatCompletionsEndpointPreview = React.useMemo(() => {
    try {
      return getChatCompletionEndpoint(config);
    } catch {
      return "Enter a valid base URI and chat path.";
    }
  }, [config]);

  const modelListEndpointPreview = React.useMemo(() => {
    try {
      return getModelListEndpoint(config);
    } catch {
      return "Enter a valid base URI and model list path.";
    }
  }, [config]);

  const tokenRefreshEndpointPreview = React.useMemo(() => {
    try {
      return getTokenRefreshEndpoint(config);
    } catch {
      return "Enter a valid base URI and token refresh path.";
    }
  }, [config]);

  const selectedPromptTemplateDefinition = React.useMemo(
    () =>
      PROMPT_TEMPLATE_DEFINITIONS.find((definition) => definition.key === selectedPromptTemplateKey) ||
      PROMPT_TEMPLATE_DEFINITIONS[0],
    [selectedPromptTemplateKey]
  );

  React.useEffect(() => {
    setTargetLanguage(config.preferredLanguage);
  }, [config.preferredLanguage]);

  React.useEffect(() => {
    return () => {
      if (dialogRef.current) {
        try {
          dialogRef.current.close();
        } catch {
          // Ignore close errors during unload.
        }
      }
    };
  }, []);

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

  const appendDebugLog = (entryTitle: string, detailObject?: unknown) => {
    const timestamp = new Date().toISOString();
    const detail = detailObject ? `\n${JSON.stringify(detailObject, null, 2)}` : "";
    const entry = `[${timestamp}] ${entryTitle}${detail}`;
    setDebugLog((previous) => [entry, ...previous].slice(0, 80));
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

  const resolveWorkflowSourceText = async (
    trySelectionFirst: boolean
  ): Promise<{ text: string; usedSelection: boolean }> => {
    if (trySelectionFirst) {
      const selectedText = await getSelectedTextOrEmpty();
      appendDebugLog("Selection probe", {
        chars: selectedText.trim().length,
        preview: selectedText.trim().slice(0, 120),
      });

      if (selectedText.trim()) {
        return { text: selectedText, usedSelection: true };
      }
    }

    const bodyText = await getCurrentBodyText();
    return { text: bodyText, usedSelection: false };
  };

  const getResultDialogUrl = () => {
    const currentUrl = new URL(window.location.href);
    const cacheBust = currentUrl.searchParams.get("cb");
    const dialogUrl = new URL(currentUrl.origin);
    dialogUrl.pathname = "/result-dialog.html";
    dialogUrl.search = "";

    if (cacheBust) {
      dialogUrl.searchParams.set("cb", cacheBust);
    }

    return dialogUrl.toString();
  };

  const postResultToDialog = (payload: ResultDialogPayload) => {
    if (!dialogRef.current) {
      return;
    }

    try {
      dialogRef.current.messageChild(JSON.stringify(payload));
    } catch (error) {
      logError("Dialog message send failed", error);
    }
  };

  const openOrUpdateResultDialog = async (payload: ResultDialogPayload) => {
    if (!Office.context || !Office.context.ui || typeof Office.context.ui.displayDialogAsync !== "function") {
      throw new Error("Outlook dialog API is unavailable in this client.");
    }

    if (dialogRef.current) {
      postResultToDialog(payload);
      return;
    }

    const url = getResultDialogUrl();
    appendDebugLog("Opening result dialog", { url });

    await new Promise<void>((resolve, reject) => {
      Office.context.ui.displayDialogAsync(
        url,
        { width: 72, height: 86, displayInIframe: true },
        (asyncResult) => {
          if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
            const resultError = asyncResult.error as { message?: string; error?: number };
            const errorMessage =
              resultError.message || `Dialog API error code: ${String(resultError.error ?? "unknown")}`;
            reject(new Error(errorMessage));
            return;
          }

          const dialog = asyncResult.value;
          dialogRef.current = dialog;

          dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
            if (dialogRef.current === dialog) {
              dialogRef.current = null;
            }
          });

          dialog.addEventHandler(Office.EventType.DialogMessageReceived, (eventArgs) => {
            const messageEvent = eventArgs as { message: string };
            const message = parseDialogMessage(messageEvent.message);
            if (!message) {
              return;
            }

            if (message.type === "ready") {
              postResultToDialog(payload);
              return;
            }

            if (message.type === "close") {
              try {
                dialog.close();
              } catch {
                // Ignore close errors.
              }
            }
          });

          // Safety send in case the ready message is delayed.
          window.setTimeout(() => postResultToDialog(payload), 250);
          resolve();
        }
      );
    });
  };

  const presentResult = async (payload: ResultDialogPayload): Promise<void> => {
    setResultText(payload.text);
    setLatestPayload(payload);
    await openOrUpdateResultDialog(payload);
  };

  const onRefreshModels = React.useCallback(async () => {
    try {
      setModelListError("");
      setModelListInfo("");

      if (!config.baseUri.trim()) {
        setModelListError("Set base URI first to fetch models.");
        return;
      }

      if (config.authMode === "umsToken" && !config.umsToken.trim()) {
        setModelListError("Set UMS token first to fetch models.");
        return;
      }

      if (config.authMode === "apiKey" && !config.apiKey.trim()) {
        setModelListError("Set API key first to fetch models.");
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
  }, [config]);

  const onCheckApiAndRefreshToken = React.useCallback(async () => {
    try {
      setModelListError("");
      setModelListInfo("");

      if (!config.baseUri.trim()) {
        throw new Error("Set base URI first to check API.");
      }

      setIsCheckingApi(true);

      if (config.authMode === "umsToken") {
        if (!config.umsToken.trim()) {
          throw new Error("Set UMS token first to check API.");
        }

        await refreshAccessToken(config, true);
        setModelListInfo("API check succeeded and access token was refreshed.");
        setStatus("API check succeeded and access token was refreshed.");
      } else {
        if (!config.apiKey.trim()) {
          throw new Error("Set API key first to check API.");
        }

        await listAvailableModels(config);
        setModelListInfo("API check succeeded with direct API key.");
        setStatus("API check succeeded with direct API key.");
      }
    } catch (error) {
      logError("API check failed", error);
      setModelListError((error as Error).message);
      setError((error as Error).message);
    } finally {
      setIsCheckingApi(false);
    }
  }, [config]);

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

  const onUpdatePromptTemplate = (key: PromptTemplateKey, value: string) => {
    setConfig((previous) => ({
      ...previous,
      promptTemplates: {
        ...previous.promptTemplates,
        [key]: value,
      },
    }));
  };

  const onResetSelectedPromptTemplate = () => {
    const defaultValue = DEFAULT_PROMPT_TEMPLATES[selectedPromptTemplateKey];
    onUpdatePromptTemplate(selectedPromptTemplateKey, defaultValue);
  };

  const onResetAllPromptTemplates = () => {
    setConfig((previous) => ({
      ...previous,
      promptTemplates: { ...DEFAULT_PROMPT_TEMPLATES },
    }));
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

        const output = await runAi(
          buildReplyDraftMessages(
            threadText,
            direction.trim(),
            tone,
            formality,
            length,
            config.promptTemplates
          )
        );
        await presentResult(createDialogPayload("Generated reply draft", getWorkflowLabel(workflow), "Original", output));
        setStatus("Reply draft generated.");
      }

      if (workflow === "improveDraft") {
        const source = await resolveWorkflowSourceText(true);
        const sourceText = source.usedSelection
          ? source.text
          : splitDraftAndThread(source.text).draftText || source.text;

        if (!sourceText.trim()) {
          throw new Error("No draft text found to improve.");
        }

        const output = await runAi(
          buildImproveDraftMessages(sourceText, tone, formality, length, config.promptTemplates)
        );
        await presentResult(
          createDialogPayload(
            source.usedSelection ? "Improved selected text" : "Improved draft",
            getWorkflowLabel(workflow),
            "Original",
            output
          )
        );
        setStatus(source.usedSelection ? "Selected text improved." : "Draft improved.");
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

        const output = await runAi(
          buildImproveReplyMessages(
            draftText,
            threadText,
            tone,
            formality,
            length,
            config.promptTemplates
          )
        );
        await presentResult(
          createDialogPayload("Improved reply draft", getWorkflowLabel(workflow), "Original", output)
        );
        if (composeType.toLowerCase().includes("reply") || replyContext.threadText) {
          setStatus("Reply draft improved with thread style context.");
        } else {
          setStatus("Reply-style draft improvement completed.");
        }
      }

      if (workflow === "summary") {
        const source = await resolveWorkflowSourceText(true);
        if (!source.text.trim()) {
          throw new Error("No email content found to summarize.");
        }

        const output = await runAi(
          buildSummaryMessages(source.text, config.preferredLanguage, config.promptTemplates)
        );
        await presentResult(
          createDialogPayload(
            source.usedSelection ? "Summary of selected text" : "Summary of email",
            getWorkflowLabel(workflow),
            config.preferredLanguage,
            output
          )
        );
        setStatus(
          source.usedSelection
            ? `Selection summarized in ${config.preferredLanguage}.`
            : `Email summarized in ${config.preferredLanguage}.`
        );
      }

      if (workflow === "translate") {
        const source = await resolveWorkflowSourceText(true);
        if (!source.text.trim()) {
          throw new Error("No email content found to translate.");
        }

        const output = await runAi(
          buildTranslationMessages(source.text, targetLanguage, config.promptTemplates)
        );
        await presentResult(
          createDialogPayload(
            source.usedSelection ? "Translation of selected text" : "Translation of email",
            getWorkflowLabel(workflow),
            targetLanguage,
            output
          )
        );
        setStatus(
          source.usedSelection
            ? `Selection translated to ${targetLanguage}.`
            : `Translation to ${targetLanguage} completed.`
        );
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

  const onOpenResultWindow = async () => {
    try {
      if (!latestPayload) {
        throw new Error("No generated result is available.");
      }

      await openOrUpdateResultDialog(latestPayload);
    } catch (error) {
      logError("Opening result window failed", error);
      setError((error as Error).message);
    }
  };

  const onCopyLatestResult = async () => {
    try {
      if (!resultText.trim()) {
        throw new Error("No generated result is available.");
      }

      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("Clipboard API is unavailable in this client.");
      }

      await navigator.clipboard.writeText(resultText);
      setStatus("Result copied to clipboard.");
    } catch (error) {
      logError("Copy result failed", error);
      setError((error as Error).message);
    }
  };

  const onAskChat = async () => {
    try {
      if (!chatQuestion.trim()) {
        throw new Error("Enter a question for chat.");
      }

      setIsChatLoading(true);
      const source = await resolveWorkflowSourceText(true);
      const output = await runAi(
        buildChatMessages(
          source.text,
          resultText,
          chatQuestion.trim(),
          config.preferredLanguage,
          config.promptTemplates
        )
      );

      setChatResponse(output);
      setStatus(source.usedSelection ? "Chat response ready (selection context)." : "Chat response ready.");
    } catch (error) {
      logError("Chat failed", error);
      setError((error as Error).message);
    } finally {
      setIsChatLoading(false);
    }
  };

  const dialogMessageReady = latestPayload ? `${latestPayload.workflow} | ${latestPayload.language}` : "No result yet";

  return (
    <div className="ms-welcome">
      <main className="ms-welcome__main">
        <div className="taskpane-heading-row">
          <h2 className="ms-font-xl ms-fontWeight-semilight ms-fontColor-neutralPrimary">
            Outlook AI Assistant
          </h2>
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
            Quick action scope: <b>Selection first</b> (falls back to full draft/message if nothing
            is selected)
          </p>
        )}

        {isConfigVisible && (
          <div className="taskpane-section taskpane-config">
            <h3>AI Service Configuration</h3>
            <TextField
              label="Base URI"
              value={config.baseUri}
              placeholder="https://internal-ai.example.com"
              onChange={(_ev, value) => setConfig({ ...config, baseUri: value || "" })}
            />
            <p className="taskpane-config-state">Use everything before `/v1/` as base URI.</p>
            <TextField
              label="Chat completions path"
              value={config.chatCompletionsPath}
              placeholder="/v1/chat/completions"
              onChange={(_ev, value) => setConfig({ ...config, chatCompletionsPath: value || "" })}
            />
            <TextField label="Resolved chat completions endpoint" value={chatCompletionsEndpointPreview} readOnly />
            <TextField
              label="Model list path"
              value={config.modelListPath}
              placeholder="/v1/model_list"
              onChange={(_ev, value) => setConfig({ ...config, modelListPath: value || "" })}
            />
            <TextField label="Resolved model list endpoint" value={modelListEndpointPreview} readOnly />
            <Dropdown
              label="Authentication mode"
              selectedKey={config.authMode}
              options={[
                { key: "umsToken", text: "UMS token (refresh to access token)" },
                { key: "apiKey", text: "Direct API key" },
              ]}
              onChange={(_ev, option) => {
                if (!option) {
                  return;
                }

                setConfig({ ...config, authMode: option.key as AuthMode });
              }}
            />
            {config.authMode === "umsToken" && (
              <>
                <TextField
                  label="Token refresh path"
                  value={config.tokenRefreshPath}
                  placeholder="/v1/token/refresh"
                  onChange={(_ev, value) => setConfig({ ...config, tokenRefreshPath: value || "" })}
                />
                <TextField label="Resolved token refresh endpoint" value={tokenRefreshEndpointPreview} readOnly />
                <TextField
                  type="password"
                  canRevealPassword
                  revealPasswordAriaLabel="Show token"
                  label="UMS token"
                  value={config.umsToken}
                  onChange={(_ev, value) => setConfig({ ...config, umsToken: value || "" })}
                />
                <p className="taskpane-config-state">UMS tokens are typically 40-50 characters.</p>
              </>
            )}
            {config.authMode === "apiKey" && (
              <>
                <TextField
                  type="password"
                  canRevealPassword
                  revealPasswordAriaLabel="Show API key"
                  label="API key"
                  value={config.apiKey}
                  onChange={(_ev, value) => setConfig({ ...config, apiKey: value || "" })}
                />
                <p className="taskpane-config-state">
                  Direct API keys are typically longer than 50 characters.
                </p>
              </>
            )}
            <Dropdown
              label="Summary/default translation language"
              selectedKey={config.preferredLanguage}
              options={languageOptions}
              onChange={(_ev, option) => {
                if (!option) {
                  return;
                }

                setConfig({ ...config, preferredLanguage: option.key as SupportedLanguage });
              }}
            />
            <div className="taskpane-actions">
              <DefaultButton onClick={onCheckApiAndRefreshToken} disabled={isCheckingApi}>
                {isCheckingApi
                  ? "Checking API..."
                  : config.authMode === "umsToken"
                    ? "Check API & refresh token"
                    : "Check API key"}
              </DefaultButton>
              <DefaultButton onClick={onRefreshModels} disabled={isLoadingModels}>
                {isLoadingModels ? "Loading models..." : "Refresh model list"}
              </DefaultButton>
              <DefaultButton onClick={() => setIsPromptEditorVisible(true)}>
                Edit prompts
              </DefaultButton>
            </div>
            {config.authMode === "umsToken" && (
              <p className="taskpane-config-state">
                Access token is fetched via `/v1/token/refresh` and kept only in memory.
              </p>
            )}
            {config.authMode === "apiKey" && (
              <p className="taskpane-config-state">
                Direct API key is used as bearer token for model and chat requests.
              </p>
            )}
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
                Unable to load model list: {modelListError}. You can still enter a custom model
                manually.
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
              options={[
                { key: "summary", text: "Summarize selected text/message" },
                { key: "translate", text: "Translate selected text/message" },
              ]}
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
            <h3>Latest result</h3>
            <div className="taskpane-actions">
              <DefaultButton onClick={onOpenResultWindow} disabled={!latestPayload}>
                Open large window
              </DefaultButton>
              <DefaultButton onClick={onCopyLatestResult} disabled={!resultText.trim()}>
                Copy
              </DefaultButton>
            </div>
          </div>
          <p className="taskpane-config-state">Status: {dialogMessageReady}</p>
          <div className="taskpane-markup-preview">
            <div
              className="taskpane-markup"
              dangerouslySetInnerHTML={{
                __html: formatStructuredTextAsHtml(resultText || "No generated result yet."),
              }}
            />
          </div>
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

        <div className="taskpane-section">
          <h3>Chat with AI</h3>
          <TextField
            multiline
            rows={4}
            label="Ask a question about this email"
            placeholder="Example: What are the top 3 unresolved actions and who owns each?"
            value={chatQuestion}
            onChange={(_ev, value) => setChatQuestion(value || "")}
          />
          <div className="taskpane-actions">
            <PrimaryButton onClick={onAskChat} disabled={isChatLoading}>
              {isChatLoading ? "Asking..." : "Ask AI"}
            </PrimaryButton>
          </div>
          <div className="taskpane-markup-chat">
            <div
              className="taskpane-markup"
              dangerouslySetInnerHTML={{
                __html: formatStructuredTextAsHtml(chatResponse || "Chat response will appear here."),
              }}
            />
          </div>
        </div>

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
              rows={12}
              value={debugLog.length > 0 ? debugLog.join("\n\n-----\n\n") : "No log entries yet."}
              readOnly
            />
          )}
        </div>
      </main>

      <Dialog
        hidden={!isPromptEditorVisible}
        onDismiss={() => setIsPromptEditorVisible(false)}
        dialogContentProps={{
          type: DialogType.largeHeader,
          title: "Prompt templates",
          subText:
            "Edit the prompts used by each workflow. Use placeholders listed below. Changes are saved when you save configuration.",
        }}
        minWidth={820}
        modalProps={{ isBlocking: false }}
      >
        <Dropdown
          label="Template"
          selectedKey={selectedPromptTemplateKey}
          options={PROMPT_TEMPLATE_DEFINITIONS.map((definition) => ({
            key: definition.key,
            text: definition.label,
          }))}
          onChange={(_ev, option) => {
            if (!option) {
              return;
            }

            setSelectedPromptTemplateKey(option.key as PromptTemplateKey);
          }}
        />
        <p className="taskpane-config-state">{selectedPromptTemplateDefinition.description}</p>
        <p className="taskpane-config-state">
          Placeholders:{" "}
          {selectedPromptTemplateDefinition.placeholders.length > 0
            ? selectedPromptTemplateDefinition.placeholders.map((placeholder) => `{{${placeholder}}}`).join(", ")
            : "(none)"}
        </p>
        <TextField
          multiline
          rows={16}
          value={config.promptTemplates[selectedPromptTemplateKey] || ""}
          onChange={(_ev, value) => onUpdatePromptTemplate(selectedPromptTemplateKey, value || "")}
        />
        <DialogFooter>
          <DefaultButton onClick={onResetSelectedPromptTemplate}>Reset selected</DefaultButton>
          <DefaultButton onClick={onResetAllPromptTemplates}>Reset all</DefaultButton>
          <PrimaryButton onClick={() => setIsPromptEditorVisible(false)} text="Done" />
        </DialogFooter>
      </Dialog>
    </div>
  );
}
