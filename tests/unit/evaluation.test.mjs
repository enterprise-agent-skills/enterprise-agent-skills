import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateResponse } from "../harness/evaluate.mjs";
import { evaluateSkill } from "../harness/mock-eval.mjs";
import { validateSchema } from "../../scripts/lib/schema.mjs";

const scenario = {
  name: "demo",
  prompt: "Write an Apex class that greets",
  expected_patterns: ["class Greeter", "with sharing"],
  forbidden_patterns: ["without sharing"],
  tags: ["basic"],
  validators: ["apex"],
  mock_response: "// file: Greeter.cls\npublic with sharing class Greeter { public String hi() { return 'hi'; } }\n",
  negative_responses: [
    { name: "no_sharing", reason: "Ignores sharing rules entirely.", caught_by: "forbidden_pattern", response: "// file: Greeter.cls\npublic without sharing class Greeter {}\n" },
  ],
};

const criteria = [
  "# demo Acceptance Criteria",
  "## 1. Sharing",
  "### 1.1 Correct: with sharing",
  "```apex",
  "// file: Greeter.cls",
  "public with sharing class Greeter {}",
  "```",
  "### 1.2 Incorrect: without sharing",
  "```apex",
  "public without sharing class Greeter {}",
  "```",
].join("\n");

test("evaluate: a correct answer passes and records validator results", async () => {
  const r = await evaluateResponse(scenario, { text: scenario.mock_response }, { strictValidators: true });
  assert.equal(r.passed, true, r.failures.join("; "));
  assert.deepEqual(r.validatorResults.map((v) => v.status), ["passed"]);
});

test("evaluate: classifies failures by kind", async () => {
  const forbidden = await evaluateResponse(scenario, { text: "// file: Greeter.cls\npublic without sharing class Greeter {}\n" });
  assert.ok(forbidden.failureKinds.includes("forbidden_pattern"));
  const syntax = await evaluateResponse(scenario, { text: "// file: Greeter.cls\npublic with sharing class Greeter { void m() { x = 1 } }\n" });
  assert.ok(syntax.failureKinds.includes("validator"));
});

test("evaluate: a required validator that never ran is a failure", async () => {
  const r = await evaluateResponse(scenario, { text: "public with sharing class Greeter {} as plain prose" });
  assert.equal(r.passed, false);
  assert.ok(r.failures.some((f) => /did not run|failed on/.test(f)));
});

test("mock eval: a well-formed skill passes every check", async () => {
  const r = await evaluateSkill({ skill: "demo", maturity: "beta", scenarioEntry: { data: { scenarios: [scenario] }, criteriaText: criteria }, strictValidators: true });
  assert.equal(r.passed, true, JSON.stringify(r.errors));
  assert.equal(r.criteria.detected, 1);
});

test("mock eval: a negative answer that passes is reported", async () => {
  const leaky = { ...scenario, forbidden_patterns: [] };
  const r = await evaluateSkill({ skill: "demo", maturity: "beta", scenarioEntry: { data: { scenarios: [leaky] }, criteriaText: criteria }, strictValidators: true });
  assert.equal(r.passed, false);
  const neg = r.scenarios[0].checks.find((c) => c.id === "negative:no_sharing");
  assert.equal(neg.passed, false);
});

test("mock eval: a negative caught for the wrong reason is reported", async () => {
  const wrongReason = {
    ...scenario,
    negative_responses: [{ name: "missing_greeter", reason: "Wrong class entirely.", caught_by: "forbidden_pattern", response: "// file: Other.cls\npublic with sharing class Other {}\n" }],
  };
  const r = await evaluateSkill({ skill: "demo", maturity: "beta", scenarioEntry: { data: { scenarios: [wrongReason] }, criteriaText: criteria }, strictValidators: true });
  const neg = r.scenarios[0].checks.find((c) => c.id === "negative:missing_greeter");
  assert.equal(neg.passed, false);
  assert.match(neg.details[0], /not by a forbidden_pattern check/);
});

test("mock eval: trivial expected patterns fail the empty-answer control", async () => {
  const trivial = { ...scenario, expected_patterns: [".*"] };
  const r = await evaluateSkill({ skill: "demo", maturity: "beta", scenarioEntry: { data: { scenarios: [trivial] }, criteriaText: criteria }, strictValidators: true });
  const control = r.scenarios[0].checks.find((c) => c.id === "empty-control");
  assert.equal(control.passed, false);
});

test("mock eval: an Incorrect criteria example no test catches is an error", async () => {
  const uncovered = { ...scenario, forbidden_patterns: ["something else"], negative_responses: [] };
  const r = await evaluateSkill({ skill: "demo", maturity: "beta", scenarioEntry: { data: { scenarios: [uncovered] }, criteriaText: criteria }, strictValidators: true });
  assert.equal(r.passed, false);
  assert.ok(r.errors.some((e) => /not caught by any forbidden pattern/.test(e)));
  assert.ok(r.errors.some((e) => /negative_responses/.test(e)));
});

// Pattern failures only: these ABAP answers run without an SAP environment, so abaplint reports
// a validator failure that is not the point of the tests.
const patternFailures = (r) => r.failures.filter((f) => /^(Expected|Forbidden) pattern/.test(f));

test("evaluate: an ABAP comment neither satisfies an expected pattern nor triggers a forbidden one", async () => {
  const sc = {
    name: "aggregate",
    prompt: "Total the net value per sales organization on any database",
    expected_patterns: ["(?i)SUM\\(", "(?i)GROUP\\s+BY"],
    forbidden_patterns: ["(?i)\\bCOLLECT\\b"],
    tags: ["basic"],
    mock_response: "x",
  };
  // The wrong approach (COLLECT), dressed up with a comment that names the right one.
  const wrong = "* file: src/zfa_totals.prog.abap\nREPORT zfa_totals.\n* We do not use SUM( ) with GROUP BY here; COLLECT is simpler.\nLOOP AT lt_vbak INTO DATA(ls_vbak).\n  COLLECT ls_vbak INTO lt_sum.\nENDLOOP.\n";
  assert.deepEqual(patternFailures(await evaluateResponse(sc, { text: wrong })), [
    "Forbidden pattern present: (?i)\\bCOLLECT\\b",
    "Expected pattern not found: (?i)SUM\\(",
    "Expected pattern not found: (?i)GROUP\\s+BY",
  ]);
  // The right approach with a warning comment that names the wrong one.
  const right = "* file: src/zfa_totals.prog.abap\nREPORT zfa_totals.\n\" COLLECT would read every row first.\nSELECT vkorg, SUM( netwr ) AS netwr FROM vbak GROUP BY vkorg INTO TABLE @DATA(lt_sum). \" no COLLECT\n";
  assert.deepEqual(patternFailures(await evaluateResponse(sc, { text: right })), []);
});

test("evaluate: literals and the explanation still count for patterns", async () => {
  const sc = { name: "fm", prompt: "Call the order creation function module", expected_patterns: ["CALL\\s+FUNCTION\\s+'Z_FA_ORDER_CREATE'", "commit"], forbidden_patterns: [], tags: ["basic"], mock_response: "x" };
  const answer = "The caller must commit afterwards.\n* file: src/zfa_call.prog.abap\nREPORT zfa_call.\nCALL FUNCTION 'Z_FA_ORDER_CREATE'. \" create the order\n";
  assert.deepEqual(patternFailures(await evaluateResponse(sc, { text: answer })), []);
});

test("evaluate: workspace files from the Vally grader are matched without comments too", async () => {
  const sc = { name: "ws", prompt: "Write a JavaScript loader module", expected_patterns: ["export\\s+function\\s+load"], forbidden_patterns: ["eval\\("], tags: ["basic"], mock_response: "x" };
  const files = [
    { path: "answer.md", content: "Never use eval( ) on input.\n" },
    { path: "src/load.mjs", content: "// eval( ) is never needed here\nexport function load(x) { return JSON.parse(x); }\n" },
  ];
  const r = await evaluateResponse(sc, { files }, { strictValidators: true });
  // The explanation in answer.md is prose, so it is matched as written and trips the pattern.
  assert.deepEqual(r.failures, ["Forbidden pattern present: eval\\("]);
  const quiet = await evaluateResponse(sc, { files: [files[1]] }, { strictValidators: true });
  assert.equal(quiet.passed, true, quiet.failures.join("; "));
});

test("mock eval: every scenario of a beta skill needs its own negative response", async () => {
  const second = { ...scenario, name: "demo_two", negative_responses: [] };
  const r = await evaluateSkill({ skill: "demo", maturity: "beta", scenarioEntry: { data: { scenarios: [scenario, second] }, criteriaText: criteria }, strictValidators: true });
  assert.equal(r.passed, false);
  const check = r.scenarios.find((s) => s.name === "demo_two").checks.find((c) => c.id === "negative-present");
  assert.equal(check?.passed, false);
  assert.equal(r.scenarios.find((s) => s.name === "demo").checks.some((c) => c.id === "negative-present"), false);
  const experimental = await evaluateSkill({ skill: "demo", maturity: "experimental", scenarioEntry: { data: { scenarios: [scenario, second] }, criteriaText: criteria }, strictValidators: true });
  assert.equal(experimental.scenarios.find((s) => s.name === "demo_two").checks.some((c) => c.id === "negative-present"), false);
});

test("mock eval: a forbidden pattern that nothing triggers is reported as a warning", async () => {
  const untested = { ...scenario, forbidden_patterns: ["without sharing", "Database\\.query\\("] };
  const r = await evaluateSkill({ skill: "demo", maturity: "beta", scenarioEntry: { data: { scenarios: [untested] }, criteriaText: criteria }, strictValidators: true });
  assert.equal(r.passed, true, JSON.stringify(r.errors));
  assert.ok(r.warnings.some((w) => w.includes("forbidden pattern 'Database\\.query\\(' is never triggered")), r.warnings.join("; "));
  assert.ok(!r.warnings.some((w) => w.includes("'without sharing' is never triggered")));
});

test("schema: a negative response must say which kind of check catches it", () => {
  const data = (negative) => ({ config: { model: "m", max_tokens: 1, temperature: 0 }, scenarios: [{ ...scenario, negative_responses: [negative] }] });
  const negative = scenario.negative_responses[0];
  const withoutCaughtBy = { name: negative.name, reason: negative.reason, response: negative.response };
  assert.deepEqual(validateSchema("skill-scenarios.schema.json", data(negative)), []);
  assert.ok(validateSchema("skill-scenarios.schema.json", data(withoutCaughtBy)).some((e) => /required property 'caught_by'/.test(e)));
});

test("evaluate: an answer cannot hide code from graders behind a context marker", async () => {
  const sc = { name: "ctx", prompt: "Return a JSON settings file", expected_patterns: ["enabled"], forbidden_patterns: ["secretValue"], tags: ["basic"], mock_response: "x" };
  const hidden = await evaluateResponse(sc, { text: "Settings follow.\n# file: settings.json\n{\"enabled\": true}\n# context: extra.json\n{\"secretValue\": 1}\n" });
  assert.equal(hidden.passed, false);
  assert.ok(hidden.files.includes("extra.json"), "context-marked files in answers are graded like any file");
});
