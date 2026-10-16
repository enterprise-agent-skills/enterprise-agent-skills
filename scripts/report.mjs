#!/usr/bin/env node
/**
 * Combine the JSON reports in reports/ into one quality summary (reports/summary.md and
 * reports/summary.json). Run after the individual checks; missing reports are listed as
 * "not run" rather than treated as passing.
 */
import { join } from "node:path";
import { REPO_ROOT, PATHS } from "./lib/constants.mjs";
import { exists, readText } from "./lib/fsutil.mjs";
import { loadRepository, taxonomy } from "./lib/repo-model.mjs";
import { appendJobSummary, mdTable, writeReport } from "./lib/report.mjs";

const model = loadRepository();
const tax = taxonomy(model.config);
const read = (name) => {
  const p = join(REPO_ROOT, PATHS.reports, `${name}.json`);
  return exists(p) ? JSON.parse(readText(p)) : null;
};
const validation = read("validation");
const security = read("security");
const mock = read("mock-eval");
const vally = read("vally");
const links = read("external-links");

const skills = model.skills.filter((s) => s.data);
const byVendor = {};
const byMaturity = {};
for (const s of skills) {
  const md = s.data.metadata ?? {};
  byVendor[md.vendor] = (byVendor[md.vendor] ?? 0) + 1;
  byMaturity[md.maturity] = (byMaturity[md.maturity] ?? 0) + 1;
}

const today = new Date();
const staleDays = 180;
const verification = skills.map((s) => {
  const date = s.data.metadata?.["last-verified"];
  const age = date ? Math.floor((today - new Date(`${date}T00:00:00Z`)) / 86400000) : null;
  return { name: s.data.name, lastVerified: date ?? null, ageDays: age, stale: age === null || age > staleDays };
});

const status = (r, ok) => (r ? (ok(r) ? "pass" : "FAIL") : "not run");
const checks = [
  ["Static validation", status(validation, (r) => r.summary.errors === 0), validation ? `${validation.summary.errors} errors, ${validation.summary.warnings} warnings` : ""],
  ["Security scan", status(security, (r) => r.summary.errors === 0), security ? `${security.summary.errors} errors, ${security.summary.warnings} warnings` : ""],
  ["Mock evaluation", status(mock, (r) => r.totals.skillsPassed === r.totals.skills), mock ? `${mock.totals.checksPassed}/${mock.totals.checks} checks` : ""],
  ["Vally (offline)", status(vally, (r) => r.steps.every((s) => s.ok)), vally ? `${vally.steps.filter((s) => s.ok).length}/${vally.steps.length} steps` : ""],
  ["External links", status(links, (r) => r.results.every((x) => x.ok)), links ? `${links.results.filter((x) => x.ok).length}/${links.results.length} reachable` : ""],
];

const md = [
  "# Repository quality report",
  "",
  `Generated ${today.toISOString().slice(0, 10)}.`,
  "",
  "## Checks",
  "",
  mdTable(["Check", "Result", "Detail"], checks),
  "",
  "## Catalog",
  "",
  mdTable(["Vendor", "Skills"], Object.entries(byVendor).map(([v, n]) => [tax.vendorNames[v] ?? v, n])),
  "",
  mdTable(["Maturity", "Skills"], Object.entries(byMaturity).map(([m, n]) => [m, n])),
  "",
  "## Live verification",
  "",
  `Skills without a live verification in the last ${staleDays} days need one before they can be marked stable.`,
  "",
  mdTable(["Skill", "Last verified", "Status"], verification.map((v) => [v.name, v.lastVerified ?? "never", v.stale ? "needs verification" : "current"])),
  "",
  `Incubator drafts awaiting migration: ${validation?.incubator?.count ?? "unknown"}.`,
].join("\n");

writeReport("summary", { generatedAt: today.toISOString(), checks, byVendor, byMaturity, verification }, md);
appendJobSummary(md);
console.log(md);
