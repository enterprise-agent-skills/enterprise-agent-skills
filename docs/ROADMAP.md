# Roadmap

Status as of 2026-10-15. "Implemented" means the code exists and its checks pass locally;
items under "Next" are not built yet.

## Implemented

| Area | What exists |
|------|-------------|
| Repository structure | Plugin folders with skills inside, generated platform manifests and marketplaces, catalog JSON, llms.txt, README catalog regions |
| Plugins and skills | `sap-abap`: Standard ABAP for ECC, NetWeaver, and S/4HANA (`sap-abap-standard`), enhancements (`sap-abap-enhancements`), integration with BAPI, RFC, IDoc, and SAP Gateway (`sap-abap-integration`), RAP business objects in ABAP Cloud (`sap-rap-business-object`), clean core assessment (`sap-clean-core-check`), and a reviewer agent; `microsoft-fabric` (incremental merge); `salesforce-platform` (Apex trigger framework) |
| Tests per skill | Acceptance criteria and scenarios with reference answers and negative controls for every skill; generated Vally specs |
| Release-aware ABAP validation | SAP environment registry (ECC 6.0 EHP0 to EHP8, NetWeaver 7.0 to 7.52, S/4HANA 1511 to 2025, Private Edition, ABAP Cloud), abaplint grammar per release, feature rules for gates abaplint misses, tested release fixtures for ABAP statements, `context_files` for objects quoted in prompts. See [sap-environments.md](sap-environments.md) |
| Validation | Schemas, naming, taxonomy, links, references, snippet parsing against the snippet's SAP target, placeholder detection, incubator advisory checks |
| Language validators | abaplint (Standard ABAP and ABAP Cloud, CDS), Apex parser, Python `ast`, `node --check`, JSON, YAML |
| Mock evaluation | Reference, empty-answer, and negative-answer checks with `caught_by`, criteria coverage |
| Vally | Lint for skills and specs, oracle on golden patches, baseline negative control |
| Security | Offline scanner; CodeQL, dependency review, and Scorecard workflows |
| CI | PR validation, security, scheduled quality report, optional live evaluation (disabled by default) |
| Contributor tooling | `new:skill` scaffolder (with SAP metadata for ABAP skills), templates, `export:upstream` for microsoft/skills |
| Community files | Contributing guide, code of conduct, security policy, governance, attribution, issue and PR templates |
| Publication | Public repository [frontier-agent-skills/frontier-agent-skills-plugins](https://github.com/frontier-agent-skills/frontier-agent-skills-plugins) with protected `main` (pull requests and the `static-and-mock` and `scan` checks required), private vulnerability reporting, Dependabot, secret scanning with push protection, and Discussions |

## Next

1. **End-to-end platform verification.** Install each plugin in Claude Code, Cowork, Copilot
   CLI, Codex, Cursor, and Gemini CLI; record results in
   [platform-compatibility.md](platform-compatibility.md).
2. **First tagged release.** Tag `v0.1.0` once the checks pass on GitHub and attach the
   quality reports.
3. **Live system tests (opt-in).** Import the ABAP reference objects into SAP systems (an
   older ECC release and a current S/4HANA release, plus the BTP ABAP environment trial for
   ABAP Cloud), run the SAP syntax check, ABAP Unit, and ATC, and compare with the offline
   release checks. Deploy the Apex sample to a scratch org; run the Fabric notebook in a
   trial capacity. Credentials stay in repository secrets and the jobs never run on forks.
4. **Live model evaluations (opt-in).** Enable the `live-evals` workflow with a Copilot token
   to run the generated Vally specs against real agents and publish scores per skill.
5. **More SAP skills.** CDS view entities and access control, Fiori elements annotations, and
   UI5, split from the remaining incubator material; each with release metadata and tests.
6. **Report abaplint release-gating gaps upstream.** The fixtures document statements that
   abaplint accepts on releases that are too old; sharing them helps every abaplint user.
7. **Migrate incubator skills.** Split the remaining legacy drafts into focused skills with
   tests, in the order given in [incubator/README.md](../incubator/README.md).
8. **More validators.** KQL, DAX, and SQL dialect parsers that run offline.
9. **More vendors.** AWS, Google Cloud, ServiceNow, Workday, Snowflake, and Databricks skills,
   each with a domain owner.
10. **Catalog website.** A static GitHub Pages site generated from `catalog/catalog.json` with
    search and filters.
11. **Release automation.** Per-plugin changelogs, version bump checks when skill content
    changes, and tagged releases.
12. **Directory listings.** Submit plugins to the Claude plugin directory and the external
    plugin list in github/awesome-copilot once end-to-end verification is done.
