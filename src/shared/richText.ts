/* global window */

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const GLOBAL_ALLOWED_ATTRIBUTES = new Set(["colspan", "rowspan"]);
const TAG_ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
};

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
    .replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, "$1<em>$2</em>");
}

function isSafeHref(href: string): boolean {
  const normalized = href.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("#") ||
    normalized.startsWith("/")
  );
}

function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

function sanitizeHtml(input: string): string {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return escapeHtml(input);
  }

  const parser = new window.DOMParser();
  const parsed = parser.parseFromString(`<div>${input}</div>`, "text/html");
  const container = parsed.body.firstElementChild as any;
  if (!container) {
    return escapeHtml(input);
  }

  const sanitizeNode = (node: any) => {
    const nodeType = Number(node?.nodeType || 0);
    // 8 = comment node
    if (nodeType === 8) {
      node.remove();
      return;
    }

    // 1 = element node
    if (nodeType !== 1) {
      return;
    }

    const tagName = String(node.tagName || "").toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      const parent = node.parentNode;
      if (!parent) {
        node.remove();
        return;
      }

      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
      return;
    }

    const allowedAttributes = TAG_ALLOWED_ATTRIBUTES[tagName] || new Set<string>();
    const attributes = Array.from(node.attributes || []) as Array<{ name: string; value: string }>;
    for (const attribute of attributes) {
      const attributeName = String(attribute.name || "").toLowerCase();
      if (!GLOBAL_ALLOWED_ATTRIBUTES.has(attributeName) && !allowedAttributes.has(attributeName)) {
        node.removeAttribute(attribute.name);
        continue;
      }

      if (tagName === "a" && attributeName === "href") {
        if (!isSafeHref(String(attribute.value || ""))) {
          node.removeAttribute("href");
        }
      }
    }

    if (tagName === "a") {
      const target = String(node.getAttribute("target") || "").toLowerCase();
      if (target === "_blank") {
        node.setAttribute("rel", "noopener noreferrer");
      }
    }

    const children = Array.from(node.childNodes || []);
    for (const child of children) {
      sanitizeNode(child);
    }
  };

  const nodes = Array.from(container.childNodes || []);
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

export function formatStructuredTextAsHtml(text: string): string {
  const normalized = text || "";
  if (looksLikeHtml(normalized)) {
    return sanitizeHtml(normalized);
  }

  return formatStructuredText(normalized);
}
