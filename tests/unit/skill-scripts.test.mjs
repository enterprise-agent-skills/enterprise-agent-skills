import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { REPO_ROOT } from "../../scripts/lib/constants.mjs";
import { findPython } from "../harness/validators.mjs";

// Scripts bundled in skills run on users' machines, so they get real tests with fixtures.
const python = findPython();
const inCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const skip = !python && !inCI ? "no Python 3 on PATH" : false;

const script = join(REPO_ROOT, "plugins/sap-abap/skills/sap-clean-core-check/scripts/lookup_api_state.py");
const fixture = join(REPO_ROOT, "tests/fixtures/cloudification/objectReleaseInfo-sample.json");
const run = (...args) => spawnSync(python, ["-I", script, "--source", fixture, ...args], { encoding: "utf8" });

test("lookup_api_state: reports state and successor for a table", { skip }, () => {
  const r = run("VBAK", "--json");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.results[0].state, "notToBeReleased");
  assert.deepEqual(out.results[0].entries[0].successors, ["I_SALESDOCUMENT"]);
});

test("lookup_api_state: finds function modules by object key", { skip }, () => {
  const out = JSON.parse(run("BAPI_PROCORD_GET_DETAIL", "--json").stdout);
  assert.equal(out.results[0].found, true);
  assert.deepEqual(out.results[0].entries[0].successors, ["I_MANUFACTURINGORDER"]);
});

test("lookup_api_state: unknown objects are reported as not found", { skip }, () => {
  const out = JSON.parse(run("ZZ_NOT_THERE", "--json").stdout);
  assert.equal(out.results[0].found, false);
});

test("lookup_api_state: --fail-on-not-released exits 3 only when needed", { skip }, () => {
  assert.equal(run("I_SALESORDER", "--fail-on-not-released").status, 0);
  assert.equal(run("I_SALESORDER", "VBAK", "--fail-on-not-released").status, 3);
});

test("lookup_api_state: refuses non-https URLs", { skip }, () => {
  const r = spawnSync(python, ["-I", script, "--source", "http://example.test/data.json", "VBAK"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Only https URLs/);
});
