/* global Office */

export interface ReplyContext {
  draftText: string;
  threadText: string;
}

const REPLY_MARKERS: RegExp[] = [
  /^\s*From:\s/m,
  /^\s*On .+wrote:\s*$/m,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*Von:\s/m,
  /^\s*Fra:\s/m,
  /^\s*보낸 사람:\s/m,
];

function fromAsyncResult<T>(
  callbackBased: (done: (result: Office.AsyncResult<T>) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    callbackBased((asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Succeeded) {
        resolve(asyncResult.value);
      } else {
        reject(new Error(asyncResult.error.message));
      }
    });
  });
}

function getMailboxItem(): Office.Item | null {
  if (typeof Office === "undefined" || !Office.context || !Office.context.mailbox) {
    return null;
  }

  return Office.context.mailbox.item;
}

function normalizeOfficeTextValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: unknown }).data;
    if (typeof data === "string") {
      return data;
    }
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  return String(value);
}

export async function getCurrentBodyText(): Promise<string> {
  const item = getMailboxItem() as Office.MessageRead | Office.MessageCompose;
  if (!item || !item.body) {
    throw new Error("No Outlook message is available in current context.");
  }

  const value = await fromAsyncResult<string>((done) => {
    item.body.getAsync(Office.CoercionType.Text, done);
  });

  return normalizeOfficeTextValue(value);
}

export async function getCurrentBodyHtml(): Promise<string> {
  const item = getMailboxItem() as Office.MessageRead | Office.MessageCompose;
  if (!item || !item.body) {
    throw new Error("No Outlook message is available in current context.");
  }

  const value = await fromAsyncResult<string>((done) => {
    item.body.getAsync(Office.CoercionType.Html, done);
  });

  return normalizeOfficeTextValue(value);
}

export async function getSelectedTextOrEmpty(): Promise<string> {
  const item = getMailboxItem() as any;
  if (!item || typeof item.getSelectedDataAsync !== "function") {
    return "";
  }

  try {
    const value = await fromAsyncResult<unknown>((done) => {
      item.getSelectedDataAsync(Office.CoercionType.Text, done);
    });

    return normalizeOfficeTextValue(value);
  } catch {
    return "";
  }
}

export async function getSelectedHtmlOrEmpty(): Promise<string> {
  const item = getMailboxItem() as any;
  if (!item || typeof item.getSelectedDataAsync !== "function") {
    return "";
  }

  try {
    const value = await fromAsyncResult<unknown>((done) => {
      item.getSelectedDataAsync(Office.CoercionType.Html, done);
    });

    return normalizeOfficeTextValue(value);
  } catch {
    return "";
  }
}

export async function setComposeBodyText(text: string): Promise<void> {
  const item = getMailboxItem() as Office.MessageCompose;
  if (!item || !item.body || typeof item.body.setAsync !== "function") {
    throw new Error("Current context does not support replacing draft body text.");
  }

  await fromAsyncResult<void>((done) => {
    item.body.setAsync(text, { coercionType: Office.CoercionType.Text }, done);
  });
}

export async function setComposeBodyHtml(html: string): Promise<void> {
  const item = getMailboxItem() as Office.MessageCompose;
  if (!item || !item.body || typeof item.body.setAsync !== "function") {
    throw new Error("Current context does not support replacing draft body HTML.");
  }

  await fromAsyncResult<void>((done) => {
    item.body.setAsync(html, { coercionType: Office.CoercionType.Html }, done);
  });
}

export async function insertTextAtCursor(text: string): Promise<void> {
  const item = getMailboxItem() as Office.MessageCompose;
  if (!item || !item.body || typeof item.body.setSelectedDataAsync !== "function") {
    throw new Error("Current context does not support text insertion at cursor.");
  }

  await fromAsyncResult<void>((done) => {
    item.body.setSelectedDataAsync(text, { coercionType: Office.CoercionType.Text }, done);
  });
}

export async function insertHtmlAtCursor(html: string): Promise<void> {
  const item = getMailboxItem() as Office.MessageCompose;
  if (!item || !item.body || typeof item.body.setSelectedDataAsync !== "function") {
    throw new Error("Current context does not support HTML insertion at cursor.");
  }

  await fromAsyncResult<void>((done) => {
    item.body.setSelectedDataAsync(html, { coercionType: Office.CoercionType.Html }, done);
  });
}

export async function getComposeTypeOrUnknown(): Promise<string> {
  const item = getMailboxItem() as any;
  if (!item || typeof item.getComposeTypeAsync !== "function") {
    return "unknown";
  }

  try {
    const result: any = await fromAsyncResult<any>((done) => {
      item.getComposeTypeAsync(done);
    });

    if (result && typeof result.composeType === "string") {
      return result.composeType;
    }

    if (typeof result === "string") {
      return result;
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

export function getCurrentItemIdOrEmpty(): string {
  const item = getMailboxItem() as { itemId?: unknown } | null;
  if (!item || typeof item.itemId !== "string") {
    return "";
  }

  return item.itemId.trim();
}

export function splitDraftAndThread(bodyText: string): ReplyContext {
  if (!bodyText || bodyText.trim().length === 0) {
    return { draftText: "", threadText: "" };
  }

  let markerIndex = -1;

  REPLY_MARKERS.forEach((pattern) => {
    const match = pattern.exec(bodyText);
    if (!match || match.index < 0) {
      return;
    }

    if (markerIndex < 0 || match.index < markerIndex) {
      markerIndex = match.index;
    }
  });

  if (markerIndex < 0) {
    return {
      draftText: bodyText.trim(),
      threadText: "",
    };
  }

  return {
    draftText: bodyText.slice(0, markerIndex).trim(),
    threadText: bodyText.slice(markerIndex).trim(),
  };
}

export function limitWords(text: string, maxWords: number): string {
  if (!text) {
    return "";
  }

  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= maxWords) {
    return text;
  }

  return words.slice(0, maxWords).join(" ");
}

export interface EmailParticipant {
  displayName: string;
  emailAddress: string;
}

export interface EmailMetadata {
  subject: string;
  from?: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
}

export async function getEmailSubject(): Promise<string> {
  const item = getMailboxItem() as any;
  if (!item) {
    return "";
  }

  if (typeof item.subject === "string") {
    return item.subject;
  }

  if (item.subject && typeof item.subject.getAsync === "function") {
    try {
      const value = await fromAsyncResult<string>((done) => {
        item.subject.getAsync(done);
      });
      return typeof value === "string" ? value : "";
    } catch {
      return "";
    }
  }

  return "";
}

export async function setComposeSubject(subject: string): Promise<void> {
  const item = getMailboxItem() as any;
  if (!item || !item.subject || typeof item.subject.setAsync !== "function") {
    throw new Error("Current context does not support setting email subject.");
  }

  await fromAsyncResult<void>((done) => {
    item.subject.setAsync(subject, done);
  });
}

function normalizeRecipient(entry: any): EmailParticipant | null {
  if (!entry) {
    return null;
  }
  if (typeof entry === "string") {
    return { displayName: entry, emailAddress: entry };
  }
  const displayName = typeof entry.displayName === "string" ? entry.displayName.trim() : "";
  const emailAddress = typeof entry.emailAddress === "string" ? entry.emailAddress.trim() : "";
  if (!displayName && !emailAddress) {
    return null;
  }
  return {
    displayName: displayName || emailAddress,
    emailAddress: emailAddress || displayName,
  };
}

export async function getEmailMetadata(): Promise<EmailMetadata> {
  const item = getMailboxItem() as any;
  const subject = await getEmailSubject();
  if (!item) {
    return { subject, to: [], cc: [] };
  }

  let from: EmailParticipant | undefined;
  if (item.from) {
    from = normalizeRecipient(item.from) || undefined;
  }

  let to: EmailParticipant[] = [];
  if (Array.isArray(item.to)) {
    to = item.to.map(normalizeRecipient).filter(Boolean) as EmailParticipant[];
  } else if (item.to && typeof item.to.getAsync === "function") {
    try {
      const rawTo = await fromAsyncResult<any[]>((done) => item.to.getAsync(done));
      if (Array.isArray(rawTo)) {
        to = rawTo.map(normalizeRecipient).filter(Boolean) as EmailParticipant[];
      }
    } catch {
      // Ignore
    }
  }

  let cc: EmailParticipant[] = [];
  if (Array.isArray(item.cc)) {
    cc = item.cc.map(normalizeRecipient).filter(Boolean) as EmailParticipant[];
  } else if (item.cc && typeof item.cc.getAsync === "function") {
    try {
      const rawCc = await fromAsyncResult<any[]>((done) => item.cc.getAsync(done));
      if (Array.isArray(rawCc)) {
        cc = rawCc.map(normalizeRecipient).filter(Boolean) as EmailParticipant[];
      }
    } catch {
      // Ignore
    }
  }

  return { subject, from, to, cc };
}

export function extractGreetingName(from?: EmailParticipant): string {
  if (!from) {
    return "";
  }
  const name = from.displayName || from.emailAddress || "";
  if (!name) {
    return "";
  }
  if (name.includes(",")) {
    const parts = name.split(",");
    if (parts.length > 1 && parts[1].trim()) {
      return parts[1].trim().split(/\s+/)[0];
    }
  }
  return name.split(/\s+/)[0];
}

export interface EmailAttachmentInfo {
  name: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}

export async function getEmailAttachments(): Promise<EmailAttachmentInfo[]> {
  const item = getMailboxItem() as any;
  if (!item) {
    return [];
  }

  if (Array.isArray(item.attachments)) {
    return item.attachments.map((att: any) => ({
      name: String(att.name || "attachment"),
      contentType: typeof att.contentType === "string" ? att.contentType : undefined,
      size: typeof att.size === "number" ? att.size : undefined,
      isInline: Boolean(att.isInline),
    }));
  }

  if (typeof item.getAttachmentsAsync === "function") {
    try {
      const rawAttachments = await fromAsyncResult<any[]>((done) => item.getAttachmentsAsync(done));
      if (Array.isArray(rawAttachments)) {
        return rawAttachments.map((att: any) => ({
          name: String(att.name || "attachment"),
          contentType: typeof att.contentType === "string" ? att.contentType : undefined,
          size: typeof att.size === "number" ? att.size : undefined,
          isInline: Boolean(att.isInline),
        }));
      }
    } catch {
      // Ignore attachment fetch errors
    }
  }

  return [];
}

export function getCurrentUserProfile(): EmailParticipant | null {
  if (
    typeof Office === "undefined" ||
    !Office.context ||
    !Office.context.mailbox ||
    !Office.context.mailbox.userProfile
  ) {
    return null;
  }
  const up = Office.context.mailbox.userProfile;
  return {
    displayName: up.displayName || "",
    emailAddress: up.emailAddress || "",
  };
}

export type DetectedLanguage = "English" | "German" | "Korean" | "Danish" | "French" | "Spanish";

export function detectTextLanguage(text: string): DetectedLanguage {
  if (!text || !text.trim()) {
    return "English";
  }

  const sample = text.slice(0, 3000);

  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(sample)) {
    return "Korean";
  }

  const lower = sample.toLowerCase();

  const germanScore = (
    lower.match(
      /\b(und|der|die|das|ist|bitte|danke|sehr\s+geehrte|mit\s+freundlichen\s+grüßen|wir|für|nicht|einen|einer|haben|werden|können)\b/gi
    ) || []
  ).length;

  const danishScore = (
    lower.match(
      /\b(og|jeg|det|at|en|til|er|ikke|for|med\s+venlig\s+hilsen|mvh|vi|på|som|har|kan|skal|mange\s+tak)\b/gi
    ) || []
  ).length;

  const frenchScore = (
    lower.match(
      /\b(le|la|les|et|est|pour|dans|cordialement|nous|vous|avec|sur|qui|merci|bonjour)\b/gi
    ) || []
  ).length;

  const spanishScore = (
    lower.match(
      /\b(el|la|los|las|en|por|con|para|saludos|cordialmente|gracias|nosotros|usted|que|del)\b/gi
    ) || []
  ).length;

  if (
    germanScore >= 3 &&
    germanScore > danishScore &&
    germanScore > frenchScore &&
    germanScore > spanishScore
  ) {
    return "German";
  }
  if (
    danishScore >= 3 &&
    danishScore > germanScore &&
    danishScore > frenchScore &&
    danishScore > spanishScore
  ) {
    return "Danish";
  }
  if (frenchScore >= 3 && frenchScore > germanScore && frenchScore > danishScore) {
    return "French";
  }
  if (spanishScore >= 3 && spanishScore > germanScore && spanishScore > danishScore) {
    return "Spanish";
  }

  return "English";
}

export function buildEnrichedThreadContext(
  threadText: string,
  metadata?: EmailMetadata,
  attachments?: EmailAttachmentInfo[],
  userProfile?: EmailParticipant | null
): string {
  const parts: string[] = [];

  if (metadata) {
    const participants: string[] = [];
    if (metadata.from?.displayName || metadata.from?.emailAddress) {
      participants.push(`From: ${metadata.from.displayName} <${metadata.from.emailAddress}>`);
    }
    if (metadata.to.length > 0) {
      const toStr = metadata.to.map((t) => `${t.displayName || t.emailAddress}`).join(", ");
      participants.push(`To: ${toStr}`);
    }
    if (metadata.cc.length > 0) {
      const ccStr = metadata.cc.map((c) => `${c.displayName || c.emailAddress}`).join(", ");
      participants.push(`CC: ${ccStr}`);
    }
    if (userProfile && (userProfile.displayName || userProfile.emailAddress)) {
      participants.push(
        `Current User (You): ${userProfile.displayName} <${userProfile.emailAddress}>`
      );
    }

    if (participants.length > 0) {
      parts.push(`[Participants]\n${participants.join("\n")}`);
    }

    if (metadata.subject) {
      parts.push(`[Subject]: ${metadata.subject}`);
    }
  }

  if (attachments && attachments.length > 0) {
    const fileNames = attachments
      .filter((att) => !att.isInline)
      .map((att) => att.name)
      .join(", ");
    if (fileNames) {
      parts.push(`[Attached Files in Thread]: ${fileNames}`);
    }
  }

  if (threadText.trim()) {
    parts.push(`[Email Body / Thread Content]:\n${threadText.trim()}`);
  }

  return parts.join("\n\n");
}
