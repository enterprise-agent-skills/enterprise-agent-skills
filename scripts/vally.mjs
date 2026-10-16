#!/usr/bin/env node
/**
 * Credential-free Vally checks (Microsoft Vally CLI, MIT license):
 *
 *   1. vally lint          on every plugin's skills folder (spec compliance, file references,
 *                          URL hygiene against config/known-domains.txt)
 *   2. vally lint          on every generated eval spec (--strict)
 *   3. vally oracle        applies each scenario's golden patch and runs the graders
 *   4. vally oracle --no-golden-input
 *                          negative control: every grader must fail without the golden answer
 *
 * None of these steps runs an agent or calls a model. Live evaluations are optional and
 * documented in docs/testing.md.
 *
 *   npm run eval:vally
 *   npm run eval:vally -- --skill <name>
 */
import { spawnSync } from "node:child_process";
import { REPO_ROOT, PATHS } from "./lib/constants.mjs";
import { loadRepository } from "./lib/repo-model.mjs";
import { appendJobSummary, mdTable, parseArgs, writeReport } from "./lib/report.mjs";

const args = parseArgs(process.argv.slice(2));
const model = loadRepository();
const version = model.config?.tooling?.vally_cli_version ?? "0.19.0";
const env = { ...process.env, VALLY_TELEMETRY_OPTOUT: "1", DO_NOT_TRACK: "1", FA_REPO_ROOT: REPO_ROOT };
const isWin = process.platform === "win32";

function vally(argv) {
  const all = ["--yes", `@microsoft/vally-cli@${version}`, ...argv];
  const cmd = isWin ? "npx.cmd" : "npx";
  const quoted = isWin ? all.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : all;
  const r = spawnSync(cmd, quoted, { cwd: REPO_ROOT, env, encoding: "utf8", shell: isWin, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  return { status: r.status ?? 1, output };
}

const steps = [];
function record(kind, target, expectZero, r) {
  const ok = expectZero ? r.status === 0 : r.status !== 0;
  steps.push({ kind, target, ok, exitCode: r.status, output: r.output.trim().split("\n").slice(-25).join("\n") });
  console.log(`${ok ? "PASS" : "FAIL"}  ${kind.padEnd(16)} ${target}  (exit ${r.status})`);
  if (!ok) console.log(r.output.trim().split("\n").slice(-25).map((l) => `      ${l}`).join("\n"));
}

const versionCheck = vally(["--version"]);
if (versionCheck.status !== 0) {
  console.error(`Could not run @microsoft/vally-cli@${version} through npx:\n${versionCheck.output}`);
  process.exit(1);
}
console.log(`vally ${versionCheck.output.trim().split("\n").pop()}`);

const knownDomains = PATHS.knownDomains;
for (const plugin of model.plugins) {
  if (args.skill && !plugin.skills.some((s) => s.data?.name === args.skill)) continue;
  const target = `${plugin.relDir}/skills`;
  record("lint-skills", target, true, vally(["lint", target, "--known-domains", knownDomains, "--strict"]));
}

for (const skill of model.skills) {
  const name = skill.data?.name;
  if (!name || (args.skill && args.skill !== name)) continue;
  const entry = model.scenarios[name];
  if (!entry?.hasVally) continue;
  const spec = entry.vallyFile;
  record("lint-eval-spec", spec, true, vally(["lint", "--eval-spec", spec, "--strict"]));
  if (args["skip-oracle"]) continue;
  record("oracle", spec, true, vally(["oracle", "--eval-spec", spec]));
  record("oracle-baseline", spec, true, vally(["oracle", "--eval-spec", spec, "--no-golden-input"]));
}

const failed = steps.filter((s) => !s.ok);
const md = [
  "## Vally checks (offline)",
  "",
  `@microsoft/vally-cli ${version}. Lint, oracle on golden answers, and a baseline run that must fail without them. No agent or model is invoked.`,
  "",
  mdTable(["Step", "Target", "Result", "Exit code"], steps.map((s) => [s.kind, s.target, s.ok ? "pass" : "FAIL", s.exitCode])),
  "",
  `${steps.length - failed.length}/${steps.length} steps passed.`,
].join("\n");
writeReport("vally", { generatedAt: new Date().toISOString(), version, steps }, md);
appendJobSummary(md);
console.log(`\nVally: ${steps.length - failed.length}/${steps.length} steps passed.`);
process.exit(failed.length ? 1 : 0);
