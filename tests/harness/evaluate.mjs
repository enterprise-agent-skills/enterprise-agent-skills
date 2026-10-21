import { splitIntoFiles, joinForPatterns, defaultFileFor, stripComments } from "./files.mjs";
import { checkPatterns } from "./patterns.mjs";
import { runValidators } from "./validators.mjs";
import { resolveEnvironment } from "./sap-env.mjs";

/**
 * Evaluate one response against one scenario.
 *
 * `input` is either { text } (a reference or negative answer with optional file markers) or
 * { files: [{ path, content }] } (files produced in a workspace, used by the Vally grader).
 *
 * Options:
 *   strictValidators    treat an unavailable validator as a failure (CI mode)
 *   defaultEnvironment  SAP environment from the top of scenarios.yaml, used when the
 *                       scenario does not declare its own `environment`
 *
 * The result never reports a pass when a required validator did not run.
 * Failure kinds: forbidden_pattern, expected_pattern, validator, environment, structure,
 * validator_unavailable.
 */
export async function evaluateResponse(scenario, input, { strictValidators = false, defaultEnvironment = null } = {}) {
  const failures = [];
  const kinds = new Set();
  const warnings = [];
  const fail = (kind, message) => {
    kinds.add(kind);
    failures.push(message);
  };

  let split;
  try {
    split = input.files ? { preamble: "", files: input.files } : splitIntoFiles(input.text);
  } catch (err) {
    return { passed: false, failures: [err.message], failureKinds: ["structure"], warnings, validatorResults: [], unvalidated: [], files: [], environment: null };
  }
  // An answer cannot exempt its own code from grading: context markers count as files here.
  if (split.context?.length) split = { ...split, files: [...split.files, ...split.context], context: [] };
  let files = split.files;
  const declared = scenario.validators ?? [];

  if (!files.length && input.text) {
    const single = declared.map(defaultFileFor).filter(Boolean);
    if (single.length === 1) files = [{ path: single[0], content: input.text }];
    if (declared.includes("abaplint")) {
      fail("structure", "abaplint needs file markers with abapGit names (for example '* file: src/zcl_name.clas.abap').");
    }
  }

  const envSpec = scenario.environment ?? defaultEnvironment;
  const abapEnv = envSpec ? resolveEnvironment(envSpec) : null;
  if (abapEnv && !abapEnv.ok) fail("structure", `Environment: ${abapEnv.errors.join("; ")}`);

  // Patterns run on the explanation and on code without comments, so a comment that names a
  // required statement cannot satisfy an expected pattern, and a comment that names a rejected
  // one cannot trigger a forbidden pattern. Literals stay. An answer without file markers is
  // all explanation, as before.
  const text = input.files ? files.map((f) => stripComments(f.content, f.path)).join("\n") : joinForPatterns(split);
  const { missing, present } = checkPatterns(text, scenario.expected_patterns, scenario.forbidden_patterns);
  for (const p of present) fail("forbidden_pattern", `Forbidden pattern present: ${p}`);
  for (const p of missing) fail("expected_pattern", `Expected pattern not found: ${p}`);

  const { results, unvalidated } = await runValidators(files, { abapEnv, contextFiles: scenario.context_files ?? [] });
  for (const r of results) {
    if (r.status === "failed") fail(r.validator === "sap-environment" ? "environment" : "validator", `${r.validator} failed on ${r.file}: ${r.messages.join("; ")}`);
    if (r.status === "unavailable") {
      const msg = `${r.validator} unavailable for ${r.file}: ${r.messages.join("; ")}`;
      if (strictValidators) fail("validator_unavailable", msg);
      else warnings.push(msg);
    }
  }
  for (const v of declared) {
    if (!results.some((r) => r.validator === v)) fail("structure", `Required validator '${v}' did not run because no matching file was produced.`);
  }

  return {
    passed: failures.length === 0,
    failures,
    failureKinds: [...kinds],
    warnings,
    validatorResults: results,
    unvalidated,
    files: files.map((f) => f.path),
    environment: abapEnv?.label ?? null,
  };
}
