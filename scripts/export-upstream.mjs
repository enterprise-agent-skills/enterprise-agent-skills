#!/usr/bin/env node
/**
 * Export a skill in the layout used by github.com/microsoft/skills so it can be proposed
 * upstream with little rework.
 *
 *   npm run export:upstream -- --skill fabric-lakehouse-incremental-merge \
 *       --out ../export/microsoft-skills --target-plugin <their-plugin-folder>
 *
 * Only skills whose plugin declares upstream.microsoft_skills as candidate, submitted, or
 * accepted can be exported. Eligibility is a maintainer decision in microsoft/skills; open an
 * issue there before sending a pull request.
 *
 * Output:
 *   .github/plugins/<target-plugin>/skills/<skill>/   SKILL.md (name, description, compatibility) + resources
 *   tests/scenarios/<skill>/acceptance-criteria.md
 *   tests/scenarios/<skill>/scenarios.yaml             fields from their schema only
 *   UPSTREAM-CHECKLIST.md                              steps left to do by hand
 */
import { cpSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { stringify } from "yaml";
import { REPO_ROOT } from "./lib/constants.mjs";
import { writeIfChanged } from "./lib/fsutil.mjs";
import { stringifyFrontmatter } from "./lib/frontmatter.mjs";
import { loadRepository } from "./lib/repo-model.mjs";
import { parseArgs } from "./lib/report.mjs";

const ELIGIBLE = new Set(["candidate", "submitted", "accepted"]);
const UPSTREAM_SCENARIO_FIELDS = ["name", "prompt", "expected_patterns", "forbidden_patterns", "tags", "mock_response"];

const args = parseArgs(process.argv.slice(2));
const fail = (msg) => {
  console.error(`export:upstream: ${msg}`);
  process.exit(1);
};
if (!args.skill || !args.out) fail("usage: --skill <name> --out <dir> [--target-plugin <folder>]");

const model = loadRepository();
const skill = model.skills.find((s) => s.data?.name === args.skill);
if (!skill) fail(`Skill not found: ${args.skill}`);
const plugin = model.plugins.find((p) => p.dirName === skill.plugin);
const status = plugin?.source?.upstream?.microsoft_skills ?? "not-applicable";
if (!ELIGIBLE.has(status)) {
  fail(`Plugin '${skill.plugin}' declares upstream.microsoft_skills: ${status}. Only Microsoft-specific skills marked 'candidate' (after checking with the microsoft/skills maintainers) can be exported.`);
}

const outDir = isAbsolute(args.out) ? args.out : resolve(process.cwd(), args.out);
if (resolve(outDir).startsWith(resolve(REPO_ROOT, "plugins"))) fail("Choose an output folder outside plugins/.");
const targetPlugin = args["target-plugin"] && args["target-plugin"] !== true ? args["target-plugin"] : skill.plugin;
if (!args["target-plugin"]) console.warn(`No --target-plugin given; using '${targetPlugin}'. The microsoft/skills maintainers decide the final plugin folder.`);

// 1. Skill folder: resources copied as-is, frontmatter reduced to the fields upstream uses.
const skillOut = join(outDir, ".github", "plugins", targetPlugin, "skills", skill.dirName);
mkdirSync(skillOut, { recursive: true });
cpSync(skill.dir, skillOut, { recursive: true });
const front = { name: skill.data.name, description: String(skill.data.description).replace(/\s+/g, " ").trim(), compatibility: String(skill.data.compatibility).replace(/\s+/g, " ").trim() };
writeIfChanged(join(skillOut, "SKILL.md"), `${stringifyFrontmatter(front)}\n${skill.body}`);

// 2. Tests: acceptance criteria unchanged, scenarios reduced to the upstream schema.
const entry = model.scenarios[skill.data.name];
if (!entry?.data) fail(`No tests/scenarios/${skill.data.name}/scenarios.yaml to export.`);
const testsOut = join(outDir, "tests", "scenarios", skill.data.name);
writeIfChanged(join(testsOut, "acceptance-criteria.md"), entry.criteriaText);
const scenarios = {
  config: entry.data.config,
  scenarios: entry.data.scenarios.map((s) => Object.fromEntries(UPSTREAM_SCENARIO_FIELDS.map((k) => [k, s[k]]))),
};
writeIfChanged(join(testsOut, "scenarios.yaml"), `# Exported from ${model.config.repository.name} (tests/scenarios/${skill.data.name}).\n${stringify(scenarios, { lineWidth: 0 })}`);

// 3. Checklist of the steps the exporter cannot do.
const checklist = [
  `# Upstream checklist: ${skill.data.name}`,
  "",
  `Exported from ${model.config.repository.name} on ${new Date().toISOString().slice(0, 10)}.`,
  "",
  "- [ ] Open an issue in https://github.com/microsoft/skills describing the skill and ask whether it fits the repository's scope.",
  `- [ ] Confirm the target plugin folder (exported to \`.github/plugins/${targetPlugin}/\`).`,
  "- [ ] Check naming against the conventions in their README and skill-creator skill; rename if asked.",
  `- [ ] Run their mock harness: \`cd tests && pnpm install && pnpm harness ${skill.data.name} --mock --verbose\`.`,
  "- [ ] Add the skill to the catalog section of their README.",
  "- [ ] Mention the origin repository in the pull request description; keep the MIT license notice.",
  "- [ ] Remove anything Microsoft maintainers ask to drop, such as non-Microsoft product references.",
  "",
  "Fields removed during export: SKILL.md `license` and `metadata`; scenario `description`, `validators`, and `negative_responses`.",
  "Vally specs are not exported because they depend on this repository's grader script.",
  "",
].join("\n");
writeIfChanged(join(outDir, "UPSTREAM-CHECKLIST.md"), checklist);

console.log(`Exported ${skill.data.name} to ${outDir}`);
console.log("Read UPSTREAM-CHECKLIST.md before opening a pull request.");
