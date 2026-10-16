import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { REPO_ROOT, PATHS } from "./constants.mjs";

export function mdTable(headers, rows) {
  const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const head = `| ${headers.map(esc).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  return [head, sep, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
}

/** Write a report pair (JSON + Markdown) under reports/. Returns the relative paths. */
export function writeReport(name, json, markdown) {
  const dir = join(REPO_ROOT, PATHS.reports);
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, `${name}.json`);
  const mdPath = join(dir, `${name}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
  return { json: `${PATHS.reports}/${name}.json`, markdown: `${PATHS.reports}/${name}.md` };
}

/** Append Markdown to the GitHub Actions job summary when running in Actions. */
export function appendJobSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${markdown}\n`, "utf8");
}

export function isCI() {
  return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}
