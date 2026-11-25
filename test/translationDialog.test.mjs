// Plain-assert Node tests for the live translated view (read mode):
// - bodyDom applySegmentTranslations onApplied callback (flash targets)
// - the dialog-side flow: parse the view html, adopt the parsed body into
//   the "dialog" document, apply incremental updates, flash classes.
// Runs against jsdom the same way bodyDom.test.mjs does.

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));

function transpile(relPath, outName) {
  const source = readFileSync(path.join(here, "..", relPath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2019 },
  });
  const outDir = path.join(tmpdir(), "translation-dialog-test");
  mkdirSync(outDir, { recursive: true });
  const modulePath = path.join(outDir, outName);
  writeFileSync(modulePath, outputText);
  return pathToFileURL(modulePath).href;
}

const { applySegmentTranslations, buildSegmentBatches, parseMailBodyHtml, serializeMailBody } =
  await import(transpile("src/shared/bodyDom.ts", "bodyDomDialog.mjs"));

const jsdomWindow = new JSDOM("<!DOCTYPE html><html><body></body></html>").window;
globalThis.window = jsdomWindow;

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const MAIL_HTML = `<!DOCTYPE html>
<html><body>
  <p dir="ltr">Hello <b>team</b>, the quarterly review is on Friday.</p>
  <p><img src="x.png" alt="Chart of results">Numbers: 42</p>
  <p>Best regards,<br>Kim</p>
</body></html>`;

/* Minimal re-implementation of the dialog's live-view behavior (mirrors
 * src/dialog/resultDialog.ts) so the flow is tested without Office.js. */
function createDialogHarness() {
  const dialogDom = new JSDOM(
    `<!doctype html><html><head></head><body>
      <p id="dialog-notes" hidden></p>
      <p id="dialog-subject" hidden></p>
      <div id="dialog-markup"></div>
    </body></html>`
  );
  const doc = dialogDom.window.document;
  const markup = doc.getElementById("dialog-markup");
  const subjectNode = doc.getElementById("dialog-subject");

  const state = {
    liveParsed: null,
    originalHtml: "",
    appliedMapping: {},
    appliedIds: new Set(),
    language: "",
  };

  return {
    doc,
    state,
    applyView(view) {
      const parsed = parseMailBodyHtml(view.html);
      assert.ok(parsed, "view html must parse");
      state.liveParsed = parsed;
      state.originalHtml = view.html;
      state.appliedMapping = {};
      state.appliedIds = new Set();
      state.language = view.language;
      markup.innerHTML = "";
      markup.appendChild(doc.adoptNode(parsed.document.body));
    },
    applyUpdate(update) {
      assert.ok(state.liveParsed, "view must be applied before updates");
      const fresh = {};
      for (const id of Object.keys(update.mapping)) {
        if (!state.appliedIds.has(id)) {
          fresh[id] = update.mapping[id];
        }
      }
      const flashedNodes = [];
      const newIds = Object.keys(fresh);
      if (newIds.length > 0) {
        applySegmentTranslations(state.liveParsed, fresh, (nodes) => flashedNodes.push(...nodes));
        for (const id of newIds) {
          state.appliedIds.add(id);
          state.appliedMapping[id] = fresh[id];
        }
      }
      if (update.subjectHtml) {
        subjectNode.textContent = update.subjectHtml;
        subjectNode.hidden = false;
      }
      return flashedNodes;
    },
    copyHtml() {
      const parsed = parseMailBodyHtml(state.originalHtml);
      assert.ok(parsed, "original html must re-parse for copy");
      applySegmentTranslations(parsed, state.appliedMapping);
      return serializeMailBody(parsed);
    },
  };
}

console.log("live translated view (dialog simulation)");

// --- 1. view renders the original copy immediately ------------------------
{
  const h = createDialogHarness();
  const parsed = parseMailBodyHtml(MAIL_HTML);
  const mailCopyHtml = serializeMailBody(parsed);

  h.applyView({ html: mailCopyHtml, language: "German" });

  ok("adopted body renders the original mail copy");
  assert.match(h.doc.getElementById("dialog-markup").textContent, /Hello team/);
  assert.equal(h.doc.querySelectorAll("#dialog-markup body p").length, 3);
}

// --- 2. incremental updates splice translations into the LIVE dom ---------
{
  const h = createDialogHarness();
  const parsed = parseMailBodyHtml(MAIL_HTML);
  const mailCopyHtml = serializeMailBody(parsed);
  h.applyView({ html: mailCopyHtml, language: "German" });

  const batches = buildSegmentBatches(parsed.segments, 4000);
  assert.ok(batches.length >= 1, "mail must yield batches");

  // First batch: translate the first two segments.
  const firstIds = ["t0", "t1"];
  const mapping1 = {};
  for (const id of firstIds) {
    const segment = parsed.segments.find((s) => s.id === id);
    mapping1[id] = segment.parts.map((part) => `DE(${part})`);
  }
  const flashed1 = h.applyUpdate({ type: "translationUpdate", mapping: mapping1 });

  ok("first update splices translations into the live copy");
  assert.match(h.doc.getElementById("dialog-markup").textContent, /DE\(Hello\)/);
  assert.match(h.doc.getElementById("dialog-markup").textContent, /DE\(team\)/);

  ok("every applied segment reported its flash target nodes");
  const expectedFlash1 = firstIds.reduce(
    (sum, id) => sum + parsed.segments.find((s) => s.id === id).parts.length,
    0
  );
  assert.equal(flashed1.length, expectedFlash1);
  assert.ok(flashed1.every((node) => node.nodeType === 3), "text flash targets are Text nodes");

  // Second update carries the FULL mapping (old + new): ids already applied
  // must not be reported (and thus not flashed) again.
  const remaining = parsed.segments
    .filter((s) => s.kind === "text" && !firstIds.includes(s.id))
    .slice(0, 2);
  const mapping2 = { ...mapping1 };
  for (const segment of remaining) {
    mapping2[segment.id] = segment.parts.map((part) => `DE(${part})`);
  }
  const flashed2 = h.applyUpdate({ type: "translationUpdate", mapping: mapping2 });
  const expectedFlash2 = remaining.reduce((sum, s) => sum + s.parts.length, 0);
  assert.equal(flashed2.length, expectedFlash2, "only new ids are flashed");
  ok("full-mapping update applies only unseen ids (lost-update healing)");

  ok("structure unchanged after live applies (structure guarantee holds)");
  const before = h.doc.getElementById("dialog-markup").querySelector("body");
  assert.equal(before.querySelectorAll("p").length, 3);
  assert.equal(before.querySelectorAll("b").length, 1);
  assert.ok(before.querySelector("b").textContent.includes("DE("));
}

// --- 3. attribute segments translate and flash the element ----------------
{
  const h = createDialogHarness();
  const parsed = parseMailBodyHtml(MAIL_HTML);
  h.applyView({ html: serializeMailBody(parsed), language: "German" });

  const attrSegment = parsed.segments.find((s) => s.kind === "attribute");
  assert.ok(attrSegment, "mail has an alt attribute segment");
  const flashed = h.applyUpdate({
    type: "translationUpdate",
    mapping: { [attrSegment.id]: ["DE(Chart of results)"] },
  });

  ok("attribute segment translated via setAttribute");
  assert.equal(
    h.doc.getElementById("dialog-markup").querySelector("img").getAttribute("alt"),
    "DE(Chart of results)"
  );
  assert.equal(flashed.length, 1);
  assert.equal(flashed[0].nodeType, 1, "flash target for attributes is the element");
}

// --- 4. multi-part segments keep their per-node layout --------------------
{
  const h = createDialogHarness();
  const parsed = parseMailBodyHtml(MAIL_HTML);
  h.applyView({ html: serializeMailBody(parsed), language: "German" });

  const multiPart = parsed.segments.find(
    (s) => s.kind === "text" && s.parts.length > 1 && s.parts.some((p) => p.includes("Best regards"))
  );
  assert.ok(multiPart, "mail has a multi-part segment (Best regards,<br>Kim)");
  h.applyUpdate({
    type: "translationUpdate",
    mapping: { [multiPart.id]: multiPart.parts.map((part) => `DE(${part})`) },
  });

  const markup = h.doc.getElementById("dialog-markup");
  ok("multi-part segment: each text node keeps its own translated value");
  assert.match(markup.textContent, /DE\(Best regards,\)\s*DE\(Kim\)/);
}

// --- 5. copy reflects the CURRENT translation state -----------------------
{
  const h = createDialogHarness();
  const parsed = parseMailBodyHtml(MAIL_HTML);
  h.applyView({ html: serializeMailBody(parsed), language: "German" });

  const copiedBefore = h.copyHtml();
  assert.match(copiedBefore, /Hello <b>team<\/b>/);
  assert.doesNotMatch(copiedBefore, /DE\(/);

  h.applyUpdate({
    type: "translationUpdate",
    mapping: { [parsed.segments[0].id]: parsed.segments[0].parts.map((p) => `DE(${p})`) },
  });

  const copiedAfter = h.copyHtml();
  ok("copy re-parses the original and replays the accumulated mapping");
  assert.match(copiedAfter, /DE\(Hello\)/);
  assert.match(copiedAfter, /quarterly review is on Friday/, "untranslated parts stay original");
}

// --- 6. ids align between the taskpane parse and the dialog re-parse ------
{
  const parsed = parseMailBodyHtml(MAIL_HTML);
  const roundTripped = serializeMailBody(parsed);
  const reparsed = parseMailBodyHtml(roundTripped);

  ok("dialog re-parse of the serialized copy yields identical segment ids");
  assert.deepEqual(
    parsed.segments.map((s) => [s.id, s.parts]),
    reparsed.segments.map((s) => [s.id, s.parts])
  );
}

console.log(`\n${passed}/${passed} checks passed`);
