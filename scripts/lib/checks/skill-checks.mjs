import { join, posix } from "node:path";
import { SKILL_MAX_LINES, SKILL_SPEC_KEYS, REPO_ROOT } from "../constants.mjs";
import { exists, readText } from "../fsutil.mjs";
import { validateSchema } from "../schema.mjs";
import { taxonomy } from "../repo-model.mjs";
import { fencedBlocks, isExternal, markdownLinks } from "../markdown.mjs";
import { splitIntoFiles } from "../../../tests/harness/files.mjs";
import { runValidators } from "../../../tests/harness/validators.mjs";
import { basisValue, loadSapEnvironments, parseEnvString, resolveEnvironment } from "../../../tests/harness/sap-env.mjs";

/**
 * Skill rules. Top-level frontmatter keys are limited to the Agent Skills specification so a
 * skill folder copied into any agent stays valid; catalog data lives under `metadata`.
 */
export async function checkSkills(model, findings, { strictValidators = false } = {}) {
  const tax = taxonomy(model.config);
  const names = new Map();
  const stats = { skills: 0, snippetsValidated: 0, snippetsSkipped: 0, fragments: 0 };

  for (const skill of model.skills) {
    const file = skill.file;
    if (skill.error === "missing") continue;
    stats.skills++;
    if (skill.error) {
      findings.error("SKILL_FRONTMATTER", skill.error, { file });
      continue;
    }
    const d = skill.data;
    for (const key of Object.keys(d)) {
      if (!SKILL_SPEC_KEYS.includes(key)) findings.error("SKILL_NONSTANDARD_KEY", `Top-level key '${key}' is not part of the Agent Skills specification. Move catalog data under 'metadata'.`, { file });
    }
    for (const err of validateSchema("skill-frontmatter.schema.json", d)) findings.error("SKILL_SCHEMA", err, { file });
    if (d.name !== skill.dirName) findings.error("SKILL_NAME_MISMATCH", `name '${d.name}' must equal the folder name '${skill.dirName}'.`, { file });
    if (names.has(d.name)) findings.error("SKILL_DUPLICATE_NAME", `Skill name '${d.name}' is also used in ${names.get(d.name)}. Copilot and npx skills deduplicate by name.`, { file });
    names.set(d.name, file);

    const desc = String(d.description ?? "");
    if (!/\bUSE FOR:/.test(desc)) findings.error("SKILL_DESCRIPTION_TRIGGERS", "description must include 'USE FOR:' followed by the situations that should activate the skill.", { file });
    if (!/\bDO NOT USE FOR:/.test(desc)) findings.error("SKILL_DESCRIPTION_ANTI_TRIGGERS", "description must include 'DO NOT USE FOR:' to route nearby requests elsewhere.", { file });

    const md = d.metadata ?? {};
    const plugin = model.plugins.find((p) => p.dirName === skill.plugin);
    if (md.vendor && !tax.vendors.has(md.vendor)) findings.error("SKILL_VENDOR", `Unknown vendor '${md.vendor}'.`, { file });
    if (md.category && !tax.categories.has(md.category)) findings.error("SKILL_CATEGORY", `Unknown category '${md.category}'.`, { file });
    if (md.maturity && !tax.maturity.has(md.maturity)) findings.error("SKILL_MATURITY", `Unknown maturity '${md.maturity}'.`, { file });
    if (plugin?.source && md.vendor && md.vendor !== plugin.source.vendor && plugin.source.vendor !== "vendor-neutral") {
      findings.warn("SKILL_VENDOR_DIFFERS", `Skill vendor '${md.vendor}' differs from plugin vendor '${plugin.source.vendor}'.`, { file });
    }
    if (md.maturity === "stable" && !md["last-verified"]) findings.error("SKILL_STABLE_UNVERIFIED", "Stable skills need metadata.last-verified (date of the last live verification).", { file });
    if (md.maturity && md.maturity !== "experimental" && !model.scenarios[d.name]) {
      findings.error("SKILL_NO_TESTS", `Maturity '${md.maturity}' requires tests/scenarios/${d.name}/acceptance-criteria.md and scenarios.yaml.`, { file });
    }

    const lineCount = skill.text.split("\n").length;
    if (lineCount > SKILL_MAX_LINES) findings.error("SKILL_TOO_LONG", `SKILL.md has ${lineCount} lines; the limit is ${SKILL_MAX_LINES}. Move detail into references/.`, { file });
    else if (lineCount > 350) findings.warn("SKILL_LONG", `SKILL.md has ${lineCount} lines. Consider moving detail into references/ to save context.`, { file });
    if (!/^#\s+\S/m.test(skill.body)) findings.error("SKILL_NO_TITLE", "Body needs a top-level '# ' heading.", { file });

    checkSapMetadata(skill, findings);
    checkReferences(skill, findings);
    await checkSnippets(skill, findings, stats, strictValidators);
  }
  return stats;
}

/**
 * SAP ABAP skills must say which systems they target, because guidance that is right for
 * S/4HANA 2023 can be wrong for ECC 6.0 on NetWeaver 7.31. Values are checked against
 * config/sap-environments.yaml.
 */
function checkSapMetadata(skill, findings) {
  const md = skill.data.metadata ?? {};
  if (md.vendor !== "sap" || md.product !== "abap") return;
  const file = skill.file;
  const reg = loadSapEnvironments();
  const list = (key) => String(md[key] ?? "").split(",").map((v) => v.trim()).filter(Boolean);

  for (const key of ["sap-products", "sap-deployments", "abap-language-version", "sap-basis-min", "abap-env-default"]) {
    if (!md[key]) findings.error("SAP_METADATA_MISSING", `SAP ABAP skills need metadata.${key}.`, { file });
  }
  const productIds = new Set(reg.products.map((p) => p.id));
  for (const p of list("sap-products")) if (!productIds.has(p)) findings.error("SAP_METADATA_PRODUCT", `Unknown SAP product '${p}' in sap-products. Known: ${[...productIds].join(", ")}.`, { file });
  const deploymentIds = new Set(reg.deployments.map((d) => d.id));
  for (const d of list("sap-deployments")) if (!deploymentIds.has(d)) findings.error("SAP_METADATA_DEPLOYMENT", `Unknown deployment '${d}' in sap-deployments. Known: ${[...deploymentIds].join(", ")}.`, { file });
  for (const v of list("abap-language-version")) if (!["standard", "cloud"].includes(v)) findings.error("SAP_METADATA_LANGUAGE", `abap-language-version must list 'standard' and/or 'cloud', not '${v}'.`, { file });
  if (md["sap-basis-min"] && Number.isNaN(basisValue(md["sap-basis-min"]))) findings.error("SAP_METADATA_BASIS", "sap-basis-min must look like 7.50.", { file });
  if (md["abap-env-default"]) {
    try {
      const env = resolveEnvironment(parseEnvString(md["abap-env-default"]));
      if (!env.ok) findings.error("SAP_METADATA_ENV", `abap-env-default does not resolve: ${env.errors.join("; ")}`, { file });
      else if (!list("abap-language-version").includes(env.languageVersion)) findings.error("SAP_METADATA_ENV", `abap-env-default uses language version '${env.languageVersion}', which is not listed in abap-language-version.`, { file });
    } catch (err) {
      findings.error("SAP_METADATA_ENV", err.message, { file });
    }
  }
}

function snippetEnvironment(skill, block) {
  const text = block.env ?? skill.data.metadata?.["abap-env-default"];
  return text ? resolveEnvironment(parseEnvString(text)) : null;
}

function checkReferences(skill, findings) {
  const file = skill.file;
  const body = skill.body;
  for (const { target, line } of markdownLinks(body)) {
    if (isExternal(target) || target.startsWith("#")) continue;
    const clean = decodeURIComponent(target.split("#")[0]);
    if (clean.includes("\\")) findings.error("SKILL_BACKSLASH_PATH", `Use forward slashes in links: ${target}`, { file, line });
    if (clean.startsWith("/") || /^[A-Za-z]:/.test(clean)) findings.error("SKILL_ABSOLUTE_PATH", `Links must be relative to the skill folder: ${target}`, { file, line });
    const resolved = posix.normalize(posix.join(skill.relDir, clean));
    if (!resolved.startsWith(`${skill.relDir}/`)) findings.error("SKILL_LINK_OUTSIDE", `Link leaves the skill folder and will break when the skill is installed alone: ${target}`, { file, line });
    else if (!exists(join(REPO_ROOT, resolved))) findings.error("SKILL_LINK_MISSING", `Linked file does not exist: ${target}`, { file, line });
  }
  // Files in references/, scripts/ and assets/ that SKILL.md never mentions will never be loaded.
  for (const f of skill.files ?? []) {
    if (f === "SKILL.md") continue;
    const top = f.split("/")[0];
    if (!["references", "scripts", "assets"].includes(top)) {
      findings.warn("SKILL_UNEXPECTED_FILE", `Unexpected file '${f}'. Use references/, scripts/ or assets/.`, { file: `${skill.relDir}/${f}` });
      continue;
    }
    if (f.endsWith("__init__.py") || f.includes("__pycache__")) continue;
    if (!skill.text.includes(f)) findings.warn("SKILL_ORPHAN_FILE", `SKILL.md never mentions '${f}', so agents will not know to load it.`, { file: `${skill.relDir}/${f}` });
    if (top === "scripts") findings.info("SKILL_SCRIPT", `Bundled script '${f}' runs on user machines; reviewers must read it in full.`, { file: `${skill.relDir}/${f}` });
  }
}

/**
 * Snippet lint for SKILL.md and references/*.md: JSON and YAML blocks must parse; blocks with
 * file markers run through the language validators. A block can opt out with
 * `<!-- snippet-lint: skip reason -->` on the line before the fence. ABAP blocks are checked
 * against `<!-- abap-env: ... -->` on the line before the fence, or the skill's
 * `abap-env-default` metadata.
 */
async function checkSnippets(skill, findings, stats, strictValidators) {
  const docs = [{ file: skill.file, text: skill.text }];
  for (const f of skill.files ?? []) {
    if (f.startsWith("references/") && f.endsWith(".md")) docs.push({ file: `${skill.relDir}/${f}`, text: readText(join(REPO_ROOT, skill.relDir, f)) });
  }
  for (const doc of docs) {
    for (const block of fencedBlocks(doc.text)) {
      if (block.directive && block.directive.startsWith("snippet-lint: skip")) {
        stats.snippetsSkipped++;
        continue;
      }
      let files = [];
      let split;
      try {
        split = splitIntoFiles(block.code);
      } catch (err) {
        findings.error("SNIPPET_MARKER", err.message, { file: doc.file, line: block.line });
        continue;
      }
      if (split.files.length) files = split.files;
      else if (block.lang === "json") files = [{ path: "snippet.json", content: block.code }];
      else if (block.lang === "yaml" || block.lang === "yml") files = [{ path: "snippet.yaml", content: block.code }];
      if (!files.length) {
        stats.fragments++;
        continue;
      }
      let abapEnv = null;
      try {
        abapEnv = snippetEnvironment(skill, block);
      } catch (err) {
        findings.error("SNIPPET_ENVIRONMENT", err.message, { file: doc.file, line: block.line });
        continue;
      }
      const { results } = await runValidators(files, { abapEnv, contextFiles: split.context });
      for (const r of results) {
        if (r.status === "passed") stats.snippetsValidated++;
        else if (r.status === "failed") findings.error("SNIPPET_INVALID", `${r.validator} failed (${r.file}): ${r.messages.join("; ")}`, { file: doc.file, line: block.line });
        else if (strictValidators) findings.error("SNIPPET_VALIDATOR_UNAVAILABLE", r.messages.join("; "), { file: doc.file, line: block.line });
        else findings.warn("SNIPPET_VALIDATOR_UNAVAILABLE", r.messages.join("; "), { file: doc.file, line: block.line });
      }
    }
  }
}
