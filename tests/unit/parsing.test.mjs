import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";
import { fencedBlocks, markdownLinks } from "../../scripts/lib/markdown.mjs";
import { joinForPatterns, splitIntoFiles, stripComments } from "../harness/files.mjs";
import { compilePattern, checkPatterns, trivialPatterns, literalFallbacks } from "../harness/patterns.mjs";
import { parseCriteria } from "../harness/criteria.mjs";

test("frontmatter: parses a valid block and reports the body start line", () => {
  const r = parseFrontmatter("---\nname: demo\ndescription: x\n---\n# Title\n");
  assert.equal(r.error, null);
  assert.equal(r.data.name, "demo");
  assert.equal(r.body, "# Title\n");
  assert.equal(r.bodyStartLine, 5);
});

test("frontmatter: rejects missing, unterminated, invalid, and non-mapping blocks", () => {
  assert.match(parseFrontmatter("# no frontmatter").error, /must start/);
  assert.match(parseFrontmatter("---\nname: x\n").error, /not terminated/);
  assert.match(parseFrontmatter("---\nname: [unclosed\n---\n").error, /Invalid YAML/);
  assert.match(parseFrontmatter("---\n- a\n- b\n---\n").error, /mapping/);
});

test("files: markers split a response and are not part of file content", () => {
  const r = splitIntoFiles("intro text\n// file: src/a.cls\nclass A {}\n# file: b.py\nprint(1)\n");
  assert.equal(r.preamble, "intro text");
  assert.deepEqual(r.files.map((f) => f.path), ["src/a.cls", "b.py"]);
  assert.equal(r.files[0].content, "class A {}\n");
  assert.ok(!r.files[1].content.includes("file:"));
});

test("files: a closing code fence ends the current file", () => {
  const text = "Here is the code:\n```apex\n// file: A.cls\npublic class A {}\n```\nThis explanation is not code.\n";
  const r = splitIntoFiles(text);
  assert.equal(r.files.length, 1);
  assert.equal(r.files[0].content, "public class A {}\n");
  assert.match(r.preamble, /explanation is not code/);
});

test("files: ABAP full-line comment markers work and unsafe paths are rejected", () => {
  const r = splitIntoFiles("* file: src/zcl_a.clas.abap\nCLASS zcl_a DEFINITION.\n");
  assert.equal(r.files[0].path, "src/zcl_a.clas.abap");
  assert.throws(() => splitIntoFiles("// file: ../outside.cls\nx"), /Unsafe/);
  assert.throws(() => splitIntoFiles("// file: /abs/path.cls\nx"), /Unsafe/);
});

test("comments: ABAP comments go, literals and function module interface lines stay", () => {
  const abap = [
    "* We do not use SUM( ) with GROUP BY here.",
    '*"  IMPORTING VALUE(IV_ORDER) TYPE VBELN',
    "CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'. \" commit the work",
    "lv_text = 'He said \"hi\"'. \" a quote inside a literal is not a comment",
    "lv_tmpl = |Total \"{ lv_sum }\"|. \" templates keep their text",
    "lv_raw = `a\"b`.",
    "lv_esc = |a\\|b \"c|. \" an escaped bar does not end the template",
    "  \" an indented full-line comment",
  ].join("\n");
  assert.deepEqual(stripComments(abap, "src/zfa_report.prog.abap").split("\n"), [
    "",
    '*"  IMPORTING VALUE(IV_ORDER) TYPE VBELN',
    "CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'.",
    "lv_text = 'He said \"hi\"'.",
    "lv_tmpl = |Total \"{ lv_sum }\"|.",
    "lv_raw = `a\"b`.",
    "lv_esc = |a\\|b \"c|.",
    "",
  ]);
});

test("comments: Apex, JavaScript, and CDS lose // and /* */ comments outside strings", () => {
  const apex = "String s = 'a // b'; // real comment\nString t = 'it\\'s /* not */ a comment';\n/* block\n   comment */Integer i = 1;\nInteger j/*x*/= 2;\n";
  // A removed block comment leaves one space where it started, so the code after it keeps its
  // column and ^-anchored patterns still match.
  assert.equal(stripComments(apex, "Handler.cls"), "String s = 'a // b';\nString t = 'it\\'s /* not */ a comment';\n \nInteger i = 1;\nInteger j = 2;\n");
  const js = 'const url = "abfss://lake@x/y"; // path\nconst t = `line one\n// still in the template\n`;\n';
  assert.equal(stripComments(js, "load.mjs"), 'const url = "abfss://lake@x/y";\nconst t = `line one\n// still in the template\n`;\n');
  const cds = "define view entity ZI_X as select from zt // source\n{ key a, 'x//y' as b /* note */ }\n";
  assert.equal(stripComments(cds, "src/zi_x.ddls.asddls"), "define view entity ZI_X as select from zt\n{ key a, 'x//y' as b   }\n");
});

test("comments: Python loses # comments outside strings, including triple-quoted strings", () => {
  const py = 'color = "#ffffff"  # white\n"""Docstring with a # sign\nover two lines"""\nx = 1 # one\n';
  assert.equal(stripComments(py, "notebooks/load.py"), 'color = "#ffffff"\n"""Docstring with a # sign\nover two lines"""\nx = 1\n');
  assert.equal(stripComments("print('a') # b\nprint('c')\n", "t.py").split("\n").length, 3, "line count is kept");
});

test("comments: other file types are unchanged, and the explanation is never stripped", () => {
  assert.equal(stripComments("# Heading\n// not code\n", "answer.md"), "# Heading\n// not code\n");
  assert.equal(stripComments('{"a": "//"}', "x.json"), '{"a": "//"}');
  const text = joinForPatterns(splitIntoFiles("Run BAPI_TRANSACTION_COMMIT after the call.\n* file: src/zfa_x.prog.abap\n* COMMIT WORK.\nWRITE 'x'.\n"));
  assert.match(text, /Run BAPI_TRANSACTION_COMMIT after the call\./);
  assert.doesNotMatch(text, /COMMIT WORK/);
});

test("patterns: regex entries match as regex, invalid regex falls back to literal", () => {
  assert.equal(compilePattern("a\\.b").kind, "regex");
  assert.equal(compilePattern("read_item(item_id").kind, "literal");
  assert.ok(compilePattern("read_item(item_id").test("x.read_item(item_id=1)"));
  assert.deepEqual(literalFallbacks(["ok", "bad("]), ["bad("]);
});

test("patterns: a leading (?i) makes a pattern case-insensitive", () => {
  const p = compilePattern("(?i)authority-check object");
  assert.equal(p.kind, "regex");
  assert.ok(p.test("AUTHORITY-CHECK OBJECT 'S_TCODE'"));
  assert.ok(p.test("authority-check object 'S_TCODE'"));
  assert.equal(compilePattern("AUTHORITY-CHECK").test("authority-check"), false);
});

test("patterns: (?im) and (?s) inline flags compile as regexes instead of literals", () => {
  assert.equal(compilePattern("(?im)^commit work").kind, "regex");
  assert.ok(compilePattern("(?im)^commit work").test("x\nCOMMIT WORK."));
  assert.ok(compilePattern("(?is)begin.end").test("BEGIN\nEND"));
  assert.equal(compilePattern("(?i)begin.end").test("BEGIN\nEND"), false);
});

test("files: context markers are returned separately from answer files", () => {
  const r = splitIntoFiles("* context: src/zcl_base.clas.abap\nCLASS zcl_base DEFINITION.\n* file: src/zcl_ext.clas.abap\nCLASS zcl_ext DEFINITION.\n");
  assert.deepEqual(r.files.map((f) => f.path), ["src/zcl_ext.clas.abap"]);
  assert.deepEqual(r.context.map((f) => f.path), ["src/zcl_base.clas.abap"]);
});

test("patterns: reports missing expected and present forbidden patterns", () => {
  const r = checkPatterns("alpha beta", ["alpha", "gamma"], ["beta", "delta"]);
  assert.deepEqual(r.missing, ["gamma"]);
  assert.deepEqual(r.present, ["beta"]);
});

test("patterns: flags expected patterns that match an empty answer", () => {
  assert.deepEqual(trivialPatterns(["x*", "real"]), ["x*"]);
});

test("criteria: classifies Correct, Incorrect, and anti-pattern headings and reads exemptions", () => {
  const md = [
    "# Criteria", "## 1. Area",
    "### 1.1 Correct: good", "```python", "ok()", "```",
    "### 1.2 Incorrect: bad", "<!-- not-detectable: needs runtime -->", "```python", "bad()", "```",
    "### 1.3 Anti-pattern: worse", "```python", "worse()", "```",
    "### 1.4 Notes", "```text", "neutral", "```",
  ].join("\n");
  const r = parseCriteria(md);
  assert.equal(r.correct.length, 1);
  assert.equal(r.incorrect.length, 2);
  assert.equal(r.unclassified.length, 1);
  assert.equal(r.incorrect[0].exemption, "needs runtime");
  assert.equal(r.incorrect[1].exemption, null);
});

test("markdown: link extraction ignores code and keeps line numbers", () => {
  const md = "text [a](one.md)\n```\n[b](inside-code.md)\n```\nmore `[c](inline.md)` [d](two.md)\n";
  const links = markdownLinks(md);
  assert.deepEqual(links.map((l) => l.target), ["one.md", "two.md"]);
  assert.deepEqual(links.map((l) => l.line), [1, 5]);
});

test("markdown: fenced blocks carry the preceding snippet-lint directive", () => {
  const md = "<!-- snippet-lint: skip partial example -->\n```json\n{ broken\n```\n```yaml\na: 1\n```\n";
  const blocks = fencedBlocks(md);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].directive, /^snippet-lint: skip/);
  assert.equal(blocks[1].directive, null);
});
