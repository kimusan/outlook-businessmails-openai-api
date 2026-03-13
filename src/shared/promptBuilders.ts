import type { ChatMessage } from "./aiClient";
import { limitWords } from "./outlookContext";

export type ToneOption = "neutral" | "friendly" | "formal" | "concise";
export type FormalityOption = "balanced" | "informal" | "formal";
export type LengthOption = "short" | "medium" | "long";
export type SupportedLanguage = "English" | "Korean" | "Danish";

export type PromptTemplateKey =
  | "replyDraftSystem"
  | "replyDraftUser"
  | "improveDraftSystem"
  | "improveDraftUser"
  | "improveReplySystem"
  | "improveReplyUser"
  | "translationSystem"
  | "translationUser"
  | "summarySystem"
  | "summaryUser"
  | "chatSystem"
  | "chatUser";

export type PromptTemplates = Record<PromptTemplateKey, string>;

export interface PromptTemplateDefinition {
  key: PromptTemplateKey;
  label: string;
  description: string;
  placeholders: string[];
}

export const PROMPT_TEMPLATE_DEFINITIONS: PromptTemplateDefinition[] = [
  {
    key: "replyDraftSystem",
    label: "Reply draft - system",
    description: "High-level behavior for drafting replies.",
    placeholders: [],
  },
  {
    key: "replyDraftUser",
    label: "Reply draft - user",
    description: "Instructions and context for generating a reply draft.",
    placeholders: ["style", "direction", "thread"],
  },
  {
    key: "improveDraftSystem",
    label: "Improve draft - system",
    description: "High-level behavior for improving a regular draft.",
    placeholders: [],
  },
  {
    key: "improveDraftUser",
    label: "Improve draft - user",
    description: "Instructions and source text for draft improvement.",
    placeholders: ["style", "draft"],
  },
  {
    key: "improveReplySystem",
    label: "Improve reply - system",
    description: "High-level behavior for improving a reply draft with thread alignment.",
    placeholders: [],
  },
  {
    key: "improveReplyUser",
    label: "Improve reply - user",
    description: "Instructions and context for reply draft improvement.",
    placeholders: ["style", "draft", "thread"],
  },
  {
    key: "translationSystem",
    label: "Translate - system",
    description: "High-level behavior for translation.",
    placeholders: [],
  },
  {
    key: "translationUser",
    label: "Translate - user",
    description: "Instructions and text for translation.",
    placeholders: ["target_language", "text"],
  },
  {
    key: "summarySystem",
    label: "Summary - system",
    description: "High-level behavior for summarization.",
    placeholders: [],
  },
  {
    key: "summaryUser",
    label: "Summary - user",
    description: "Instructions and source text for summary.",
    placeholders: ["output_language", "text"],
  },
  {
    key: "chatSystem",
    label: "Chat - system",
    description: "High-level behavior for taskpane chat.",
    placeholders: [],
  },
  {
    key: "chatUser",
    label: "Chat - user",
    description: "Instructions and context for chat questions.",
    placeholders: ["output_language", "question", "email_context", "latest_result"],
  },
];

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplates = {
  replyDraftSystem:
    "You are a senior executive email assistant. Write high-quality business replies with strong clarity and judgment. " +
    "Never invent facts, commitments, dates, numbers, or approvals that are not present in the input. " +
    "Output only the final email body as plain text (no subject line, no markdown, no code fences).",
  replyDraftUser:
    "{{style}}\n\n" +
    'User direction: "{{direction}}"\n\n' +
    "Instructions:\n" +
    "- Preserve all factual details from the thread.\n" +
    "- Match the thread language and writing style unless direction explicitly requests otherwise.\n" +
    "- Keep names, organizations, dates, and action items accurate.\n" +
    "- If a critical detail is missing, avoid fabricating and phrase response safely.\n" +
    "- Use a practical email structure: acknowledgment -> core response -> next steps -> polite close.\n\n" +
    "Referenced thread:\n{{thread}}",
  improveDraftSystem:
    "You are an expert business writing editor. Improve language quality without changing intent or facts. " +
    "Do not add new claims, commitments, dates, or decisions. " +
    "Output only the revised email body as plain text.",
  improveDraftUser:
    "{{style}}\n\n" +
    "Edit goals:\n" +
    "- Improve clarity, grammar, flow, and professionalism.\n" +
    "- Keep all key facts, asks, deadlines, and recipients intact.\n" +
    "- Remove redundancy and ambiguity.\n" +
    "- Keep formatting simple and email-ready.\n\n" +
    "Draft to improve:\n{{draft}}",
  improveReplySystem:
    "You are an expert editor for reply emails. Improve quality while preserving original intent and factual correctness. " +
    "Align wording with prior thread context and do not invent information. " +
    "Output only the revised reply body as plain text (no quoted thread).",
  improveReplyUser:
    "{{style}}\n\n" +
    "Instructions:\n" +
    "- Improve the current reply draft.\n" +
    "- Preserve all concrete facts, numbers, dates, and commitments.\n" +
    "- Match language, terminology, and politeness level used in the referenced thread.\n" +
    "- Make asks and next steps explicit.\n\n" +
    "Current reply draft:\n{{draft}}\n\n" +
    "Referenced thread:\n{{thread}}",
  translationSystem:
    "You are a professional translator for business emails (English, Korean, Danish). " +
    "Translate accurately while preserving meaning, intent, and tone. " +
    "Do not omit or add information. Output translation only as plain text.",
  translationUser:
    "Translate the following email content to {{target_language}}.\n\n" +
    "Translation rules:\n" +
    "- Preserve names, numbers, dates, times, URLs, and email addresses exactly.\n" +
    "- Preserve line breaks, bullet structure, and paragraph intent where possible.\n" +
    "- Keep the same level of politeness/professional register.\n" +
    "- Do not include commentary, explanations, or notes.\n\n" +
    "Content:\n{{text}}",
  summarySystem:
    "You are a chief-of-staff style summarization assistant for business email threads. " +
    "Prioritize decision relevance, ownership, deadlines, and risks. " +
    "Return markdown with headings and bullet lists only (no tables).",
  summaryUser:
    "Summarize this email content in {{output_language}}. " +
    "If the content appears to be a thread, include all sections below. " +
    "If it is a single email, still provide the same sections with best-effort details.\n\n" +
    "Use this markdown template and keep section order:\n" +
    "## Participants\n" +
    "### Active participants\n" +
    "- name/email\n" +
    "### Passive participants\n" +
    "- name/email\n\n" +
    "## Executive summary\n" +
    "- 3-6 bullets with key decisions, requests, deadlines, and risks\n\n" +
    "## Detailed timeline (who says what)\n" +
    "- Chronological bullets with speaker attribution and message intent\n" +
    "- Include open questions, unresolved items, and follow-ups\n\n" +
    "Quality rules:\n" +
    "- Do not invent facts.\n" +
    "- Mark uncertainty explicitly as unknown.\n" +
    "- Highlight explicit deadlines and owners when present.\n" +
    "- Keep wording concise and executive-friendly.\n\n" +
    "Email content:\n{{text}}",
  chatSystem:
    "You are an Outlook email copilot. Answer questions using only the provided context and latest generated text. " +
    "If context is insufficient, state what is missing instead of guessing. " +
    "Use concise markdown with short headings/bullets when it improves readability.",
  chatUser:
    "Answer in {{output_language}} unless the question explicitly requests another language.\n" +
    "Prioritize actionable guidance and clear rationale.\n\n" +
    "Question:\n{{question}}\n\n" +
    "Email context:\n{{email_context}}\n\n" +
    "Latest generated result:\n{{latest_result}}",
};

function formatStyle(tone: ToneOption, formality: FormalityOption, length: LengthOption): string {
  const toneInstruction =
    tone === "friendly"
      ? "warm, collaborative, and human"
      : tone === "formal"
        ? "professional and diplomatic"
        : tone === "concise"
          ? "brief and direct with minimal filler"
          : "neutral and clear";
  const formalityInstruction =
    formality === "informal"
      ? "lightly conversational while still business-appropriate"
      : formality === "formal"
        ? "highly professional and polished"
        : "business-neutral";
  const lengthInstruction =
    length === "short"
      ? "short; only key points"
      : length === "long"
        ? "detailed; include rationale and next steps"
        : "medium length; balanced detail";

  return (
    "Style requirements:\n" +
    `- Tone: ${toneInstruction}\n` +
    `- Formality: ${formalityInstruction}\n` +
    `- Length: ${lengthInstruction}`
  );
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => values[key] || "");
}

export function mergePromptTemplates(overrides?: Partial<PromptTemplates> | null): PromptTemplates {
  const merged: PromptTemplates = { ...DEFAULT_PROMPT_TEMPLATES };
  if (!overrides) {
    return merged;
  }

  for (const definition of PROMPT_TEMPLATE_DEFINITIONS) {
    const candidate = overrides[definition.key];
    if (typeof candidate === "string" && candidate.trim()) {
      merged[definition.key] = candidate;
    }
  }

  return merged;
}

export function buildReplyDraftMessages(
  threadText: string,
  direction: string,
  tone: ToneOption,
  formality: FormalityOption,
  length: LengthOption,
  templates?: Partial<PromptTemplates>
): ChatMessage[] {
  const limitedThread = limitWords(threadText, 1200);
  const merged = mergePromptTemplates(templates);

  return [
    {
      role: "system",
      content: merged.replyDraftSystem,
    },
    {
      role: "user",
      content: renderTemplate(merged.replyDraftUser, {
        style: formatStyle(tone, formality, length),
        direction,
        thread: limitedThread,
      }),
    },
  ];
}

export function buildImproveDraftMessages(
  draftText: string,
  tone: ToneOption,
  formality: FormalityOption,
  length: LengthOption,
  templates?: Partial<PromptTemplates>
): ChatMessage[] {
  const limitedDraft = limitWords(draftText, 1000);
  const merged = mergePromptTemplates(templates);

  return [
    {
      role: "system",
      content: merged.improveDraftSystem,
    },
    {
      role: "user",
      content: renderTemplate(merged.improveDraftUser, {
        style: formatStyle(tone, formality, length),
        draft: limitedDraft,
      }),
    },
  ];
}

export function buildImproveReplyMessages(
  draftText: string,
  threadText: string,
  tone: ToneOption,
  formality: FormalityOption,
  length: LengthOption,
  templates?: Partial<PromptTemplates>
): ChatMessage[] {
  const limitedDraft = limitWords(draftText, 800);
  const limitedThread = limitWords(threadText, 1000);
  const merged = mergePromptTemplates(templates);

  return [
    {
      role: "system",
      content: merged.improveReplySystem,
    },
    {
      role: "user",
      content: renderTemplate(merged.improveReplyUser, {
        style: formatStyle(tone, formality, length),
        draft: limitedDraft,
        thread: limitedThread,
      }),
    },
  ];
}

export function buildTranslationMessages(
  text: string,
  targetLanguage: SupportedLanguage,
  templates?: Partial<PromptTemplates>
): ChatMessage[] {
  const limitedText = limitWords(text, 1500);
  const merged = mergePromptTemplates(templates);

  return [
    {
      role: "system",
      content: merged.translationSystem,
    },
    {
      role: "user",
      content: renderTemplate(merged.translationUser, {
        target_language: targetLanguage,
        text: limitedText,
      }),
    },
  ];
}

export function buildSummaryMessages(
  text: string,
  outputLanguage: SupportedLanguage,
  templates?: Partial<PromptTemplates>
): ChatMessage[] {
  const limitedText = limitWords(text, 1800);
  const merged = mergePromptTemplates(templates);

  return [
    {
      role: "system",
      content: merged.summarySystem,
    },
    {
      role: "user",
      content: renderTemplate(merged.summaryUser, {
        output_language: outputLanguage,
        text: limitedText,
      }),
    },
  ];
}

export function buildChatMessages(
  emailContext: string,
  latestResult: string,
  userQuestion: string,
  outputLanguage: SupportedLanguage,
  templates?: Partial<PromptTemplates>
): ChatMessage[] {
  const limitedContext = limitWords(emailContext, 1400);
  const limitedResult = limitWords(latestResult, 700);
  const merged = mergePromptTemplates(templates);

  return [
    {
      role: "system",
      content: merged.chatSystem,
    },
    {
      role: "user",
      content: renderTemplate(merged.chatUser, {
        output_language: outputLanguage,
        question: userQuestion,
        email_context: limitedContext || "(none)",
        latest_result: limitedResult || "(none)",
      }),
    },
  ];
}
