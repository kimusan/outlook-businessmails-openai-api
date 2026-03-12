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

export function formatStructuredTextAsHtml(text: string): string {
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
