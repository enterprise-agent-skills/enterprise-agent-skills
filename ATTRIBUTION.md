# Attribution and upstream sources

This file records every outside source this repository copies from or builds on, and where each
license text is kept. Update it in the same pull request that adds the material. Skills that
adapt outside content also record the source in `metadata.upstream-source` and
`metadata.upstream-license` in their `SKILL.md`.

The repository's own license is the MIT License in [LICENSE](LICENSE). Each release archive
includes a copy as `LICENSE.txt`.

## Material copied into this repository

| Path | Source | License | Notes |
|------|--------|---------|-------|
| `tests/fixtures/cloudification/objectReleaseInfo-sample.json` | [SAP/abap-atc-cr-cv-s4hc](https://github.com/SAP/abap-atc-cr-cv-s4hc), commit `60cb748` | Apache-2.0 | Seven unmodified entries used as a test fixture. Copyright notice: [tests/fixtures/cloudification/README.md](tests/fixtures/cloudification/README.md) |
| `schemas/vendor/agent-plugins/1.0.0/` | [agentplugins/agent-plugins-spec](https://github.com/agentplugins/agent-plugins-spec), commit `ff8ab5e` | Apache-2.0 | Two unmodified JSON schemas. Copyright notice: [schemas/vendor/agent-plugins/NOTICE.md](schemas/vendor/agent-plugins/NOTICE.md) |

The full Apache License 2.0 text is in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt),
downloaded unchanged from https://www.apache.org/licenses/LICENSE-2.0.txt on 2026-10-21.
Neither upstream repository has a NOTICE file (checked 2026-10-21), so there is no NOTICE text
to pass on.

None of these files is in `plugins/`, so the plugin and skill folders, and the release archives
built from those folders, do not contain them.

## Documentation that skills name as sources

Three SAP skills list their sources, with the date checked, in Sources sections: every file in
`plugins/sap-abap/skills/sap-abap-enhancements/references/` and
`plugins/sap-abap/skills/sap-abap-integration/references/`, and
`plugins/sap-abap/skills/sap-rap-business-object/SKILL.md`. Most entries are SAP Help Portal
pages, including the ABAP Keyword Documentation. The others are SAP Community and SAP Learning
pages, an SAP tutorial, and one file in
[SAP-samples/abap-platform-rap100](https://github.com/SAP-samples/abap-platform-rap100).

Two references in `plugins/microsoft-fabric/skills/fabric-lakehouse-incremental-merge/` name
Microsoft Learn pages as their sources: `references/table-maintenance.md` and
`references/incremental-merge-notebook.md`. Microsoft publishes the Fabric documentation in
[MicrosoftDocs/fabric-docs](https://github.com/MicrosoftDocs/fabric-docs), with text under
CC-BY-4.0 and code under MIT. The license texts are the `LICENSE` and `LICENSE-CODE` files in
that repository (checked 2026-10-21).

## Projects whose design this repository follows

Apart from the Agent Plugins schemas listed above, nothing was copied from these projects, so no
other license text from them is needed here. Their structure and conventions informed ours.

| Project | License | What we adopted |
|---------|---------|-----------------|
| [microsoft/skills](https://github.com/microsoft/skills) | MIT | `SKILL.md` conventions with trigger and anti-trigger descriptions, plugin bundles with skills inside, `tests/scenarios/<skill>/acceptance-criteria.md` and `scenarios.yaml` (our scenario schema is a compatible superset), mock evaluation in CI, Vally evaluation specs beside scenarios |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | MIT | Plugin catalog and marketplace generation, Agent Plugins manifests with repository-specific data under `extensions`, `vally lint` as a pull request gate, contribution templates and least-privilege workflows |
| [Agent Skills specification](https://agentskills.io) | CC-BY-4.0 (documentation), Apache-2.0 (code), as stated in [agentskills/agentskills](https://github.com/agentskills/agentskills) (checked 2026-10-21) | Skill folder layout and frontmatter fields |
| [Agent Plugins specification](https://agent-plugins.org) | CC-BY-4.0 (text), Apache-2.0 (schemas) | Portable plugin manifest and MCP configuration format |

## Development dependencies

`npm ci` installs these packages from the public npm registry to build, validate, and test this
repository. They are `devDependencies` in `package.json`. They are not committed, and no plugin
or release archive contains them.

| Package | License | Use | License text |
|---------|---------|-----|--------------|
| [@abaplint/core](https://github.com/abaplint/abaplint) | MIT | Parses ABAP and CDS samples with the grammar of each sample's target release (Standard ABAP for SAP_BASIS 7.00 to 8.16, and ABAP Cloud) | [LICENSE](https://github.com/abaplint/abaplint/blob/main/LICENSE) in the source repository; the npm package has no license file |
| [@apexdevtools/apex-parser](https://github.com/apex-dev-tools/apex-parser) | BSD-3-Clause | Parses Apex samples | [LICENSE](https://github.com/apex-dev-tools/apex-parser/blob/main/LICENSE) in the source repository; the npm package has no license file |
| [ajv](https://github.com/ajv-validator/ajv), [ajv-formats](https://github.com/ajv-validator/ajv-formats) | MIT | JSON Schema validation | `LICENSE` in each package folder under `node_modules/` |
| [yaml](https://github.com/eemeli/yaml) | ISC | YAML parsing | `node_modules/yaml/LICENSE` |

`package-lock.json` records the license of every installed package, including the packages these
depend on. On 2026-10-21 every package was MIT, ISC, or BSD-3-Clause; the indirect BSD-3-Clause
packages were antlr4 and fast-uri.

`npm run eval:vally` also runs [@microsoft/vally-cli](https://microsoft.github.io/vally/) (MIT)
through npx, at the version pinned in `repo.config.yaml`, to lint skills and evaluation specs and
grade golden answers. `npm ci` does not install it, and it is not committed. Its license text is
the `LICENSE` file in the package that npx downloads.

## Earlier work in this repository

`plugins/sap-abap/skills/sap-abap-standard` and `plugins/sap-abap/skills/sap-rap-business-object`
were rewritten from `sap-abap-fiori-dev`, an earlier draft that was never released as a skill,
and record that in `metadata.derived-from`. The draft is no longer in the repository.

## Trademarks

Product names are trademarks of their owners and are used only to identify the products the
skills work with. See the Trademarks section of the README.
