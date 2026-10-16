#!/usr/bin/env node
/**
 * Generate platform manifests, marketplaces, catalog, llms.txt, README catalog regions,
 * plugin READMEs, and Vally eval specs from the source files.
 *
 *   npm run build          write generated files
 *   npm run build:check    fail if any generated file is missing or out of date (CI)
 */
import { join } from "node:path";
import { REPO_ROOT } from "./lib/constants.mjs";
import { writeIfChanged } from "./lib/fsutil.mjs";
import { loadRepository } from "./lib/repo-model.mjs";
import { generateAll } from "./lib/generate.mjs";

const check = process.argv.includes("--check");
const model = loadRepository();
if (model.loadErrors.length) {
  for (const e of model.loadErrors) console.error(`ERROR ${e.file}: ${e.message}`);
  console.error("\nFix the load errors above, then run the build again.");
  process.exit(1);
}

const outputs = generateAll(model);
const stale = [];
for (const [path, content] of outputs) {
  const r = writeIfChanged(join(REPO_ROOT, path), content, { check });
  if (r.changed) stale.push(`${path}${r.missing ? " (missing)" : ""}`);
}

if (check) {
  if (stale.length) {
    console.error("Generated files are out of date. Run `npm run build` and commit the result:");
    for (const s of stale) console.error(`  ${s}`);
    process.exit(1);
  }
  console.log(`build:check: ${outputs.size} generated files are up to date.`);
} else {
  console.log(`build: ${outputs.size} generated files, ${stale.length} updated.`);
  for (const s of stale) console.log(`  updated ${s}`);
}
