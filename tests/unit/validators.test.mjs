import { test } from "node:test";
import assert from "node:assert/strict";
import { runValidators, findPython } from "../harness/validators.mjs";
import { resolveEnvironment } from "../harness/sap-env.mjs";

// Negative fixtures prove each validator rejects bad input; without them a validator that
// silently skipped files would look like a pass. Release-specific ABAP fixtures are in
// sap-environment.test.mjs; the ABAP tests here use ABAP Cloud.

const inCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const abapCloud = resolveEnvironment({ product: "s4hana", release: "2023", language_version: "cloud" });

async function single(path, content) {
  const { results } = await runValidators([{ path, content }], { abapEnv: abapCloud });
  assert.equal(results.length, 1, `expected one result for ${path}`);
  return results[0];
}

test("abaplint: accepts ABAP Cloud class syntax", async () => {
  const r = await single("zcl_ok.clas.abap", "CLASS zcl_ok DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\nCLASS zcl_ok IMPLEMENTATION.\n  METHOD run.\n    DATA(x) = 1.\n  ENDMETHOD.\nENDCLASS.\n");
  assert.equal(r.status, "passed", r.messages.join("; "));
});

test("abaplint: rejects statements that do not exist in ABAP Cloud", async () => {
  const r = await single("zcl_bad.clas.abap", "CLASS zcl_bad DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\nCLASS zcl_bad IMPLEMENTATION.\n  METHOD run.\n    WRITE / 'x'.\n  ENDMETHOD.\nENDCLASS.\n");
  assert.equal(r.status, "failed");
  assert.match(r.messages.join(" "), /WRITE/);
});

test("abaplint: rejects CDS syntax errors", async () => {
  const r = await single("zr_bad.ddls.asddls", "define root view entity ZR_Bad as select from zt { key a as A b as B }\n");
  assert.equal(r.status, "failed");
});

test("abaplint: fails files it does not recognize instead of skipping them", async () => {
  const r = await single("my_class.abap", "CLASS zcl_x DEFINITION PUBLIC.\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\nENDCLASS.\n");
  assert.equal(r.status, "failed");
  assert.match(r.messages[0], /did not recognize/);
});

test("apex: accepts a class and a trigger, rejects a missing semicolon", async () => {
  assert.equal((await single("A.cls", "public with sharing class A { public void m() { Integer i = 1; } }")).status, "passed");
  assert.equal((await single("T.trigger", "trigger T on Account (before insert) { new A().m(); }")).status, "passed");
  const bad = await single("B.cls", "public class B { public void m() { Integer i = 1 } }");
  assert.equal(bad.status, "failed");
  assert.match(bad.messages[0], /missing ';'/);
});

test("python: accepts valid code and rejects a syntax error", { skip: !findPython() && !inCI ? "no Python 3 on PATH" : false }, async () => {
  assert.equal((await single("ok.py", "def f(x):\n    return x + 1\n")).status, "passed");
  const bad = await single("bad.py", "def f(x)\n    return x\n");
  assert.equal(bad.status, "failed");
});

test("python: non-ASCII source is read as UTF-8 on every platform", { skip: !findPython() && !inCI ? "no Python 3 on PATH" : false }, async () => {
  // On Windows, sys.stdin.read() decodes with the console code page, so these failed there.
  // U+2010 is a Unicode hyphen, which Python does not accept as an operator.
  const [aAcute, hyphen, oUmlaut, sharpS] = [0xc1, 0x2010, 0xf6, 0xdf].map((cp) => String.fromCodePoint(cp));
  const ok = await single("names.py", `name = "${aAcute}lvaro"\nnote = "re${hyphen}run"\ngr${oUmlaut}${sharpS}e = 1\n`);
  assert.equal(ok.status, "passed", ok.messages.join("; "));
  // A syntax error that involves a non-ASCII character is reported, not a crash.
  const bad = await single("hyphen.py", `x = re${hyphen}run\n`);
  assert.equal(bad.status, "failed");
  assert.match(bad.messages[0], /^1:\d+ invalid character/);
  assert.doesNotMatch(bad.messages[0], /Traceback|UnicodeEncodeError/);
});

test("javascript, json, yaml: reject invalid documents", async () => {
  assert.equal((await single("ok.mjs", "export const a = 1;\n")).status, "passed");
  assert.equal((await single("bad.mjs", "export const = 1;\n")).status, "failed");
  assert.equal((await single("bad.json", "{ \"a\": }")).status, "failed");
  assert.equal((await single("bad.yaml", "a: [1, 2\n")).status, "failed");
  assert.equal((await single("ok.yaml", "a: 1\nb: [1, 2]\n")).status, "passed");
});

test("files without a parser are reported as unvalidated, not passed", async () => {
  const { results, unvalidated } = await runValidators([{ path: "src/z.bdef.asbdef", content: "managed;" }]);
  assert.equal(results.length, 0);
  assert.deepEqual(unvalidated, ["src/z.bdef.asbdef"]);
});
