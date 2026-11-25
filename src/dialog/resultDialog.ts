/* eslint-disable no-undef */
/* global Office, window, document, navigator */

import {
  ResultDialogIncomingMessage,
  ResultDialogOutgoingMessage,
  ResultDialogPayload,
  TranslationUpdatePayload,
  TranslationViewPayload,
} from "../shared/dialogMessages";
import {
  applySegmentTranslations,
  parseMailBodyHtml,
  ParsedBody,
  serializeMailBody,
} from "../shared/bodyDom";
import {
  containsHtmlMarkup,
  formatStructuredTextAsHtml,
  htmlToPlainText,
} from "../shared/richText";

const titleNode = document.getElementById("dialog-title") as HTMLElement;
const metaNode = document.getElementById("dialog-meta") as HTMLElement;
const markupNode = document.getElementById("dialog-markup") as HTMLElement;
const notesNode = document.getElementById("dialog-notes") as HTMLElement;
const subjectNode = document.getElementById("dialog-subject") as HTMLElement;
const copyButton = document.getElementById("copy-button") as HTMLButtonElement;
const closeButton = document.getElementById("close-button") as HTMLButtonElement;
const statusNode = document.getElementById("dialog-status") as HTMLElement;

const FLASH_MS = 1400;

let currentText = "";

/* Live translated view state. The parsed copy's Text/Element nodes are
 * adopted into this document, so applying a mapping mutates the visible
 * DOM directly (Text.data / setAttribute only — structure cannot change). */
let liveParsed: ParsedBody | null = null;
let liveOriginalHtml = "";
let liveAppliedMapping: Record<string, string[]> = {};
let liveAppliedIds = new Set<string>();
let liveTotalSegments = 0;
let liveLanguage = "";

function setStatus(message: string): void {
  statusNode.textContent = message;
  window.setTimeout(() => {
    if (statusNode.textContent === message) {
      statusNode.textContent = "";
    }
  }, 2500);
}

function sendMessageToParent(message: ResultDialogOutgoingMessage): void {
  try {
    Office.context.ui.messageParent(JSON.stringify(message));
  } catch {
    // Ignore when parent messaging is unavailable.
  }
}

function flashElement(element: Element): void {
  if (!element || element.nodeType !== 1 /* ELEMENT_NODE */) {
    return;
  }
  const target = element as HTMLElement;
  target.classList.remove("translate-flash");
  void target.offsetWidth; // force reflow so a repeat flash restarts
  target.classList.add("translate-flash");
  window.setTimeout(() => target.classList.remove("translate-flash"), FLASH_MS + 100);
}

function flashAppliedNodes(nodes: Node[]): void {
  for (const node of nodes) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      if (node.parentElement) {
        flashElement(node.parentElement);
      }
    } else {
      flashElement(node as Element);
    }
  }
}

function applyPayload(payload: ResultDialogPayload): void {
  resetTranslationView();
  currentText = payload.text || "";
  titleNode.textContent = payload.title || "AI Result";
  metaNode.classList.remove("is-live");
  metaNode.textContent = `${payload.workflow} | ${payload.language} | ${new Date(
    payload.generatedAt
  ).toLocaleString()}`;
  if (!currentText.trim()) {
    markupNode.innerHTML =
      '<p style="color: #6b7280; font-style: italic;">Contacting AI model &amp; generating response...</p>';
  } else {
    markupNode.innerHTML = formatStructuredTextAsHtml(currentText);
  }
}

function resetTranslationView(): void {
  liveParsed = null;
  liveOriginalHtml = "";
  liveAppliedMapping = {};
  liveAppliedIds = new Set<string>();
  liveTotalSegments = 0;
  liveLanguage = "";
  notesNode.hidden = true;
  notesNode.innerHTML = "";
  subjectNode.hidden = true;
  subjectNode.textContent = "";
  markupNode.classList.remove("mail-view");
}

function applyTranslationView(payload: TranslationViewPayload): void {
  resetTranslationView();
  currentText = "";

  titleNode.textContent = payload.title || "Translated message";
  metaNode.classList.add("is-live");
  metaNode.textContent = `Translating to ${payload.language} — 0%`;

  if (payload.noteHtml) {
    notesNode.innerHTML = payload.noteHtml;
    notesNode.hidden = false;
  }
  if (payload.subjectHtml) {
    subjectNode.textContent = payload.subjectHtml;
    subjectNode.hidden = false;
  }

  const parsed = parseMailBodyHtml(payload.html);
  if (!parsed) {
    markupNode.innerHTML =
      '<p style="color: #6b7280; font-style: italic;">Could not render the message copy.</p>';
    return;
  }

  liveParsed = parsed;
  liveOriginalHtml = payload.html;
  liveTotalSegments = payload.totalSegments;
  liveLanguage = payload.language || "";

  // Move the parsed body element (and its Text nodes, whose references the
  // segment internals hold) into this document so later mapping updates
  // mutate the visible DOM directly.
  markupNode.innerHTML = "";
  markupNode.classList.add("mail-view");
  const adoptedBody = document.adoptNode(parsed.document.body);
  markupNode.appendChild(adoptedBody);
}

function applyTranslationUpdate(payload: TranslationUpdatePayload): void {
  if (!liveParsed) {
    return; // no view rendered yet; the next full mapping heals this
  }

  // Updates carry the full mapping so far; apply only unseen ids so an
  // already-applied segment is never flashed or written twice.
  const freshMapping: Record<string, string[]> = {};
  for (const id of Object.keys(payload.mapping || {})) {
    if (!liveAppliedIds.has(id)) {
      freshMapping[id] = payload.mapping[id];
    }
  }

  const newIds = Object.keys(freshMapping);
  if (newIds.length > 0) {
    applySegmentTranslations(liveParsed, freshMapping, flashAppliedNodes);
    for (const id of newIds) {
      liveAppliedIds.add(id);
      liveAppliedMapping[id] = freshMapping[id];
    }
  }

  if (payload.subjectHtml) {
    subjectNode.textContent = payload.subjectHtml;
    subjectNode.hidden = false;
    flashElement(subjectNode);
  }

  const percent =
    liveTotalSegments > 0 ? Math.round((payload.translatedCount / liveTotalSegments) * 100) : 0;
  metaNode.classList.toggle("is-live", !payload.finished && !payload.cancelled);
  if (payload.cancelled) {
    metaNode.textContent = `Translation cancelled — ${payload.translatedCount} of ${liveTotalSegments} segments translated`;
  } else if (payload.finished) {
    const keptNote =
      payload.keptOriginalCount > 0 ? ` (${payload.keptOriginalCount} kept original)` : "";
    metaNode.textContent = `Translated to ${liveLanguage} — ${payload.translatedCount} segments${keptNote}`;
  } else {
    metaNode.textContent = `Translating to ${liveLanguage} — ${percent}% (part ${Math.min(
      payload.batchDone,
      payload.batchCount
    )}/${payload.batchCount})`;
  }
}

function currentTranslationHtml(): string {
  // Re-parse the pristine original and replay the accumulated mapping: the
  // adopted nodes live in the rendered DOM, so serialize from a clean copy.
  const parsed = parseMailBodyHtml(liveOriginalHtml);
  if (!parsed) {
    return "";
  }
  applySegmentTranslations(parsed, liveAppliedMapping);
  return serializeMailBody(parsed);
}

function parseMessage(rawMessage: string): ResultDialogIncomingMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as ResultDialogIncomingMessage;
    if (
      parsed &&
      (parsed.type === "resultPayload" ||
        parsed.type === "translationView" ||
        parsed.type === "translationUpdate")
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

async function copyCurrentText(): Promise<void> {
  const textToCopy = liveParsed ? currentTranslationHtml() : currentText;
  if (!textToCopy.trim()) {
    setStatus("No content to copy.");
    return;
  }

  if (!navigator || !navigator.clipboard) {
    setStatus("Clipboard API unavailable.");
    return;
  }

  try {
    const ClipboardItemCtor = (window as any).ClipboardItem;
    if (
      containsHtmlMarkup(textToCopy) &&
      ClipboardItemCtor &&
      typeof navigator.clipboard.write === "function"
    ) {
      const htmlBlob = new Blob([textToCopy], { type: "text/html" });
      const textBlob = new Blob([htmlToPlainText(textToCopy)], { type: "text/plain" });
      const item = new ClipboardItemCtor({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      });
      await navigator.clipboard.write([item]);
    } else if (typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(textToCopy);
    } else {
      throw new Error("Clipboard write unavailable");
    }

    setStatus("Copied to clipboard.");
  } catch {
    setStatus("Copy failed.");
  }
}

copyButton.addEventListener("click", () => {
  void copyCurrentText();
});

closeButton.addEventListener("click", () => {
  sendMessageToParent({ type: "close" });
});

Office.onReady(() => {
  Office.context.ui.addHandlerAsync(
    Office.EventType.DialogParentMessageReceived,
    (args) => {
      const message = parseMessage(args.message);
      if (!message) {
        setStatus("Ignored unknown payload.");
        return;
      }

      if (message.type === "resultPayload") {
        applyPayload(message);
      } else if (message.type === "translationView") {
        applyTranslationView(message);
      } else if (message.type === "translationUpdate") {
        applyTranslationUpdate(message);
      }
    },
    (asyncResult: Office.AsyncResult<any>) => {
      if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
        setStatus(
          `Failed to register dialog handler: ${asyncResult.error?.message || "unknown error"}`
        );
        return;
      }

      sendMessageToParent({ type: "ready" });
    }
  );
});
