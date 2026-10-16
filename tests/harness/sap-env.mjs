import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

/**
 * SAP environment model for release-aware ABAP validation.
 *
 * Two independent dimensions decide what code is valid:
 *   - where SAP runs (deployment: on-premise, Azure/AWS/GCP IaaS, SAP-managed) - informational only;
 *   - which ABAP applies (product, SAP_BASIS release and support package, language version,
 *     database) - this selects the abaplint grammar and the feature rules.
 * An ECC system on Azure VMs therefore validates exactly like an ECC system on premises.
 *
 * Registry: config/sap-environments.yaml (schema: schemas/sap-environments.schema.json).
 */

const CONFIG_URL = new URL("../../config/sap-environments.yaml", import.meta.url);
const FEATURES_URL = new URL("../../config/abap-language-features.yaml", import.meta.url);
let registry = null;
let languageFeatures = null;

export function loadSapEnvironments() {
  if (!registry) registry = parseYaml(readFileSync(fileURLToPath(CONFIG_URL), "utf8"));
  return registry;
}

/** config/abap-language-features.yaml: ABAP statements and expressions by first release. */
export function loadLanguageFeatures() {
  if (!languageFeatures) languageFeatures = parseYaml(readFileSync(fileURLToPath(FEATURES_URL), "utf8"));
  return languageFeatures;
}

/** "7.40" -> 740, "8.16" -> 816. Returns NaN for anything else. */
export function basisValue(sapBasis) {
  const m = /^(\d+)\.(\d{2})$/.exec(String(sapBasis ?? ""));
  return m ? Number(m[1]) * 100 + Number(m[2]) : NaN;
}

/** "7.40 SP08" -> { sapBasis: "7.40", supportPackage: 8, rank: 74008 }; "7.02" -> SP 0. */
export function parseRelease(text) {
  const m = /^(\d\.\d{2})(?: SP(\d{2}))?$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const supportPackage = m[2] ? Number(m[2]) : 0;
  return { sapBasis: m[1], supportPackage, rank: basisValue(m[1]) * 100 + supportPackage };
}

/**
 * Parse "product=ecc release=ehp7 support_package=8 database=anydb" into an object.
 * Used by `<!-- abap-env: ... -->` directives and the `abap-env-default` skill metadata key.
 */
export function parseEnvString(text) {
  const env = {};
  for (const part of String(text ?? "").trim().split(/\s+/).filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq <= 0) throw new Error(`Invalid abap-env entry '${part}'; use key=value pairs.`);
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    env[key] = key === "support_package" ? Number(value) : value;
  }
  return env;
}

/**
 * Resolve an environment description to a concrete target.
 * Returns { ok, errors, label, product, release, sapBasis, supportPackage, basis, deployment,
 *           languageVersion, database, grammar }.
 * Resolution is conservative: when a release has no exact abaplint grammar it maps to the
 * nearest older grammar, so valid code may be rejected but code that needs a newer release is
 * never accepted.
 */
export function resolveEnvironment(input) {
  const reg = loadSapEnvironments();
  const errors = [];
  const env = input ?? {};
  const product = reg.products.find((p) => p.id === env.product);
  if (!product) {
    return fail(`Unknown or missing SAP product '${env.product ?? ""}'. Use one of: ${reg.products.map((p) => p.id).join(", ")}.`);
  }

  let release = null;
  if (env.release !== undefined) {
    release = product.releases.find((r) => r.id === String(env.release));
    if (!release) errors.push(`Unknown release '${env.release}' for ${product.name}. Use one of: ${product.releases.map((r) => r.id).join(", ")}.`);
  }
  const sapBasis = env.sap_basis ?? release?.sap_basis;
  if (!sapBasis) errors.push(`Give either release or sap_basis for ${product.name}.`);
  if (env.sap_basis && release && release.sap_basis !== env.sap_basis) {
    errors.push(`sap_basis ${env.sap_basis} does not match ${product.name} ${release.id} (SAP_BASIS ${release.sap_basis}).`);
  }

  const languageVersion = env.language_version ?? (product.language_versions.includes("standard") ? "standard" : "cloud");
  if (!product.language_versions.includes(languageVersion)) {
    errors.push(`${product.name} does not support language version '${languageVersion}'.`);
  }
  const isCloudBasis = sapBasis === "cloud";
  const basis = isCloudBasis ? Infinity : basisValue(sapBasis);
  if (sapBasis && !isCloudBasis && Number.isNaN(basis)) errors.push(`Invalid sap_basis '${sapBasis}'; use the form 7.50.`);
  if (languageVersion === "cloud" && product.cloud_language_from_sap_basis && basis < basisValue(product.cloud_language_from_sap_basis)) {
    errors.push(`ABAP for Cloud Development needs SAP_BASIS ${product.cloud_language_from_sap_basis} or later on ${product.name}; target is ${sapBasis}.`);
  }

  const database = env.database ?? (product.databases.length === 1 ? product.databases[0] : undefined);
  if (!database) errors.push(`${product.name} runs on ${product.databases.join(" or ")}; set database.`);
  else if (!product.databases.includes(database)) errors.push(`${product.name} does not run on database '${database}'.`);
  else if (database === "hana" && product.hana_from_sap_basis && basis < basisValue(product.hana_from_sap_basis)) {
    errors.push(`${product.name} runs on SAP HANA only from SAP_BASIS ${product.hana_from_sap_basis}; target is SAP_BASIS ${sapBasis}.`);
  }

  const deployment = env.deployment ?? product.deployments[0];
  if (!product.deployments.includes(deployment)) {
    errors.push(`Deployment '${deployment}' is not valid for ${product.name}. Use one of: ${product.deployments.join(", ")}.`);
  }

  const supportPackage = env.support_package;
  let grammar = null;
  if (languageVersion === "cloud") grammar = "Cloud";
  else if (!Number.isNaN(basis) && !isCloudBasis) {
    const rows = reg.grammar_by_sap_basis.filter((r) => r.sap_basis === sapBasis);
    if (!rows.length) errors.push(`No abaplint grammar is mapped for SAP_BASIS ${sapBasis} in config/sap-environments.yaml.`);
    else if (rows.some((r) => r.min_support_package !== undefined)) {
      if (supportPackage === undefined || Number.isNaN(supportPackage)) {
        errors.push(`SAP_BASIS ${sapBasis} syntax depends on the support package; set support_package.`);
      } else {
        const match = rows.filter((r) => (r.min_support_package ?? 0) <= supportPackage).sort((a, b) => (b.min_support_package ?? 0) - (a.min_support_package ?? 0))[0];
        grammar = match?.grammar ?? null;
      }
    } else grammar = rows[0].grammar;
  }

  const releaseText = release ? `${release.name ?? release.id}` : `SAP_BASIS ${sapBasis}`;
  const label = `${product.name} ${releaseText}${sapBasis && sapBasis !== "cloud" ? ` (SAP_BASIS ${sapBasis}${supportPackage !== undefined ? ` SP${supportPackage}` : ""})` : ""}, ${languageVersion === "cloud" ? "ABAP Cloud" : "Standard ABAP"}, ${database ?? "?"}, ${deployment}`;
  return { ok: errors.length === 0 && Boolean(grammar), errors: grammar || errors.length ? errors : ["Could not determine the abaplint grammar."], label, product: product.id, productName: product.name, release: release?.id ?? null, sapBasis, supportPackage, basis, deployment, languageVersion, database, grammar };

  function fail(message) {
    return { ok: false, errors: [message], label: "unresolved environment", grammar: null };
  }
}

/**
 * Code without comments and without the contents of literals, so rule patterns match statements
 * only. ABAP: full-line comments start with `*` in column 1, end-of-line comments with `"`
 * outside literals ('...', `...`, |...|). CDS and other DDL: `//` and `/* ... *\/` comments.
 */
export function codeOnly(content, ext) {
  if (ext === ".abap") {
    return content
      .split("\n")
      .map((line) => {
        if (line.startsWith("*")) return "";
        let out = "";
        let quote = null;
        for (const c of line) {
          if (quote) {
            if (c === quote) {
              quote = null;
              out += c;
            }
            continue;
          }
          if (c === '"') break;
          if (c === "'" || c === "`" || c === "|") quote = c;
          out += c;
        }
        return out;
      })
      .join("\n");
  }
  return content.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
}

/**
 * Apply release and database rules that the abaplint grammar does not cover (for example CDS
 * view entities, AMDP on non-HANA databases, statements abaplint accepts too early). Returns
 * validator results.
 */
export function checkEnvironmentRules(files, env) {
  const reg = loadSapEnvironments();
  const results = [];
  for (const f of files) {
    const ext = (f.path.toLowerCase().match(/(\.[a-z0-9]+)$/) ?? [])[1];
    const messages = [];
    const code = codeOnly(f.content, ext);
    for (const rule of reg.feature_rules) {
      if (!rule.extensions.includes(ext)) continue;
      if (!new RegExp(rule.pattern, "im").test(code)) continue;
      const needBasis = rule.min_sap_basis ? basisValue(rule.min_sap_basis) : null;
      const needSp = rule.min_support_package ?? 0;
      const tooOld = needBasis !== null && (env.basis < needBasis || (env.basis === needBasis && rule.min_support_package !== undefined && (env.supportPackage ?? 0) < needSp));
      if (tooOld) {
        messages.push(`[${rule.id}] ${rule.description} needs SAP_BASIS ${rule.min_sap_basis}${rule.min_support_package !== undefined ? ` SP${String(rule.min_support_package).padStart(2, "0")}` : ""} or later; target is ${env.label}.`);
      }
      if (rule.requires_database && env.database !== rule.requires_database) {
        messages.push(`[${rule.id}] ${rule.description} needs SAP HANA; target database is ${env.database}.`);
      }
      if (rule.requires_language_version && env.languageVersion !== rule.requires_language_version) {
        messages.push(`[${rule.id}] ${rule.description} is only valid with language version ${rule.requires_language_version}.`);
      }
    }
    if (messages.length) results.push({ validator: "sap-environment", file: f.path, status: "failed", messages });
  }
  return results;
}
