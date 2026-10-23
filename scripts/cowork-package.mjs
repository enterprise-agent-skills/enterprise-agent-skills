#!/usr/bin/env node
/**
 * Build a Microsoft 365 Copilot Cowork plugin package: one plugin's skills plus a connector to
 * the sap-system MCP server that the user's organization hosts. docs/copilot-cowork.md is the
 * setup guide.
 *
 *   npm run package:cowork -- --mcp-url https://<host>/mcp --auth OAuthPluginVault --auth-config-id <id>
 *   npm run package:cowork -- --mcp-url https://<host>/mcp/<secret> --auth None        (demo mode)
 *
 * Options:
 *   --plugin <name>        plugin folder under plugins/ (default sap-abap)
 *   --out <dir>            output folder (default dist/copilot-cowork); a relative path is resolved
 *                          against the folder npm was started from
 *   --version x.y.z        manifest version (default: the plugin version in plugin.yaml)
 *   --app-id <guid>        manifest id (default: a UUID v5 of the plugin name, the same on every
 *                          build; pass another GUID for a second package of the same plugin in one
 *                          tenant, for example a demo build next to a production build)
 *   --name <short name>    name shown in Cowork, up to 30 characters (default: the plugin name)
 *   --tools                include the server's tool list (see TOOLS_FILE below); off by
 *                          default, because Cowork does not use it and its upload validator
 *                          rejected a package that declared it (2026-10-22)
 *
 * The package is a ZIP with manifest.json (Microsoft 365 app manifest 1.29), color.png,
 * outline.png, and one skills/<name>/ folder per skill, each with LICENSE.txt: the layout the
 * Cowork documentation gives for a hand-assembled package. The manifest is checked against the
 * vendored schema in schemas/vendor/microsoft-365/ and against the upload rules the documentation
 * lists (companion file limits, safe file names, referenceId only with OAuthPluginVault) before
 * the ZIP is written. The icons are drawn here, so the build needs no image files, and the ZIP
 * writer is deterministic: the same inputs give the same bytes.
 *
 * Sources (checked 2026-10-22): learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development
 * (package layout, icon sizes, validation rules, companion file limits, auth types) and the
 * schema itself (field limits).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { REPO_ROOT, PATHS } from "./lib/constants.mjs";
import { isLocalJunk, readText, rel, stableJson, walkFiles } from "./lib/fsutil.mjs";
import { createImage, encodePng, fillRoundedRect } from "./lib/png.mjs";
import { loadRepository, repoUrls } from "./lib/repo-model.mjs";
import { parseArgs } from "./lib/report.mjs";
import { createZip } from "./lib/zip.mjs";
import { resolveOutDir } from "./package.mjs";

export const MANIFEST_VERSION = "1.29";
export const MANIFEST_SCHEMA_URL = `https://developer.microsoft.com/json-schemas/teams/v${MANIFEST_VERSION}/MicrosoftTeams.schema.json`;
const VENDORED_SCHEMA = join(REPO_ROOT, PATHS.schemas, "vendor", "microsoft-365", `app-manifest-v${MANIFEST_VERSION}.json`);

/**
 * Namespace for the manifest id, a UUID v5 of the plugin name. Cowork identifies a plugin by its
 * id across versions, so this value must never change once a package has been uploaded.
 */
export const COWORK_APP_ID_NAMESPACE = "64037d54-083e-4536-a66e-fa10de075ad9";

/** Authorization types this script accepts; the server supports no other (see the guide). */
export const AUTH_TYPES = ["OAuthPluginVault", "None"];
export const CONNECTOR_ID = "sap-system";

/**
 * The template package attached to every release: the same package with placeholders for the
 * two values that are specific to an organization, so an administrator without Node.js can
 * unzip it, replace the two values in manifest.json, and zip it again.
 */
export const TEMPLATE_MCP_URL = "https://sap-mcp.example.com/mcp";
export const TEMPLATE_AUTH_CONFIG_ID = "REPLACE-WITH-YOUR-AUTH-CONFIG-ID";
export const TEMPLATE_FILE_NAME = "plugin-sap-abap-cowork-template.zip";
/**
 * The server's tool list in the tools/list format, included and referenced from the manifest
 * only with --tools. Cowork discovers tools from the server and does not read this file, and
 * its upload validator rejected a package that declared it (2026-10-22); other Microsoft 365
 * hosts treat it as a pinned tool list.
 */
export const TOOLS_FILE = "tools/sap-system-tools.json";
export const ACCENT_COLOR = "#2E5C8A";
const LAUNCHER = ["mcp", "sap-system", "launch.mjs"];

// Limits from the Cowork plugin documentation (validation rules and companion file limits).
const MAX_SKILLS = 20;
const MAX_COMPANION_FILES = 20;
const MAX_COMPANION_FILE_BYTES = 5 * 1024 * 1024;
const MAX_COMPANION_TOTAL_BYTES = 10 * 1024 * 1024;
const SAFE_SEGMENT = /^[A-Za-z0-9._ !-]+$/;
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GUID = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/** UUID version 5 (RFC 4122, SHA-1) of `name` in `namespace`. */
export function uuidV5(namespace, name) {
  if (!GUID.test(namespace)) throw new Error(`Not a UUID: ${namespace}`);
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const bytes = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The manifest id of a plugin's package: stable across builds and versions. */
export function coworkAppId(pluginName) {
  return uuidV5(COWORK_APP_ID_NAMESPACE, pluginName);
}

/**
 * Problems with one skill folder's files, as readable strings, against the rules the Cowork
 * documentation lists for companion files. `files` is [{ path, size }] with paths relative to the
 * skill folder, forward slashes, SKILL.md included.
 */
export function checkSkillPackageFiles(skillName, files) {
  const errors = [];
  const where = `skill ${skillName}`;
  if (!files.some((f) => f.path === "SKILL.md")) errors.push(`${where}: SKILL.md is missing.`);
  const companions = files.filter((f) => f.path !== "SKILL.md");
  if (companions.length > MAX_COMPANION_FILES) errors.push(`${where}: ${companions.length} companion files; Cowork allows ${MAX_COMPANION_FILES} per skill besides SKILL.md.`);
  const total = companions.reduce((n, f) => n + f.size, 0);
  if (total > MAX_COMPANION_TOTAL_BYTES) errors.push(`${where}: companion files total ${total} bytes; the limit is ${MAX_COMPANION_TOTAL_BYTES} per skill.`);
  for (const f of companions) {
    if (f.size > MAX_COMPANION_FILE_BYTES) errors.push(`${where}: ${f.path} is ${f.size} bytes; the limit is ${MAX_COMPANION_FILE_BYTES} per file.`);
  }
  for (const f of files) {
    if (f.path.startsWith("/") || /\\|\0/.test(f.path)) errors.push(`${where}: ${JSON.stringify(f.path)} must be a relative path without backslashes or null bytes.`);
    for (const segment of f.path.split("/")) {
      if (segment === "..") errors.push(`${where}: ${f.path} contains a parent folder segment.`);
      else if (segment.startsWith(".")) errors.push(`${where}: ${f.path} is hidden (a name starting with a dot); Cowork rejects hidden files.`);
      else if (!SAFE_SEGMENT.test(segment)) errors.push(`${where}: ${f.path} uses characters outside letters, digits, hyphens, underscores, dots, spaces, and "!".`);
      else if (RESERVED_NAME.test(segment)) errors.push(`${where}: ${f.path} uses a Windows reserved name.`);
    }
  }
  return errors;
}

let manifestValidator = null;

/**
 * Validate a manifest against the vendored Microsoft 365 app manifest schema plus the connector
 * rules the schema leaves to the upload service. Returns readable error strings.
 */
export function validateCoworkManifest(manifest) {
  if (!manifestValidator) {
    const schema = JSON.parse(readText(VENDORED_SCHEMA));
    // The schema declares draft-04. Ajv's draft-07 validator accepts its keywords once the
    // declaration is removed (it uses no boolean exclusiveMinimum/exclusiveMaximum and no id).
    delete schema.$schema;
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    manifestValidator = ajv.compile(schema);
  }
  const errors = [];
  if (!manifestValidator(manifest)) {
    for (const e of manifestValidator.errors) {
      if (e.keyword === "if") continue; // the then/required error already explains it
      const extra = e.params?.additionalProperty ? ` '${e.params.additionalProperty}'` : "";
      errors.push(`manifest${e.instancePath || ""} ${e.message}${extra}`);
    }
  }
  const connectors = manifest.agentConnectors ?? [];
  const ids = new Set();
  connectors.forEach((c, i) => {
    if (ids.has(c.id)) errors.push(`manifest/agentConnectors/${i}: duplicate connector id ${c.id}.`);
    ids.add(c.id);
    const auth = c.toolSource?.remoteMcpServer?.authorization;
    if (auth?.type === "None" && "referenceId" in auth) errors.push(`manifest/agentConnectors/${i}: referenceId must not be present when the authorization type is None.`);
  });
  const folders = (manifest.agentSkills ?? []).map((s) => s.folder);
  if (new Set(folders).size !== folders.length) errors.push("manifest/agentSkills: duplicate folder values.");
  return errors;
}

/** Draw the two icons the manifest needs from the accent color. Returns PNG buffers. */
export function renderIcons(accentColor = ACCENT_COLOR) {
  const m = accentColor.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!m) throw new Error(`Accent color must be #RRGGBB, got ${accentColor}.`);
  const accent = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 255];
  const white = [255, 255, 255, 255];
  // 192 x 192 full-color icon: a rounded square in the accent color with three white bars, the
  // rows of a table. 32 x 32 outline icon: the same bars in white on a transparent background,
  // as the schema asks ("transparent PNG outline icon. The border color needs to be white").
  const color = createImage(192, 192);
  fillRoundedRect(color, { x: 0, y: 0, width: 192, height: 192, radius: 40, color: accent });
  for (const y of [54, 87, 120]) fillRoundedRect(color, { x: 48, y, width: 96, height: 18, radius: 9, color: white });
  const outline = createImage(32, 32);
  for (const y of [8, 14, 20]) fillRoundedRect(outline, { x: 7, y, width: 18, height: 4, radius: 2, color: white });
  return { color: encodePng(color), outline: encodePng(outline) };
}

/**
 * Run the server launcher's print-tools command and return { tools, reason }: `tools` in the
 * tools/list format, or null with the reason the list is not available (no Python, missing
 * packages, no server file). Anything the launcher prints on stderr stays out of the build log.
 */
export function runPrintTools(launcher) {
  if (!existsSync(launcher)) return { tools: null, reason: `${rel(launcher)} not found` };
  const r = spawnSync(process.execPath, [launcher, "print-tools"], { encoding: "utf8", timeout: 60_000, windowsHide: true });
  if (r.error) return { tools: null, reason: r.error.message };
  if (r.status !== 0) return { tools: null, reason: `print-tools exited with status ${r.status}${summarizeStderr(r.stderr)}` };
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    return { tools: null, reason: "print-tools output is not JSON" };
  }
  return normalizeTools(parsed);
}

/** The launcher's own message when it printed one, else the last line (a Python exception). */
function summarizeStderr(text) {
  const lines = String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => l.startsWith("sap-system:")) ?? lines[lines.length - 1];
  return line ? `: ${line}` : "";
}

/** Accept a tools/list result or a bare array; keep each tool object as the server sent it. */
export function normalizeTools(parsed) {
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tools) ? parsed.tools : null;
  if (!list || !list.length) return { tools: null, reason: "print-tools returned no tools" };
  for (const t of list) {
    if (!t || typeof t.name !== "string" || typeof t.description !== "string" || !t.inputSchema || typeof t.inputSchema !== "object") {
      return { tools: null, reason: "a tool lacks name, description, or inputSchema" };
    }
  }
  return { tools: { tools: list }, reason: null };
}

function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${name}.`);
  return value.trim();
}

function checkMcpUrl(value) {
  const text = requireString(value, "--mcp-url");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`--mcp-url is not a valid URL: ${text}`);
  }
  if (url.protocol !== "https:") throw new Error("--mcp-url must start with https://; Cowork connects to remote MCP servers over HTTPS only.");
  if (!url.hostname) throw new Error("--mcp-url has no host name.");
  if (url.username || url.password) throw new Error("--mcp-url must not contain credentials.");
  if (/\s/.test(text)) throw new Error("--mcp-url must not contain whitespace.");
  if (text.length > 2048) throw new Error("--mcp-url is longer than 2048 characters.");
  return text;
}

/**
 * Build the package. Returns { zipPath, manifest, entries, sha256, tools }. `printTools` is the
 * function that fetches the server's tool list, replaceable in tests.
 */
export function buildCoworkPackage({
  plugin = "sap-abap",
  mcpUrl,
  auth,
  authConfigId,
  outDir = join(REPO_ROOT, "dist", "copilot-cowork"),
  version,
  appId,
  shortName,
  includeTools = false,
  printTools = runPrintTools,
  fileName,
} = {}) {
  const url = checkMcpUrl(mcpUrl);
  const authType = requireString(auth, "--auth");
  if (!AUTH_TYPES.includes(authType)) {
    throw new Error(`--auth must be one of ${AUTH_TYPES.join(", ")}; got ${authType}. The sap-system server supports Microsoft Entra ID sign-in (OAuthPluginVault) and the demo mode without sign-in (None).`);
  }
  let referenceId = null;
  if (authType === "OAuthPluginVault") {
    referenceId = requireString(authConfigId, "--auth-config-id (the auth config ID from the Teams developer portal, required with --auth OAuthPluginVault)");
    if (referenceId.length > 128) throw new Error("--auth-config-id is longer than 128 characters.");
  } else if (authConfigId !== undefined && authConfigId !== null && authConfigId !== "") {
    throw new Error("--auth-config-id must be left out with --auth None; Cowork rejects a referenceId when the authorization type is None.");
  }

  const model = loadRepository();
  const p = model.plugins.find((x) => x.source?.name === plugin || x.dirName === plugin);
  if (!p || !p.source) throw new Error(`Plugin ${plugin} not found under ${PATHS.plugins}/ (or its plugin.yaml does not load).`);
  const pluginErrors = model.loadErrors.filter((e) => e.file.startsWith(`${p.relDir}/`));
  if (pluginErrors.length) throw new Error(`Plugin ${plugin} has load errors: ${pluginErrors.map((e) => `${e.file}: ${e.message}`).join("; ")}`);
  const source = p.source;
  const urls = repoUrls(model.config);

  const manifestVersion = String(version ?? source.version ?? "").replace(/^v/, "");
  if (!SEMVER.test(manifestVersion)) throw new Error(`The version must be MAJOR.MINOR.PATCH, got ${JSON.stringify(manifestVersion)}; pass --version.`);
  const id = appId ? String(appId).trim() : coworkAppId(source.name);
  if (!GUID.test(id)) throw new Error(`--app-id must be a GUID, got ${id}.`);

  // Skills in the plugin's display order, each checked against the upload rules.
  const order = source.skill_order ?? [];
  const skillRank = (name) => (order.includes(name) ? order.indexOf(name) : order.length);
  const skills = [...p.skills].sort((a, b) => skillRank(a.dirName) - skillRank(b.dirName) || a.dirName.localeCompare(b.dirName));
  if (!skills.length) throw new Error(`Plugin ${plugin} has no skills.`);
  if (skills.length > MAX_SKILLS) throw new Error(`Plugin ${plugin} has ${skills.length} skills; Cowork allows ${MAX_SKILLS} per package.`);
  const license = readFileSync(join(REPO_ROOT, "LICENSE"));
  const entries = [];
  const problems = [];
  for (const s of skills) {
    if (!s.data) {
      problems.push(`${s.file}: ${s.error ?? "frontmatter does not parse"}.`);
      continue;
    }
    if (s.data.name !== s.dirName) problems.push(`${s.file}: name ${JSON.stringify(s.data.name)} must equal the folder name ${s.dirName}.`);
    if (!KEBAB.test(s.dirName)) problems.push(`${s.file}: the folder name must be kebab-case.`);
    if (typeof s.data.description !== "string" || !s.data.description.trim()) problems.push(`${s.file}: description is missing.`);
    const files = walkFiles(s.dir)
      .map((f) => relative(s.dir, f).split(sep).join("/"))
      .filter((f) => !isLocalJunk(f))
      .map((path) => ({ path, size: statSync(join(s.dir, path)).size }));
    if (files.some((f) => f.path.toLowerCase() === "license.txt")) {
      problems.push(`${s.relDir}/LICENSE.txt already exists; packaging would replace it. Decide which license applies first.`);
    }
    const packaged = [...files, { path: "LICENSE.txt", size: license.length }];
    problems.push(...checkSkillPackageFiles(s.dirName, packaged));
    for (const f of files) entries.push({ path: `skills/${s.dirName}/${f.path}`, data: readFileSync(join(s.dir, f.path)) });
    entries.push({ path: `skills/${s.dirName}/LICENSE.txt`, data: license });
  }
  if (problems.length) throw new Error(`The skills do not meet the Cowork package rules:\n  ${problems.join("\n  ")}`);

  // The server's tool list, when the server can run on this machine.
  let tools = { included: false, reason: "left out (pass --tools to include it)", names: [] };
  if (includeTools) {
    const r = printTools(join(p.dir, ...LAUNCHER));
    if (r.tools) {
      entries.push({ path: TOOLS_FILE, data: stableJson(r.tools) });
      tools = { included: true, reason: null, names: r.tools.tools.map((t) => t.name) };
    } else {
      tools = { included: false, reason: r.reason ?? "unavailable", names: [] };
    }
  }

  const developerName = model.config?.repository?.marketplace_display_name ?? urls.name;
  const guide = urls.blob("docs/copilot-cowork.md");
  const short = (shortName ?? source.name).trim();
  const descriptionShort = source.display_name ?? source.description;
  const connectorDescription = [
    "Read-only access to the SAP ABAP system (SAP ECC, SAP S/4HANA, or the ABAP Platform trial) behind the sap-system MCP server that your organization hosts.",
    "In the default focused mode the tools are sap_connection_info, sap_system_info, sap_search_objects, sap_describe_table, sap_read_table, sap_read_source, sap_list_package, sap_odata_list_services, sap_odata_metadata, and sap_odata_query.",
    "The server sends requests only to the SAP system it is configured for and blocks every request that could change it.",
  ].join(" ");
  const descriptionFull = [
    source.description,
    source.long_description,
    `This package also contains the ${CONNECTOR_ID} connector. ${connectorDescription}`,
    `Independent community project under the MIT License; not affiliated with SAP or Microsoft. Setup guide, privacy, and terms: ${guide}`,
  ].filter(Boolean).map((t) => String(t).trim()).join("\n\n");
  const remoteMcpServer = { mcpServerUrl: url };
  // Without the "./" prefix: Cowork's validator reported "./tools/... not found" for a file
  // that was in the ZIP, so the plain ZIP entry path is used.
  if (tools.included) remoteMcpServer.mcpToolDescription = { file: TOOLS_FILE };
  remoteMcpServer.authorization = referenceId ? { type: authType, referenceId } : { type: authType };
  const manifest = {
    $schema: MANIFEST_SCHEMA_URL,
    manifestVersion: MANIFEST_VERSION,
    version: manifestVersion,
    id,
    developer: { name: developerName, websiteUrl: urls.repo, privacyUrl: `${guide}#privacy`, termsOfUseUrl: `${guide}#terms-of-use` },
    name: { short, full: source.display_name ?? short },
    description: { short: descriptionShort, full: descriptionFull },
    icons: { color: "color.png", outline: "outline.png" },
    accentColor: ACCENT_COLOR,
    agentSkills: skills.map((s) => ({ folder: `./skills/${s.dirName}` })),
    agentConnectors: [{ id: CONNECTOR_ID, displayName: "SAP system (read-only)", description: connectorDescription, toolSource: { remoteMcpServer } }],
  };
  const manifestErrors = validateCoworkManifest(manifest);
  if (manifestErrors.length) throw new Error(`The manifest does not pass the Microsoft 365 app manifest ${MANIFEST_VERSION} schema:\n  ${manifestErrors.join("\n  ")}`);

  const icons = renderIcons(ACCENT_COLOR);
  entries.push({ path: "manifest.json", data: stableJson(manifest) }, { path: "color.png", data: icons.color }, { path: "outline.png", data: icons.outline });
  const zip = createZip(entries);
  mkdirSync(outDir, { recursive: true });
  const zipPath = join(outDir, fileName || `${source.name}-cowork-plugin.zip`);
  writeFileSync(zipPath, zip);
  return { zipPath, manifest, entries: entries.map((e) => e.path).sort(), sha256: createHash("sha256").update(zip).digest("hex"), size: zip.length, tools };
}

/** The template package for releases: placeholders instead of an organization's values. */
export function buildCoworkTemplate({ outDir = join(REPO_ROOT, "dist", "copilot-cowork") } = {}) {
  return buildCoworkPackage({
    plugin: "sap-abap",
    mcpUrl: TEMPLATE_MCP_URL,
    auth: "OAuthPluginVault",
    authConfigId: TEMPLATE_AUTH_CONFIG_ID,
    outDir,
    includeTools: false,
    fileName: TEMPLATE_FILE_NAME,
  });
}

const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const str = (v) => (typeof v === "string" ? v : undefined);
  if (args.help || args.h) {
    console.log("Usage: node scripts/cowork-package.mjs --mcp-url https://<host>/mcp --auth OAuthPluginVault --auth-config-id <id> [--out <dir>] [--plugin <name>] [--version x.y.z] [--app-id <guid>] [--name <short name>] [--tools]\n       node scripts/cowork-package.mjs --mcp-url https://<host>/mcp/<secret> --auth None [...]   (demo mode)\nSee docs/copilot-cowork.md.");
    process.exit(0);
  }
  try {
    const result = buildCoworkPackage({
      plugin: str(args.plugin),
      mcpUrl: str(args["mcp-url"]),
      auth: str(args.auth),
      authConfigId: str(args["auth-config-id"]),
      outDir: str(args.out) ? resolveOutDir(args.out) : undefined,
      version: str(args.version),
      appId: str(args["app-id"]),
      shortName: str(args.name),
      includeTools: Boolean(args.tools),
    });
    const c = result.manifest.agentConnectors[0].toolSource.remoteMcpServer;
    const shown = c.authorization.type === "None" ? `${new URL(c.mcpServerUrl).origin}/<secret path not shown>` : c.mcpServerUrl;
    const kb = Math.max(1, Math.round(result.size / 1024));
    const shownPath = relative(process.cwd(), result.zipPath).startsWith("..") ? result.zipPath : relative(process.cwd(), result.zipPath);
    console.log(`cowork-package: wrote ${shownPath} (${kb} KB, ${result.entries.length} files, sha256 ${result.sha256.slice(0, 12)}...)`);
    console.log(`  manifest  id ${result.manifest.id}, version ${result.manifest.version}, name ${JSON.stringify(result.manifest.name.short)}`);
    console.log(`  connector ${CONNECTOR_ID} -> ${shown} (${c.authorization.type}${c.authorization.referenceId ? ", auth config id set" : ""})`);
    console.log(`  skills    ${result.manifest.agentSkills.map((s) => s.folder.replace("./skills/", "")).join(", ")}`);
    console.log(`  tools     ${result.tools.included ? `${TOOLS_FILE} (${result.tools.names.length}: ${result.tools.names.join(", ")})` : `not included (${result.tools.reason})`}`);
    console.log("Next: upload the ZIP in Cowork under Customize > Plugins > Upload plugin. See docs/copilot-cowork.md.");
  } catch (err) {
    console.error(`cowork-package: ${err.message}`);
    process.exit(1);
  }
}
