/* eslint-disable no-undef */
/* global window */

import DOMPurify from "dompurify";

/*
 * Tags removed unconditionally. DOMPurify's default allowlist already drops
 * script/iframe/object/embed, noscript/noembed/noframes/xmp, style/meta/link
 * and form controls, but FORBID_TAGS enforces it regardless of any future
 * default-profile change and also removes svg/math (not needed for rendering
 * translated email HTML here) and template (removed by the previous sanitizer).
 */
const FORBIDDEN_TAGS = [
  "noscript",
  "noembed",
  "noframes",
  "xmp",
  "style",
  "meta",
  "link",
  "form",
  "input",
  "svg",
  "math",
  "template",
];

/*
 * DOMPurify's default URI regexp (cid: kept for Outlook inline images) plus
 * data:image/ so inline email images still display. Generic data: URIs stay
 * blocked; the hook below narrows data:image/ to img@src only, so it can never
 * be used on href/src of active or navigational elements.
 */
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data:image\/):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeType !== 1 /* ELEMENT_NODE */) {
    return;
  }

  const element = node as Element;

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const isImageSrc = element.tagName.toLowerCase() === "img" && name === "src";
    if (!isImageSrc && attribute.value.trim().toLowerCase().startsWith("data:")) {
      element.removeAttribute(attribute.name);
    }
  }

  if (
    element.tagName.toLowerCase() === "a" &&
    (element.getAttribute("target") || "").toLowerCase() === "_blank"
  ) {
    element.setAttribute("rel", "noopener noreferrer");
  }
});

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyInlineFormatting(input: string): string {
  const escaped = escapeHtml(input);

  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, "$1<em>$2</em>")
    .replace(
      /\bhttps?:\/\/[^\s<]+/g,
      (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
}

export function sanitizeHtmlFragment(input: string): string {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return escapeHtml(input);
  }

  return DOMPurify.sanitize(input, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    ALLOWED_URI_REGEXP,
    // DOMPurify's defaults drop target; keep it (the old sanitizer preserved
    // target="_blank" and the hook above adds rel="noopener noreferrer").
    ADD_ATTR: ["target"],
  });
}

export function containsHtmlMarkup(text: string): boolean {
  if (!text || !text.includes("<") || !text.includes(">")) {
    return false;
  }

  const pairedTag = /<([a-z][\w:-]*)(?:\s[^>]*)?>[\s\S]*<\/\1>/i;
  if (pairedTag.test(text)) {
    return true;
  }

  return /<(br|hr|img|meta|link|input)\b/i.test(text);
}

function formatStructuredText(text: string): string {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");

  const htmlParts: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    const listHtml = listItems.map((item) => `<li>${item}</li>`).join("");
    htmlParts.push(`<ul>${listHtml}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      htmlParts.push('<div class="fmt-spacer"></div>');
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = Math.min(6, headingMatch[1].length + 1);
      htmlParts.push(`<h${level}>${applyInlineFormatting(headingMatch[2])}</h${level}>`);
      continue;
    }

    const numberedHeadingMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numberedHeadingMatch) {
      flushList();
      htmlParts.push(`<h3>${applyInlineFormatting(numberedHeadingMatch[1])}</h3>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(applyInlineFormatting(bulletMatch[1]));
      continue;
    }

    flushList();
    htmlParts.push(`<p>${applyInlineFormatting(trimmed)}</p>`);
  }

  flushList();

  if (htmlParts.length === 0) {
    return '<p class="fmt-empty">No content.</p>';
  }

  return htmlParts.join("");
}

export function htmlToPlainText(html: string): string {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return html;
  }

  const parser = new window.DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  return (parsed.body.textContent || "").trim();
}

export function formatStructuredTextAsHtml(text: string): string {
  const normalized = text || "";
  if (containsHtmlMarkup(normalized)) {
    return sanitizeHtmlFragment(normalized);
  }

  return formatStructuredText(normalized);
}
