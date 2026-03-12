import { ChatMessage } from "./aiClient";
import { limitWords } from "./outlookContext";

export type ToneOption = "neutral" | "friendly" | "formal" | "concise";
export type FormalityOption = "balanced" | "informal" | "formal";
export type LengthOption = "short" | "medium" | "long";
export type SupportedLanguage = "English" | "Korean" | "Danish";

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
        "You are a senior executive email assistant. Write high-quality business replies with strong clarity and judgment. " +
        "Never invent facts, commitments, dates, numbers, or approvals that are not present in the input. " +
        "Output only the final email body as plain text (no subject line, no markdown, no code fences).",
    },
    {
      role: "user",
      content:
        `${formatStyle(tone, formality, length)}\n\n` +
        `User direction: "${direction}"\n\n` +
        "Instructions:\n" +
        "- Preserve all factual details from the thread.\n" +
        "- Match the thread language and writing style unless direction explicitly requests otherwise.\n" +
        "- Keep names, organizations, dates, and action items accurate.\n" +
        "- If a critical detail is missing, avoid fabricating and phrase response safely.\n" +
        "- Use a practical email structure: acknowledgment -> core response -> next steps -> polite close.\n\n" +
        `Referenced thread:\n${limitedThread}`,
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
        "You are an expert business writing editor. Improve language quality without changing intent or facts. " +
        "Do not add new claims, commitments, dates, or decisions. " +
        "Output only the revised email body as plain text.",
    },
    {
      role: "user",
      content:
        `${formatStyle(tone, formality, length)}\n\n` +
        "Edit goals:\n" +
        "- Improve clarity, grammar, flow, and professionalism.\n" +
        "- Keep all key facts, asks, deadlines, and recipients intact.\n" +
        "- Remove redundancy and ambiguity.\n" +
        "- Keep formatting simple and email-ready.\n\n" +
        `Draft to improve:\n${limitedDraft}`,
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
        "You are an expert editor for reply emails. Improve quality while preserving original intent and factual correctness. " +
        "Align wording with prior thread context and do not invent information. " +
        "Output only the revised reply body as plain text (no quoted thread).",
    },
    {
      role: "user",
      content:
        `${formatStyle(tone, formality, length)}\n\n` +
        "Instructions:\n" +
        "- Improve the current reply draft.\n" +
        "- Preserve all concrete facts, numbers, dates, and commitments.\n" +
        "- Match language, terminology, and politeness level used in the referenced thread.\n" +
        "- Make asks and next steps explicit.\n\n" +
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
        "You are a professional translator for business emails (English, Korean, Danish). " +
        "Translate accurately while preserving meaning, intent, and tone. " +
        "Do not omit or add information. Output translation only as plain text.",
    },
    {
      role: "user",
      content:
        `Translate the following email content to ${targetLanguage}.\n\n` +
        "Translation rules:\n" +
        "- Preserve names, numbers, dates, times, URLs, and email addresses exactly.\n" +
        "- Preserve line breaks, bullet structure, and paragraph intent where possible.\n" +
        "- Keep the same level of politeness/professional register.\n" +
        "- Do not include commentary, explanations, or notes.\n\n" +
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
        "You are a chief-of-staff style summarization assistant for business email threads. " +
        "Prioritize decision relevance, ownership, deadlines, and risks. " +
        "Return markdown with headings and bullet lists only (no tables).",
    },
    {
      role: "user",
      content:
        `Summarize this email content in ${outputLanguage}. ` +
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
        `Email content:\n${limitedText}`,
    },
  ];
}

export function buildChatMessages(
  emailContext: string,
  latestResult: string,
  userQuestion: string,
  outputLanguage: SupportedLanguage
): ChatMessage[] {
  const limitedContext = limitWords(emailContext, 1400);
  const limitedResult = limitWords(latestResult, 700);

  return [
    {
      role: "system",
      content:
        "You are an Outlook email copilot. Answer questions using only the provided context and latest generated text. " +
        "If context is insufficient, state what is missing instead of guessing. " +
        "Use concise markdown with short headings/bullets when it improves readability.",
    },
    {
      role: "user",
      content:
        `Answer in ${outputLanguage} unless the question explicitly requests another language.\n` +
        "Prioritize actionable guidance and clear rationale.\n\n" +
        `Question:\n${userQuestion}\n\n` +
        `Email context:\n${limitedContext || "(none)"}\n\n` +
        `Latest generated result:\n${limitedResult || "(none)"}`,
    },
  ];
}
