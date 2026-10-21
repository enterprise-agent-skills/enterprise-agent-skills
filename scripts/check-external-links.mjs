#!/usr/bin/env node
/**
 * Check external links in Markdown files (excluding incubator/). Runs on a schedule, not on
 * pull requests, because remote sites fail for reasons unrelated to a change.
 *
 *   npm run links:external                  report only
 *   npm run links:external -- --fail-on-broken
 *
 * Writes reports/external-links.json and reports/external-links.md.
 */
import { externalLinks } from "./lib/checks/link-checks.mjs";
import { appendJobSummary, mdTable, parseArgs, writeReport } from "./lib/report.mjs";

const args = parseArgs(process.argv.slice(2));
const links = [...externalLinks().entries()];
const TIMEOUT_MS = 15000;
const CONCURRENCY = 8;

async function probe(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "enterprise-agent-skills-link-check" } });
      if (res.ok) return { status: res.status, ok: true };
      if (method === "GET" || ![403, 405, 501].includes(res.status)) return { status: res.status, ok: false };
    } catch (err) {
      if (method === "GET") return { status: 0, ok: false, error: err.name === "TimeoutError" ? "timeout" : err.message };
    }
  }
  return { status: 0, ok: false };
}

const results = [];
for (let i = 0; i < links.length; i += CONCURRENCY) {
  const batch = links.slice(i, i + CONCURRENCY);
  results.push(...(await Promise.all(batch.map(async ([url, files]) => ({ url, files, ...(await probe(url)) })))));
}

const broken = results.filter((r) => !r.ok);
for (const r of broken) console.log(`BROKEN ${r.status || r.error} ${r.url}  (${r.files.join(", ")})`);
console.log(`External links: ${results.length - broken.length}/${results.length} reachable.`);

const md = [
  "## External links",
  "",
  `${results.length - broken.length}/${results.length} reachable.`,
  "",
  broken.length ? mdTable(["URL", "Status", "Used in"], broken.map((r) => [r.url, r.status || r.error, r.files.join(", ")])) : "No broken links.",
].join("\n");
writeReport("external-links", { generatedAt: new Date().toISOString(), results }, md);
appendJobSummary(md);
process.exit(args["fail-on-broken"] && broken.length ? 1 : 0);
