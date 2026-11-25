// Plain-assert Node tests for src/shared/bodyDom.ts (no test framework).
// The TypeScript module is transpiled on the fly with the repo's typescript
// devDependency, and parsing runs against jsdom's DOMParser
// (new JSDOM(...).window.DOMParser) — the same spec-compliant HTML parser the
// DOMParser spike validated the round-tripping behavior with.

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));

// --- transpile src/shared/bodyDom.ts to a temp ESM module and import it ---
const source = readFileSync(path.join(here, "..", "src", "shared", "bodyDom.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2019 },
});
const outDir = path.join(tmpdir(), "bodydom-test");
mkdirSync(outDir, { recursive: true });
const modulePath = path.join(outDir, "bodyDom.mjs");
writeFileSync(modulePath, outputText);
const {
  applySegmentTranslations,
  buildSegmentBatches,
  parseMailBodyHtml,
  serializeMailBody,
  stripTextEdges,
} = await import(pathToFileURL(modulePath).href);

// --- tiny runner ---
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const FIXTURES = ["f1-classic-outlook.html", "f2-vml.html", "f3-owa.html", "f4-edge-stew.html"];
const loadFixture = (name) => readFileSync(path.join(here, "fixtures", name), "utf8");
const allParts = (parsed) => parsed.segments.flatMap((segment) => segment.parts);

// --- DOM helpers ---
function childNodesOf(node) {
  const out = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1 || child.nodeType === 3 || child.nodeType === 8) {
      out.push(child);
    }
  }
  return out;
}

function describeNode(node) {
  if (!node) {
    return "(missing)";
  }
  if (node.nodeType === 1) {
    return node.tagName;
  }
  if (node.nodeType === 3) {
    return `#text(${JSON.stringify(String(node.data).slice(0, 40))})`;
  }
  if (node.nodeType === 8) {
    return `#comment(${JSON.stringify(String(node.data).slice(0, 40))})`;
  }
  return `#nodeType${node.nodeType}`;
}

// Structural tree diff. By default compares node types, tag names, namespaces,
// attribute names+order+values, text data and comment data. opts.ignoreTextData
// and opts.ignoreAttrValues relax text/attribute VALUE checks only.
function diffTrees(a, b, opts = {}) {
  const { ignoreTextData = false, ignoreAttrValues = false } = opts;
  const diffs = [];
  const walk = (x, y, where) => {
    if (x === y) {
      return;
    }
    if (!x || !y) {
      diffs.push(`${where}: missing ${describeNode(x || y)}`);
      return;
    }
    if (x.nodeType !== y.nodeType) {
      diffs.push(`${where}: nodeType ${x.nodeType} vs ${y.nodeType}`);
      return;
    }
    if (x.nodeType === 1) {
      if (x.tagName !== y.tagName) {
        diffs.push(`${where}: tagName ${x.tagName} vs ${y.tagName}`);
      }
      if (x.namespaceURI !== y.namespaceURI) {
        diffs.push(`${where}: namespace`);
      }
      const xa = Array.from(x.attributes);
      const ya = Array.from(y.attributes);
      if (xa.length !== ya.length) {
        diffs.push(`${where}: attrCount ${xa.length} vs ${ya.length}`);
      }
      for (let k = 0; k < Math.min(xa.length, ya.length); k++) {
        if (xa[k].name !== ya[k].name) {
          diffs.push(`${where}: attrName ${xa[k].name} vs ${ya[k].name}`);
        } else if (!ignoreAttrValues && xa[k].value !== ya[k].value) {
          diffs.push(`${where}: attrValue ${xa[k].name}`);
        }
      }
    } else if (x.nodeType === 3) {
      if (!ignoreTextData && x.data !== y.data) {
        diffs.push(`${where}: text`);
      }
    } else if (x.nodeType === 8) {
      if (x.data !== y.data) {
        diffs.push(`${where}: comment`);
      }
    }
    const xc = childNodesOf(x);
    const yc = childNodesOf(y);
    if (xc.length !== yc.length) {
      diffs.push(`${where}: childCount ${xc.length} vs ${yc.length}`);
      return;
    }
    for (let k = 0; k < xc.length; k++) {
      walk(xc[k], yc[k], `${where}/${describeNode(xc[k])}[${k}]`);
    }
  };
  walk(a, b, "root");
  return diffs;
}

function collectComments(root) {
  const out = [];
  const walk = (node) => {
    for (const child of childNodesOf(node)) {
      if (child.nodeType === 8) {
        out.push(child.data);
      }
      walk(child);
    }
  };
  walk(root);
  return out;
}

function collectCidUris(doc) {
  return Array.from(doc.querySelectorAll("img[src]"))
    .map((img) => img.getAttribute("src"))
    .filter((src) => src !== null && src.startsWith("cid:"));
}

function scriptStyleTexts(doc) {
  const out = [];
  for (const tag of ["script", "style"]) {
    for (const element of doc.querySelectorAll(tag)) {
      out.push(element.textContent);
    }
  }
  return out;
}

// --- (0) window guard ---
test("parseMailBodyHtml returns null when window.DOMParser is unavailable", () => {
  const saved = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(parseMailBodyHtml("<p>hi</p>"), null);
  } finally {
    globalThis.window = saved;
  }
});

const jsdomWindow = new JSDOM("<!DOCTYPE html><html><body></body></html>").window;
globalThis.window = jsdomWindow;

// --- (a) parse -> serialize -> reparse structural identity ---
for (const fixture of FIXTURES) {
  test(`${fixture}: parse -> serialize -> reparse is structurally identical`, () => {
    const input = loadFixture(fixture);
    const first = parseMailBodyHtml(input);
    const serialized = serializeMailBody(first);
    assert.ok(serialized.startsWith("<!DOCTYPE html"), "doctype rebuilt");
    const second = parseMailBodyHtml(serialized);
    assert.deepEqual(
      diffTrees(first.document.documentElement, second.document.documentElement),
      [],
      "full structural identity (nodes, attrs, text, comments)"
    );
    // comments (incl. MSO conditional comments) preserved verbatim
    assert.deepEqual(
      collectComments(second.document.documentElement),
      collectComments(first.document.documentElement)
    );
    // cid: inline-image URIs intact
    assert.deepEqual(collectCidUris(second.document), collectCidUris(first.document));
    // style/script content byte-identical
    assert.deepEqual(scriptStyleTexts(second.document), scriptStyleTexts(first.document));
  });
}

// --- (b) fake translation changes ZERO structure ---
for (const fixture of FIXTURES) {
  test(`${fixture}: applying a fake translation changes ZERO structure`, () => {
    const input = loadFixture(fixture);
    const parsed = parseMailBodyHtml(input);
    const mapping = {};
    for (const segment of parsed.segments) {
      mapping[segment.id] = segment.parts.map((part) => `[T] ${part}`);
    }
    const result = applySegmentTranslations(parsed, mapping);
    assert.deepEqual(result.failed, []);
    assert.equal(result.applied, parsed.segments.length);

    const baseline = parseMailBodyHtml(input);
    const translated = parseMailBodyHtml(serializeMailBody(parsed));
    const structural = diffTrees(baseline.document.documentElement, translated.document.documentElement, {
      ignoreTextData: true,
      ignoreAttrValues: true,
    });
    assert.deepEqual(structural, [], "structure must be untouched by apply");

    // sanity: text/attribute VALUES did change
    assert.ok(serializeMailBody(parsed).includes("[T] "));
    const withValues = diffTrees(baseline.document.documentElement, translated.document.documentElement);
    assert.ok(withValues.length > 0, "value diffs expected");
  });
}

// --- (c) script/style subtrees never yield segments ---
test("f4: script/style subtrees never produce segments", () => {
  const parsed = parseMailBodyHtml(loadFixture("f4-edge-stew.html"));
  const forbidden = [
    "notTranslatable",
    "should not be translated",
    "do not translate me",
    "pseudo",
    "background: #ffeeee",
  ];
  const parts = allParts(parsed);
  for (const fragment of forbidden) {
    assert.ok(!parts.some((part) => part.includes(fragment)), `segment leaked: ${fragment}`);
  }
  assert.ok(parts.length > 0, "non-script text still extracted");
});

// --- (d) quoted reply chain exclusion ---
test("f1: quoted reply chain excluded, skippedQuotedChain=true", () => {
  const parsed = parseMailBodyHtml(loadFixture("f1-classic-outlook.html"));
  assert.equal(parsed.skippedQuotedChain, true);
  const joined = allParts(parsed).join("\n");
  for (const excluded of ["Alice Smith", "Seoul team", "PreheaderText", "9:15 AM"]) {
    assert.ok(!joined.includes(excluded), `quoted chain leaked: ${excluded}`);
  }
  // original content is still segmented
  assert.ok(joined.includes("Hi team,"));
  assert.ok(joined.includes("Please review the quarterly forecast before Friday\u200B."));
  assert.ok(joined.includes("Best regards,"));
});

test("f1: includeQuotedChain=true disables exclusion", () => {
  const parsed = parseMailBodyHtml(loadFixture("f1-classic-outlook.html"), { includeQuotedChain: true });
  assert.equal(parsed.skippedQuotedChain, false);
  assert.ok(allParts(parsed).some((part) => part.includes("Can we also add the Seoul team's numbers?")));
});

test("f2/f3/f4: no reply chain detected", () => {
  for (const fixture of ["f2-vml.html", "f3-owa.html", "f4-edge-stew.html"]) {
    const parsed = parseMailBodyHtml(loadFixture(fixture));
    assert.equal(parsed.skippedQuotedChain, false, fixture);
  }
});

// --- (e) merged-sibling grouping ---
test("f3: <br>-split Korean sentence yields one multi-part segment", () => {
  const parsed = parseMailBodyHtml(loadFixture("f3-owa.html"));
  const segment = parsed.segments.find(
    (s) => s.parts.length === 3 && s.parts[0] === "프로젝트 일정이 확정되었습니다."
  );
  assert.ok(segment, "expected the 3-part Korean segment");
  assert.deepEqual(segment.parts, [
    "프로젝트 일정이 확정되었습니다.",
    "다음 회의는 목요일 오전 10시입니다.",
    "감사합니다.",
  ]);
});

test("f4: <br>+comment-split sentence yields one multi-part segment", () => {
  const parsed = parseMailBodyHtml(loadFixture("f4-edge-stew.html"));
  const segment = parsed.segments.find((s) => s.parts[0] === "Sentence one");
  assert.ok(segment, "expected the sentence group");
  assert.equal(segment.parts.length, 5);
  assert.deepEqual(segment.parts, [
    "Sentence one",
    "Sentence two",
    "Sentence three",
    "middle text",
    "tail.",
  ]);
});

test("grouping walks through <o:p> and breaks on real elements", () => {
  const html =
    "<html><body><div>Alpha sentence<o:p></o:p>Omega sentence</div><div>Beta one<b>bold</b></div></body></html>";
  const parsed = parseMailBodyHtml(html);
  const alpha = parsed.segments.find((s) => s.parts.includes("Alpha sentence"));
  assert.ok(alpha, "alpha group");
  assert.deepEqual(alpha.parts, ["Alpha sentence", "Omega sentence"], "<o:p> merged through");
  const beta = parsed.segments.find((s) => s.parts.includes("Beta one"));
  assert.ok(beta, "beta segment");
  assert.equal(beta.parts.length, 1, "<b> is a real element boundary");
});

test("f2: VML text inside v:textbox is translatable", () => {
  const parsed = parseMailBodyHtml(loadFixture("f2-vml.html"));
  const parts = allParts(parsed);
  assert.ok(parts.includes("Click here to accept the invitation"), "v:shape textbox text");
  assert.ok(parts.includes("Rect label"), "v:rect textbox text");
  assert.ok(parts.includes("Hello before shape."));
  assert.ok(parts.includes("Text after the shape."));
});

// --- (f) whitespace edges (NBSP/ZWSP) ---
test("stripTextEdges: whitespace/NBSP/ZWSP edges, core preserved", () => {
  assert.deepEqual(stripTextEdges("\u00A0\u200B hi \t\u00A0"), {
    core: "hi",
    leading: "\u00A0\u200B ",
    trailing: " \t\u00A0",
  });
  assert.deepEqual(stripTextEdges("plain"), { core: "plain", leading: "", trailing: "" });
  assert.deepEqual(stripTextEdges(""), { core: "", leading: "", trailing: "" });
  // leading + core + trailing always reconstructs the input
  for (const sample of ["   ", "\u200B\u200B", "a", " \u00A0x\u200B", "café\u00A0", "한국어 text"]) {
    const { core, leading, trailing } = stripTextEdges(sample);
    assert.equal(leading + core + trailing, sample);
  }
});

test("NBSP/ZWSP edges are preserved verbatim around applied translations", () => {
  const parsed = parseMailBodyHtml("<div>\u00A0\u200BHello edges\u200B\u00A0</div>");
  assert.equal(parsed.segments.length, 1);
  const segment = parsed.segments[0];
  assert.equal(segment.kind, "text");
  assert.deepEqual(segment.parts, ["Hello edges"], "edges stripped from parts");
  const result = applySegmentTranslations(parsed, { [segment.id]: ["[T] Hello edges"] });
  assert.deepEqual(result, { applied: 1, failed: [] });
  const textNode = parsed.document.body.firstChild.firstChild;
  assert.equal(textNode.nodeType, 3);
  assert.equal(textNode.data, "\u00A0\u200B[T] Hello edges\u200B\u00A0", "original edges re-appended");
});

test("f1: internal NBSP/ZWSP stay inside translated parts", () => {
  const parsed = parseMailBodyHtml(loadFixture("f1-classic-outlook.html"));
  const parts = allParts(parsed);
  assert.ok(parts.includes("Klaus\u00A0Schulz\u00A0\u200B| Senior\u00A0Engineer"), "internal NBSP/ZWSP kept");
  assert.ok(parts.includes("Q1\u00A0actual"));
  assert.ok(parts.includes("Please review the quarterly forecast before Friday\u200B."));
});

test("attribute value edges are preserved", () => {
  const parsed = parseMailBodyHtml('<div><span title="\u00A0Tip here\u00A0">x</span></div>');
  const segment = parsed.segments.find((s) => s.kind === "attribute");
  assert.ok(segment, "attribute segment");
  assert.deepEqual(segment.parts, ["Tip here"]);
  assert.equal(segment.context, "title");
  applySegmentTranslations(parsed, { [segment.id]: ["[T] Tip here"] });
  assert.equal(parsed.document.querySelector("span").getAttribute("title"), "\u00A0[T] Tip here\u00A0");
});

test("text without Unicode letters is not segmented", () => {
  const parsed = parseMailBodyHtml("<div>12.05.2026 &mdash; 1.234,56 &euro; +49 30 123456</div>");
  assert.equal(parsed.segments.filter((s) => s.kind === "text").length, 0);
});

// --- (g) part-count mismatch ---
test("part-count mismatch fails and keeps originals", () => {
  const input = loadFixture("f3-owa.html");
  const parsed = parseMailBodyHtml(input);
  const segment = parsed.segments.find((s) => s.parts.length === 3);
  assert.ok(segment, "need a multi-part segment");
  const pristine = serializeMailBody(parseMailBodyHtml(input));
  const result = applySegmentTranslations(parsed, { [segment.id]: ["only one part"] });
  assert.deepEqual(result, { applied: 0, failed: [segment.id] });
  assert.equal(serializeMailBody(parsed), pristine, "originals kept");
});

test("unknown mapping ids are ignored; missing ids keep originals", () => {
  const parsed = parseMailBodyHtml(loadFixture("f4-edge-stew.html"));
  const first = parsed.segments[0];
  const result = applySegmentTranslations(parsed, {
    [first.id]: first.parts.map((part) => `[T] ${part}`),
    zzz99: ["x"],
  });
  assert.deepEqual(result.failed, []);
  assert.equal(result.applied, 1);
  assert.ok(serializeMailBody(parsed).includes("[T] "));
});

// --- (h) batching ---
test("buildSegmentBatches: greedy, never splits a segment, respects budget", () => {
  const seg = (id, parts) => ({ id, kind: "text", parts });
  const t0 = seg("t0", ["a".repeat(10)]);
  const t1 = seg("t1", ["b".repeat(20)]);
  const t2 = seg("t2", ["c".repeat(5), "d".repeat(5)]);

  const batches = buildSegmentBatches([t0, t1, t2], 35);
  assert.deepEqual(
    batches.map((batch) => batch.map((s) => s.id)),
    [["t0", "t1"], ["t2"]]
  );
  const flat = batches.flat();
  assert.deepEqual(flat, [t0, t1, t2], "order preserved, each segment exactly once");
  assert.equal(flat[0], t0, "segments are not copied");
  for (const batch of batches) {
    const chars = batch.reduce(
      (sum, s) => sum + s.parts.reduce((acc, part) => acc + part.length, 0),
      0
    );
    assert.ok(chars <= 35 || batch.length === 1, "batch over budget must hold a single segment");
  }

  assert.deepEqual(buildSegmentBatches([], 10), []);
  const big = seg("t9", ["x".repeat(100)]);
  assert.deepEqual(buildSegmentBatches([big], 10), [[big]], "oversized segment never split");
  const mixed = buildSegmentBatches([t0, big, t2], 35);
  assert.deepEqual(
    mixed.map((batch) => batch.map((s) => s.id)),
    [["t0"], ["t9"], ["t2"]]
  );
});

test("buildSegmentBatches: maxSegmentsPerBatch caps batch size (small responses survive)", () => {
  const seg = (id) => ({ id, kind: "text", parts: ["word"] });
  const many = Array.from({ length: 94 }, (_, i) => seg(`t${i}`)); // the reported failing shape

  const batches = buildSegmentBatches(many, 4000, 30);
  assert.ok(
    batches.every((batch) => batch.length <= 30),
    "no batch exceeds the segment cap"
  );
  const flat = batches.flat();
  assert.deepEqual(flat, many, "order preserved, each segment exactly once");
  assert.equal(batches.length, Math.ceil(94 / 30), "94 segments fill 4 batches of <=30");

  // Cap omitted (undefined): all segments fit one batch (backwards compatible).
  assert.equal(buildSegmentBatches(many, 4000).length, 1);
  // Cap smaller than any batch content still yields batches (never drops data).
  const tiny = buildSegmentBatches(many, 4000, 1);
  assert.equal(tiny.length, 94);
  assert.deepEqual(tiny.flat(), many);
});

// --- (i) title="a>b" round-trips escaped ---
test('f4: title="a>b" survives the round trip escaped', () => {
  const input = loadFixture("f4-edge-stew.html");
  const parsed = parseMailBodyHtml(input);
  const serialized = serializeMailBody(parsed);
  assert.ok(serialized.includes('title="a&gt;b"'), "escaped in serialization");
  const reparsed = parseMailBodyHtml(serialized);
  const p = reparsed.document.querySelector("p[title]");
  assert.ok(p);
  assert.equal(p.tagName, "P");
  assert.equal(p.getAttribute("title"), "a>b");
  assert.equal(p.firstChild.nodeType, 3, "value stayed an attribute, not markup");
  const attributeSegment = parsed.segments.find((s) => s.kind === "attribute" && s.parts[0] === "a>b");
  assert.ok(attributeSegment, "attribute segment present");
  assert.equal(attributeSegment.context, "title");
});

// --- determinism ---
test("segment extraction is deterministic across reparses", () => {
  for (const fixture of FIXTURES) {
    const a = parseMailBodyHtml(loadFixture(fixture));
    const b = parseMailBodyHtml(loadFixture(fixture));
    assert.deepEqual(b.segments, a.segments, fixture);
  }
});

// --- run ---
let failedCount = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failedCount++;
    console.log(`FAIL - ${name}`);
    console.log(String(err && err.stack ? err.stack : err).split("\n").slice(0, 8).join("\n"));
  }
}

// informational: measured segment counts per fixture
console.log("\nsegment counts:");
for (const fixture of FIXTURES) {
  const parsed = parseMailBodyHtml(loadFixture(fixture));
  const text = parsed.segments.filter((s) => s.kind === "text");
  const attribute = parsed.segments.filter((s) => s.kind === "attribute");
  const multiPart = text.filter((s) => s.parts.length > 1);
  console.log(
    `  ${fixture}: total=${parsed.segments.length} text=${text.length} attr=${attribute.length} multiPart=${multiPart.length} skippedQuotedChain=${parsed.skippedQuotedChain}`
  );
}

console.log(`\n${tests.length - failedCount}/${tests.length} tests passed`);
// The shared jsdom window keeps the Node event loop alive; exit explicitly.
process.exit(failedCount > 0 ? 1 : 0);
