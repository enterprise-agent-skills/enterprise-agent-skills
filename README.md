# Frontier Agent Skills and Plugins

Agent Skills and plugins for enterprise platforms such as SAP, Microsoft, and Salesforce, with
AWS, Google Cloud, and others to follow. One source folder per plugin installs in Claude Code,
Claude Cowork, GitHub Copilot, OpenAI Codex, Cursor, Gemini CLI, and any agent that reads the
open [Agent Skills](https://agentskills.io) format.

Every skill ships with acceptance criteria and test scenarios. The required checks run in CI
without any paid model API key: schema validation, language parsers for every code sample,
mock evaluations with negative controls, Microsoft Vally lint and oracle runs, and a security
scan. [docs/testing.md](docs/testing.md) explains exactly what those checks prove and what they
do not.

This is an independent community project. It is not affiliated with, sponsored by, or endorsed
by SAP, Microsoft, Salesforce, or any other vendor named here.

## Install

<!-- BEGIN GENERATED: plugins (edit with npm run build) -->
| Plugin | Vendor | Skills | Install name | Maturity |
| --- | --- | --- | --- | --- |
| [ABAP development skills for SAP S/4HANA, SAP ECC, and SAP BTP](plugins/sap-abap/README.md) | SAP | `sap-abap-standard`, `sap-abap-enhancements`, `sap-abap-integration`, `sap-rap-business-object`, `sap-clean-core-check` | `sap-abap@frontier-agent-skills` | beta |
| [Microsoft Fabric Data Engineering](plugins/microsoft-fabric/README.md) | Microsoft | `fabric-lakehouse-incremental-merge` | `microsoft-fabric@frontier-agent-skills` | beta |
| [Salesforce Platform Development](plugins/salesforce-platform/README.md) | Salesforce | `salesforce-apex-trigger-framework` | `salesforce-platform@frontier-agent-skills` | beta |

```text
# Claude Code
/plugin marketplace add frontier-agent-skills/frontier-agent-skills-plugins
/plugin install <plugin>@frontier-agent-skills

# GitHub Copilot CLI
copilot plugin marketplace add frontier-agent-skills/frontier-agent-skills-plugins
copilot plugin install <plugin>@frontier-agent-skills

# OpenAI Codex (then open /plugins)
codex plugin marketplace add frontier-agent-skills/frontier-agent-skills-plugins

# Any Agent Skills compatible agent (Copilot in VS Code, Cursor, Gemini CLI, and others)
npx skills add frontier-agent-skills/frontier-agent-skills-plugins --skill <skill>
```

Claude Cowork and claude.ai: Customize > Plugins > Add > Add marketplace, then enter `https://github.com/frontier-agent-skills/frontier-agent-skills-plugins`.
<!-- END GENERATED: plugins -->

Install only the plugins you need. Every skill an agent loads takes up context, and unrelated
skills make the agent's choices less reliable.

## Skill catalog

<!-- BEGIN GENERATED: catalog (edit with npm run build) -->
### SAP

SAP skills state the systems and the ABAP development model they target. Where SAP runs (on premises or on Azure, AWS, or Google Cloud VMs) does not change which skill applies. See [docs/sap-environments.md](docs/sap-environments.md).

| Skill | What it does | SAP systems | ABAP model | Category | Maturity | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| [sap-abap-standard](plugins/sap-abap/skills/sap-abap-standard/SKILL.md) | Write, fix, and review Standard ABAP for customer-managed SAP systems: SAP ECC 6.0, SAP NetWeaver AS ABAP, and SAP S/4HANA, on premises or on Azure, AWS, or Google Cloud VMs. Covers reports and ALV, ABAP Objects, DDIC objects, ABAP SQL and HANA-aware performance, authorization checks, error handling, ABAP Unit, ATC, transports, and troubleshooting, using only syntax the target release supports. | SAP ECC 6.0, SAP NetWeaver AS ABAP, SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition; SAP_BASIS 7.00+ | Standard ABAP | Development | beta | 4 scenarios, 6 negative controls |
| [sap-abap-enhancements](plugins/sap-abap/skills/sap-abap-enhancements/SKILL.md) | Choose and build enhancements of SAP standard code in Standard ABAP on SAP ECC 6.0 and SAP S/4HANA: Customizing first, then BAdIs and exits, modifications last. Covers kernel BAdIs (enhancement spots, filters, fallback classes, GET BADI, CALL BADI), classic BAdIs, customer exits (SMOD, CMOD), SD user exits such as MV45AFZZ, source code plug-ins, class and function module enhancements, LUW rules in exits, release limits from SAP_BASIS 7.00 to 8.16, SPAU and SPAU_ENH, and clean core levels. | SAP ECC 6.0, SAP NetWeaver AS ABAP, SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition; SAP_BASIS 7.00+ | Standard ABAP | Development | beta | 7 scenarios, 28 negative controls |
| [sap-abap-integration](plugins/sap-abap/skills/sap-abap-integration/SKILL.md) | Write and review integration code in Standard ABAP on SAP ECC 6.0, SAP NetWeaver AS ABAP, and SAP S/4HANA: BAPI calls with RETURN checks and caller commit, BAPI-style RFC function modules, synchronous, asynchronous, and background RFC (tRFC, qRFC, bgRFC), IDocs with ALE and EDI, and SAP Gateway OData V2 services built in SEGW, using only syntax and APIs the target release supports. | SAP ECC 6.0, SAP NetWeaver AS ABAP, SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition; SAP_BASIS 7.00+ | Standard ABAP | Integration | beta | 7 scenarios, 24 negative controls |
| [sap-rap-business-object](plugins/sap-abap/skills/sap-rap-business-object/SKILL.md) | Build a managed RAP business object with draft for SAP Fiori elements on ABAP Cloud: database table, CDS view entities, behavior definition, behavior pool, projection layer, service definition, and service binding. | SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition, SAP S/4HANA Cloud Public Edition, SAP BTP ABAP environment; SAP_BASIS 7.57+ | ABAP Cloud | Development | beta | 4 scenarios, 7 negative controls |
| [sap-clean-core-check](plugins/sap-abap/skills/sap-clean-core-check/SKILL.md) | Assess custom ABAP code for ABAP Cloud and clean core readiness: find SAP objects that are not released, look up their successors in SAP's Cloudification Repository, and rewrite code to use released APIs. | SAP ECC 6.0, SAP NetWeaver AS ABAP, SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition, SAP S/4HANA Cloud Public Edition, SAP BTP ABAP environment; SAP_BASIS 7.00+ | Standard ABAP, ABAP Cloud | Code quality and review | beta | 2 scenarios, 4 negative controls |

### Microsoft

| Skill | What it does | Prerequisites | Category | Maturity | Tests |
| --- | --- | --- | --- | --- | --- |
| [fabric-lakehouse-incremental-merge](plugins/microsoft-fabric/skills/fabric-lakehouse-incremental-merge/SKILL.md) | Load data incrementally into Microsoft Fabric Lakehouse Delta tables from a notebook with PySpark: watermark-based extraction, de-duplication, idempotent MERGE upserts, secrets from Azure Key Vault, and table maintenance. | Microsoft Fabric workspace with a Lakehouse and a Fabric Spark runtime that includes Delta Lake (runtime 1.3 or later). A Fabric notebook attached to the target Lakehouse. Azure Key Vault access for any source credentials. | Data engineering and analytics | beta | 3 scenarios, 4 negative controls |

### Salesforce

| Skill | What it does | Prerequisites | Category | Maturity | Tests |
| --- | --- | --- | --- | --- | --- |
| [salesforce-apex-trigger-framework](plugins/salesforce-platform/skills/salesforce-apex-trigger-framework/SKILL.md) | Implement Apex triggers with the one-trigger-per-object handler pattern: bulk-safe logic, recursion control that works across 200-record chunks, user-mode data access, field-level errors, and unit tests with full batches. | Salesforce org with Apex enabled (Developer Edition, sandbox, or scratch org) and API version 60.0 or later for WITH USER_MODE, AccessLevel.USER_MODE, and the Assert class. Salesforce CLI (sf) to deploy and run tests. | Development | beta | 2 scenarios, 5 negative controls |

No skills yet for: Amazon Web Services, Google Cloud, ServiceNow, Workday, Snowflake, Databricks, Oracle. See [CONTRIBUTING.md](CONTRIBUTING.md) to propose one.
<!-- END GENERATED: catalog -->

A machine-readable index of every plugin and skill is in [catalog/catalog.json](catalog/catalog.json),
and an agent-friendly summary is in [llms.txt](llms.txt).

## How skills are tested

| Check | Command | Needs credentials |
|-------|---------|-------------------|
| Generated manifests match their sources | `npm run build:check` | No |
| Skill, plugin, scenario, and link validation | `npm run validate` | No |
| Security hygiene (secrets, hidden characters, risky commands) | `npm run security` | No |
| Unit tests for the tooling, including negative fixtures | `npm run test:unit` | No |
| Mock evaluation: reference answers, negative controls, criteria coverage | `npm run eval:mock` | No |
| Vally lint, oracle on golden answers, baseline negative control | `npm run eval:vally` | No |
| Live model evaluation | see [docs/testing.md](docs/testing.md) | Yes, optional, off by default |

`npm run check` runs every credential-free check except Vally (Vally downloads its CLI on first
use). Reports are written to `reports/` as Markdown and JSON.

The mock evaluation does not measure how well a model uses a skill. It proves that each
skill's reference answers are correct according to the skill's own rules and real language
parsers, that the checks reject documented bad answers, and that every "Incorrect" example in
the acceptance criteria is caught by a test. Those properties make later live evaluations
meaningful.

For SAP, every ABAP sample and test answer names its target system, from ECC 6.0 on SAP_BASIS
7.00 to S/4HANA 2025, and is parsed with the grammar of that release. Code that uses syntax the
release does not have, or an SAP HANA feature on another database, fails the check. The release
rules are themselves tested against SAP's release documentation; see
[docs/sap-environments.md](docs/sap-environments.md).

## Platform support

| Platform | How this repository supports it | Status |
|----------|---------------------------------|--------|
| Claude Code | `.claude-plugin/plugin.json` per plugin, `.claude-plugin/marketplace.json` | Manifests validated with `claude plugin validate` locally |
| Claude Cowork and claude.ai | Same plugin folders through the marketplace | Generated; not yet verified end to end |
| GitHub Copilot CLI | Agent Plugins `plugin.json`, `.github/plugin/marketplace.json` | Generated; not yet verified end to end |
| GitHub Copilot in VS Code, Cursor, Gemini CLI, others | `npx skills add`, plus `.cursor-plugin` and `gemini-extension.json` manifests | Generated; not yet verified end to end |
| OpenAI Codex | Agent Plugins `plugin.json`, `.agents/plugins/marketplace.json` | Generated; not yet verified end to end |

Details, sources, and the verification plan are in [docs/platform-compatibility.md](docs/platform-compatibility.md).

## Repository layout

```text
plugins/<plugin>/plugin.yaml            Plugin source of truth (edit this)
plugins/<plugin>/skills/<skill>/        Agent Skills: SKILL.md plus references/, scripts/, assets/
plugins/<plugin>/agents/                Optional custom agents (*.agent.md)
plugins/<plugin>/*.json, .*-plugin/     Generated platform manifests (do not edit)
tests/scenarios/<skill>/                acceptance-criteria.md, scenarios.yaml, generated vally/eval.yaml
tests/harness/                          Mock evaluator and language validators
mcp/servers.yaml                        Curated MCP servers that plugins may bundle or document
config/                                 SAP environment registry, ABAP release features, domain and security allowlists
schemas/                                JSON schemas, including vendored Agent Plugins schemas
scripts/                                Build, validation, security, Vally, export tooling
incubator/                              Drafts that are not yet published
docs/                                   Architecture, testing, contributing guides
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In short: open an issue with the skill proposal,
scaffold with `npm run new:skill`, write acceptance criteria and scenarios with at least one
known-bad answer, run `npm run check` and `npm run eval:vally`, and open a pull request.

Skills that are specific to Microsoft products are written so they can be proposed to
[microsoft/skills](https://github.com/microsoft/skills) with little rework; see
[docs/upstream-contributions.md](docs/upstream-contributions.md).

## Trademarks

SAP, ABAP, SAP Fiori, and SAP S/4HANA are trademarks of SAP SE. Microsoft, Microsoft Fabric,
Azure, Power BI, and GitHub Copilot are trademarks of the Microsoft group of companies.
Salesforce and Apex are trademarks of Salesforce, Inc. Other names are trademarks of their
owners. They are used here only to identify the products the skills work with.

## License

[MIT](LICENSE). Third-party material and its licenses are listed in [ATTRIBUTION.md](ATTRIBUTION.md).
