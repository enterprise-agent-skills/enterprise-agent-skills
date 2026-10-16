#!/usr/bin/env node
/**
 * Static validation of the whole repository. No network access and no model credentials.
 *
 *   npm run validate             all checks
 *   npm run validate -- --strict unavailable validators fail (default in CI)
 *
 * Writes reports/validation.json and reports/validation.md. Exit code 1 on any error.
 */
import { join } from "node:path";
import { REPO_ROOT } from "./lib/constants.mjs";
import { listDirs, readText, exists, rel, walkFiles } from "./lib/fsutil.mjs";
import { Findings } from "./lib/findings.mjs";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { loadRepository } from "./lib/repo-model.mjs";
import { generateAll } from "./lib/generate.mjs";
import { checkConfig, checkLanguageFeatures, checkMcpRegistry, checkSapEnvironments } from "./lib/checks/config-checks.mjs";
import { checkPlugins, checkMarketplaces } from "./lib/checks/plugin-checks.mjs";
import { checkSkills } from "./lib/checks/skill-checks.mjs";
import { checkScenarios } from "./lib/checks/scenario-checks.mjs";
import { checkMarkdownLinks } from "./lib/checks/link-checks.mjs";
import { appendJobSummary, isCI, mdTable, parseArgs, writeReport } from "./lib/report.mjs";

const args = parseArgs(process.argv.slice(2));
const strictValidators = Boolean(args.strict) || isCI();
const findings = new Findings("validate");
const model = loadRepository();

for (const e of model.loadErrors) findings.error("LOAD", e.message, { file: e.file });

checkConfig(model, findings);
checkMcpRegistry(model, findings);
await checkSapEnvironments(findings);
checkLanguageFeatures(findings);

let generated = new Map();
try {
  generated = generateAll(model);
} catch (err) {
  findings.error("GENERATE", `Generation failed: ${err.message}`);
}
if (generated.size) {
  checkPlugins(model, generated, findings);
  checkMarketplaces(generated, findings);
}
const skillStats = await checkSkills(model, findings, { strictValidators });
checkScenarios(model, findings);
const linkStats = checkMarkdownLinks(findings);
checkPlaceholders(findings);
const incubator = checkIncubator(findings);

findings.print();

const s = findings.summary();
const md = [
  "## Static validation",
  "",
  mdTable(["Measure", "Value"], [
    ["Plugins", model.plugins.length],
    ["Skills", skillStats.skills],
    ["Scenario folders", Object.keys(model.scenarios).length],
    ["Code snippets validated", skillStats.snippetsValidated],
    ["Code fragments without a parser", skillStats.fragments],
    ["Snippets explicitly skipped", skillStats.snippetsSkipped],
    ["Relative links checked", linkStats.checked],
    ["Incubator drafts (not in catalog)", incubator.count],
    ["Errors", s.errors],
    ["Warnings", s.warnings],
  ]),
  "",
  s.errors ? mdTable(["Code", "Location", "Message"], findings.errors.map((f) => [f.code, `${f.file ?? ""}${f.line ? `:${f.line}` : ""}`, f.message])) : "No errors.",
  "",
  s.warnings ? `<details><summary>${s.warnings} warning(s)</summary>\n\n${mdTable(["Code", "Location", "Message"], findings.warnings.map((f) => [f.code, `${f.file ?? ""}${f.line ? `:${f.line}` : ""}`, f.message]))}\n\n</details>` : "",
].join("\n");

writeReport("validation", { generatedAt: new Date().toISOString(), strictValidators, summary: s, skillStats, linkStats, incubator, findings: findings.items }, md);
appendJobSummary(md);
process.exit(s.errors ? 1 : 0);

/** Template placeholders ({{TODO: ...}}) must be replaced before a skill or plugin merges. */
function checkPlaceholders(f) {
  for (const root of ["plugins", "tests/scenarios"]) {
    for (const absFile of walkFiles(join(REPO_ROOT, root))) {
      const lines = readText(absFile).split("\n");
      lines.forEach((line, i) => {
        if (line.includes("{{TODO")) f.error("TEMPLATE_PLACEHOLDER", "Unfinished template placeholder.", { file: rel(absFile), line: i + 1 });
      });
    }
  }
}

/** Legacy drafts in incubator/ are reported, never published. Problems are warnings. */
function checkIncubator(f) {
  const root = join(REPO_ROOT, "incubator", "legacy-cowork-skills");
  const dirs = listDirs(root);
  for (const dir of dirs) {
    const file = join(root, dir, "SKILL.md");
    const relFile = `incubator/legacy-cowork-skills/${dir}/SKILL.md`;
    if (!exists(file)) continue;
    const parsed = parseFrontmatter(readText(file));
    const issues = [];
    if (parsed.error) issues.push(parsed.error);
    else {
      if (parsed.data.name !== dir) issues.push(`name '${parsed.data.name ?? ""}' does not match folder`);
      if (!/\bUSE FOR:/.test(String(parsed.data.description ?? ""))) issues.push("description lacks USE FOR / DO NOT USE FOR triggers");
    }
    const lines = readText(file).split("\n").length;
    if (lines > 500) issues.push(`${lines} lines (limit 500)`);
    if (issues.length) f.warn("INCUBATOR_NOT_READY", `Draft needs migration before publishing: ${issues.join("; ")}.`, { file: relFile });
  }
  return { count: dirs.length };
}
