/* Marks the earliest moment the main bundle begins evaluating its module
 * graph. Must be the first import in index.tsx: ES module evaluation is
 * depth-first in source order, so this runs before any other module code.
 * assets/boot-report.js reports this marker to distinguish "bundle never
 * loaded/parsed" from "a module threw during evaluation". */
/* global window */
(window as any).__taskpaneEntryRan = "imports-started";
