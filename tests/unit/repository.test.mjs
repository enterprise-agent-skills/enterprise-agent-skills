import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRepository } from "../../scripts/lib/repo-model.mjs";
import { generateAll, replaceRegion, shortDescription } from "../../scripts/lib/generate.mjs";
import { validateSchema } from "../../scripts/lib/schema.mjs";
import { AGENT_PLUGINS_PLUGIN_SCHEMA, GENERATED_BEGIN, GENERATED_END } from "../../scripts/lib/constants.mjs";
import { parse as parseYaml } from "yaml";

const model = loadRepository();
const generated = generateAll(model);

test("repository loads without parse errors", () => {
  assert.deepEqual(model.loadErrors, []);
  assert.ok(model.plugins.length >= 1);
});

test("every published skill has acceptance criteria and scenarios", () => {
  for (const skill of model.skills) {
    const entry = model.scenarios[skill.data.name];
    assert.ok(entry, `missing tests/scenarios/${skill.data.name}`);
    assert.ok(entry.criteriaText, `missing acceptance criteria for ${skill.data.name}`);
    assert.ok(entry.data?.scenarios?.length, `missing scenarios for ${skill.data.name}`);
  }
});

test("each plugin gets an Agent Plugins manifest that passes the vendored schema", () => {
  for (const plugin of model.plugins) {
    const manifest = JSON.parse(generated.get(`${plugin.relDir}/plugin.json`));
    assert.deepEqual(validateSchema(AGENT_PLUGINS_PLUGIN_SCHEMA, manifest), []);
    assert.equal(manifest.name, plugin.dirName);
  }
});

test("the schema check rejects an invalid manifest (negative control)", () => {
  const errors = validateSchema(AGENT_PLUGINS_PLUGIN_SCHEMA, { $schema: AGENT_PLUGINS_PLUGIN_SCHEMA, name: "Bad Name", skills: "./skills/" });
  assert.ok(errors.length >= 2, errors.join("; "));
});

test("marketplaces list every plugin with a source inside plugins/", () => {
  const claude = JSON.parse(generated.get(".claude-plugin/marketplace.json"));
  const copilot = JSON.parse(generated.get(".github/plugin/marketplace.json"));
  const codex = JSON.parse(generated.get(".agents/plugins/marketplace.json"));
  const names = model.plugins.map((p) => p.dirName).sort();
  assert.deepEqual(claude.plugins.map((p) => p.name).sort(), names);
  assert.deepEqual(copilot.plugins.map((p) => p.name).sort(), names);
  assert.deepEqual(codex.plugins.map((p) => p.name).sort(), names);
  for (const p of claude.plugins) assert.match(p.source, /^\.\/plugins\//);
});

test("generated Vally specs carry one golden patch and one uniquely named grader per scenario", () => {
  for (const [path, content] of generated) {
    if (!path.endsWith("vally/eval.yaml")) continue;
    const spec = parseYaml(content);
    const graderNames = spec.stimuli.flatMap((s) => s.graders.map((g) => g.name));
    assert.equal(new Set(graderNames).size, graderNames.length, path);
    for (const s of spec.stimuli) {
      assert.match(s.golden_patch.inline, /^--- \/dev\/null\n\+\+\+ b\//, `${path} ${s.name}`);
      assert.equal(typeof s.tags, "object");
    }
  }
});

test("README region replacement keeps hand-written text", () => {
  const text = `before\n${GENERATED_BEGIN("x")}\nold\n${GENERATED_END("x")}\nafter\n`;
  const out = replaceRegion(text, "x", "new");
  assert.match(out, /^before\n/);
  assert.match(out, /\nnew\n/);
  assert.match(out, /after\n$/);
  assert.ok(!out.includes("old"));
});

test("short descriptions stop before the trigger list", () => {
  assert.equal(shortDescription("Builds things. USE FOR: a, b. DO NOT USE FOR: c."), "Builds things.");
});
