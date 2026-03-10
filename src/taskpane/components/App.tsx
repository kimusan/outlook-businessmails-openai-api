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
import { createChatCompletion } from "../../shared/aiClient";

export interface AppProps {
  title: string;
  isOfficeInitialized: boolean;
}

type HostMode = "compose" | "read";
type Workflow = "replyDraft" | "improveDraft" | "improveReplyDraft" | "translate";

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
  const [workflow, setWorkflow] = React.useState<Workflow>(hostMode === "compose" ? "replyDraft" : "translate");
  const [config, setConfig] = React.useState<AiServiceConfig>(() => ({ ...DEFAULT_AI_CONFIG, ...loadAiServiceConfig() }));
  const [tone, setTone] = React.useState<ToneOption>("neutral");
  const [formality, setFormality] = React.useState<FormalityOption>("balanced");
  const [length, setLength] = React.useState<LengthOption>("medium");
  const [direction, setDirection] = React.useState<string>("");
  const [targetLanguage, setTargetLanguage] = React.useState<SupportedLanguage>("English");
  const [resultText, setResultText] = React.useState<string>("");
  const [statusText, setStatusText] = React.useState<string>("");
  const [errorText, setErrorText] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = React.useState<boolean>(false);

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

  const runAi = async (messages: { role: "system" | "user" | "assistant"; content: string }[]) => {
    const validationError = validateAiServiceConfig(config);
    if (validationError) {
      throw new Error(validationError);
    }

    return createChatCompletion(config, messages);
  };

  const onSaveConfig = async () => {
    try {
      setIsSavingConfig(true);
      const validationError = validateAiServiceConfig(config);
      if (validationError) {
        throw new Error(validationError);
      }

      await saveAiServiceConfig(config);
      setStatus("Configuration saved.");
    } catch (error) {
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
        const bodyText = await getCurrentBodyText();
        if (!bodyText.trim()) {
          throw new Error("No email content found to translate.");
        }

        const output = await runAi(buildTranslationMessages(bodyText, targetLanguage));
        setResultText(output);
        setStatus(`Translation to ${targetLanguage} completed.`);
      }
    } catch (error) {
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
      setError((error as Error).message);
    }
  };

  return (
    <div className="ms-welcome">
      <main className="ms-welcome__main">
        <h2 className="ms-font-xl ms-fontWeight-semilight ms-fontColor-neutralPrimary">Outlook AI Assistant</h2>
        <p className="ms-font-m">Mode: {hostMode === "compose" ? "Compose" : "Read"}</p>

        <div className="taskpane-section taskpane-config">
          <h3>AI Service Configuration</h3>
          <TextField
            label="Chat completions endpoint"
            value={config.endpoint}
            placeholder="https://internal-ai.example.com/v1/chat/completions"
            onChange={(_ev, value) => setConfig({ ...config, endpoint: value || "" })}
          />
          <TextField
            label="Model"
            value={config.model}
            onChange={(_ev, value) => setConfig({ ...config, model: value || "" })}
          />
          <Dropdown
            label="Authentication mode"
            selectedKey={config.authMode}
            options={[
              { key: "bearer", text: "Bearer token (Authorization header)" },
              { key: "customHeader", text: "Custom header" },
              { key: "none", text: "None" },
            ]}
            onChange={(_ev, option) => {
              if (!option) {
                return;
              }

              setConfig({ ...config, authMode: option.key as "bearer" | "customHeader" | "none" });
            }}
          />
          {config.authMode !== "none" && (
            <TextField
              type="password"
              canRevealPassword
              revealPasswordAriaLabel="Show password"
              label="API key"
              value={config.apiKey}
              onChange={(_ev, value) => setConfig({ ...config, apiKey: value || "" })}
            />
          )}
          {config.authMode === "customHeader" && (
            <TextField
              label="API key header name"
              value={config.apiKeyHeader}
              onChange={(_ev, value) => setConfig({ ...config, apiKeyHeader: value || "" })}
            />
          )}
          {(config.authMode === "bearer" || config.authMode === "customHeader") && (
            <TextField
              label="Optional API key prefix"
              value={config.apiKeyPrefix}
              placeholder="Example: Token"
              onChange={(_ev, value) => setConfig({ ...config, apiKeyPrefix: value || "" })}
            />
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
          <PrimaryButton onClick={onSaveConfig} disabled={isSavingConfig}>
            Save configuration
          </PrimaryButton>
        </div>

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
            {errorText}
          </MessageBar>
        )}

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
