import { join } from "node:path";
import { OWNER_PLACEHOLDER, PATHS, PLUGIN_MCP_DIR } from "../constants.mjs";
import { exists } from "../fsutil.mjs";
import { repoUrls } from "../repo-model.mjs";
import { validateSchema } from "../schema.mjs";
import { loadLanguageFeatures, loadSapEnvironments, parseRelease } from "../../../tests/harness/sap-env.mjs";

export function checkConfig(model, findings) {
  if (!model.config) return;
  for (const err of validateSchema("repo-config.schema.json", model.config)) findings.error("CONFIG_SCHEMA", err, { file: PATHS.config });
  if (model.config.repository?.owner === OWNER_PLACEHOLDER) {
    findings.warn("CONFIG_OWNER_PLACEHOLDER", `repository.owner is still '${OWNER_PLACEHOLDER}'. Set the GitHub organization before publishing, then run npm run build.`, { file: PATHS.config });
  }
}

/** config/sap-environments.yaml: schema, unique ids, valid regexes, and grammars abaplint knows. */
export async function checkSapEnvironments(findings) {
  const file = "config/sap-environments.yaml";
  let reg;
  try {
    reg = loadSapEnvironments();
  } catch (err) {
    findings.error("SAP_ENV_LOAD", err.message, { file });
    return;
  }
  for (const err of validateSchema("sap-environments.schema.json", reg)) findings.error("SAP_ENV_SCHEMA", err, { file });
  const dup = (items, label) => {
    const seen = new Set();
    for (const id of items) {
      if (seen.has(id)) findings.error("SAP_ENV_DUPLICATE", `Duplicate ${label} '${id}'.`, { file });
      seen.add(id);
    }
  };
  dup((reg.products ?? []).map((p) => p.id), "product");
  dup((reg.feature_rules ?? []).map((r) => r.id), "feature rule");
  for (const p of reg.products ?? []) dup(p.releases.map((r) => r.id), `${p.id} release`);
  const deployments = new Set((reg.deployments ?? []).map((d) => d.id));
  for (const p of reg.products ?? []) {
    for (const d of p.deployments) if (!deployments.has(d)) findings.error("SAP_ENV_DEPLOYMENT", `Product ${p.id} lists unknown deployment '${d}'.`, { file });
    for (const r of p.releases) {
      if (r.sap_basis !== "cloud" && !(reg.grammar_by_sap_basis ?? []).some((g) => g.sap_basis === r.sap_basis)) {
        findings.error("SAP_ENV_NO_GRAMMAR", `${p.id} ${r.id} uses SAP_BASIS ${r.sap_basis}, which has no grammar mapping.`, { file });
      }
    }
  }
  for (const rule of reg.feature_rules ?? []) {
    try {
      new RegExp(rule.pattern, "im");
    } catch (err) {
      findings.error("SAP_ENV_RULE_REGEX", `Rule ${rule.id}: ${err.message}`, { file });
    }
  }
  let ab = null;
  try {
    ab = await import("@abaplint/core");
  } catch {
    findings.warn("SAP_ENV_ABAPLINT", "@abaplint/core is not installed; grammar names were not checked.", { file });
  }
  if (ab) {
    for (const g of reg.grammar_by_sap_basis ?? []) {
      if (ab.Version[g.grammar] === undefined) findings.error("SAP_ENV_GRAMMAR", `abaplint has no grammar '${g.grammar}' (SAP_BASIS ${g.sap_basis}).`, { file });
    }
  }
}

/** config/abap-language-features.yaml: schema, unique ids, release format, and rule references. */
export function checkLanguageFeatures(findings) {
  const file = "config/abap-language-features.yaml";
  let manifest;
  try {
    manifest = loadLanguageFeatures();
  } catch (err) {
    findings.error("ABAP_FEATURES_LOAD", err.message, { file });
    return;
  }
  for (const err of validateSchema("abap-language-features.schema.json", manifest)) findings.error("ABAP_FEATURES_SCHEMA", err, { file });
  const rules = new Set((loadSapEnvironments().feature_rules ?? []).map((r) => r.id));
  const seen = new Set();
  for (const f of manifest.features ?? []) {
    if (seen.has(f.id)) findings.error("ABAP_FEATURES_DUPLICATE", `Duplicate feature '${f.id}'.`, { file });
    seen.add(f.id);
    const since = parseRelease(f.since);
    if (since && since.sapBasis === "7.40" && !/ SP\d{2}$/.test(f.since)) {
      findings.error("ABAP_FEATURES_SP", `${f.id}: 7.40 features need the support package, for example "7.40 SP05".`, { file });
    }
    if (f.validator_from && parseRelease(f.validator_from)?.rank <= since?.rank) {
      findings.error("ABAP_FEATURES_VALIDATOR_FROM", `${f.id}: validator_from must be later than since.`, { file });
    }
    if (f.checked_by?.startsWith("rule:") && !rules.has(f.checked_by.slice(5))) {
      findings.error("ABAP_FEATURES_RULE", `${f.id}: ${f.checked_by} is not a feature rule in config/sap-environments.yaml.`, { file });
    }
  }
}

/** Registry fields that only a server published from this repository (bundled_from_plugin) may carry. */
const BUNDLE_ONLY_FIELDS = ["plugin_path", "plugin_args", "setup_args", "setup_notes", "data_access", "user_config"];

/**
 * mcp/servers.yaml. Besides the schema: unique ids, known vendors, pinned npx packages, and
 * the bundling policy. A server may be bundled when it is vendor-published and needs no
 * credentials, or when it is published from this repository: then it is read-only by default,
 * takes credentials only from the agent's prompt (user_config) or the user's own config file,
 * and its launcher exists in the plugin that bundles it.
 */
export function checkMcpRegistry(model, findings) {
  const reg = model.mcpRegistry;
  if (!reg) return;
  const where = { file: PATHS.mcpRegistry };
  for (const err of validateSchema("mcp-registry.schema.json", reg)) findings.error("MCP_REGISTRY_SCHEMA", err, where);
  const seen = new Set();
  const vendors = new Set((model.config?.vendors ?? []).map((v) => v.id));
  for (const s of reg.servers ?? []) {
    if (seen.has(s.id)) findings.error("MCP_DUPLICATE_ID", `Duplicate MCP server id '${s.id}'.`, where);
    seen.add(s.id);
    if (s.vendor && !vendors.has(s.vendor)) findings.error("MCP_UNKNOWN_VENDOR", `Server '${s.id}' uses unknown vendor '${s.vendor}'.`, where);
    if (s.transport === "stdio" && s.command === "npx") {
      const pkg = (s.args ?? []).find((a) => !a.startsWith("-"));
      if (pkg && !/@\d+\.\d+\.\d+/.test(pkg.replace(/^@[^/]+\//, "x/"))) {
        findings.warn("MCP_UNPINNED", `Server '${s.id}' runs '${pkg}' without an exact version. Pin a version to avoid unreviewed updates.`, where);
      }
    }
    if (s.bundle_policy === "bundle" && s.auth !== "none" && !s.bundled_from_plugin) {
      findings.error("MCP_BUNDLE_NEEDS_CREDENTIALS", `Server '${s.id}' needs credentials (auth '${s.auth}') and is not published from this repository, so it may only be documented: set bundle_policy document-only.`, where);
    }
    if (s.bundled_from_plugin) {
      checkBundledServer(s, model, findings);
    } else {
      for (const field of BUNDLE_ONLY_FIELDS) {
        if (s[field] !== undefined) findings.error("MCP_BUNDLE_FIELD", `Server '${s.id}': '${field}' is allowed only for a server published from this repository (bundled_from_plugin).`, where);
      }
    }
  }
}

function checkBundledServer(s, model, findings) {
  const where = { file: PATHS.mcpRegistry };
  const plugin = model.plugins.find((p) => p.dirName === s.bundled_from_plugin);
  if (!plugin) {
    findings.error("MCP_BUNDLE_PLUGIN_UNKNOWN", `Server '${s.id}' is bundled from plugin '${s.bundled_from_plugin}', which does not exist under ${PATHS.plugins}/.`, where);
    return;
  }
  if (s.official !== false) findings.error("MCP_BUNDLE_OFFICIAL", `Server '${s.id}' is published from this repository, not by the product vendor, so official must be false.`, where);
  if (s.read_only_by_default !== true) findings.error("MCP_BUNDLE_NOT_READ_ONLY", `Server '${s.id}' is published from this repository, so it must be read-only by default.`, where);
  if (!["none", "system-credentials"].includes(s.auth)) {
    findings.error("MCP_BUNDLE_AUTH", `Server '${s.id}': a server published from this repository takes credentials only from the agent's prompt or the user's own config file (auth none or system-credentials), not '${s.auth}'.`, where);
  }
  if (s.transport !== "stdio") findings.error("MCP_BUNDLE_TRANSPORT", `Server '${s.id}': a server published from this repository starts on the user's machine, so transport must be stdio.`, where);
  const path = String(s.plugin_path ?? "");
  if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    findings.error("MCP_BUNDLE_PATH_UNSAFE", `Server '${s.id}': plugin_path must be a forward-slash path inside the plugin folder, not '${path}'.`, where);
  } else {
    if (!path.startsWith(`${PLUGIN_MCP_DIR}/`)) findings.error("MCP_BUNDLE_PATH_DIR", `Server '${s.id}': plugin_path must be under ${PLUGIN_MCP_DIR}/ in the plugin folder, not '${path}'.`, where);
    if (!exists(join(plugin.dir, ...path.split("/")))) findings.error("MCP_BUNDLE_PATH_MISSING", `Server '${s.id}': ${plugin.relDir}/${path} does not exist.`, where);
  }
  const repo = repoUrls(model.config).repo;
  if (!String(s.source ?? "").startsWith(`${repo}/`)) findings.warn("MCP_BUNDLE_SOURCE", `Server '${s.id}' is published from this repository, so source should point into ${repo}.`, where);
  if (plugin.source && !(plugin.source.mcp_servers ?? []).includes(s.id)) {
    findings.error("MCP_BUNDLE_NOT_LISTED", `Server '${s.id}' ships in plugin '${plugin.dirName}', so ${plugin.sourcePath} must list it under mcp_servers.`, where);
  }
  const envs = new Map();
  for (const [key, option] of Object.entries(s.user_config ?? {})) {
    if (envs.has(option.env)) findings.error("MCP_USER_CONFIG_ENV", `Server '${s.id}': user_config '${key}' and '${envs.get(option.env)}' both use environment variable ${option.env}.`, where);
    envs.set(option.env, key);
    if (option.sensitive && option.default !== undefined) {
      findings.error("MCP_USER_CONFIG_SENSITIVE_DEFAULT", `Server '${s.id}': user_config '${key}' is sensitive, so it must not have a default; the default would be stored in the repository.`, where);
    }
  }
}
