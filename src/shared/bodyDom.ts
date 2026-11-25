/* eslint-disable no-undef */
/* global window */

/*
 * In-place translation of Outlook mail body HTML.
 *
 * Core guarantee (validated by the DOMParser spike): a translation is spliced
 * into the parsed document ONLY via Text.data assignment and
 * element.setAttribute — never an innerHTML write — so the document structure
 * cannot change by construction. Serialization reuses
 * documentElement.outerHTML and rebuilds the doctype, which outerHTML drops.
 */

export type BodyDomSegmentKind = "text" | "attribute";

export interface BodyDomSegment {
  id: string; // "t0", "t1", ... for text; "a0", "a1", ... for attributes
  kind: BodyDomSegmentKind;
  parts: string[]; // trimmed translatable substrings in DOM order; length 1 except for multi-node text groups
  context?: string; // short human hint, e.g. "img alt", "aria-label"
}

export interface ParsedBody {
  document: Document;
  segments: BodyDomSegment[];
  skippedQuotedChain: boolean;
}

/*
 * Subtrees that must never yield segments. Their text is code/boilerplate and
 * must survive round-trips byte-identical.
 */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "XMP"]);

/*
 * Edge characters stripped before a string is sent to a model and re-appended
 * afterwards: JavaScript \s already covers NBSP (\u00A0), but NOT ZWSP
 * (\u200B), which Outlook inserts freely — so ZWSP is listed explicitly.
 */
const EDGE_CHAR = /[\s\u200B]/u;

const LETTER = /\p{L}/u;

const REPLY_MARKERS = [
  "from:",
  "sent:",
  "to:",
  "subject:",
  "von:",
  "gesendet:",
  "fra:",
  "보낸 사람:",
  "-------- original message",
  "--original message--",
];

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BODY",
  "CAPTION",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HTML",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

/* Private per-segment bookkeeping applySegmentTranslations needs. */
interface TextNodeSlot {
  node: Text;
  leading: string;
  trailing: string;
}

interface SegmentInternal {
  kind: BodyDomSegmentKind;
  textNodes?: TextNodeSlot[]; // text segments: one slot per part
  element?: Element; // attribute segments
  attributeName?: string;
  leading?: string;
  trailing?: string;
}

const internalsByParsedBody = new WeakMap<ParsedBody, SegmentInternal[]>();

function hasLetters(text: string): boolean {
  return LETTER.test(text);
}

export function stripTextEdges(text: string): { core: string; leading: string; trailing: string } {
  const value = text || "";
  let start = 0;
  while (start < value.length && EDGE_CHAR.test(value.charAt(start))) {
    start++;
  }
  let end = value.length;
  while (end > start && EDGE_CHAR.test(value.charAt(end - 1))) {
    end--;
  }
  return {
    core: value.slice(start, end),
    leading: value.slice(0, start),
    trailing: value.slice(end),
  };
}

function collectNodesInOrder(root: Element): Node[] {
  const ordered: Node[] = [];
  const walk = (parent: Node): void => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 /* ELEMENT_NODE */) {
        if (SKIP_TAGS.has((child as Element).tagName.toUpperCase())) {
          continue;
        }
        ordered.push(child);
        walk(child);
      } else if (child.nodeType === 3 /* TEXT_NODE */ || child.nodeType === 8 /* COMMENT_NODE */) {
        ordered.push(child);
      }
    }
  };
  walk(root);
  return ordered;
}

/*
 * <br> and <o:p> are layout-only separators. <o:p> is an empty MSO namespace
 * paragraph terminator (an HTML-namespace element whose localName contains a
 * colon): text grouping walks THROUGH it, it is never a content boundary.
 */
function isParagraphBreak(node: Node): boolean {
  if (node.nodeType !== 1 /* ELEMENT_NODE */) {
    return false;
  }
  const tag = (node as Element).tagName.toUpperCase();
  return tag === "BR" || tag === "O:P";
}

function nearestBlockParent(node: Node): Node | null {
  let current = node.parentNode;
  while (current && current.nodeType === 1 /* ELEMENT_NODE */) {
    if (BLOCK_TAGS.has((current as Element).tagName.toUpperCase())) {
      return current;
    }
    current = current.parentNode;
  }
  return current;
}

/*
 * Quoted reply chain detection (DOM level): index (in document order) of the
 * first p/div/blockquote that starts with a reply header marker, or the first
 * div/blockquote with Outlook's border-left reply chrome. -1 when not found.
 */
function findQuotedChainCutoff(ordered: Node[]): number {
  for (let i = 0; i < ordered.length; i++) {
    const node = ordered[i];
    if (node.nodeType !== 1 /* ELEMENT_NODE */) {
      continue;
    }
    const element = node as Element;
    const tag = element.tagName.toUpperCase();
    if (tag !== "P" && tag !== "DIV" && tag !== "BLOCKQUOTE") {
      continue;
    }
    const trimmed = (element.textContent || "").trim().toLowerCase();
    if (REPLY_MARKERS.some((marker) => trimmed.startsWith(marker))) {
      return i;
    }
    if (
      (tag === "DIV" || tag === "BLOCKQUOTE") &&
      (element.getAttribute("style") || "").toLowerCase().includes("border-left")
    ) {
      return i;
    }
  }
  return -1;
}

function isTranslatableAttribute(tag: string, name: string): boolean {
  return (name === "alt" && tag === "IMG") || name === "aria-label" || name === "title";
}

export function parseMailBodyHtml(
  html: string,
  options?: { includeQuotedChain?: boolean }
): ParsedBody | null {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return null;
  }

  const doc = new window.DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) {
    return null;
  }

  const ordered = collectNodesInOrder(body);
  let skippedQuotedChain = false;
  if (!options || options.includeQuotedChain !== true) {
    const cutoff = findQuotedChainCutoff(ordered);
    if (cutoff >= 0) {
      ordered.length = cutoff;
      skippedQuotedChain = true;
    }
  }

  const segments: BodyDomSegment[] = [];
  const internals: SegmentInternal[] = [];
  let textId = 0;
  let attrId = 0;

  let i = 0;
  while (i < ordered.length) {
    const node = ordered[i];

    if (node.nodeType === 1 /* ELEMENT_NODE */) {
      const element = node as Element;
      const tag = element.tagName.toUpperCase();
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (!isTranslatableAttribute(tag, name)) {
          continue;
        }
        const stripped = stripTextEdges(attribute.value);
        if (!hasLetters(stripped.core)) {
          continue;
        }
        segments.push({
          id: `a${attrId++}`,
          kind: "attribute",
          parts: [stripped.core],
          context: name === "alt" ? "img alt" : name,
        });
        internals.push({
          kind: "attribute",
          element,
          attributeName: attribute.name,
          leading: stripped.leading,
          trailing: stripped.trailing,
        });
      }
      i++;
      continue;
    }

    if (node.nodeType !== 3 /* TEXT_NODE */) {
      i++; // comment nodes only act as group separators below
      continue;
    }

    const textNode = node as Text;
    const first = stripTextEdges(textNode.data);
    if (!hasLetters(first.core)) {
      i++; // pure numbers/dates/punctuation are not translated
      continue;
    }

    /*
     * Merge consecutive text nodes of the same block parent that are
     * separated only by <br>, <o:p> or comment nodes — a sentence split by
     * formatting becomes ONE segment with one part per text node.
     */
    const blockParent = nearestBlockParent(textNode);
    const slots: TextNodeSlot[] = [
      { node: textNode, leading: first.leading, trailing: first.trailing },
    ];
    const parts = [first.core];

    let j = i + 1;
    while (j < ordered.length) {
      const next = ordered[j];
      if (next.nodeType === 8 /* COMMENT_NODE */ || isParagraphBreak(next)) {
        j++;
        continue;
      }
      if (next.nodeType === 3 /* TEXT_NODE */) {
        const candidate = next as Text;
        const stripped = stripTextEdges(candidate.data);
        if (hasLetters(stripped.core) && nearestBlockParent(candidate) === blockParent) {
          slots.push({ node: candidate, leading: stripped.leading, trailing: stripped.trailing });
          parts.push(stripped.core);
          j++;
          continue;
        }
      }
      break;
    }

    segments.push({ id: `t${textId++}`, kind: "text", parts });
    internals.push({ kind: "text", textNodes: slots });
    i = j;
  }

  const parsed: ParsedBody = { document: doc, segments, skippedQuotedChain };
  internalsByParsedBody.set(parsed, internals);
  return parsed;
}

export function applySegmentTranslations(
  parsed: ParsedBody,
  mapping: Record<string, string[]>
): { applied: number; failed: string[] } {
  const failed: string[] = [];
  let applied = 0;

  if (!parsed || !parsed.segments) {
    return { applied, failed };
  }

  const internals = internalsByParsedBody.get(parsed) || [];
  for (let i = 0; i < parsed.segments.length; i++) {
    const segment = parsed.segments[i];
    if (!Object.prototype.hasOwnProperty.call(mapping || {}, segment.id)) {
      continue; // segments missing from the mapping keep their originals
    }
    const values = mapping[segment.id];
    const internal = internals[i];
    const usable =
      Array.isArray(values) &&
      values.length === segment.parts.length &&
      values.every((value) => typeof value === "string") &&
      internal !== undefined &&
      internal.kind === segment.kind;
    if (!usable) {
      failed.push(segment.id); // part-count mismatch: keep the originals
      continue;
    }

    if (segment.kind === "text") {
      const slots = internal.textNodes || [];
      for (let k = 0; k < slots.length; k++) {
        // Re-append the ORIGINAL whitespace edges (incl. NBSP/ZWSP) that
        // models drop; splice via Text.data so structure cannot change.
        slots[k].node.data = slots[k].leading + values[k] + slots[k].trailing;
      }
    } else if (internal.element && internal.attributeName) {
      internal.element.setAttribute(
        internal.attributeName,
        (internal.leading || "") + values[0] + (internal.trailing || "")
      );
    }
    applied++;
  }

  return { applied, failed };
}

export function serializeMailBody(parsed: ParsedBody): string {
  const doc = parsed && parsed.document;
  if (!doc || !doc.documentElement) {
    return "";
  }
  const doctype = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ""}${
        doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ""
      }>`
    : "<!DOCTYPE html>";
  return `${doctype}\n${doc.documentElement.outerHTML}`;
}

/*
 * Greedy fill by total part characters. A segment is never split across
 * batches; a single segment larger than the budget gets a batch of its own.
 */
export function buildSegmentBatches(
  segments: BodyDomSegment[],
  maxCharsPerBatch: number
): BodyDomSegment[][] {
  const batches: BodyDomSegment[][] = [];
  if (!segments || segments.length === 0) {
    return batches;
  }
  const budget = maxCharsPerBatch > 0 ? maxCharsPerBatch : 1;
  let current: BodyDomSegment[] = [];
  let currentChars = 0;
  for (const segment of segments) {
    const chars = segment.parts.reduce((sum, part) => sum + (part ? part.length : 0), 0);
    if (current.length > 0 && currentChars + chars > budget) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(segment);
    currentChars += chars;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}
