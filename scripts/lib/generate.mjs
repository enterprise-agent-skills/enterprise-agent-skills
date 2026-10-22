import { join } from "node:path";
import { AGENT_PLUGINS_MCP_SCHEMA, AGENT_PLUGINS_PLUGIN_SCHEMA, GENERATED_BEGIN, GENERATED_END, PATHS, PLUGIN_ROOT_VARIABLES, REPO_ROOT } from "./constants.mjs";
import { exists, isLocalJunk, readText, stableJson } from "./fsutil.mjs";
import { repoUrls, taxonomy } from "./repo-model.mjs";
import { mdTable } from "./report.mjs";
import { splitIntoFiles, defaultFileFor } from "../../tests/harness/files.mjs";
import { loadLanguageFeatures, loadSapEnvironments, basisValue, parseRelease } from "../../tests/harness/sap-env.mjs";

/**
 * Compute every generated file from the repository model. Returns Map<relPath, content>.
 * Pure function of the model: build.mjs writes the map, build.mjs --check compares it.
 */
export function generateAll(model) {
  const out = new Map();
  const ctx = context(model);
  for (const plugin of model.plugins) {
    if (!plugin.source) continue;
    for (const [path, content] of generatePlugin(plugin, ctx)) out.set(path, content);
  }
  const plugins = orderedPlugins(model, ctx);
  out.set(".claude-plugin/marketplace.json", stableJson(claudeMarketplace(plugins, ctx)));
  out.set(".github/plugin/marketplace.json", stableJson(copilotMarketplace(plugins, ctx)));
  out.set(".agents/plugins/marketplace.json", stableJson(codexMarketplace(plugins, ctx)));
  out.set(PATHS.catalog, stableJson(catalog(model, ctx)));
  out.set(PATHS.llms, llmsTxt(model, ctx));
  for (const skill of model.skills) {
    const entry = skill.data && model.scenarios[skill.data.name];
    if (entry?.data?.scenarios?.length) out.set(entry.vallyFile, vallySpec(skill, entry));
  }
  const readme = readmeWithGeneratedRegions(model, ctx);
  if (readme) out.set(PATHS.readme, readme);
  const sapDoc = sapEnvironmentsDoc(model, ctx);
  if (sapDoc) out.set(PATHS.sapEnvironmentsDoc, sapDoc);
  const syntaxDoc = releaseSyntaxDoc();
  if (syntaxDoc) out.set(PATHS.releaseSyntaxDoc, syntaxDoc);
  return out;
}

function context(model) {
  const urls = repoUrls(model.config);
  const tax = taxonomy(model.config);
  const repo = model.config?.repository ?? {};
  return {
    urls,
    tax,
    repo,
    marketplace: repo.marketplace_name ?? "enterprise-agent-skills",
    license: repo.license ?? "MIT",
    defaultAuthor: { name: `${repo.marketplace_display_name ?? "Enterprise Agent Skills"} contributors`, url: urls.repo },
    mcpById: Object.fromEntries((model.mcpRegistry?.servers ?? []).map((s) => [s.id, s])),
    // Display order follows the vendor list in repo.config.yaml (SAP first), not the alphabet.
    vendorRank: Object.fromEntries((model.config?.vendors ?? []).map((v, i) => [v.id, i])),
  };
}

/** Skills of a plugin in display order: plugin.yaml skill_order first, then alphabetical. */
function orderedSkillNames(plugin) {
  const order = plugin.source?.skill_order ?? [];
  const rank = (name) => (order.includes(name) ? order.indexOf(name) : order.length);
  return plugin.skills.filter((s) => s.data).map((s) => s.data.name).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Published plugins in display order: vendor order from repo.config.yaml, then name. */
function orderedPlugins(model, ctx) {
  const rank = (p) => ctx.vendorRank[p.source.vendor] ?? Number.MAX_SAFE_INTEGER;
  return model.plugins.filter((p) => p.source).sort((a, b) => rank(a) - rank(b) || a.source.name.localeCompare(b.source.name));
}

// ------------------------------------------------------------------ per-plugin manifests

function generatePlugin(plugin, ctx) {
  const s = plugin.source;
  const base = plugin.relDir;
  const author = s.author ?? ctx.defaultAuthor;
  const homepage = ctx.urls.tree(base);
  const files = new Map();
  const servers = (s.mcp_servers ?? []).map((id) => ctx.mcpById[id]).filter(Boolean);
  const hasAgents = plugin.agents.length > 0;
  // A server published from this repository (bundled_from_plugin) is started from the plugin
  // folder, and the agent asks for its connection details where the platform supports that.
  const bundled = servers.some((m) => m.bundled_from_plugin);
  const userConfig = claudeUserConfig(servers);
  const settings = geminiSettings(servers);

  files.set(`${base}/plugin.json`, stableJson({
    $schema: AGENT_PLUGINS_PLUGIN_SCHEMA,
    name: s.name,
    version: s.version,
    description: s.description,
    author,
    homepage,
    repository: ctx.urls.repo,
    license: ctx.license,
    keywords: s.keywords,
  }));

  const claude = {
    name: s.name,
    displayName: s.display_name,
    version: s.version,
    description: s.description,
    author,
    homepage,
    repository: ctx.urls.repo,
    license: ctx.license,
    keywords: s.keywords,
  };
  if (userConfig) claude.userConfig = userConfig;
  files.set(`${base}/.claude-plugin/plugin.json`, stableJson(claude));

  const cursor = {
    name: s.name,
    description: s.description,
    version: s.version,
    author,
    homepage,
    repository: ctx.urls.repo,
    license: ctx.license,
    keywords: s.keywords,
    skills: "./skills/",
  };
  if (hasAgents) cursor.agents = "./agents/";
  // Cursor reads Claude's .mcp.json as long as nothing in it is Claude-specific. A bundled
  // server needs Cursor's own plugin-root variable and must not carry the ${user_config.*}
  // env that only Claude Code substitutes, so it is declared inline instead.
  if (servers.length) cursor.mcpServers = bundled ? Object.fromEntries(servers.map((m) => [m.id, cursorServer(m)])) : "./.mcp.json";
  files.set(`${base}/.cursor-plugin/plugin.json`, stableJson(cursor));

  const gemini = { name: s.name, version: s.version, description: s.description };
  if (servers.length) gemini.mcpServers = Object.fromEntries(servers.map((m) => [m.id, geminiServer(m)]));
  if (settings.length) gemini.settings = settings;
  files.set(`${base}/gemini-extension.json`, stableJson(gemini));

  if (servers.length) {
    files.set(`${base}/mcp.json`, stableJson({
      $schema: AGENT_PLUGINS_MCP_SCHEMA,
      mcpServers: Object.fromEntries(servers.map((m) => [m.id, agentPluginsServer(m)])),
    }));
    files.set(`${base}/.mcp.json`, stableJson({ mcpServers: Object.fromEntries(servers.map((m) => [m.id, claudeServer(m)])) }));
  }

  // In Agent Plugins mode, GitHub Copilot reads custom agents from com.github.copilot/agents/.
  for (const agent of plugin.agents) {
    files.set(`${base}/com.github.copilot/agents/${agent.fileName}`, readText(join(REPO_ROOT, agent.file)));
  }

  files.set(`${base}/README.md`, pluginReadme(plugin, servers, ctx));
  return files;
}

/**
 * Arguments that start a server published from this repository: the launcher path prefixed
 * with the platform's plugin-root variable, then the server's own arguments.
 */
function bundledArgs(m, rootVariable) {
  return [`${rootVariable}/${m.plugin_path}`, ...(m.plugin_args ?? [])];
}

/**
 * Agent Plugins mcp.json (GitHub Copilot CLI, OpenAI Codex). A bundled server gets no env: the
 * specification forbids secrets there and expands only ${PLUGIN_ROOT} and ${PLUGIN_DATA}, so
 * users run the server's setup command once instead.
 */
function agentPluginsServer(m) {
  if (m.bundled_from_plugin) return { type: "stdio", command: m.command, args: bundledArgs(m, PLUGIN_ROOT_VARIABLES.agentPlugins) };
  return m.transport === "stdio" ? { type: "stdio", command: m.command, args: m.args } : { type: "streamable-http", url: m.url };
}

/**
 * Claude Code .mcp.json. The values Claude Code prompted for (userConfig in the manifest)
 * reach a bundled server as ${user_config.KEY} in env.
 */
function claudeServer(m) {
  if (m.bundled_from_plugin) {
    const server = { command: m.command, args: bundledArgs(m, PLUGIN_ROOT_VARIABLES.claude) };
    if (m.user_config) server.env = Object.fromEntries(Object.entries(m.user_config).map(([key, option]) => [option.env, `\${user_config.${key}}`]));
    return server;
  }
  return m.transport === "stdio" ? { command: m.command, args: m.args } : { type: "http", url: m.url };
}

/** Gemini CLI gemini-extension.json. Prompted settings reach a bundled server as environment variables. */
function geminiServer(m) {
  if (m.bundled_from_plugin) return { command: m.command, args: bundledArgs(m, PLUGIN_ROOT_VARIABLES.gemini) };
  return m.transport === "stdio" ? { command: m.command, args: m.args } : { httpUrl: m.url };
}

/** Cursor inline mcpServers. Cursor infers the transport from command or url. */
function cursorServer(m) {
  if (m.bundled_from_plugin) return { command: m.command, args: bundledArgs(m, PLUGIN_ROOT_VARIABLES.cursor) };
  return m.transport === "stdio" ? { command: m.command, args: m.args } : { url: m.url };
}

/**
 * userConfig for .claude-plugin/plugin.json from the user_config blocks of the plugin's
 * servers, with the fields of the Claude Code plugin manifest reference (checked 2026-10-22):
 * type, title, description, required, default, sensitive. Null when no server declares any.
 */
function claudeUserConfig(servers) {
  const out = {};
  for (const m of servers) {
    for (const [key, o] of Object.entries(m.user_config ?? {})) {
      const option = { type: o.type, title: o.title, description: o.description };
      if (o.required !== undefined) option.required = o.required;
      if (o.default !== undefined) option.default = o.default;
      if (o.sensitive) option.sensitive = true;
      out[key] = option;
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * settings for gemini-extension.json: Gemini CLI asks for them when the extension is
 * installed, stores sensitive values in the system keychain, and passes each one to the
 * extension's MCP servers as the named environment variable (extension reference, checked
 * 2026-10-22).
 */
function geminiSettings(servers) {
  return servers.flatMap((m) => Object.values(m.user_config ?? {}).map((o) => {
    const setting = { name: o.title, description: o.description, envVar: o.env };
    if (o.sensitive) setting.sensitive = true;
    return setting;
  }));
}

// ------------------------------------------------------------------ marketplaces

function pluginEntryCommon(plugin, ctx) {
  const s = plugin.source;
  return {
    name: s.name,
    source: `./${plugin.relDir}`,
    description: s.description,
    version: s.version,
    author: s.author ?? ctx.defaultAuthor,
    homepage: ctx.urls.tree(plugin.relDir),
    repository: ctx.urls.repo,
    license: ctx.license,
    keywords: s.keywords,
    category: s.category,
  };
}

function claudeMarketplace(plugins, ctx) {
  return {
    name: ctx.marketplace,
    owner: { name: ctx.urls.owner, url: `https://github.com/${ctx.urls.owner}` },
    metadata: { description: ctx.repo.description?.trim() ?? "", version: "1.0.0", pluginRoot: `./${PATHS.plugins}` },
    // `skills` lets the npx skills installer find skills at their declared depth.
    plugins: plugins.map((p) => ({ ...pluginEntryCommon(p, ctx), skills: ["./skills/"] })),
  };
}

function copilotMarketplace(plugins, ctx) {
  return {
    name: ctx.marketplace,
    owner: { name: ctx.urls.owner, url: `https://github.com/${ctx.urls.owner}` },
    metadata: { description: ctx.repo.description?.trim() ?? "", version: "1.0.0" },
    plugins: plugins.map((p) => ({ ...pluginEntryCommon(p, ctx), tags: [p.source.vendor, p.source.maturity] })),
  };
}

function codexMarketplace(plugins, ctx) {
  return {
    name: ctx.marketplace,
    interface: { displayName: ctx.repo.marketplace_display_name ?? ctx.marketplace },
    plugins: plugins.map((p) => ({
      name: p.source.name,
      source: { source: "local", path: `./${p.relDir}` },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: ctx.tax.categoryNames[p.source.category] ?? p.source.category,
    })),
  };
}

// ------------------------------------------------------------------ catalog and llms.txt

export function shortDescription(description) {
  const text = String(description ?? "").replace(/\s+/g, " ").trim();
  const cut = text.search(/\bUSE FOR:/);
  return (cut > 0 ? text.slice(0, cut) : text).trim();
}

function skillRecords(model, ctx) {
  const pluginByDir = Object.fromEntries(model.plugins.map((p) => [p.dirName, p]));
  return model.skills
    .filter((s) => s.data)
    .map((s) => {
      const md = s.data.metadata ?? {};
      const entry = model.scenarios[s.data.name];
      const scenarios = entry?.data?.scenarios ?? [];
      const plugin = pluginByDir[s.plugin];
      return {
        name: s.data.name,
        plugin: s.plugin,
        vendor: md.vendor,
        product: md.product,
        category: md.category,
        maturity: md.maturity,
        version: md.version,
        last_verified: md["last-verified"] ?? null,
        authors: md.authors ? md.authors.split(",").map((a) => a.trim()).filter(Boolean) : [],
        sap: md.vendor === "sap" && md.product === "abap" ? sapInfo(md) : null,
        summary: shortDescription(s.data.description),
        description: String(s.data.description).replace(/\s+/g, " ").trim(),
        prerequisites: String(s.data.compatibility ?? "").replace(/\s+/g, " ").trim(),
        path: s.relDir,
        url: ctx.urls.tree(s.relDir),
        tests: {
          scenarios: scenarios.length,
          negative_controls: scenarios.reduce((n, sc) => n + (sc.negative_responses?.length ?? 0), 0),
          acceptance_criteria: Boolean(entry?.criteriaText),
          vally_spec: Boolean(scenarios.length),
        },
        upstream_microsoft_skills: plugin?.source?.upstream?.microsoft_skills ?? "not-applicable",
      };
    })
    .sort((a, b) => {
      const vendor = (r) => ctx.vendorRank[r.vendor] ?? Number.MAX_SAFE_INTEGER;
      const order = (r) => {
        const names = orderedSkillNames(pluginByDir[r.plugin]);
        return names.indexOf(r.name);
      };
      return vendor(a) - vendor(b) || a.plugin.localeCompare(b.plugin) || order(a) - order(b);
    });
}

function splitList(value) {
  return String(value ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

/** SAP environment data from skill metadata, with display names from config/sap-environments.yaml. */
function sapInfo(md) {
  const reg = loadSapEnvironments();
  const productName = (id) => reg.products.find((p) => p.id === id)?.name ?? id;
  const deploymentName = (id) => reg.deployments.find((d) => d.id === id)?.name ?? id;
  return {
    products: splitList(md["sap-products"]),
    product_names: splitList(md["sap-products"]).map(productName),
    deployments: splitList(md["sap-deployments"]),
    deployment_names: splitList(md["sap-deployments"]).map(deploymentName),
    language_versions: splitList(md["abap-language-version"]),
    sap_basis_min: md["sap-basis-min"] ?? null,
  };
}

function sapSystemsText(sap) {
  if (!sap) return "";
  return `${sap.product_names.join(", ")}; SAP_BASIS ${sap.sap_basis_min}+`;
}

function abapModelText(sap) {
  if (!sap) return "";
  return sap.language_versions.map((v) => (v === "cloud" ? "ABAP Cloud" : "Standard ABAP")).join(", ");
}

function catalog(model, ctx) {
  return {
    schema_version: 1,
    notice: "Generated by scripts/build.mjs. Do not edit by hand.",
    repository: ctx.urls.repo,
    marketplace: ctx.marketplace,
    plugins: orderedPlugins(model, ctx)
      .map((p) => ({
        name: p.source.name,
        display_name: p.source.display_name,
        vendor: p.source.vendor,
        category: p.source.category,
        maturity: p.source.maturity,
        version: p.source.version,
        description: p.source.description,
        path: p.relDir,
        skills: orderedSkillNames(p),
        agents: p.agents.map((a) => a.data?.name).filter(Boolean),
        mcp_servers: p.source.mcp_servers ?? [],
      })),
    skills: skillRecords(model, ctx),
  };
}

function llmsTxt(model, ctx) {
  const lines = [`# ${ctx.repo.marketplace_display_name ?? ctx.urls.name}`, "", `> ${String(ctx.repo.description ?? "").replace(/\s+/g, " ").trim()}`, "", "## Plugins", ""];
  for (const p of orderedPlugins(model, ctx)) lines.push(`- [${p.source.display_name}](${ctx.urls.tree(p.relDir)}): ${p.source.description}`);
  lines.push("", "## Skills", "");
  for (const s of skillRecords(model, ctx)) lines.push(`- [${s.name}](${ctx.urls.blob(`${s.path}/SKILL.md`)}): ${s.summary}`);
  lines.push("", "## Optional", "", `- [Catalog JSON](${ctx.urls.blob(PATHS.catalog)}): machine-readable index of plugins and skills`, `- [Contributing](${ctx.urls.blob("CONTRIBUTING.md")}): how to add, test, and review skills`, "");
  return lines.join("\n");
}

// ------------------------------------------------------------------ README regions

/** Join words as "a", "a or b", or "a, b, or c" (conj "or"); the same with "and". */
function joinList(items, conj) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conj} ${items[items.length - 1]}`;
}

/**
 * Install and update commands for one plugin and one of its skills. The commands were checked
 * against the vendors' documentation on 2026-10-21: code.claude.com/docs/en/discover-plugins
 * (auto-update is off by default for marketplaces like this one), the GitHub Copilot CLI plugin
 * reference, learn.chatgpt.com/docs/plugins (the Codex IDE extension does not support plugins,
 * and Codex documents no plugin update command), claude.com/docs/plugins/overview, and the
 * npx skills command reference.
 */
function installBlock(ctx, pluginName = "<plugin>", skillName = "<skill>") {
  return [
    "```text",
    "# Claude Code",
    `/plugin marketplace add ${ctx.urls.slug}`,
    `/plugin install ${pluginName}@${ctx.marketplace}`,
    "",
    "# GitHub Copilot CLI",
    `copilot plugin marketplace add ${ctx.urls.slug}`,
    `copilot plugin install ${pluginName}@${ctx.marketplace}`,
    "",
    "# OpenAI Codex CLI (the Codex IDE extension does not support plugins)",
    `codex plugin marketplace add ${ctx.urls.slug}`,
    `# then enter /plugins in Codex, install ${pluginName}, and start a new session`,
    "",
    "# Any Agent Skills compatible agent (Copilot in VS Code, Cursor, Gemini CLI, and others)",
    `npx skills add ${ctx.urls.slug} --skill ${skillName}`,
    "```",
    "",
    `Claude Cowork and claude.ai: Customize > Plugins > Add > Add marketplace, then enter \`${ctx.urls.repo}\`.`,
    "",
    "To update:",
    "",
    `- Claude Code: run \`claude plugin update ${pluginName}@${ctx.marketplace}\` in your shell, or open the plugin on the **Installed** tab of \`/plugin\` and select **Update now**. Claude Code does not update plugins from this marketplace automatically unless you turn it on: select \`${ctx.marketplace}\` on the **Marketplaces** tab of \`/plugin\`, then **Enable auto-update**.`,
    `- GitHub Copilot CLI: run \`copilot plugin update ${pluginName}\`.`,
    "- Claude Cowork and claude.ai: in Customize > Plugins, select **Check for updates**, or turn on **Sync automatically** for this marketplace.",
    `- Skills installed with \`npx skills\`: run \`npx skills update ${skillName}\`.`,
  ].join("\n");
}

/** Sentences above the root README install commands: what they install, and how to swap in another plugin or skill. */
function installIntro(ctx, first, rest, skillName) {
  const name = first.source.name;
  const parts = [`The commands below install the \`${name}\` plugin; the \`npx skills\` line installs only its \`${skillName}\` skill.`];
  if (rest.length) {
    const others = rest.map((p) => `\`${p.source.name}\``);
    parts.push(`For another plugin, replace \`${name}\` with ${joinList(others, "or")}; every install name has the form \`<plugin>@${ctx.marketplace}\`.`);
  }
  parts.push(`For another skill, replace \`${skillName}\` with any skill name from the catalog below.`);
  return parts.join(" ");
}

function readmeWithGeneratedRegions(model, ctx) {
  const path = join(REPO_ROOT, PATHS.readme);
  if (!exists(path)) return null;
  let text = readText(path);
  const records = skillRecords(model, ctx);

  const catalogMd = [];
  const vendors = [...new Set(records.map((r) => r.vendor))];
  for (const v of vendors) {
    const rows = records.filter((r) => r.vendor === v);
    catalogMd.push(`### ${ctx.tax.vendorNames[v] ?? v}`, "");
    if (rows.some((r) => r.sap)) {
      catalogMd.push("SAP skills state the systems and the ABAP development model they target. Where SAP runs (on premises or on Azure, AWS, or Google Cloud VMs) does not change which skill applies. See [docs/sap-environments.md](docs/sap-environments.md).", "");
      catalogMd.push(mdTable(
        ["Skill", "What it does", "SAP systems", "ABAP model", "Category", "Maturity", "Tests"],
        rows.map((r) => [
          `[${r.name}](${r.path}/SKILL.md)`,
          r.summary,
          sapSystemsText(r.sap),
          abapModelText(r.sap),
          ctx.tax.categoryNames[r.category] ?? r.category,
          r.maturity,
          `${r.tests.scenarios} scenarios, ${r.tests.negative_controls} negative controls`,
        ]),
      ), "");
      continue;
    }
    catalogMd.push(mdTable(
      ["Skill", "What it does", "Prerequisites", "Category", "Maturity", "Tests"],
      rows.map((r) => [
        `[${r.name}](${r.path}/SKILL.md)`,
        r.summary,
        r.prerequisites,
        ctx.tax.categoryNames[r.category] ?? r.category,
        r.maturity,
        `${r.tests.scenarios} scenarios, ${r.tests.negative_controls} negative controls`,
      ]),
    ), "");
  }
  const covered = new Set(vendors);
  const wanted = (model.config?.vendors ?? []).filter((v) => !covered.has(v.id) && v.id !== "vendor-neutral").map((v) => v.name);
  if (wanted.length) catalogMd.push(`Planned: skills for ${joinList(wanted, "and")}. See [CONTRIBUTING.md](CONTRIBUTING.md) to propose one.`, "");

  // "Works with", not "Vendor": in plugin listings a vendor is the publisher, and these plugins
  // are not published by SAP, Microsoft, or Salesforce.
  const plugins = orderedPlugins(model, ctx);
  const pluginsMd = [mdTable(
    ["Plugin", "Works with", "Skills", "Install name", "Maturity"],
    plugins.map((p) => [
      `[${p.source.display_name}](${p.relDir}/README.md)`,
      ctx.tax.vendorNames[p.source.vendor] ?? p.source.vendor,
      orderedSkillNames(p).map((n) => `\`${n}\``).join(", "),
      `\`${p.source.name}@${ctx.marketplace}\``,
      p.source.maturity,
    ]),
  ), ""];
  // Concrete commands for the first plugin (SAP), with the general form next to them.
  const [first, ...rest] = plugins;
  if (first) {
    const skillName = orderedSkillNames(first)[0] ?? "<skill>";
    pluginsMd.push(installIntro(ctx, first, rest, skillName), "", installBlock(ctx, first.source.name, skillName));
  } else {
    pluginsMd.push(installBlock(ctx));
  }

  text = replaceRegion(text, "catalog", catalogMd.join("\n").trimEnd());
  text = replaceRegion(text, "plugins", pluginsMd.join("\n").trimEnd());
  return text;
}

export function replaceRegion(text, id, content) {
  const begin = GENERATED_BEGIN(id);
  const end = GENERATED_END(id);
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start === -1 || stop === -1 || stop < start) return text;
  return `${text.slice(0, start + begin.length)}\n${content}\n${text.slice(stop)}`;
}

// ------------------------------------------------------------------ release-syntax.md

/** Table of ABAP features by release from config/abap-language-features.yaml. */
function releaseSyntaxDoc() {
  const path = join(REPO_ROOT, PATHS.releaseSyntaxDoc);
  if (!exists(path)) return null;
  const features = loadLanguageFeatures()
    .features.map((f, i) => ({ ...f, order: i, rank: parseRelease(f.since)?.rank ?? 0 }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order);
  const checkText = (f) => {
    const base = f.checked_by === "abaplint" ? "abaplint" : `rule \`${f.checked_by.slice("rule:".length)}\``;
    return f.validator_from ? `${base}; accepted from ${f.validator_from} only` : base;
  };
  // A code span that contains backticks needs a double-backtick delimiter.
  const code = (s) => (s.includes("`") ? `\`\` ${s} \`\`` : `\`${s}\``);
  const table = mdTable(
    ["Since", "Feature", "Example", "On older releases", "Offline check"],
    features.map((f) => [f.since, f.name, code(f.syntax), f.older, checkText(f)]),
  );
  let text = replaceRegion(readText(path), "abap-language-features", table);
  text = replaceRegion(text, "sap-release-map", releaseMapTable());
  return text;
}

/** SAP_BASIS release per product release, for customer-managed products (no cloud releases). */
function releaseMapTable() {
  const reg = loadSapEnvironments();
  const products = reg.products.filter((p) => p.releases.some((r) => r.sap_basis !== "cloud"));
  const shortName = (name) => {
    if (name === "ECC 6.0") return "6.0 without EHP";
    return name.replace(/^(ECC 6\.0 |NetWeaver |S\/4HANA |Private Edition )/, "");
  };
  const bases = [...new Set(products.flatMap((p) => p.releases.map((r) => r.sap_basis)))]
    .filter((b) => b !== "cloud")
    .sort((a, b) => basisValue(a) - basisValue(b));
  return mdTable(
    ["SAP_BASIS", ...products.map((p) => p.name)],
    bases.map((b) => [b, ...products.map((p) => p.releases.filter((r) => r.sap_basis === b).map((r) => shortName(r.name ?? r.id)).join(", "))]),
  );
}

// ------------------------------------------------------------------ docs/sap-environments.md

const pad2 = (n) => String(n).padStart(2, "0");

/** abaplint grammar(s) used for one SAP_BASIS release, including support package ranges. */
function grammarText(reg, sapBasis) {
  if (sapBasis === "cloud") return "`Cloud`";
  const rows = reg.grammar_by_sap_basis
    .filter((r) => r.sap_basis === sapBasis)
    .sort((a, b) => (a.min_support_package ?? 0) - (b.min_support_package ?? 0));
  if (!rows.length) return "not mapped";
  if (rows.length === 1 && rows[0].min_support_package === undefined) {
    return `\`${rows[0].grammar}\`${rows[0].note ? ` (${rows[0].note})` : ""}`;
  }
  return rows
    .map((r, i) => {
      const from = r.min_support_package ?? 0;
      const next = rows[i + 1];
      const range = next ? `SP${pad2(from)}-${pad2(next.min_support_package - 1)}` : `SP${pad2(from)}+`;
      return `${range}: \`${r.grammar}\``;
    })
    .join("; ");
}

function languageText(product, sapBasis) {
  const from = product.cloud_language_from_sap_basis;
  return product.language_versions
    .filter((lv) => lv !== "cloud" || !from || sapBasis === "cloud" || basisValue(sapBasis) >= basisValue(from))
    .map((lv) => (lv === "cloud" ? "ABAP Cloud" : "Standard ABAP"))
    .join(", ");
}

function sapEnvironmentsDoc(model, ctx) {
  const path = join(REPO_ROOT, PATHS.sapEnvironmentsDoc);
  if (!exists(path)) return null;
  const reg = loadSapEnvironments();
  const deploymentName = (id) => reg.deployments.find((d) => d.id === id)?.name ?? id;
  const databaseName = (id) => reg.databases.find((d) => d.id === id)?.name ?? id;
  let text = readText(path);

  const skills = skillRecords(model, ctx).filter((r) => r.sap);
  text = replaceRegion(text, "sap-skills", mdTable(
    ["Skill", "SAP systems", "ABAP model", "Minimum SAP_BASIS", "Where SAP runs"],
    skills.map((r) => [
      `[${r.name}](../${r.path}/SKILL.md)`,
      r.sap.product_names.join(", "),
      abapModelText(r.sap),
      r.sap.sap_basis_min ?? "",
      r.sap.deployment_names.join("; "),
    ]),
  ));

  text = replaceRegion(text, "sap-products", mdTable(
    ["Product", "Databases", "ABAP language versions", "Where it runs"],
    reg.products.map((p) => [
      p.name,
      p.databases.map(databaseName).join("; "),
      p.language_versions.map((lv) => (lv === "cloud" ? `ABAP Cloud${p.cloud_language_from_sap_basis ? ` (SAP_BASIS ${p.cloud_language_from_sap_basis} and later)` : ""}` : "Standard ABAP")).join(", "),
      p.deployments.map(deploymentName).join("; "),
    ]),
  ));

  const rows = [];
  for (const p of reg.products) {
    for (const r of p.releases) {
      rows.push([
        p.name,
        r.name ?? r.id,
        `\`${p.id}\` / \`${r.id}\``,
        r.sap_basis === "cloud" ? "current cloud release" : r.sap_basis,
        languageText(p, r.sap_basis),
        grammarText(reg, r.sap_basis),
      ]);
    }
  }
  text = replaceRegion(text, "sap-releases", mdTable(["Product", "Release", "product / release id", "SAP_BASIS", "ABAP language versions", "abaplint grammar (Standard ABAP)"], rows));

  text = replaceRegion(text, "sap-feature-rules", mdTable(
    ["Rule", "Detects", "Needs", "Source"],
    reg.feature_rules.map((f) => [
      `\`${f.id}\``,
      f.description,
      [
        f.min_sap_basis ? `SAP_BASIS ${f.min_sap_basis}${f.min_support_package !== undefined ? ` SP${pad2(f.min_support_package)}` : ""} or later` : null,
        f.requires_database ? databaseName(f.requires_database) : null,
      ].filter(Boolean).join("; "),
      f.source ?? "",
    ]),
  ));
  return text;
}

// ------------------------------------------------------------------ plugin README

/**
 * What a helper script bundled in a skill downloads, keyed by "<skill name>/<path in the skill>",
 * for the "Data and permissions" section of the plugin README. Each note was written from the
 * script source (checked 2026-10-21) and is used only while the script still names every host
 * listed here. Any other script that contains a URL gets a generic note naming its hosts, so a
 * README never says a plugin sends no data while one of its scripts can connect somewhere.
 */
const SCRIPT_NETWORK_NOTES = {
  "sap-clean-core-check/scripts/lookup_api_state.py": {
    hosts: ["raw.githubusercontent.com"],
    text: "downloads a file from SAP's Cloudification Repository on GitHub ([SAP/abap-atc-cr-cv-s4hc](https://github.com/SAP/abap-atc-cr-cv-s4hc), served from raw.githubusercontent.com) each time an agent runs it. The file lists the release state of SAP objects. The script looks up object names in it on your machine and sends no code or object names. To work offline, download the file once and pass `--source <local file>`.",
  },
};

/** Helper scripts in the given skills, with the hosts each one names in an http or https URL. */
function bundledScripts(skills) {
  return skills.flatMap((k) =>
    (k.files ?? [])
      .filter((f) => f.startsWith("scripts/") && !isLocalJunk(f))
      .sort()
      .map((f) => {
        const text = readText(join(k.dir, f));
        const hosts = [...new Set([...text.matchAll(/\bhttps?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()))].sort();
        return { path: `skills/${k.dirName}/${f}`, key: `${k.data.name}/${f}`, hosts };
      }),
  );
}

function scriptNetworkNote(script) {
  const known = SCRIPT_NETWORK_NOTES[script.key];
  if (known && known.hosts.every((h) => script.hosts.includes(h))) return `The helper script \`${script.path}\` ${known.text}`;
  return `The helper script \`${script.path}\` contains URLs for ${joinList(script.hosts, "and")} and can connect to them when an agent runs it.`;
}

/** Readable form of the registry's auth values for the plugin README. */
const AUTH_TEXT = {
  none: "none",
  "user-login": "interactive sign-in",
  "api-credentials": "keys or credentials you supply",
  "system-credentials": "your own credentials for your system",
};

/** "SAP user" stays as it is; "Logon language" becomes "logon language" inside a sentence. */
function lowerLead(text) {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/**
 * README paragraphs for a server published from this repository: where it runs, what it
 * accesses, and how each agent gets its connection details. Claude Code and Gemini CLI prompt
 * for user_config; Agent Plugins hosts and Cursor receive nothing from the plugin, so their
 * users run the setup command once.
 */
function bundledServerNotes(m, plugin) {
  const dir = m.plugin_path.split("/").slice(0, -1).join("/");
  const options = Object.values(m.user_config ?? {});
  const titles = options.map((o) => lowerLead(o.title));
  const secret = options.filter((o) => o.sensitive).map((o) => `the ${lowerLead(o.title)}`);
  const lines = [[`The \`${m.id}\` server is published from this repository (\`${dir}/\`) and runs on your machine.`, m.requirements, m.data_access].filter(Boolean).join(" "), ""];
  const setup = m.setup_args ? `node <plugin folder>/${m.plugin_path} ${m.setup_args.join(" ")}` : null;
  if (options.length) {
    lines.push(`How each agent gets the connection details (${joinList(titles, "and")}):`, "");
    lines.push(`- Claude Code asks for them when you enable the plugin${secret.length ? ` and keeps ${joinList(secret, "and")} in its secure credential store` : ""}.`);
    lines.push(`- Gemini CLI asks for them when the plugin folder is installed as an extension${secret.length ? ` and keeps ${joinList(secret, "and")} in the system keychain` : ""}; \`gemini extensions config ${plugin.source.name}\` changes them later.`);
    if (setup) lines.push(`- GitHub Copilot CLI, OpenAI Codex, Cursor, and other Agent Plugins hosts do not prompt: run \`${setup}\` once. ${m.setup_notes ?? ""}`.trimEnd());
    else lines.push("- GitHub Copilot CLI, OpenAI Codex, Cursor, and other Agent Plugins hosts receive no connection details from the plugin; see the server's documentation.");
  } else if (setup) {
    lines.push(`No agent prompts for this server's configuration: run \`${setup}\` once. ${m.setup_notes ?? ""}`.trimEnd());
  }
  lines.push("", `\`<plugin folder>\` is the folder your agent installed the plugin to; in a clone of this repository it is \`${plugin.relDir}\`.`, "");
  return lines;
}

function pluginReadme(plugin, servers, ctx) {
  const s = plugin.source;
  const order = orderedSkillNames(plugin);
  const skills = plugin.skills.filter((k) => k.data).sort((a, b) => order.indexOf(a.data.name) - order.indexOf(b.data.name));
  const vendorName = ctx.tax.vendorNames[s.vendor] ?? s.vendor;
  const neutral = s.vendor === "vendor-neutral";
  const publisher = (s.author ?? ctx.defaultAuthor).name;
  const lines = [
    `<!-- ${"Generated by scripts/build.mjs from plugin.yaml and SKILL.md files. Do not edit by hand."} -->`,
    `# ${s.display_name}`,
    "",
    s.description.trim(),
    "",
  ];
  if (s.long_description) lines.push(s.long_description.trim(), "");
  // "Works with" names the vendor whose products the skills target; "Publisher" names who
  // publishes the plugin, so the table never reads as if the vendor published it.
  lines.push(mdTable(["Field", "Value"], [
    ["Plugin name", `\`${s.name}\``],
    ["Works with", vendorName],
    ["Publisher", neutral ? `${publisher} (independent)` : `${publisher} (independent; not affiliated with ${vendorName})`],
    ["Category", ctx.tax.categoryNames[s.category] ?? s.category],
    ["Maturity", s.maturity],
    ["Version", s.version],
    ["License", ctx.license],
  ]), "");
  const sapSkills = skills.some((k) => k.data.metadata?.vendor === "sap" && k.data.metadata?.product === "abap");
  if (sapSkills) {
    lines.push("## Skills", "", "Pick the skill that matches your system and development model. Hosting on premises or on Azure, AWS, or Google Cloud VMs does not change which skill applies.", "");
    lines.push(mdTable(["Skill", "Use it for", "SAP systems", "ABAP model", "Prerequisites"], skills.map((k) => {
      const sap = k.data.metadata?.product === "abap" ? sapInfo(k.data.metadata) : null;
      return [
        `[${k.data.name}](skills/${k.dirName}/SKILL.md)`,
        shortDescription(k.data.description),
        sapSystemsText(sap),
        abapModelText(sap),
        String(k.data.compatibility ?? "").replace(/\s+/g, " ").trim(),
      ];
    })), "");
  } else {
    lines.push("## Skills", "", mdTable(["Skill", "Use it for", "Prerequisites"], skills.map((k) => [
      `[${k.data.name}](skills/${k.dirName}/SKILL.md)`,
      shortDescription(k.data.description),
      String(k.data.compatibility ?? "").replace(/\s+/g, " ").trim(),
    ])), "");
  }
  if (plugin.agents.length) {
    lines.push("## Custom agents", "", mdTable(["Agent", "Purpose"], plugin.agents.map((a) => [`[${a.data?.name ?? a.fileName}](agents/${a.fileName})`, String(a.data?.description ?? "").replace(/\s+/g, " ")])), "");
  }
  lines.push("## Install", "", installBlock(ctx, s.name, skills[0]?.data.name ?? "<skill>"), "");
  lines.push("## Data and permissions", "");
  const scripts = bundledScripts(skills);
  const networkNotes = scripts.filter((x) => x.hosts.length).map(scriptNetworkNote);
  if (servers.length) {
    lines.push("This plugin bundles the MCP servers below. They start or connect only in agents that support plugin MCP configuration. Review each server's own documentation for the data it accesses.", "");
    lines.push(mdTable(["Server", "Publisher", "Transport", "Authentication", "Source"], servers.map((m) => [m.name, m.publisher, m.transport, AUTH_TEXT[m.auth] ?? m.auth, m.source])), "");
    for (const m of servers.filter((x) => x.bundled_from_plugin)) lines.push(...bundledServerNotes(m, plugin));
    if (networkNotes.length) lines.push(networkNotes.join(" "), "");
  } else {
    const contents = !scripts.length
      ? "instructions and reference documents"
      : `instructions, reference documents, and ${scripts.length === 1 ? "a helper script" : "helper scripts"}`;
    if (networkNotes.length) {
      lines.push([`This plugin contains ${contents}. It bundles no MCP servers or hooks.`, ...networkNotes, "Any other data access happens through tools you have already connected to your agent."].join(" "), "");
    } else {
      lines.push(`This plugin contains ${contents} only. It bundles no MCP servers or hooks and sends no data anywhere by itself. Any data access happens through tools you have already connected to your agent.`, "");
    }
  }
  lines.push("## Tests", "", `Acceptance criteria and scenarios for each skill live in [tests/scenarios](../../tests/scenarios). Run \`npm run eval:mock -- --skill <name>\` from the repository root.`, "");
  const notAffiliated = neutral ? "any vendor named here" : `${vendorName} or any other vendor named here`;
  lines.push("## Independence and trademarks", "", `This plugin is an independent community project. It is not affiliated with, sponsored by, or endorsed by ${notAffiliated}. Product and company names are trademarks of their owners and are used only to identify the products the skills work with.`, "");
  return lines.join("\n");
}

// ------------------------------------------------------------------ Vally eval spec

function vallySpec(skill, entry) {
  const name = skill.data.name;
  const scenarios = entry.data.scenarios;
  const out = [
    "# Generated by scripts/build.mjs from scenarios.yaml. Do not edit by hand.",
    "# Offline: `npm run eval:vally` runs `vally oracle` (golden patches) and a baseline negative control.",
    "# Live (optional, needs a Copilot token): see docs/testing.md.",
    `name: ${name}-deterministic`,
    `description: Deterministic checks for the ${name} skill, generated from its scenarios.`,
    'version: "1.0"',
    "type: capability",
    "defaults:",
    "  runs: 1",
    "  timeout: 10m",
    "agent_environment:",
    "  skills:",
    `    - ../../../../plugins/${skill.plugin}/skills/${skill.dirName}`,
    "grading_environment:",
    "  files:",
    "    - src: ../../../harness/vally-grade.mjs",
    "      dest: .vally/grade.mjs",
    "stimuli:",
  ];
  for (const sc of scenarios) {
    const split = splitIntoFiles(sc.mock_response);
    let files = [...split.files, ...split.context];
    // The explanation outside code files is part of the answer: the mock evaluation checks it,
    // so the golden patch carries it as answer.md and live agents are asked to write it there.
    const explained = files.length > 0 && split.preamble.length > 0;
    if (explained) files = [{ path: "answer.md", content: `${split.preamble}\n` }, ...files];
    if (!files.length) {
      const fallback = (sc.validators ?? []).map(defaultFileFor).find(Boolean) ?? "response.txt";
      files = [{ path: fallback, content: sc.mock_response.endsWith("\n") ? sc.mock_response : `${sc.mock_response}\n` }];
    }
    out.push(`  - name: ${sc.name.replace(/_/g, "-")}`);
    out.push("    prompt: |-");
    for (const l of sc.prompt.trimEnd().split("\n")) out.push(l ? `      ${l}` : "");
    if (explained) out.push("", "      Write your explanation to answer.md and each code object to its own file.");
    // Vally expects tags as a mapping; scenario tags are kept as one space-separated value.
    out.push("    tags:");
    out.push(`      scenario: ${sc.name}`);
    out.push(`      labels: "${sc.tags.join(" ")}"`);
    out.push("    golden_patch:");
    out.push("      inline: |");
    for (const f of files) {
      const lines = f.content.replace(/\n$/, "").split("\n");
      out.push("        --- /dev/null", `        +++ b/${f.path}`, `        @@ -0,0 +1,${lines.length} @@`);
      for (const l of lines) out.push(`        +${l}`);
    }
    out.push("    graders:");
    out.push("      - type: run-command");
    // Grader names must be unique across the eval file and at most 60 characters.
    out.push(`        name: ${`checks-${sc.name.replace(/_/g, "-")}`.slice(0, 60)}`);
    out.push("        config:");
    out.push("          command: node");
    out.push(`          args: [".vally/grade.mjs", "${name}", "${sc.name}"]`);
    out.push("          timeout: 120s");
  }
  out.push("scoring:", "  threshold: 1.0", "");
  return out.join("\n");
}
