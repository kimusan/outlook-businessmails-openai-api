import { ChatMessage } from "./aiClient";
import { limitWords } from "./outlookContext";

export type ToneOption = "neutral" | "friendly" | "formal" | "concise";
export type FormalityOption = "balanced" | "informal" | "formal";
export type LengthOption = "short" | "medium" | "long";
export type SupportedLanguage = "English" | "Korean" | "Danish";

function formatStyle(tone: ToneOption, formality: FormalityOption, length: LengthOption): string {
  return `Tone: ${tone}. Formality: ${formality}. Length: ${length}.`;
}

export function buildReplyDraftMessages(
  threadText: string,
  direction: string,
  tone: ToneOption,
  formality: FormalityOption,
  length: LengthOption
): ChatMessage[] {
  const limitedThread = limitWords(threadText, 1200);

  return [
    {
      role: "system",
      content:
        "You are an email copilot. Produce a professional email reply body only. Do not include subject line or markdown.",
    },
    {
      role: "user",
      content:
        `${formatStyle(tone, formality, length)} ` +
        `Use this direction from the user: "${direction}". ` +
        "Use the referenced thread to preserve context, entities, and language style. " +
        "If the thread language is clear, reply in that language unless explicitly contradicted by the direction.\n\n" +
        `Thread:\n${limitedThread}`,
    },
  ];
}

export function buildImproveDraftMessages(
  draftText: string,
  tone: ToneOption,
  formality: FormalityOption,
  length: LengthOption
): ChatMessage[] {
  const limitedDraft = limitWords(draftText, 1000);

  return [
    {
      role: "system",
      content:
        "You improve draft emails. Keep intent and factual content unchanged, but improve clarity and language quality.",
    },
    {
      role: "user",
      content:
        `${formatStyle(tone, formality, length)} ` +
        "Rewrite this draft email body. Return plain email body text only.\n\n" +
        `Draft:\n${limitedDraft}`,
    },
  ];
}

export function buildImproveReplyMessages(
  draftText: string,
  threadText: string,
  tone: ToneOption,
  formality: FormalityOption,
  length: LengthOption
): ChatMessage[] {
  const limitedDraft = limitWords(draftText, 800);
  const limitedThread = limitWords(threadText, 1000);

  return [
    {
      role: "system",
      content:
        "You improve email replies. Keep original intent and factual details while improving quality and matching thread language/style.",
    },
    {
      role: "user",
      content:
        `${formatStyle(tone, formality, length)} ` +
        "Rewrite the reply draft and align language and style with the thread context. " +
        "Return the updated reply body only (no quoted thread).\n\n" +
        `Current reply draft:\n${limitedDraft}\n\n` +
        `Referenced thread:\n${limitedThread}`,
    },
  ];
}

export function buildTranslationMessages(
  text: string,
  targetLanguage: SupportedLanguage
): ChatMessage[] {
  const limitedText = limitWords(text, 1500);

  return [
    {
      role: "system",
      content:
        "You are an email translation assistant. Translate precisely and preserve meaning, names, dates, and requested actions.",
    },
    {
      role: "user",
      content:
        `Translate the following email content to ${targetLanguage}. ` +
        "Return translation only, without commentary.\n\n" +
        `Content:\n${limitedText}`,
    },
  ];
}

export function buildSummaryMessages(
  text: string,
  outputLanguage: SupportedLanguage
): ChatMessage[] {
  const limitedText = limitWords(text, 1800);

  return [
    {
      role: "system",
      content:
        "You summarize email content for busy professionals. Return concise, structured plain text only (no markdown tables).",
    },
    {
      role: "user",
      content:
        `Summarize this email content in ${outputLanguage}. ` +
        "If the content appears to be a thread, include all sections below. " +
        "If it is a single email, still provide the same sections with best-effort details.\n\n" +
        "Required sections in this exact order:\n" +
        "1) Participants\n" +
        "- Active participants: list names/emails who authored messages or replies.\n" +
        "- Passive participants: list recipients/cc or mentioned stakeholders not actively writing.\n" +
        "2) Executive summary\n" +
        "- 3-6 bullets with key decisions, requests, deadlines, and risks.\n" +
        "3) Detailed timeline (who says what)\n" +
        "- Chronological bullets capturing major points by speaker.\n" +
        "- Include open questions, unresolved items, and follow-ups.\n\n" +
        "Do not invent facts. Mark uncertain details as unknown.\n\n" +
        `Email content:\n${limitedText}`,
    },
  ];
}
