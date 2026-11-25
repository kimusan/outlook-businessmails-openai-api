// Plain-assert Node tests for src/shared/translationProtocol.ts: the
// tolerant segment-translation response parser (per-id validation, salvage
// of complete pairs from truncated JSON, plain-string tolerance). Built
// after a real field failure where a large batch came back truncated and
// the old all-or-nothing parser invalidated every id.

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));

function transpile(relPath, outName) {
  const source = readFileSync(path.join(here, "..", relPath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2019 },
  });
  const outDir = path.join(tmpdir(), "translation-protocol-test");
  mkdirSync(outDir, { recursive: true });
  const modulePath = path.join(outDir, outName);
  writeFileSync(modulePath, outputText);
  return pathToFileURL(modulePath).href;
}

// bodyDom.ts is imported for the BodyDomSegment type only; translationProtocol
// has no runtime dependency on it, so no need to load it here.
const {
  extractJsonObjectText,
  parseInPlaceTranslationResponse,
  salvageTranslationPairs,
} = await import(transpile("src/shared/translationProtocol.ts", "translationProtocol.mjs"));

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const seg = (id, parts, kind = "text") => ({ id, kind, parts });

const BATCH = [
  seg("t0", ["Hello"]),
  seg("t1", ["Best regards,", "Kim"]), // multi-part
  seg("t2", ["The quarterly review is on Friday."]),
];

console.log("translationProtocol: tolerant segment-response parsing");

// --- 1. fully valid response -----------------------------------------------
{
  const raw = JSON.stringify({
    t0: ["Hallo"],
    t1: ["Mit freundlichen Grüßen,", "Kim"],
    t2: ["Die Quartalsprüfung ist am Freitag."],
  });
  const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, BATCH);
  ok("valid JSON: every id mapped");
  assert.equal(invalidIds.length, 0);
  assert.equal(mapping.t0[0], "Hallo");
  assert.equal(mapping.t1[1], "Kim");
}

// --- 2. TRUNCATED JSON: salvage complete pairs -----------------------------
{
  const full = JSON.stringify({
    t0: ["Hallo"],
    t1: ["Mit freundlichen Grüßen,", "Kim"],
    t2: ["Die Quartalsprüfung ist am Freitag."],
  });
  // Cut off mid-value of t2, like a server-side output cap does.
  const truncated = full.slice(0, full.indexOf('"Die Quartalsprüfung') + 12);

  const { mapping, invalidIds } = parseInPlaceTranslationResponse(truncated, BATCH);

  ok("truncated JSON: complete pairs are salvaged, only the cut id is invalid");
  assert.equal(mapping.t0[0], "Hallo");
  assert.deepEqual(mapping.t1, ["Mit freundlichen Grüßen,", "Kim"]);
  assert.deepEqual(invalidIds, ["t2"]);
}

// --- 3. plain strings for single-part segments ----------------------------
{
  const raw = JSON.stringify({ t0: "Hallo", t1: ["a", "b"], t2: "Freitag." });
  const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, BATCH);
  ok("plain string accepted for single-part segments");
  assert.equal(mapping.t0[0], "Hallo");
  assert.equal(mapping.t2[0], "Freitag.");
  assert.equal(invalidIds.length, 0);
}

// --- 4. plain string for a MULTI-part segment is invalid ------------------
{
  const raw = JSON.stringify({ t0: ["Hallo"], t1: "nope", t2: ["x"] });
  const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, BATCH);
  ok("plain string rejected for multi-part segments (would collapse layout)");
  assert.ok(!mapping.t1);
  assert.deepEqual(invalidIds, ["t1"]);
}

// --- 5. markup injection rejected per id -----------------------------------
{
  const raw = JSON.stringify({
    t0: ["<script>alert(1)</script>"],
    t1: ["ok", "Kim"],
    t2: ["fine"],
  });
  const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, BATCH);
  ok("markup injection rejected only for the offending id");
  assert.ok(!mapping.t0);
  assert.equal(mapping.t2[0], "fine");
  assert.deepEqual(invalidIds, ["t0"]);
}

// --- 6. array length mismatch invalidates only that id ---------------------
{
  const raw = JSON.stringify({ t0: ["a"], t1: ["only one"], t2: ["c"] });
  const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, BATCH);
  ok("array length mismatch invalidates only that id");
  assert.equal(mapping.t0[0], "a");
  assert.deepEqual(invalidIds, ["t1"]);
}

// --- 7. code fences stripped ------------------------------------------------
{
  const raw = '```json\n{"t0": ["Hallo"], "t1": ["a", "b"], "t2": ["c"]}\n```';
  const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, BATCH);
  ok("code fences stripped");
  assert.equal(invalidIds.length, 0);
  assert.equal(mapping.t0[0], "Hallo");
}

// --- 8. extras (subject) participate in validation -------------------------
{
  const raw = JSON.stringify({ t0: ["Hallo"], t1: ["a", "b"], t2: ["c"] });
  const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, BATCH, {
    subject: ["Status meeting"],
  });
  ok("extras validated like segments");
  assert.ok(!mapping.subject);
  assert.deepEqual(invalidIds, ["subject"]);

  const raw2 = JSON.stringify({
    t0: ["Hallo"],
    t1: ["a", "b"],
    t2: ["c"],
    subject: ["Statusbesprechung"],
  });
  const result2 = parseInPlaceTranslationResponse(raw2, BATCH, { subject: ["Status meeting"] });
  assert.equal(result2.mapping.subject[0], "Statusbesprechung");
  assert.equal(result2.invalidIds.length, 0);
}

// --- 9. salvageTranslationPairs ignores unknown ids ------------------------
{
  const raw = '{"t0": ["Hallo"], "evil": ["x"], "t99": ["y"]}';
  const salvaged = salvageTranslationPairs(raw, ["t0", "t1"]);
  ok("salvage only considers ids that were actually sent");
  assert.deepEqual(Object.keys(salvaged), ["t0"]);
}

// --- 10. escape sequences survive salvage ----------------------------------
{
  const raw = '{"t0": ["Zitat: \\"quoted\\" und Pfad C:\\\\Users"]';
  const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, [seg("t0", ["x"])]);
  ok("escaped quotes/backslashes survive salvage from truncated JSON");
  assert.equal(mapping.t0[0], 'Zitat: "quoted" und Pfad C:\\Users');
  assert.equal(invalidIds.length, 0);
}

// --- 11. empty / garbage response: everything invalid, never throws --------
{
  for (const raw of ["", "I cannot do that.", "{\"t0\": [\"a", "[]", "null"]) {
    const { mapping, invalidIds } = parseInPlaceTranslationResponse(raw, BATCH, {
      subject: ["s"],
    });
    assert.equal(Object.keys(mapping).length, 0, `no ids for ${JSON.stringify(raw)}`);
    assert.equal(invalidIds.length, 4, `all invalid for ${JSON.stringify(raw)}`);
  }
  ok("garbage/empty responses: all ids invalid, never throws");
}

// --- 12. extractJsonObjectText sanity --------------------------------------
{
  assert.equal(extractJsonObjectText('noise {"a":1} noise'), '{"a":1}');
  assert.equal(extractJsonObjectText('no braces'), "");
  ok("extractJsonObjectText extracts the outermost object");
}

console.log(`\n${passed}/${passed} checks passed`);
