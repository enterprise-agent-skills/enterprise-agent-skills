#!/usr/bin/env node
/**
 * Mock evaluation for every skill that has tests/scenarios/<skill>/.
 *
 *   npm run eval:mock                     all skills
 *   npm run eval:mock -- --skill <name>   one skill
 *   npm run eval:mock -- --strict         unavailable validators fail (default in CI)
 *
 * Writes reports/mock-eval.json and reports/mock-eval.md. Exit code 1 on any failure.
 */
import { loadRepository } from "../../scripts/lib/repo-model.mjs";
import { mdTable, writeReport, appendJobSummary, isCI, parseArgs } from "../../scripts/lib/report.mjs";
import { evaluateSkill } from "./mock-eval.mjs";

const args = parseArgs(process.argv.slice(2));
const strictValidators = Boolean(args.strict) || isCI();
const model = loadRepository();

const targets = model.skills
  .filter((s) => s.data)
  .filter((s) => !args.skill || s.data.name === args.skill)
  .map((s) => ({ name: s.data.name, maturity: s.data.metadata?.maturity ?? "experimental", plugin: s.plugin }));

if (args.skill && !targets.length) {
  console.error(`Skill not found: ${args.skill}`);
  process.exit(1);
}

const results = [];
for (const t of targets) {
  const entry = model.scenarios[t.name];
  if (!entry) {
    results.push({ skill: t.name, maturity: t.maturity, passed: t.maturity === "experimental", errors: [`No tests/scenarios/${t.name}/ folder.`], warnings: [], scenarios: [], criteria: null });
    continue;
  }
  results.push(await evaluateSkill({ skill: t.name, maturity: t.maturity, scenarioEntry: entry, strictValidators }));
}

const totals = {
  skills: results.length,
  skillsPassed: results.filter((r) => r.passed).length,
  scenarios: results.reduce((n, r) => n + r.scenarios.length, 0),
  checks: results.reduce((n, r) => n + r.scenarios.reduce((m, s) => m + s.checks.length, 0), 0),
  checksPassed: results.reduce((n, r) => n + r.scenarios.reduce((m, s) => m + s.checks.filter((c) => c.passed).length, 0), 0),
};

for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.skill}  (${r.scenarios.length} scenarios)`);
  for (const s of r.scenarios) {
    for (const c of s.checks) {
      if (!c.passed) console.log(`      FAIL ${s.name} / ${c.label}: ${c.details.join(" | ")}`);
    }
  }
  for (const e of r.errors) console.log(`      ERROR ${e}`);
  for (const w of r.warnings) console.log(`      WARN  ${w}`);
}
console.log(`\nMock evaluation: ${totals.skillsPassed}/${totals.skills} skills passed, ${totals.checksPassed}/${totals.checks} checks passed, strict validators: ${strictValidators}`);

const md = [
  "## Mock evaluation",
  "",
  "Credential-free. Checks reference answers, negative controls, language validators, and acceptance-criteria coverage. It does not measure live model behavior.",
  "",
  mdTable(
    ["Skill", "Result", "Scenarios", "Checks passed", "Incorrect examples caught", "Correct examples parsed"],
    results.map((r) => [
      r.skill,
      r.passed ? "pass" : "FAIL",
      r.scenarios.length,
      `${r.scenarios.reduce((m, s) => m + s.checks.filter((c) => c.passed).length, 0)}/${r.scenarios.reduce((m, s) => m + s.checks.length, 0)}`,
      r.criteria ? `${r.criteria.detected}/${r.criteria.incorrect}${r.criteria.exempt ? ` (+${r.criteria.exempt} exempt)` : ""}` : "-",
      r.criteria ? `${r.criteria.validatedCorrect} files (${r.criteria.fragments} fragments not parsed)` : "-",
    ]),
  ),
  "",
  `Totals: ${totals.skillsPassed}/${totals.skills} skills, ${totals.checksPassed}/${totals.checks} checks. Strict validators: ${strictValidators}.`,
].join("\n");

const paths = writeReport("mock-eval", { generatedAt: new Date().toISOString(), strictValidators, totals, results }, md);
appendJobSummary(md);
console.log(`Reports: ${paths.markdown}, ${paths.json}`);
process.exit(results.every((r) => r.passed) ? 0 : 1);
