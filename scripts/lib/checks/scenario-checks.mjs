import { validateSchema } from "../schema.mjs";
import { literalFallbacks, trivialPatterns } from "../../../tests/harness/patterns.mjs";
import { parseCriteria } from "../../../tests/harness/criteria.mjs";
import { resolveEnvironment } from "../../../tests/harness/sap-env.mjs";

/** Structural checks for tests/scenarios/<skill>/. Behavioral checks run in npm run eval:mock. */
export function checkScenarios(model, findings) {
  const skillNames = new Set(model.skills.filter((s) => s.data).map((s) => s.data.name));
  for (const [skill, entry] of Object.entries(model.scenarios)) {
    if (!skillNames.has(skill)) findings.error("SCENARIO_ORPHAN", `tests/scenarios/${skill}/ has no matching skill under plugins/*/skills/.`, { file: entry.dir });
    if (!entry.criteriaText) findings.error("SCENARIO_NO_CRITERIA", "acceptance-criteria.md is missing.", { file: entry.criteriaFile });
    else {
      const parsed = parseCriteria(entry.criteriaText);
      if (!/^#\s+\S/m.test(entry.criteriaText)) findings.error("CRITERIA_NO_TITLE", "acceptance-criteria.md needs a '# ' title.", { file: entry.criteriaFile });
      if (!parsed.correct.length || !parsed.incorrect.length) findings.error("CRITERIA_INCOMPLETE", "acceptance-criteria.md needs at least one 'Correct' and one 'Incorrect' example.", { file: entry.criteriaFile });
    }
    if (!entry.data) {
      findings.error("SCENARIO_MISSING", "scenarios.yaml is missing or invalid.", { file: entry.scenariosFile });
      continue;
    }
    for (const err of validateSchema("skill-scenarios.schema.json", entry.data)) findings.error("SCENARIO_SCHEMA", err, { file: entry.scenariosFile });
    if (entry.data.environment) {
      const env = resolveEnvironment(entry.data.environment);
      if (!env.ok) findings.error("SCENARIO_ENVIRONMENT", `Default environment: ${env.errors.join("; ")}`, { file: entry.scenariosFile });
    }
    const seen = new Set();
    for (const sc of entry.data.scenarios ?? []) {
      if (sc.environment) {
        const env = resolveEnvironment(sc.environment);
        if (!env.ok) findings.error("SCENARIO_ENVIRONMENT", `${sc.name}: ${env.errors.join("; ")}`, { file: entry.scenariosFile });
      } else if ((sc.validators ?? []).includes("abaplint") && !entry.data.environment) {
        findings.error("SCENARIO_ENVIRONMENT_MISSING", `${sc.name}: ABAP scenarios need an SAP environment (scenario 'environment' or a file-level default).`, { file: entry.scenariosFile });
      }
      if (seen.has(sc.name)) findings.error("SCENARIO_DUPLICATE", `Duplicate scenario name '${sc.name}'.`, { file: entry.scenariosFile });
      seen.add(sc.name);
      for (const p of trivialPatterns(sc.expected_patterns)) findings.error("SCENARIO_TRIVIAL_PATTERN", `${sc.name}: expected pattern '${p}' matches an empty string.`, { file: entry.scenariosFile });
      for (const p of literalFallbacks([...(sc.expected_patterns ?? []), ...(sc.forbidden_patterns ?? [])])) {
        findings.warn("SCENARIO_LITERAL_PATTERN", `${sc.name}: '${p}' is not a valid regex and is matched literally. Escape special characters if a regex was intended.`, { file: entry.scenariosFile });
      }
      const names = new Set();
      for (const n of sc.negative_responses ?? []) {
        if (names.has(n.name)) findings.error("SCENARIO_DUPLICATE_NEGATIVE", `${sc.name}: duplicate negative response '${n.name}'.`, { file: entry.scenariosFile });
        names.add(n.name);
      }
    }
  }
}
