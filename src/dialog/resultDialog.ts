/* eslint-disable no-undef */
/* global Office, window, document, navigator */

import { ResultDialogOutgoingMessage, ResultDialogPayload } from "../shared/dialogMessages";
import {
  containsHtmlMarkup,
  formatStructuredTextAsHtml,
  htmlToPlainText,
} from "../shared/richText";

const titleNode = document.getElementById("dialog-title") as HTMLElement;
const metaNode = document.getElementById("dialog-meta") as HTMLElement;
const markupNode = document.getElementById("dialog-markup") as HTMLElement;
const copyButton = document.getElementById("copy-button") as HTMLButtonElement;
const closeButton = document.getElementById("close-button") as HTMLButtonElement;
const statusNode = document.getElementById("dialog-status") as HTMLElement;

let currentText = "";

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

function applyPayload(payload: ResultDialogPayload): void {
  currentText = payload.text || "";
  titleNode.textContent = payload.title || "AI Result";
  metaNode.textContent = `${payload.workflow} | ${payload.language} | ${new Date(payload.generatedAt).toLocaleString()}`;
  markupNode.innerHTML = formatStructuredTextAsHtml(currentText);
}

function parsePayload(rawMessage: string): ResultDialogPayload | null {
  try {
    const parsed = JSON.parse(rawMessage) as ResultDialogPayload;
    if (parsed && parsed.type === "resultPayload") {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

async function copyCurrentText(): Promise<void> {
  if (!currentText.trim()) {
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
      containsHtmlMarkup(currentText) &&
      ClipboardItemCtor &&
      typeof navigator.clipboard.write === "function"
    ) {
      const htmlBlob = new Blob([currentText], { type: "text/html" });
      const textBlob = new Blob([htmlToPlainText(currentText)], { type: "text/plain" });
      const item = new ClipboardItemCtor({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      });
      await navigator.clipboard.write([item]);
    } else if (typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(currentText);
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
  Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (args) => {
    const payload = parsePayload(args.message);
    if (!payload) {
      setStatus("Ignored unknown payload.");
      return;
    }

    applyPayload(payload);
  });

  sendMessageToParent({ type: "ready" });
});
