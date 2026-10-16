#!/usr/bin/env node
/**
 * Scaffold a skill and its test folder from templates/.
 *
 *   npm run new:skill -- --plugin sap-abap --name sap-cds-access-control \
 *       --product abap --category security
 *
 * Options:
 *   --plugin <name>     existing plugin folder, or a new one together with --vendor
 *   --name <name>       skill name (kebab-case, unique across the repository)
 *   --product <id>      product id in kebab-case, for example abap, fabric, apex
 *   --category <id>     category id from repo.config.yaml
 *   --vendor <id>       vendor id; required when the plugin does not exist yet
 *
 * Every placeholder is written as {{TODO: ...}}. `npm run validate` fails while any remain.
 */
import { join } from "node:path";
import { REPO_ROOT, PATHS } from "./lib/constants.mjs";
import { exists, readText, writeIfChanged } from "./lib/fsutil.mjs";
import { loadRepository, taxonomy } from "./lib/repo-model.mjs";
import { parseArgs } from "./lib/report.mjs";

const args = parseArgs(process.argv.slice(2));
const model = loadRepository();
const tax = taxonomy(model.config);
const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fail(message) {
  console.error(`new:skill: ${message}`);
  process.exit(1);
}

for (const key of ["plugin", "name", "product", "category"]) {
  if (!args[key] || args[key] === true) fail(`--${key} is required.`);
}
if (!kebab.test(args.name) || args.name.length > 64) fail("--name must be kebab-case, at most 64 characters.");
if (!kebab.test(args.plugin)) fail("--plugin must be kebab-case.");
if (!kebab.test(args.product)) fail("--product must be kebab-case.");
if (!tax.categories.has(args.category)) fail(`Unknown category '${args.category}'. Use one of: ${[...tax.categories].join(", ")}.`);
if (model.skills.some((s) => s.data?.name === args.name)) fail(`A skill named '${args.name}' already exists.`);

const pluginDir = join(REPO_ROOT, PATHS.plugins, args.plugin);
const existingPlugin = model.plugins.find((p) => p.dirName === args.plugin);
const vendor = existingPlugin?.source?.vendor ?? args.vendor;
if (!vendor || vendor === true) fail(`Plugin '${args.plugin}' does not exist; pass --vendor to create it.`);
if (!tax.vendors.has(vendor)) fail(`Unknown vendor '${vendor}'. Add it to repo.config.yaml first.`);

const values = {
  name: args.name,
  plugin: args.plugin,
  vendor,
  product: args.product,
  category: args.category,
  title: args.name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
};
const fill = (template) => readText(join(REPO_ROOT, "templates", template)).replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);

let skillMd = fill("skill/SKILL.md.tmpl");
let scenariosYaml = fill("scenario/scenarios.yaml.tmpl");
// ABAP skills declare the SAP systems they target, and their tests name an SAP environment
// (see docs/sap-environments.md); validation fails without both.
if (vendor === "sap" && args.product === "abap") {
  skillMd = skillMd.replace('  version: "0.1.0"\n', [
    '  version: "0.1.0"',
    '  sap-products: "{{TODO: product ids from config/sap-environments.yaml, for example ecc, netweaver, s4hana}}"',
    '  sap-deployments: "{{TODO: deployment ids, for example on-premise, azure-iaas, aws-iaas, gcp-iaas}}"',
    '  abap-language-version: "{{TODO: standard, cloud, or standard, cloud}}"',
    '  sap-basis-min: "{{TODO: lowest SAP_BASIS release the skill supports, for example 7.00}}"',
    '  abap-env-default: "{{TODO: environment for code blocks, for example product=ecc release=ehp8 database=anydb}}"',
    "",
  ].join("\n"));
  scenariosYaml = scenariosYaml.replace("\nscenarios:\n", [
    "",
    "# SAP target for every scenario unless a scenario sets its own environment.",
    "environment:",
    "  product: \"{{TODO: product id, for example ecc}}\"",
    "  release: \"{{TODO: release id, for example ehp8}}\"",
    "  database: \"{{TODO: hana or anydb}}\"",
    "",
    "scenarios:",
    "",
  ].join("\n"));
}

const writes = [];
if (!existingPlugin) writes.push([join(pluginDir, "plugin.yaml"), fill("plugin/plugin.yaml.tmpl")]);
writes.push([join(pluginDir, "skills", args.name, "SKILL.md"), skillMd]);
writes.push([join(REPO_ROOT, PATHS.scenarios, args.name, "acceptance-criteria.md"), fill("scenario/acceptance-criteria.md.tmpl")]);
writes.push([join(REPO_ROOT, PATHS.scenarios, args.name, "scenarios.yaml"), scenariosYaml]);

for (const [path] of writes) if (exists(path)) fail(`Refusing to overwrite ${path}.`);
for (const [path, content] of writes) {
  writeIfChanged(path, content);
  console.log(`created ${path.slice(REPO_ROOT.length + 1).replace(/\\/g, "/")}`);
}
console.log("\nNext: replace every {{TODO: ...}}, then run npm run build, npm run check, and npm run eval:vally.");
