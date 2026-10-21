# Roadmap

Status as of 2026-10-21. "Implemented" means the code exists and its checks pass locally;
items under "Next" are not built yet.

## Implemented

| Area | What exists |
|------|-------------|
| Repository structure | Plugin folders with skills inside, generated platform manifests and marketplaces, catalog JSON, llms.txt, README catalog regions |
| Plugins and skills | `sap-abap`: Standard ABAP for ECC, NetWeaver, and S/4HANA (`sap-abap-standard`), enhancements (`sap-abap-enhancements`), integration with BAPI, RFC, IDoc, and SAP Gateway (`sap-abap-integration`), RAP business objects in ABAP Cloud (`sap-rap-business-object`), clean core assessment (`sap-clean-core-check`), and a reviewer agent; `microsoft-fabric` (incremental merge); `salesforce-platform` (Apex trigger framework) |
| Tests per skill | Acceptance criteria and scenarios with reference answers and negative controls for every skill; generated Vally specs |
| Release-aware ABAP validation | SAP environment registry (ECC 6.0 EHP0 to EHP8, NetWeaver 7.0 to 7.52, S/4HANA 1511 to 2025, Private Edition, ABAP Cloud), abaplint grammar per release, feature rules for gates abaplint misses, tested release fixtures for ABAP statements, `context_files` for objects quoted in prompts. See [sap-environments.md](sap-environments.md) |
| Validation | Schemas, naming, taxonomy, links, references, snippet parsing against the snippet's SAP target, placeholder detection |
| Language validators | abaplint (Standard ABAP and ABAP Cloud, CDS), Apex parser, Python `ast`, `node --check`, JSON, YAML |
| Mock evaluation | Reference, empty-answer, and negative-answer checks with `caught_by`, criteria coverage |
| Vally | Lint for skills and specs, oracle on golden patches, baseline negative control |
| Security | Offline scanner; CodeQL, dependency review, and Scorecard workflows |
| CI | PR validation, security, scheduled quality report, optional live evaluation (disabled by default) |
| Release packaging | Tag-triggered `release` workflow: for a `v*` tag on a commit on `main` it runs the checks, builds a ZIP per skill and per plugin plus `all-skills.zip` (each skill or plugin folder with `LICENSE.txt`), writes SHA-256 checksums, attests build provenance, and attaches the files to the GitHub release. See [publishing.md](publishing.md#releases) |
| Contributor tooling | `new:skill` scaffolder (with SAP metadata for ABAP skills), templates, `export:upstream` for microsoft/skills |
| Community files | Contributing guide, code of conduct, security policy, governance, attribution, issue and PR templates |
| Publication | Public repository [enterprise-agent-skills/enterprise-agent-skills](https://github.com/enterprise-agent-skills/enterprise-agent-skills), published on 2026-10-15 as `frontier-agent-skills/frontier-agent-skills-plugins` and renamed on 2026-10-21, with protected `main` (pull requests and the `static-and-mock` and `scan` checks required), private vulnerability reporting, Dependabot, secret scanning with push protection, and Discussions |

## Next

1. **End-to-end platform verification.** Install each plugin in Claude Code, Cowork, Copilot
   CLI, Codex, Cursor, and Gemini CLI; record results in
   [platform-compatibility.md](platform-compatibility.md).
2. **Live system tests (opt-in).** Import the ABAP reference objects into SAP systems (an
   older ECC release and a current S/4HANA release, plus the BTP ABAP environment trial for
   ABAP Cloud), run the SAP syntax check, ABAP Unit, and ATC, and compare with the offline
   release checks. Deploy the Apex sample to a scratch org; run the Fabric notebook in a
   trial capacity. Credentials stay in repository secrets and the jobs never run on forks.
3. **Live model evaluations (opt-in).** Enable the `live-evals` workflow with a Copilot token
   to run the generated Vally specs against real agents and publish scores per skill.
4. **More SAP skills.** CDS view entities and access control, Fiori elements annotations, and
   UI5, each with release metadata and tests.
5. **Report abaplint release-gating gaps upstream.** The fixtures document statements that
   abaplint accepts on releases that are too old; sharing them helps every abaplint user.
6. **Migrate legacy drafts.** Drafts from earlier work are not in this repository. Each is
   migrated into focused skills with tests before it is published, starting with SAP
   Integration Suite (Cloud Integration iFlows and Groovy, API Management policies, Event
   Mesh, Cloud Connector and destinations) and ABAP CI pipelines with gCTS or abapGit and ATC.
   See [incubator/README.md](../incubator/README.md).
7. **More validators.** KQL, DAX, and SQL dialect parsers that run offline.
8. **More vendors.** AWS, Google Cloud, ServiceNow, Workday, Snowflake, Databricks, and Oracle skills,
   each with a domain owner.
9. **Catalog website.** A static GitHub Pages site generated from `catalog/catalog.json` with
   search and filters.
10. **Release automation.** Per-plugin changelogs, version bump checks when skill content
    changes, and the quality report summary in each release's notes. The tag-triggered release
    workflow that builds the ZIP packages is already in place (see Implemented).
11. **Directory listings.** Submit plugins to the Claude plugin directory and the external
    plugin list in github/awesome-copilot once end-to-end verification is done.
