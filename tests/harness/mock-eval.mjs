import { evaluateResponse } from "./evaluate.mjs";
import { parseCriteria } from "./criteria.mjs";
import { compilePattern, trivialPatterns } from "./patterns.mjs";
import { splitIntoFiles } from "./files.mjs";
import { runValidators } from "./validators.mjs";
import { parseEnvString, resolveEnvironment } from "./sap-env.mjs";

/**
 * Credential-free evaluation of one skill's scenarios. This does not measure model quality.
 * It proves three things that make later live evaluations meaningful:
 *
 *  1. Reference answers pass every expected/forbidden pattern and every language validator,
 *     under the SAP environment the scenario declares (for ABAP).
 *  2. The checks are not trivial: an empty answer fails, and each documented bad answer fails
 *     for the reason named in `caught_by`.
 *  3. Acceptance criteria and tests agree: every "Incorrect" example is caught by a forbidden
 *     pattern or fails a validator under its environment (or carries a documented exemption),
 *     and every complete "Correct" example passes the validators.
 */
export async function evaluateSkill({ skill, maturity, scenarioEntry, strictValidators }) {
  const result = { skill, maturity, passed: true, errors: [], warnings: [], scenarios: [], criteria: null };
  const fail = (msg) => {
    result.passed = false;
    result.errors.push(msg);
  };

  const scenarios = scenarioEntry?.data?.scenarios ?? [];
  const defaultEnvironment = scenarioEntry?.data?.environment ?? null;
  if (!scenarios.length) {
    fail("No scenarios found in scenarios.yaml.");
    return result;
  }
  const opts = { strictValidators, defaultEnvironment };

  let negativeCount = 0;
  for (const scenario of scenarios) {
    const checks = [];
    const ref = await evaluateResponse(scenario, { text: scenario.mock_response }, opts);
    checks.push({ id: "reference", label: "Reference answer passes", passed: ref.passed, details: ref.failures, validators: summarizeValidators(ref) });
    result.warnings.push(...ref.warnings.map((w) => `${scenario.name}: ${w}`));

    const trivial = trivialPatterns(scenario.expected_patterns);
    const empty = await evaluateResponse(scenario, { text: "" }, opts);
    const emptyOk = !empty.passed && trivial.length === 0;
    checks.push({
      id: "empty-control",
      label: "Empty answer fails",
      passed: emptyOk,
      details: trivial.length ? [`Expected patterns match an empty string: ${trivial.join(", ")}`] : empty.passed ? ["An empty answer passed this scenario."] : [],
    });

    for (const neg of scenario.negative_responses ?? []) {
      negativeCount++;
      const r = await evaluateResponse(scenario, { text: neg.response }, opts);
      const wanted = neg.caught_by;
      const rightReason = !wanted || r.failureKinds.includes(wanted);
      let details;
      if (r.passed) details = [`Known-bad answer passed (${neg.reason}). Add a forbidden pattern or validator that catches it.`];
      else if (!rightReason) details = [`Failed, but not by a ${wanted} check. Failures: ${r.failures.join(" | ")}`];
      else details = [`Caught by: ${r.failures.find((m) => !wanted || kindOf(m) === wanted) ?? r.failures[0]}`];
      checks.push({
        id: `negative:${neg.name}`,
        label: `Bad answer '${neg.name}' fails${wanted ? ` on a ${wanted} check` : ""}`,
        passed: !r.passed && rightReason,
        caughtBy: r.failureKinds,
        details,
      });
    }

    const scenarioPassed = checks.every((c) => c.passed);
    if (!scenarioPassed) result.passed = false;
    result.scenarios.push({ name: scenario.name, tags: scenario.tags, environment: ref.environment, passed: scenarioPassed, checks });
  }

  if (negativeCount === 0 && maturity !== "experimental") {
    fail("At least one scenario needs negative_responses (known-bad answers that must fail).");
  }

  result.criteria = await checkCriteria(scenarioEntry?.criteriaText, scenarios, defaultEnvironment);
  for (const e of result.criteria.errors) fail(e);
  result.warnings.push(...result.criteria.warnings);
  return result;
}

/** Environment for a criteria block: its own abap-env directive, else the skill default. */
function blockEnvironment(block, defaultEnvironment) {
  if (block.env) return resolveEnvironment(parseEnvString(block.env));
  return defaultEnvironment ? resolveEnvironment(defaultEnvironment) : null;
}

async function checkCriteria(text, scenarios, defaultEnvironment) {
  const out = { errors: [], warnings: [], correct: 0, incorrect: 0, detected: 0, detectedByValidator: 0, exempt: 0, validatedCorrect: 0, fragments: 0 };
  if (!text) {
    out.errors.push("acceptance-criteria.md is missing.");
    return out;
  }
  const parsed = parseCriteria(text);
  out.correct = parsed.correct.length;
  out.incorrect = parsed.incorrect.length;
  if (!parsed.correct.length) out.errors.push("acceptance-criteria.md has no 'Correct' examples.");
  if (!parsed.incorrect.length) out.errors.push("acceptance-criteria.md has no 'Incorrect' examples.");
  for (const b of parsed.unclassified) {
    out.warnings.push(`Code block at acceptance-criteria.md:${b.line} is not under a 'Correct' or 'Incorrect' heading.`);
  }

  const forbidden = scenarios.flatMap((s) => s.forbidden_patterns ?? []).map(compilePattern);
  for (const b of parsed.incorrect) {
    if (forbidden.some((p) => p.test(b.code))) {
      out.detected++;
      continue;
    }
    // A complete Incorrect example can also be caught by a validator, for example syntax that
    // the target release does not support.
    const split = safeSplit(b.code, out, b);
    const files = split?.files;
    if (files?.length) {
      let env;
      try {
        env = blockEnvironment(b, defaultEnvironment);
      } catch (err) {
        out.errors.push(`Incorrect example at acceptance-criteria.md:${b.line}: ${err.message}`);
        continue;
      }
      const { results } = await runValidators(files, { abapEnv: env, contextFiles: split.context });
      if (results.some((r) => r.status === "failed")) {
        out.detected++;
        out.detectedByValidator++;
        continue;
      }
    }
    if (b.exemption) {
      out.exempt++;
      out.warnings.push(`Incorrect example at acceptance-criteria.md:${b.line} is exempt from detection: ${b.exemption}`);
    } else {
      out.errors.push(`Incorrect example '${b.heading}' (acceptance-criteria.md:${b.line}) is not caught by any forbidden pattern or validator. Add a pattern or a <!-- not-detectable: reason --> note.`);
    }
  }

  for (const b of parsed.correct) {
    const split = safeSplit(b.code, out, b);
    if (!split) continue;
    const files = split.files;
    if (!files.length) {
      out.fragments++;
      continue;
    }
    let env;
    try {
      env = blockEnvironment(b, defaultEnvironment);
    } catch (err) {
      out.errors.push(`Correct example at acceptance-criteria.md:${b.line}: ${err.message}`);
      continue;
    }
    const { results } = await runValidators(files, { abapEnv: env, contextFiles: split.context });
    for (const r of results) {
      if (r.status === "failed") out.errors.push(`Correct example at acceptance-criteria.md:${b.line} fails ${r.validator} on ${r.file}: ${r.messages.join("; ")}`);
      if (r.status === "passed") out.validatedCorrect++;
    }
  }
  return out;
}

function safeSplit(code, out, block) {
  try {
    return splitIntoFiles(code);
  } catch (err) {
    out.errors.push(`Example at acceptance-criteria.md:${block.line}: ${err.message}`);
    return null;
  }
}

function kindOf(message) {
  if (message.startsWith("Forbidden pattern present")) return "forbidden_pattern";
  if (message.startsWith("Expected pattern not found")) return "expected_pattern";
  if (message.startsWith("sap-environment failed on")) return "environment";
  if (/ failed on /.test(message)) return "validator";
  return "structure";
}

function summarizeValidators(evaluation) {
  return evaluation.validatorResults.map((r) => `${r.validator}:${r.file}:${r.status}`);
}
