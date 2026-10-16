# Attribution and upstream sources

This file records every outside source this repository copies from or builds on. Update it in
the same pull request that adds the material. Skills that adapt outside content also record
the source in `metadata.upstream-source` and `metadata.upstream-license` in their `SKILL.md`.

## Material copied into this repository

| Path | Source | License | Notes |
|------|--------|---------|-------|
| `schemas/vendor/agent-plugins/1.0.0/` | [agentplugins/agent-plugins-spec](https://github.com/agentplugins/agent-plugins-spec), commit `ff8ab5e` | Apache-2.0 | Unmodified JSON schemas; see the NOTICE file in that folder |
| `tests/fixtures/cloudification/objectReleaseInfo-sample.json` | [SAP/abap-atc-cr-cv-s4hc](https://github.com/SAP/abap-atc-cr-cv-s4hc), commit `60cb748` | Apache-2.0 | Seven unmodified entries used as a test fixture |

## Projects whose design this repository follows

No files were copied from these projects. Their structure and conventions informed ours, and
the text in this repository is original.

| Project | License | What we adopted |
|---------|---------|-----------------|
| [microsoft/skills](https://github.com/microsoft/skills) | MIT | `SKILL.md` conventions with trigger and anti-trigger descriptions, plugin bundles with skills inside, `tests/scenarios/<skill>/acceptance-criteria.md` and `scenarios.yaml` (our scenario schema is a compatible superset), mock evaluation in CI, Vally evaluation specs beside scenarios |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | MIT | Plugin catalog and marketplace generation, Agent Plugins manifests with repository-specific data under `extensions`, `vally lint` as a pull request gate, contribution templates and least-privilege workflows |
| [Agent Skills specification](https://agentskills.io) | See site | Skill folder layout and frontmatter fields |
| [Agent Plugins specification](https://agent-plugins.org) | CC-BY-4.0 (text), Apache-2.0 (schemas) | Portable plugin manifest and MCP configuration format |

## Tools used by the test suite

| Tool | License | Use |
|------|---------|-----|
| [@abaplint/core](https://github.com/abaplint/abaplint) | MIT | Parses ABAP and CDS samples under the ABAP Cloud language version |
| [@apexdevtools/apex-parser](https://github.com/apex-dev-tools/apex-parser) | BSD-3-Clause | Parses Apex samples |
| [ajv](https://github.com/ajv-validator/ajv), ajv-formats | MIT | JSON Schema validation |
| [yaml](https://github.com/eemeli/yaml) | ISC | YAML parsing |
| [@microsoft/vally-cli](https://microsoft.github.io/vally/) | MIT | Skill and eval-spec lint, oracle grading; run through npx, not bundled |

## Earlier work in this repository

`incubator/legacy-cowork-skills/` holds eleven skills written before this repository was
restructured. `plugins/sap-abap/skills/sap-rap-business-object` was rewritten from
`sap-abap-fiori-dev` and records that in `metadata.derived-from`.

## Trademarks

Product names are trademarks of their owners and are used only to identify the products the
skills work with. See the Trademarks section of the README.
