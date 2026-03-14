/* eslint-disable no-undef */
/* global window */

const DANGEROUS_TAGS = new Set(["script", "iframe", "object", "embed", "template"]);

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

function isSafeUri(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("cid:") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("#") ||
    normalized.startsWith("/")
  );
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

export function sanitizeHtmlFragment(input: string): string {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return escapeHtml(input);
  }

  const parser = new window.DOMParser();
  const parsed = parser.parseFromString(`<div>${input}</div>`, "text/html");
  const container = parsed.body.firstElementChild as HTMLElement | null;
  if (!container) {
    return escapeHtml(input);
  }

  const sanitizeNode = (node: Node) => {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (DANGEROUS_TAGS.has(tagName)) {
      element.remove();
      return;
    }

    const attributes = Array.from(element.attributes) as Attr[];
    for (const attribute of attributes) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";

      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (
        (name === "href" || name === "src" || name === "xlink:href" || name === "formaction") &&
        !isSafeUri(value)
      ) {
        element.removeAttribute(attribute.name);
        continue;
      }
    }

    if (tagName === "a") {
      const href = element.getAttribute("href");
      if (href && !isSafeUri(href)) {
        element.removeAttribute("href");
      }

      const target = (element.getAttribute("target") || "").toLowerCase();
      if (target === "_blank") {
        element.setAttribute("rel", "noopener noreferrer");
      }
    }

    const children = Array.from(element.childNodes);
    for (const child of children) {
      sanitizeNode(child);
    }
  };

  const nodes = Array.from(container.childNodes);
  for (const node of nodes) {
    sanitizeNode(node);
  }

  return container.innerHTML;
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
