import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRepository } from "../../scripts/lib/repo-model.mjs";
import { generateAll } from "../../scripts/lib/generate.mjs";
import { validateSchema } from "../../scripts/lib/schema.mjs";
import { checkMcpRegistry } from "../../scripts/lib/checks/config-checks.mjs";
import { checkPlugins } from "../../scripts/lib/checks/plugin-checks.mjs";
import { Findings } from "../../scripts/lib/findings.mjs";
import { AGENT_PLUGINS_MCP_SCHEMA, PLUGIN_ROOT_VARIABLES } from "../../scripts/lib/constants.mjs";

// The sap-system server is published from this repository (plugins/sap-abap/mcp/sap-system)
// and bundled on every platform the generator targets. These tests pin the generated shape
// per platform and the policy checks around bundling, with negative controls for each rule.

const model = loadRepository();
const generated = generateAll(model);
const PLUGIN = "plugins/sap-abap";
const LAUNCHER = "mcp/sap-system/launch.mjs";
const KEYS = ["sap_url", "sap_user", "sap_password", "sap_client", "sap_language"];
const ENV = ["SAP_URL", "SAP_USER", "SAP_PASSWORD", "SAP_CLIENT", "SAP_LANGUAGE"];

const json = (path, from = generated) => JSON.parse(from.get(path));
const server = (m = model) => m.mcpRegistry.servers.find((s) => s.id === "sap-system");
const plugin = (m, name) => m.plugins.find((p) => p.dirName === name);

/** A deep copy of the repository model so one test can break one rule without touching the others. */
function variant(mutate) {
  const copy = structuredClone(model);
  mutate(copy);
  return copy;
}

function registryErrors(m) {
  const f = new Findings("test");
  checkMcpRegistry(m, f);
  return f.errors.map((e) => e.code);
}

function pluginErrors(m, files = generateAll(m)) {
  const f = new Findings("test");
  checkPlugins(m, files, f);
  return f.errors.map((e) => e.code);
}

test("sap-system is registered as a read-only server published from the sap-abap plugin", () => {
  const s = server();
  assert.ok(s, "mcp/servers.yaml must list sap-system");
  assert.equal(s.bundled_from_plugin, "sap-abap");
  assert.equal(s.official, false);
  assert.equal(s.read_only_by_default, true);
  assert.equal(s.auth, "system-credentials");
  assert.equal(s.bundle_policy, "bundle");
  assert.equal(s.plugin_path, LAUNCHER);
  assert.deepEqual(s.plugin_args, ["serve"]);
  assert.deepEqual(Object.keys(s.user_config), KEYS);
  assert.deepEqual(plugin(model, "sap-abap").source.mcp_servers, ["sap-system"]);
});

test("Claude Code: .mcp.json starts the launcher from the plugin root with the prompted values in env, and the manifest declares them", () => {
  const mcp = json(`${PLUGIN}/.mcp.json`);
  assert.deepEqual(validateSchema("platform/claude-mcp.schema.json", mcp), []);
  const entry = mcp.mcpServers["sap-system"];
  assert.equal(entry.command, "node");
  assert.deepEqual(entry.args, [`${PLUGIN_ROOT_VARIABLES.claude}/${LAUNCHER}`, "serve"]);
  assert.deepEqual(entry.env, Object.fromEntries(ENV.map((name, i) => [name, `\${user_config.${KEYS[i]}}`])));
  // Every env value is a placeholder Claude Code substitutes; no generated file holds a value.
  for (const v of Object.values(entry.env)) assert.match(v, /^\$\{user_config\.[a-z_]+\}$/);

  const manifest = json(`${PLUGIN}/.claude-plugin/plugin.json`);
  assert.deepEqual(validateSchema("platform/claude-plugin.schema.json", manifest), []);
  assert.deepEqual(Object.keys(manifest.userConfig), KEYS);
  const password = manifest.userConfig.sap_password;
  assert.equal(password.type, "string");
  assert.equal(password.required, true);
  assert.equal(password.sensitive, true);
  assert.equal(password.default, undefined, "a sensitive option never ships a default");
  assert.equal(manifest.userConfig.sap_url.required, true);
  assert.equal(manifest.userConfig.sap_client.default, "001");
  assert.equal(manifest.userConfig.sap_language.default, "EN");
  for (const option of Object.values(manifest.userConfig)) assert.ok(option.title && option.description);
});

test("Agent Plugins mcp.json (Copilot CLI, Codex): ${PLUGIN_ROOT}, type stdio, no env, vendored schema passes", () => {
  const mcp = json(`${PLUGIN}/mcp.json`);
  assert.deepEqual(validateSchema(AGENT_PLUGINS_MCP_SCHEMA, mcp), []);
  assert.deepEqual(mcp.mcpServers["sap-system"], { type: "stdio", command: "node", args: [`${PLUGIN_ROOT_VARIABLES.agentPlugins}/${LAUNCHER}`, "serve"] });
  assert.ok(!generated.get(`${PLUGIN}/mcp.json`).includes("user_config"), "the specification expands nothing but PLUGIN_ROOT and PLUGIN_DATA");
});

test("Gemini CLI gets ${extensionPath} plus prompted settings; Cursor gets inline ${CURSOR_PLUGIN_ROOT} without Claude's env", () => {
  const gemini = json(`${PLUGIN}/gemini-extension.json`);
  assert.deepEqual(validateSchema("platform/gemini-extension.schema.json", gemini), []);
  assert.deepEqual(gemini.mcpServers["sap-system"], { command: "node", args: [`${PLUGIN_ROOT_VARIABLES.gemini}/${LAUNCHER}`, "serve"] });
  assert.deepEqual(gemini.settings.map((s) => s.envVar), ENV);
  assert.deepEqual(gemini.settings.filter((s) => s.sensitive).map((s) => s.envVar), ["SAP_PASSWORD"]);
  for (const s of gemini.settings) assert.ok(s.name && s.description);

  const cursor = json(`${PLUGIN}/.cursor-plugin/plugin.json`);
  assert.deepEqual(validateSchema("platform/cursor-plugin.schema.json", cursor), []);
  assert.deepEqual(cursor.mcpServers["sap-system"], { command: "node", args: [`${PLUGIN_ROOT_VARIABLES.cursor}/${LAUNCHER}`, "serve"] });
  assert.ok(!generated.get(`${PLUGIN}/.cursor-plugin/plugin.json`).includes("user_config"), "Cursor does not substitute ${user_config.*}");
});

test("a plugin that bundles only a vendor server keeps its earlier manifest shapes", () => {
  assert.equal(json("plugins/microsoft-fabric/.cursor-plugin/plugin.json").mcpServers, "./.mcp.json");
  assert.equal(json("plugins/microsoft-fabric/.claude-plugin/plugin.json").userConfig, undefined);
  assert.equal(json("plugins/microsoft-fabric/gemini-extension.json").settings, undefined);
  assert.deepEqual(json("plugins/microsoft-fabric/.mcp.json").mcpServers["microsoft-learn"], { type: "http", url: "https://learn.microsoft.com/api/mcp" });
  assert.equal(json("plugins/salesforce-platform/.cursor-plugin/plugin.json").mcpServers, undefined);
});

test("the plugin README says where the server runs, what it reaches, and how each agent gets the connection details", () => {
  const readme = generated.get(`${PLUGIN}/README.md`);
  const section = readme.slice(readme.indexOf("## Data and permissions"), readme.indexOf("## Tests"));
  for (const phrase of [
    "published from this repository",
    "runs on your machine",
    "read-only, with no setting that turns that off",
    "only to the SAP URL you configure",
    "Claude Code asks for them",
    "secure credential store",
    "Gemini CLI asks for them",
    `node <plugin folder>/${LAUNCHER} setup`,
    "outside the plugin folder",
    "your own credentials for your system",
    "lookup_api_state.py",
  ]) assert.ok(section.includes(phrase), `README must say: ${phrase}`);
  assert.ok(!section.includes("bundles no MCP servers"));
});

test("generated output is deterministic", () => {
  const again = generateAll(loadRepository());
  assert.deepEqual([...again.keys()], [...generated.keys()]);
  for (const [path, content] of generated) assert.equal(again.get(path), content, path);
});

test("the registry and plugin checks accept the bundled server as configured", () => {
  const codes = [...registryErrors(model), ...pluginErrors(model, generated)];
  assert.deepEqual(codes.filter((c) => /^(MCP_|PLUGIN_MCP|PLUGIN_USER_CONFIG|GENERATED_MANIFEST)/.test(c)), []);
});

test("a vendor server that needs credentials cannot be bundled (negative control)", () => {
  const m = variant((x) => {
    x.mcpRegistry.servers.find((s) => s.id === "microsoft-learn").auth = "api-credentials";
  });
  const registry = registryErrors(m);
  assert.ok(registry.includes("MCP_BUNDLE_NEEDS_CREDENTIALS"), registry.join(", "));
  assert.ok(registry.includes("MCP_REGISTRY_SCHEMA"), "the schema rejects it too");
  assert.ok(pluginErrors(m).includes("PLUGIN_MCP_CREDENTIALS"));
});

test("a third-party server cannot borrow the fields of a repository-published one (negative control)", () => {
  const m = variant((x) => {
    const copy = structuredClone(server(x));
    delete copy.bundled_from_plugin;
    Object.assign(copy, { id: "vendor-copy", official: true, publisher: "Example vendor", source: "https://example.test/vendor-copy" });
    x.mcpRegistry.servers.push(copy);
    plugin(x, "microsoft-fabric").source.mcp_servers.push("vendor-copy");
  });
  const registry = registryErrors(m);
  assert.ok(registry.includes("MCP_BUNDLE_NEEDS_CREDENTIALS"), registry.join(", "));
  assert.ok(registry.includes("MCP_BUNDLE_FIELD"), "user_config and the launcher fields need bundled_from_plugin");
  assert.ok(pluginErrors(m).includes("PLUGIN_MCP_CREDENTIALS"));
});

test("only the plugin that holds the server code may bundle it (negative control)", () => {
  const m = variant((x) => {
    plugin(x, "salesforce-platform").source.mcp_servers = ["sap-system"];
  });
  assert.ok(pluginErrors(m).includes("PLUGIN_MCP_FOREIGN_BUNDLE"));
});

test("server code under plugins/<p>/mcp/ must be registered and listed (negative controls)", () => {
  const unregistered = variant((x) => {
    x.mcpRegistry.servers = x.mcpRegistry.servers.filter((s) => s.id !== "sap-system");
    plugin(x, "sap-abap").source.mcp_servers = [];
  });
  assert.ok(pluginErrors(unregistered).includes("PLUGIN_MCP_DIR_UNREGISTERED"));
  const unlisted = variant((x) => {
    plugin(x, "sap-abap").source.mcp_servers = [];
  });
  assert.ok(registryErrors(unlisted).includes("MCP_BUNDLE_NOT_LISTED"));
});

test("a repository-published server must keep its launcher, stay read-only, and never claim to be official (negative controls)", () => {
  assert.ok(registryErrors(variant((x) => { server(x).plugin_path = "mcp/sap-system/missing.mjs"; })).includes("MCP_BUNDLE_PATH_MISSING"));
  assert.ok(registryErrors(variant((x) => { server(x).plugin_path = "../../scripts/build.mjs"; })).includes("MCP_BUNDLE_PATH_UNSAFE"));
  assert.ok(registryErrors(variant((x) => { server(x).plugin_path = "skills/sap-abap-standard/SKILL.md"; })).includes("MCP_BUNDLE_PATH_DIR"));
  const notReadOnly = registryErrors(variant((x) => { server(x).read_only_by_default = false; }));
  assert.ok(notReadOnly.includes("MCP_BUNDLE_NOT_READ_ONLY") && notReadOnly.includes("MCP_REGISTRY_SCHEMA"));
  const official = registryErrors(variant((x) => { server(x).official = true; }));
  assert.ok(official.includes("MCP_BUNDLE_OFFICIAL") && official.includes("MCP_REGISTRY_SCHEMA"));
  assert.ok(registryErrors(variant((x) => { server(x).auth = "api-credentials"; })).includes("MCP_BUNDLE_AUTH"));
  assert.ok(registryErrors(variant((x) => { server(x).transport = "streamable-http"; server(x).url = "https://example.test/mcp"; })).includes("MCP_BUNDLE_TRANSPORT"));
  assert.ok(registryErrors(variant((x) => { server(x).user_config.sap_password.default = "<your-password>"; })).includes("MCP_USER_CONFIG_SENSITIVE_DEFAULT"));
  assert.ok(registryErrors(variant((x) => { server(x).user_config.sap_user.env = "SAP_URL"; })).includes("MCP_USER_CONFIG_ENV"));
});

test("the generated Claude files must agree on the user_config keys (negative control)", () => {
  const files = new Map(generated);
  const manifest = json(`${PLUGIN}/.claude-plugin/plugin.json`);
  delete manifest.userConfig.sap_url;
  files.set(`${PLUGIN}/.claude-plugin/plugin.json`, JSON.stringify(manifest));
  assert.ok(pluginErrors(model, files).includes("PLUGIN_USER_CONFIG_UNDECLARED"));
});
