import { join } from "node:path";
import { exists, isDir } from "../fsutil.mjs";
import { validateSchema } from "../schema.mjs";
import { taxonomy } from "../repo-model.mjs";
import { AGENT_PLUGINS_MCP_SCHEMA, AGENT_PLUGINS_PLUGIN_SCHEMA, PLUGIN_MCP_DIR } from "../constants.mjs";

const MATURITY_ORDER = ["deprecated", "experimental", "beta", "stable"];

/** Validate plugin sources, generated manifests (from the in-memory build), agents, and layout rules. */
export function checkPlugins(model, generated, findings) {
  const tax = taxonomy(model.config);
  const registry = Object.fromEntries((model.mcpRegistry?.servers ?? []).map((s) => [s.id, s]));
  const pluginNames = new Set();

  for (const plugin of model.plugins) {
    const file = plugin.sourcePath;
    const s = plugin.source;
    if (!s) continue;
    for (const err of validateSchema("plugin-source.schema.json", s)) findings.error("PLUGIN_SCHEMA", err, { file });
    if (s.name !== plugin.dirName) findings.error("PLUGIN_NAME_MISMATCH", `name '${s.name}' must equal the folder name '${plugin.dirName}'.`, { file });
    if (pluginNames.has(s.name)) findings.error("PLUGIN_DUPLICATE", `Duplicate plugin name '${s.name}'.`, { file });
    pluginNames.add(s.name);
    if (!tax.vendors.has(s.vendor)) findings.error("PLUGIN_VENDOR", `Unknown vendor '${s.vendor}'. Add it to repo.config.yaml first.`, { file });
    if (!tax.categories.has(s.category)) findings.error("PLUGIN_CATEGORY", `Unknown category '${s.category}'.`, { file });
    if (!tax.maturity.has(s.maturity)) findings.error("PLUGIN_MATURITY", `Unknown maturity '${s.maturity}'.`, { file });

    const skills = plugin.skills.filter((k) => k.data);
    if (!skills.length) findings.error("PLUGIN_NO_SKILLS", "A plugin must contain at least one skill under skills/<name>/SKILL.md.", { file });
    const lowest = skills.map((k) => k.data.metadata?.maturity).filter(Boolean).sort((a, b) => MATURITY_ORDER.indexOf(a) - MATURITY_ORDER.indexOf(b))[0];
    if (lowest && MATURITY_ORDER.indexOf(s.maturity) > MATURITY_ORDER.indexOf(lowest)) {
      findings.warn("PLUGIN_MATURITY_HIGHER", `Plugin maturity '${s.maturity}' is higher than its least mature skill ('${lowest}').`, { file });
    }

    checkPluginMcp(plugin, registry, findings);

    // Layout rules that protect users on every platform.
    if (isDir(join(plugin.dir, "hooks"))) findings.error("PLUGIN_HOOKS_NOT_ALLOWED", "Plugins may not ship hooks until the hook review policy in SECURITY.md is implemented.", { file: `${plugin.relDir}/hooks` });
    if (isDir(join(plugin.dir, "bin"))) findings.error("PLUGIN_BIN_NOT_ALLOWED", "A top-level bin/ folder stops claude.ai and Cowork from installing the plugin.", { file: `${plugin.relDir}/bin` });
    if (exists(join(plugin.dir, "LICENSE"))) findings.info("PLUGIN_LICENSE_FILE", "Plugin has its own LICENSE file; the repository license applies otherwise.", { file: `${plugin.relDir}/LICENSE` });

    for (const agent of plugin.agents) checkAgent(agent, findings);
    checkGeneratedManifests(plugin, generated, findings);
  }
}

/**
 * MCP servers a plugin bundles. A server may be bundled when the registry allows it, and a
 * server that needs credentials only when it is published from this very plugin (its code is
 * in the plugin folder, it is read-only by default, and the agent or the setup command asks
 * the user for the credentials). Server code under mcp/ must be registered, so nothing ships
 * without the registry's review record.
 */
function checkPluginMcp(plugin, registry, findings) {
  const s = plugin.source;
  const file = plugin.sourcePath;
  const userConfigKeys = new Map();
  for (const id of s.mcp_servers ?? []) {
    const server = registry[id];
    if (!server) {
      findings.error("PLUGIN_MCP_UNKNOWN", `MCP server '${id}' is not in mcp/servers.yaml.`, { file });
      continue;
    }
    if (server.bundle_policy !== "bundle") {
      findings.error("PLUGIN_MCP_NOT_BUNDLABLE", `MCP server '${id}' has bundle_policy '${server.bundle_policy}' and may only be documented, not bundled.`, { file });
    } else if (server.bundled_from_plugin && server.bundled_from_plugin !== s.name) {
      findings.error("PLUGIN_MCP_FOREIGN_BUNDLE", `MCP server '${id}' is published from plugin '${server.bundled_from_plugin}' and may be bundled only there; its launcher is not in this plugin folder.`, { file });
    } else if (server.auth !== "none" && server.bundled_from_plugin !== s.name) {
      findings.error("PLUGIN_MCP_CREDENTIALS", `MCP server '${id}' needs credentials (auth '${server.auth}'). A plugin may bundle such a server only when the server is published from the plugin itself and read-only by default.`, { file });
    }
    for (const key of Object.keys(server.user_config ?? {})) {
      if (userConfigKeys.has(key)) findings.error("PLUGIN_USER_CONFIG_DUPLICATE", `user_config key '${key}' is declared by MCP servers '${userConfigKeys.get(key)}' and '${id}'; keys must be unique within a plugin.`, { file });
      userConfigKeys.set(key, id);
    }
  }
  for (const dir of plugin.mcpDirs ?? []) {
    const registered = Object.values(registry).some((m) => m.bundled_from_plugin === s.name && String(m.plugin_path ?? "").startsWith(`${PLUGIN_MCP_DIR}/${dir}/`));
    if (!registered) {
      findings.error("PLUGIN_MCP_DIR_UNREGISTERED", `${plugin.relDir}/${PLUGIN_MCP_DIR}/${dir}/ holds server code that mcp/servers.yaml does not list as bundled from this plugin. Register it with bundled_from_plugin: ${s.name}, or remove it.`, { file: `${plugin.relDir}/${PLUGIN_MCP_DIR}/${dir}` });
    }
  }
}

function checkAgent(agent, findings) {
  const file = agent.file;
  if (agent.error) {
    findings.error("AGENT_FRONTMATTER", agent.error, { file });
    return;
  }
  const d = agent.data;
  if (!d.name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.name)) findings.error("AGENT_NAME", "Agent frontmatter needs a kebab-case 'name'.", { file });
  if (!d.description || String(d.description).length < 40) findings.error("AGENT_DESCRIPTION", "Agent frontmatter needs a 'description' of at least 40 characters.", { file });
  if (d.name && agent.fileName !== `${d.name}.agent.md`) findings.error("AGENT_FILENAME", `File name must be '${d.name}.agent.md'.`, { file });
  if (d.tools !== undefined) findings.warn("AGENT_TOOLS", "Tool names differ between Claude Code and GitHub Copilot. Omit 'tools' so the agent inherits the host's tools, or document the platform it targets.", { file });
}

function checkGeneratedManifests(plugin, generated, findings) {
  const base = plugin.relDir;
  const checks = [
    [`${base}/plugin.json`, AGENT_PLUGINS_PLUGIN_SCHEMA],
    [`${base}/.claude-plugin/plugin.json`, "platform/claude-plugin.schema.json"],
    [`${base}/.cursor-plugin/plugin.json`, "platform/cursor-plugin.schema.json"],
    [`${base}/gemini-extension.json`, "platform/gemini-extension.schema.json"],
    [`${base}/mcp.json`, AGENT_PLUGINS_MCP_SCHEMA],
    [`${base}/.mcp.json`, "platform/claude-mcp.schema.json"],
  ];
  for (const [path, schema] of checks) {
    if (!generated.has(path)) continue;
    const data = JSON.parse(generated.get(path));
    for (const err of validateSchema(schema, data)) findings.error("GENERATED_MANIFEST_SCHEMA", `${err} (schema ${schema})`, { file: path });
  }
  // Claude Code drops a server whose ${user_config.KEY} names an option the manifest does not
  // declare (claude plugin validate reports it too), so the two generated files must agree.
  const claudeMcp = generated.get(`${base}/.mcp.json`);
  if (claudeMcp) {
    const manifest = JSON.parse(generated.get(`${base}/.claude-plugin/plugin.json`) ?? "{}");
    const declared = new Set(Object.keys(manifest.userConfig ?? {}));
    for (const m of claudeMcp.matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g)) {
      if (!declared.has(m[1])) findings.error("PLUGIN_USER_CONFIG_UNDECLARED", `.mcp.json references \${user_config.${m[1]}}, which userConfig in .claude-plugin/plugin.json does not declare.`, { file: `${base}/.mcp.json` });
    }
  }
  const readme = generated.get(`${base}/README.md`) ?? "";
  const words = readme.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;
  if (words < 40) findings.error("PLUGIN_README_SHORT", "Generated README has fewer than 40 words outside code blocks (Claude directory requirement).", { file: `${base}/README.md` });
}

export function checkMarketplaces(generated, findings) {
  const pairs = [
    [".claude-plugin/marketplace.json", "platform/claude-marketplace.schema.json"],
    [".github/plugin/marketplace.json", "platform/copilot-marketplace.schema.json"],
    [".agents/plugins/marketplace.json", "platform/codex-marketplace.schema.json"],
  ];
  for (const [path, schema] of pairs) {
    const data = JSON.parse(generated.get(path));
    for (const err of validateSchema(schema, data)) findings.error("MARKETPLACE_SCHEMA", err, { file: path });
  }
}
