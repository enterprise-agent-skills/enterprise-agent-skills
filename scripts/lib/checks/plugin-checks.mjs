import { join } from "node:path";
import { exists, isDir } from "../fsutil.mjs";
import { validateSchema } from "../schema.mjs";
import { taxonomy } from "../repo-model.mjs";
import { AGENT_PLUGINS_MCP_SCHEMA, AGENT_PLUGINS_PLUGIN_SCHEMA } from "../constants.mjs";

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

    for (const id of s.mcp_servers ?? []) {
      const server = registry[id];
      if (!server) findings.error("PLUGIN_MCP_UNKNOWN", `MCP server '${id}' is not in mcp/servers.yaml.`, { file });
      else if (server.bundle_policy !== "bundle") findings.error("PLUGIN_MCP_NOT_BUNDLABLE", `MCP server '${id}' has bundle_policy '${server.bundle_policy}' and may only be documented, not bundled.`, { file });
    }

    // Layout rules that protect users on every platform.
    if (isDir(join(plugin.dir, "hooks"))) findings.error("PLUGIN_HOOKS_NOT_ALLOWED", "Plugins may not ship hooks until the hook review policy in SECURITY.md is implemented.", { file: `${plugin.relDir}/hooks` });
    if (isDir(join(plugin.dir, "bin"))) findings.error("PLUGIN_BIN_NOT_ALLOWED", "A top-level bin/ folder stops claude.ai and Cowork from installing the plugin.", { file: `${plugin.relDir}/bin` });
    if (exists(join(plugin.dir, "LICENSE"))) findings.info("PLUGIN_LICENSE_FILE", "Plugin has its own LICENSE file; the repository license applies otherwise.", { file: `${plugin.relDir}/LICENSE` });

    for (const agent of plugin.agents) checkAgent(agent, findings);
    checkGeneratedManifests(plugin, generated, findings);
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
  ];
  for (const [path, schema] of checks) {
    if (!generated.has(path)) continue;
    const data = JSON.parse(generated.get(path));
    for (const err of validateSchema(schema, data)) findings.error("GENERATED_MANIFEST_SCHEMA", `${err} (schema ${schema})`, { file: path });
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
