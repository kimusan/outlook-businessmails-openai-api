/**
 * Lightweight word-level diff utility using Longest Common Subsequence (LCS).
 * Used to provide visual side-by-side or inline diff highlighting for email improvements.
 */

export interface DiffPart {
  type: "equal" | "add" | "remove";
  value: string;
}

function tokenizeIntoWordsAndSpaces(text: string): string[] {
  if (!text) {
    return [];
  }

  // Split on word boundaries while preserving whitespace and punctuation
  const tokens: string[] = [];
  const regex = /(\s+|[^\s\w]+|\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0]);
  }

  return tokens;
}

/**
 * Computes word-level diff between original and modified text.
 */
export function computeWordDiff(originalText: string, modifiedText: string): DiffPart[] {
  const originalTokens = tokenizeIntoWordsAndSpaces(originalText || "");
  const modifiedTokens = tokenizeIntoWordsAndSpaces(modifiedText || "");

  const n = originalTokens.length;
  const m = modifiedTokens.length;

  // Build LCS matrix (bounded to prevent huge memory for massive text)
  if (n * m > 1000000) {
    // For very large text, return full modification
    return [
      { type: "remove", value: originalText },
      { type: "add", value: modifiedText },
    ];
  }

  const matrix: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (originalTokens[i - 1] === modifiedTokens[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  let i = n;
  let j = m;
  const rawParts: DiffPart[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && originalTokens[i - 1] === modifiedTokens[j - 1]) {
      rawParts.push({ type: "equal", value: originalTokens[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      rawParts.push({ type: "add", value: modifiedTokens[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
      rawParts.push({ type: "remove", value: originalTokens[i - 1] });
      i--;
    }
  }

  rawParts.reverse();

  // Merge consecutive parts of the same type
  const merged: DiffPart[] = [];
  for (const part of rawParts) {
    if (merged.length > 0 && merged[merged.length - 1].type === part.type) {
      merged[merged.length - 1].value += part.value;
    } else {
      merged.push({ ...part });
    }
  }

  return merged;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Converts diff parts into HTML with inline styling / semantic markup.
 */
export function formatDiffAsHtml(diffParts: DiffPart[]): string {
  if (diffParts.length === 0) {
    return '<p class="diff-empty">No changes detected.</p>';
  }

  const htmlPieces = diffParts.map((part) => {
    const escaped = escapeHtml(part.value).replace(/\n/g, "<br/>");
    if (part.type === "add") {
      return `<ins class="diff-add" style="background-color: #d4edda; color: #155724; text-decoration: none; border-radius: 2px; padding: 1px 2px; font-weight: 500;">${escaped}</ins>`;
    }
    if (part.type === "remove") {
      return `<del class="diff-remove" style="background-color: #f8d7da; color: #721c24; text-decoration: line-through; border-radius: 2px; padding: 1px 2px; opacity: 0.85;">${escaped}</del>`;
    }
    return `<span>${escaped}</span>`;
  });

  return `<div class="diff-container" style="line-height: 1.6; font-family: inherit; font-size: 13px; white-space: pre-wrap;">${htmlPieces.join("")}</div>`;
}
