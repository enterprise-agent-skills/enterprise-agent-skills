import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateResponse } from "../harness/evaluate.mjs";
import { evaluateSkill } from "../harness/mock-eval.mjs";

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

test("evaluate: an answer cannot hide code from graders behind a context marker", async () => {
  const sc = { name: "ctx", prompt: "Return a JSON settings file", expected_patterns: ["enabled"], forbidden_patterns: ["secretValue"], tags: ["basic"], mock_response: "x" };
  const hidden = await evaluateResponse(sc, { text: "Settings follow.\n# file: settings.json\n{\"enabled\": true}\n# context: extra.json\n{\"secretValue\": 1}\n" });
  assert.equal(hidden.passed, false);
  assert.ok(hidden.files.includes("extra.json"), "context-marked files in answers are graded like any file");
});
