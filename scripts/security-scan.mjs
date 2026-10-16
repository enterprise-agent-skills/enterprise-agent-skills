#!/usr/bin/env node
/**
 * Offline security hygiene scan. Complements GitHub secret scanning, CodeQL, and dependency
 * review (see .github/workflows/security.yml) with checks specific to agent content.
 *
 * Writes reports/security.json and reports/security.md. Exit code 1 on any error.
 */
import { extname, join } from "node:path";
import { REPO_ROOT, PATHS } from "./lib/constants.mjs";
import { exists, readText, rel, TEXT_EXTENSIONS, walkFiles } from "./lib/fsutil.mjs";
import { Findings } from "./lib/findings.mjs";
import { appendJobSummary, mdTable, writeReport } from "./lib/report.mjs";
import { ASSIGNMENT_RULE, CONTENT_RULES, HIDDEN_UNICODE, SECRET_RULES } from "./lib/security-rules.mjs";

const findings = new Findings("security");
const allowlist = loadAllowlist();
const scripts = [];
let scanned = 0;

for (const absFile of walkFiles(REPO_ROOT)) {
  const file = rel(absFile);
  const ext = extname(file).toLowerCase() || `.${file.split("/").pop()}`;
  if (!TEXT_EXTENSIONS.has(ext) && !["LICENSE", "CODEOWNERS"].includes(file.split("/").pop())) continue;
  if (file === "package-lock.json") continue;
  scanned++;
  const shipped = file.startsWith("plugins/");
  const testContent = file.startsWith("tests/scenarios/");
  const lines = readText(absFile).split("\n");
  if (/^plugins\/[^/]+\/skills\/[^/]+\/scripts\//.test(file)) scripts.push(file);

  lines.forEach((line, i) => {
    const prev = i > 0 ? lines[i - 1] : "";
    const allowed = (id) => isAllowed(file, id, line, prev);
    const where = { file, line: i + 1 };

    for (const rule of SECRET_RULES) {
      if (rule.re.test(line) && !allowed(rule.id)) findings.error(rule.id, "Possible credential. Remove it, rotate it if it was real, and load it from the environment instead.", where);
    }
    const m = line.match(ASSIGNMENT_RULE.re);
    if (m && !ASSIGNMENT_RULE.placeholder.test(m[2]) && !allowed(ASSIGNMENT_RULE.id)) {
      const msg = `Literal value assigned to '${m[1]}'. Use an environment variable, a secret store, or an obvious placeholder such as <your-secret>.`;
      if (shipped || testContent) findings.error(ASSIGNMENT_RULE.id, msg, where);
      else findings.warn(ASSIGNMENT_RULE.id, msg, where);
    }
    if (HIDDEN_UNICODE.re.test(line) && !allowed(HIDDEN_UNICODE.id)) {
      findings.error(HIDDEN_UNICODE.id, "Invisible or bidirectional control character. These can hide instructions from reviewers.", where);
    }
    if (shipped) {
      for (const rule of CONTENT_RULES) {
        if (rule.re.test(line) && !allowed(rule.id)) findings.add(rule.level, rule.id, contentMessage(rule.id), where);
      }
    }
  });
}

for (const s of scripts) findings.info("SKILL_SCRIPT_REVIEW", "Bundled skill script. Reviewers must read it in full before merge.", { file: s });

findings.print();
const sum = findings.summary();
const md = [
  "## Security hygiene scan",
  "",
  `Scanned ${scanned} text files. ${sum.errors} error(s), ${sum.warnings} warning(s). Bundled skill scripts requiring human review: ${scripts.length}.`,
  "",
  findings.items.filter((f) => f.level !== "info").length
    ? mdTable(["Level", "Rule", "Location", "Message"], findings.items.filter((f) => f.level !== "info").map((f) => [f.level, f.code, `${f.file}:${f.line}`, f.message]))
    : "No findings.",
  "",
  scripts.length ? `Scripts: ${scripts.map((s) => `\`${s}\``).join(", ")}` : "",
].join("\n");
writeReport("security", { generatedAt: new Date().toISOString(), scanned, scripts, summary: sum, findings: findings.items }, md);
appendJobSummary(md);
process.exit(sum.errors ? 1 : 0);

function contentMessage(id) {
  return {
    DANGER_PIPE_TO_SHELL: "Piping a download into a shell runs unreviewed code. Download, verify, then run.",
    DANGER_POWERSHELL_DOWNLOAD_EXEC: "Download-and-execute pattern. Download, verify, then run.",
    DANGER_TLS_VERIFICATION_DISABLED: "Disables TLS certificate verification.",
    DANGER_DESTRUCTIVE_COMMAND: "Destructive command in content an agent may execute.",
    PROMPT_INJECTION_PHRASE: "Text that reads like an instruction to override the agent or hide actions from the user.",
    INSECURE_HTTP_URL: "Plain http URL. Prefer https.",
    LARGE_ENCODED_BLOB: "Large encoded blob. Reviewers cannot read it; ship readable source instead.",
  }[id];
}

function isAllowed(file, id, line, prev) {
  const inline = new RegExp(`security-scan:\\s*allow\\s+${id}\\b`);
  if (inline.test(line) || inline.test(prev)) return true;
  return allowlist.some((a) => a.rule === id && (a.path === file || (a.path.endsWith("/**") && file.startsWith(a.path.slice(0, -2)))));
}

function loadAllowlist() {
  const path = join(REPO_ROOT, PATHS.securityAllowlist);
  if (!exists(path)) return [];
  return readText(path)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [p, rule, ...reason] = l.split(/\s+/);
      return { path: p, rule, reason: reason.join(" ") };
    });
}
