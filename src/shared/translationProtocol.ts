/*
 * Segment-based translation protocol (id -> string arrays) shared by the
 * taskpane workflows (compose in-place, read-mode live view).
 *
 * Field-hardened after a real failure: a 94-segment batch came back with
 * every id invalid because the model's JSON was truncated server-side (or
 * used plain strings). Parsing therefore:
 *   - accepts a plain string for single-part segments (models often emit
 *     {"t0": "text"} instead of {"t0": ["text"]}),
 *   - salvages complete "id": [...] pairs from TRUNCATED JSON via regex,
 *     so a cut-off response still yields the pairs that arrived,
 *   - validates per id (never all-or-nothing per batch).
 */

import type { BodyDomSegment } from "./bodyDom";

export const IN_PLACE_RETRY_SUFFIX =
  "Your previous response was not valid JSON with matching keys/array lengths. Return ONLY the corrected JSON object.";

/* Markup injection guard for translated strings. */
const MARKUP_PATTERN = /<[a-zA-Z/!]/;

export function extractJsonObjectText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return "";
  }

  return candidate.slice(start, end + 1);
}

/*
 * Salvage complete pairs from raw (possibly truncated) model output. Only
 * ids we actually sent are considered, and only syntactically complete
 * values (closed string, closed array) are accepted, so a cut-off response
 * contributes exactly the pairs that fully arrived.
 */
export function salvageTranslationPairs(
  raw: string,
  expectedIds: string[]
): Record<string, unknown> {
  const salvaged: Record<string, unknown> = {};
  if (!raw || expectedIds.length === 0) {
    return salvaged;
  }

  const idAlternation = expectedIds
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  // Complete arrays: "id": [ "s", "s", ... ] with every string closed.
  const arrayPattern = new RegExp(
    `"(${idAlternation})"\\s*:\\s*\\[((?:\\s*"(?:[^"\\\\]|\\\\.)*"\\s*(?:,\\s*"(?:[^"\\\\]|\\\\.)*"\\s*)*)?)\\]`,
    "g"
  );
  // Complete single strings: "id": "s" (accepted for single-part segments).
  const stringPattern = new RegExp(`"(${idAlternation})"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");

  for (const match of raw.matchAll(arrayPattern)) {
    try {
      const pair = JSON.parse(`{${match[0]}}`) as Record<string, unknown>;
      salvaged[match[1]] = pair[match[1]];
    } catch {
      // Malformed escape sequence: skip this pair.
    }
  }
  for (const match of raw.matchAll(stringPattern)) {
    if (Object.prototype.hasOwnProperty.call(salvaged, match[1])) {
      continue;
    }
    try {
      const pair = JSON.parse(`{${match[0]}}`) as Record<string, unknown>;
      salvaged[match[1]] = pair[match[1]];
    } catch {
      // Malformed escape sequence: skip this pair.
    }
  }

  return salvaged;
}

function isUsableTranslation(value: unknown, partCount: number): string[] | null {
  if (Array.isArray(value)) {
    if (value.length !== partCount) {
      return null;
    }
    const strings: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string" || MARKUP_PATTERN.test(entry)) {
        return null;
      }
      strings.push(entry);
    }
    return strings;
  }

  // Tolerate models that emit a plain string for a single-part segment.
  if (typeof value === "string" && partCount === 1 && !MARKUP_PATTERN.test(value)) {
    return [value];
  }

  return null;
}

export function parseInPlaceTranslationResponse(
  raw: string,
  batch: BodyDomSegment[],
  extra?: Record<string, string[]>
): { mapping: Record<string, string[]>; invalidIds: string[] } {
  // Validation rules: for every sent id (segments + extras) the response
  // must provide either a string array of the same length or (single-part
  // only) a plain string, with no injected markup (<tag). Ids without a
  // usable value keep their original text — never all-or-nothing.
  const expected: Record<string, string[]> = {};
  for (const segment of batch) {
    expected[segment.id] = segment.parts;
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      expected[key] = value;
    }
  }

  const jsonText = extractJsonObjectText(raw);
  let record: Record<string, unknown> = {};
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        record = parsed as Record<string, unknown>;
      }
    } catch {
      // Truncated/malformed JSON: fall through to salvage.
    }
  }

  const expectedIds = Object.keys(expected);
  const salvaged = salvageTranslationPairs(raw, expectedIds);

  const mapping: Record<string, string[]> = {};
  const invalidIds: string[] = [];
  for (const id of expectedIds) {
    const partCount = expected[id].length;
    const fromRecord = Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;
    const usable =
      isUsableTranslation(fromRecord, partCount) ?? isUsableTranslation(salvaged[id], partCount);
    if (usable) {
      mapping[id] = usable;
    } else {
      invalidIds.push(id);
    }
  }

  return { mapping, invalidIds };
}
