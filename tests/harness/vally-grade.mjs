#!/usr/bin/env node
/**
 * Grader for Vally `run-command`. Vally copies this file into the evaluation workspace as
 * .vally/grade.mjs (grading environment, hidden from the agent) and runs:
 *
 *   node .vally/grade.mjs <skill> <scenario>
 *
 * It evaluates the files in the workspace with the same checks as the mock harness
 * (expected and forbidden patterns plus language validators) and exits 0 on pass, 1 on fail.
 * FA_REPO_ROOT must point at the repository checkout; scripts/vally.mjs sets it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const [skill, scenarioName] = process.argv.slice(2);
const repoRoot = process.env.FA_REPO_ROOT;
if (!skill || !scenarioName || !repoRoot) {
  console.error("usage: FA_REPO_ROOT=<repo> node grade.mjs <skill> <scenario>");
  process.exit(2);
}

const load = (p) => import(pathToFileURL(join(repoRoot, p)).href);
const { parse } = await load("node_modules/yaml/dist/index.js");
const { evaluateResponse } = await load("tests/harness/evaluate.mjs");

const scenariosPath = join(repoRoot, "tests", "scenarios", skill, "scenarios.yaml");
const data = parse(readFileSync(scenariosPath, "utf8"));
const scenario = (data.scenarios ?? []).find((s) => s.name === scenarioName);
if (!scenario) {
  console.error(`Scenario '${scenarioName}' not found in ${scenariosPath}`);
  process.exit(2);
}

const SKIP = new Set([".vally", ".git", "node_modules", ".venv", "__pycache__"]);

/**
 * Collect the files the agent (or the golden patch) produced. Vally copies the skill under
 * test into the workspace; folders that contain a SKILL.md are skipped so the skill's own
 * documentation, which names the anti-patterns, is never graded as output.
 */
function collect(dir, root, out = []) {
  const names = readdirSync(dir);
  if (dir !== root && names.includes("SKILL.md")) return out;
  for (const name of names) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, root, out);
    else out.push({ path: relative(root, full).split(sep).join("/"), content: readFileSync(full, "utf8").replace(/\r\n/g, "\n") });
  }
  return out;
}

const files = collect(process.cwd(), process.cwd());
if (!files.length) {
  console.log("FAIL: the workspace contains no files to grade.");
  process.exit(1);
}

const result = await evaluateResponse(scenario, { files }, { strictValidators: true, defaultEnvironment: data.environment ?? null });
console.log(`${result.passed ? "PASS" : "FAIL"} ${skill}/${scenarioName} files=${result.files.join(",")}${result.environment ? ` environment=${result.environment}` : ""}`);
for (const f of result.failures) console.log(`  - ${f}`);
process.exit(result.passed ? 0 : 1);
