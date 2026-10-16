import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAllDocuments } from "yaml";
import { checkEnvironmentRules } from "./sap-env.mjs";

/**
 * Offline language validators. None of them calls a model or needs credentials.
 * Each returns results shaped as { validator, file, status, messages } where status is
 * "passed", "failed", or "unavailable" (tool not installed on this machine).
 */

export const VALIDATOR_FOR_EXTENSION = {
  ".abap": "abaplint",
  ".asddls": "abaplint",
  ".cls": "apex",
  ".trigger": "apex",
  ".py": "python",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
};

/** File types that are part of a solution but have no offline parser in this repository. */
export const UNVALIDATED_EXTENSIONS = new Set([".asbdef", ".asddlxs", ".srvdsrv", ".kql", ".dax", ".sql", ".md", ".txt"]);

export function extensionOf(path) {
  const m = path.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : "";
}

export function validatorFor(path) {
  return VALIDATOR_FOR_EXTENSION[extensionOf(path)] ?? null;
}

/**
 * Run every applicable validator over a list of { path, content } files.
 *
 * `abapEnv` is a resolved SAP environment (tests/harness/sap-env.mjs). ABAP and CDS files are
 * validated only against an explicit environment, because the same source can be valid on
 * S/4HANA 2023 and invalid on ECC 6.0 EHP6; without one they fail with an explanation.
 *
 * `contextFiles` are objects that already exist in the target system (for example a BAdI
 * interface quoted in the prompt). abaplint parses them with the answer so references
 * resolve; they are never reported or graded themselves.
 */
export async function runValidators(files, { abapEnv = null, contextFiles = [] } = {}) {
  const groups = {};
  const unvalidated = [];
  for (const f of files) {
    const v = validatorFor(f.path);
    if (v) (groups[v] ??= []).push(f);
    else unvalidated.push(f.path);
  }
  const results = [];
  if (groups.abaplint) {
    const context = contextFiles.filter((f) => validatorFor(f.path) === "abaplint");
    results.push(...(await validateAbap(groups.abaplint, abapEnv, context)));
  }
  if (groups.apex) results.push(...(await validateApex(groups.apex)));
  if (groups.python) results.push(...validatePython(groups.python));
  if (groups.javascript) results.push(...validateJavaScript(groups.javascript));
  if (groups.json) results.push(...groups.json.map(validateJson));
  if (groups.yaml) results.push(...groups.yaml.map(validateYaml));
  if (abapEnv?.ok) results.push(...checkEnvironmentRules(files, abapEnv));
  return { results, unvalidated };
}

// ---------------------------------------------------------------- ABAP and CDS (abaplint)

let abaplintModule = null;

async function loadAbaplint() {
  abaplintModule ??= await import("@abaplint/core");
  return abaplintModule;
}

/** Object name abaplint derives from an abapGit file name: zcl_x.clas.locals_imp.abap -> ZCL_X. */
function objectName(fileName) {
  return fileName.split(".")[0].replace(/#/g, "/").toUpperCase();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse ABAP and CDS source with the grammar of the target environment.
 *
 * Standard ABAP: parser plus abaplint's syntax check (rule check_syntax), which catches
 * release-dependent statements such as inline declarations before 7.40 SP02 and undefined
 * variables. The error namespace is limited to the objects being validated, so references to
 * SAP standard objects or to custom objects that are not part of the sample are treated as
 * external instead of failing.
 * ABAP Cloud: parser and cloud object-type rules. The syntax check is not used because RAP
 * behavior pools depend on types derived from behavior definitions, which abaplint cannot see.
 *
 * Files must use abapGit names (zfa_report.prog.abap, zcl_name.clas.abap,
 * zcl_name.clas.locals_imp.abap, zfa_fg.fugr.z_func.abap, zr_entity.ddls.asddls). A file
 * abaplint does not map to an object fails instead of being skipped silently.
 */
async function validateAbap(files, env, contextFiles = []) {
  if (!env) {
    return files.map((f) => ({ validator: "abaplint", file: f.path, status: "failed", messages: ["No SAP environment given. Set `environment` in scenarios.yaml, an `<!-- abap-env: ... -->` directive, or the skill's `abap-env-default` metadata."] }));
  }
  if (!env.ok) {
    return files.map((f) => ({ validator: "abaplint", file: f.path, status: "failed", messages: env.errors.map((e) => `Environment: ${e}`) }));
  }
  let ab;
  try {
    ab = await loadAbaplint();
  } catch {
    return files.map((f) => ({ validator: "abaplint", file: f.path, status: "unavailable", messages: ["@abaplint/core is not installed. Run npm ci."] }));
  }
  const version = ab.Version[env.grammar];
  if (version === undefined) {
    return files.map((f) => ({ validator: "abaplint", file: f.path, status: "failed", messages: [`abaplint has no grammar '${env.grammar}'.`] }));
  }
  const cloud = env.grammar === "Cloud";
  const names = [...new Set([...files, ...contextFiles].map((f) => objectName(f.path.split("/").pop())))];
  const conf = ab.Config.getDefault().get();
  conf.global.files = "/**/*.*";
  conf.syntax.version = version;
  conf.syntax.errorNamespace = `^(${names.map(escapeRegex).join("|")})$`;
  conf.rules = cloud ? { parser_error: true, cds_parser_error: true, cloud_types: true } : { parser_error: true, cds_parser_error: true, check_syntax: true };

  const reg = new ab.Registry(new ab.Config(JSON.stringify(conf)));
  const nameMap = new Map();
  for (const f of files) {
    const base = f.path.split("/").pop().toLowerCase();
    nameMap.set(base, f.path);
    reg.addFile(new ab.MemoryFile(base, f.content));
  }
  // Context objects resolve references from the answer; their own issues are not reported.
  const answerFiles = new Set(nameMap.keys());
  for (const f of contextFiles) {
    const base = f.path.split("/").pop().toLowerCase();
    if (!answerFiles.has(base)) reg.addFile(new ab.MemoryFile(base, f.content));
  }
  reg.parse();

  const recognized = new Set();
  for (const obj of reg.getObjects()) {
    for (const file of obj.getFiles()) recognized.add(file.getFilename().toLowerCase());
  }
  const messages = new Map(files.map((f) => [f.path, []]));
  for (const issue of reg.findIssues()) {
    const original = nameMap.get(issue.getFilename().toLowerCase()) ?? issue.getFilename();
    const list = messages.get(original) ?? [];
    list.push(`${issue.getStart().getRow()}:${issue.getStart().getCol()} ${issue.getMessage()} (${issue.getKey()})`);
    messages.set(original, list);
  }
  const context = `abaplint grammar ${env.grammar} for ${env.label}`;
  return files.map((f) => {
    const base = f.path.split("/").pop().toLowerCase();
    if (!recognized.has(base)) {
      return { validator: "abaplint", file: f.path, status: "failed", messages: ["abaplint did not recognize this file. Use abapGit naming, for example zfa_report.prog.abap, zcl_name.clas.abap, or zr_entity.ddls.asddls."] };
    }
    const list = messages.get(f.path) ?? [];
    return { validator: "abaplint", file: f.path, status: list.length ? "failed" : "passed", messages: list.length ? [...list, `(${context})`] : [], context };
  });
}

// ---------------------------------------------------------------- Apex

async function validateApex(files) {
  let mod;
  try {
    mod = await import("@apexdevtools/apex-parser");
  } catch {
    return files.map((f) => ({ validator: "apex", file: f.path, status: "unavailable", messages: ["@apexdevtools/apex-parser is not installed. Run npm ci."] }));
  }
  const { ApexParserFactory, ApexErrorListener } = mod;
  class Collector extends ApexErrorListener {
    constructor() {
      super();
      this.errors = [];
    }
    apexSyntaxError(line, column, msg) {
      this.errors.push(`${line}:${column} ${msg}`);
    }
  }
  return files.map((f) => {
    const listener = new Collector();
    const { parser } = ApexParserFactory.createLexerAndParser(f.content, listener);
    if (f.path.toLowerCase().endsWith(".trigger")) parser.triggerUnit();
    else parser.compilationUnit();
    return { validator: "apex", file: f.path, status: listener.errors.length ? "failed" : "passed", messages: listener.errors };
  });
}

// ---------------------------------------------------------------- Python

let pythonCommand;

/** Find a working Python 3 interpreter. Returns null when none is installed. */
export function findPython() {
  if (pythonCommand !== undefined) return pythonCommand;
  pythonCommand = null;
  for (const cmd of ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0 && /Python 3\./.test(`${r.stdout}${r.stderr}`)) {
      pythonCommand = cmd;
      break;
    }
  }
  return pythonCommand;
}

const PY_CHECK = [
  "import ast, sys",
  "src = sys.stdin.read()",
  "try:",
  "    ast.parse(src, filename=sys.argv[1])",
  "except SyntaxError as e:",
  "    print(f'{e.lineno}:{e.offset} {e.msg}')",
  "    sys.exit(1)",
].join("\n");

function validatePython(files) {
  const cmd = findPython();
  return files.map((f) => {
    if (!cmd) return { validator: "python", file: f.path, status: "unavailable", messages: ["No Python 3 interpreter found on PATH."] };
    const r = spawnSync(cmd, ["-I", "-c", PY_CHECK, f.path], { input: f.content, encoding: "utf8" });
    const ok = r.status === 0;
    return { validator: "python", file: f.path, status: ok ? "passed" : "failed", messages: ok ? [] : [(r.stdout || r.stderr).trim()] };
  });
}

// ---------------------------------------------------------------- JavaScript

function validateJavaScript(files) {
  const dir = mkdtempSync(join(tmpdir(), "fa-js-"));
  try {
    return files.map((f, i) => {
      const ext = f.path.endsWith(".cjs") ? ".cjs" : ".mjs";
      const tmp = join(dir, `snippet-${i}${ext}`);
      writeFileSync(tmp, f.content, "utf8");
      const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
      const ok = r.status === 0;
      return { validator: "javascript", file: f.path, status: ok ? "passed" : "failed", messages: ok ? [] : [firstLines(r.stderr, 4)] };
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- JSON and YAML

function validateJson(f) {
  try {
    JSON.parse(f.content);
    return { validator: "json", file: f.path, status: "passed", messages: [] };
  } catch (err) {
    return { validator: "json", file: f.path, status: "failed", messages: [err.message] };
  }
}

function validateYaml(f) {
  const docs = parseAllDocuments(f.content);
  const errors = docs.flatMap((d) => d.errors.map((e) => e.message.split("\n")[0]));
  return { validator: "yaml", file: f.path, status: errors.length ? "failed" : "passed", messages: errors };
}

function firstLines(text, n) {
  return String(text ?? "").trim().split("\n").slice(0, n).join(" | ");
}
