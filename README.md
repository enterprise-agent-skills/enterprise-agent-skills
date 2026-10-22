# Enterprise Agent Skills

[Agent Skills](https://agentskills.io) and plugins that make AI coding agents useful on
enterprise platforms, starting with SAP. The `sap-abap` plugin has five ABAP skills (Standard
ABAP; BAdIs and exits; BAPI, RFC, IDoc, and SAP Gateway; RAP business objects; clean core
checks) and an `abap-reviewer` agent, for SAP ECC 6.0, SAP S/4HANA up to 2025, and ABAP Cloud.
Smaller plugins cover incremental loads into Microsoft Fabric lakehouses and Apex triggers on
Salesforce.

Every skill ships with acceptance criteria and test scenarios, including known-bad answers that
the tests must reject. The required checks run in CI without any paid model API key;
[docs/testing.md](docs/testing.md) explains what they prove and what they do not.

This is an independent community project. It is not affiliated with, sponsored by, or endorsed
by SAP, Microsoft, Salesforce, or any other vendor named here.
The maintainer works at Microsoft and runs this project in a personal capacity; Microsoft does not review, support, or endorse it.

## Quick start

Install the SAP plugin in a Claude Code session. The install command opens the plugin's
details, where you choose the scope.

```text
/plugin marketplace add enterprise-agent-skills/enterprise-agent-skills
/plugin install sap-abap@enterprise-agent-skills
```

Or in GitHub Copilot CLI:

```text
copilot plugin marketplace add enterprise-agent-skills/enterprise-agent-skills
copilot plugin install sap-abap@enterprise-agent-skills
```

When you ask for code, name your SAP product and release, for example ECC 6.0 EHP6 or
S/4HANA 2023. The Standard ABAP, enhancement, integration, and RAP skills ask for it if you
leave it out, because what counts as valid ABAP depends on the release. [Install](#install)
covers the other agents and plugins, and
[Download skills as ZIP files](#download-skills-as-zip-files) covers the release downloads.

## Connect the SAP skills to your system

The `sap-abap` plugin bundles `sap-system`, a read-only MCP server that connects to your own
SAP ABAP system (SAP ECC, SAP S/4HANA, or the ABAP Platform trial) over ADT REST and OData v2
with your SAP user. With the connection, the skills read the installed release and support
package from the system instead of asking you for it, and they look up real objects: tables
and their fields, source code, packages, and OData services. The server runs on your machine
and needs Python 3.10 or later with the `mcp` and `httpx` packages; its launcher prints the
install command when they are missing.

You need: the URL of the system's ICM (for example `https://sap.example.com:44300`, or
`http://localhost:50000` for a trial system in Docker), an SAP user with display
authorizations, the client, and Python 3.10 or later on your machine with the two packages:

```text
python -m pip install "mcp>=2,<3" "httpx>=0.28,<1"
```

Then follow the steps for your agent. In every case, test with the question "Which SAP
release is my system?": the skill calls `sap_system_info` and answers with the SAP_BASIS
release and support package.

**Claude Code**

1. Install or update the plugin: `/plugin install sap-abap@enterprise-agent-skills`, or
   `claude plugin update sap-abap@enterprise-agent-skills` if it is already installed.
2. When Claude Code asks for the plugin's settings (on enable, or later under `/config`),
   enter the SAP URL, user, password, client, and logon language. The password goes to
   Claude Code's secure credential store.
3. Restart Claude Code and ask the test question.

**GitHub Copilot CLI**

1. Install the plugin: `copilot plugin marketplace add enterprise-agent-skills/enterprise-agent-skills`,
   then `copilot plugin install sap-abap@enterprise-agent-skills`.
2. Run the one-time setup, which tests the connection and writes the values to a file in your
   user profile (never into the plugin):
   `node ~/.copilot/installed-plugins/enterprise-agent-skills/sap-abap/mcp/sap-system/launch.mjs setup`
3. Start `copilot`, ask the test question, and allow the `sap-system` tools when asked.

**OpenAI Codex, Cursor, and other Agent Plugins hosts**: install the plugin as the
[Install](#install) section shows, run the same setup command from the folder the agent
installed the plugin to, and restart the agent.

**Gemini CLI** asks for the values when the plugin folder is installed as an extension and
keeps the password in the system keychain.

**Microsoft 365 Copilot Cowork** cannot start a local server, so the same server runs in
HTTPS mode on a host you control and Cowork signs in with Microsoft Entra ID. Four steps,
each explained in [docs/copilot-cowork.md](docs/copilot-cowork.md):

1. Deploy the server next to your SAP system with one script: Docker, automatic TLS, port
   443 only ([deploy/sap-system-mcp](deploy/sap-system-mcp/README.md)).
2. Register the sign-in: an app registration in Microsoft Entra ID and an Entra SSO client
   registration in the Teams developer portal. A trial system with demo data can use demo
   mode instead.
3. Build the package: `npm run package:cowork -- --mcp-url https://<host>/mcp --auth OAuthPluginVault --auth-config-id <id>`.
4. In Cowork, open Customize > Plugins > Upload plugin, choose the ZIP, share it, and ask the
   test question.

**Claude Cowork and claude.ai** do not start the server (Cowork does not prompt for the
values, and chat ignores local MCP servers); the skills ask you for the release instead.

The server is read-only by default and sends data only to the SAP URL you configure. Your
credentials stay on your machine, in the agent's credential store or in that file, never in
the plugin or in this repository. Prefer an HTTPS URL; use `http://` only for a trial system
on the same machine. The [plugin README](plugins/sap-abap/README.md#data-and-permissions)
names the file location and the environment variables, the server itself is in
[plugins/sap-abap/mcp/sap-system](plugins/sap-abap/mcp/sap-system), and
[docs/sap-mcp-servers.md](docs/sap-mcp-servers.md) compares it with other MCP servers for
SAP systems.

## Install

<!-- BEGIN GENERATED: plugins (edit with npm run build) -->
| Plugin | Works with | Skills | Install name | Maturity |
| --- | --- | --- | --- | --- |
| [ABAP development skills for SAP S/4HANA, SAP ECC, and SAP BTP](plugins/sap-abap/README.md) | SAP | `sap-abap-standard`, `sap-abap-enhancements`, `sap-abap-integration`, `sap-rap-business-object`, `sap-clean-core-check` | `sap-abap@enterprise-agent-skills` | beta |
| [Lakehouse data engineering skills for Microsoft Fabric](plugins/microsoft-fabric/README.md) | Microsoft | `fabric-lakehouse-incremental-merge` | `microsoft-fabric@enterprise-agent-skills` | beta |
| [Apex development skills for Salesforce](plugins/salesforce-platform/README.md) | Salesforce | `salesforce-apex-trigger-framework` | `salesforce-platform@enterprise-agent-skills` | beta |

The commands below install the `sap-abap` plugin; the `npx skills` line installs only its `sap-abap-standard` skill. For another plugin, replace `sap-abap` with `microsoft-fabric` or `salesforce-platform`; every install name has the form `<plugin>@enterprise-agent-skills`. For another skill, replace `sap-abap-standard` with any skill name from the catalog below.

```text
# Claude Code
/plugin marketplace add enterprise-agent-skills/enterprise-agent-skills
/plugin install sap-abap@enterprise-agent-skills

# GitHub Copilot CLI
copilot plugin marketplace add enterprise-agent-skills/enterprise-agent-skills
copilot plugin install sap-abap@enterprise-agent-skills

# OpenAI Codex CLI (the Codex IDE extension does not support plugins)
codex plugin marketplace add enterprise-agent-skills/enterprise-agent-skills
# then enter /plugins in Codex, install sap-abap, and start a new session

# Any Agent Skills compatible agent (Copilot in VS Code, Cursor, Gemini CLI, and others)
npx skills add enterprise-agent-skills/enterprise-agent-skills --skill sap-abap-standard
```

Claude Cowork and claude.ai: Customize > Plugins > Add > Add marketplace, then enter `https://github.com/enterprise-agent-skills/enterprise-agent-skills`.

To update:

- Claude Code: run `claude plugin update sap-abap@enterprise-agent-skills` in your shell, or open the plugin on the **Installed** tab of `/plugin` and select **Update now**. Claude Code does not update plugins from this marketplace automatically unless you turn it on: select `enterprise-agent-skills` on the **Marketplaces** tab of `/plugin`, then **Enable auto-update**.
- GitHub Copilot CLI: run `copilot plugin update sap-abap`.
- Claude Cowork and claude.ai: in Customize > Plugins, select **Check for updates**, or turn on **Sync automatically** for this marketplace.
- Skills installed with `npx skills`: run `npx skills update sap-abap-standard`.
<!-- END GENERATED: plugins -->

Install only the plugins you need. Every skill an agent loads takes up context, and unrelated
skills make the agent's choices less reliable. Every release also has ZIP files of each skill
and plugin; see [Download skills as ZIP files](#download-skills-as-zip-files).

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

Planned: skills for Amazon Web Services, Google Cloud, ServiceNow, Workday, Snowflake, Databricks, and Oracle. See [CONTRIBUTING.md](CONTRIBUTING.md) to propose one.
<!-- END GENERATED: catalog -->

A machine-readable index of every plugin and skill is in [catalog/catalog.json](catalog/catalog.json),
and an agent-friendly summary is in [llms.txt](llms.txt).

## Download skills as ZIP files

Each [GitHub release](https://github.com/enterprise-agent-skills/enterprise-agent-skills/releases)
of this repository attaches these files:

| File | Contents |
|------|----------|
| `<skill>.zip`, for example `sap-abap-standard.zip` | One skill, with `SKILL.md` and its supporting files |
| `plugin-<plugin>.zip`, for example `plugin-sap-abap.zip` | One plugin, with its skills, any agents, and the manifests for every platform |
| `<skill>-copilot-cowork.zip`, for example `sap-abap-standard-copilot-cowork.zip` | The same skill with `SKILL.md` at the root of the ZIP, for Microsoft 365 Copilot Cowork |
| `plugin-<plugin>-copilot-cowork.zip`, for example `plugin-sap-abap-copilot-cowork.zip` | The same plugin with its manifests at the root of the ZIP, for Microsoft 365 Copilot Cowork |
| `all-skills.zip` | Every skill |
| `SHA256SUMS.txt` | The SHA-256 checksum of each ZIP file |
| `provenance.sigstore.json` | Signed build provenance for the ZIP files |

A skill or plugin ZIP holds one folder named after the skill or plugin, with `LICENSE.txt`
inside; `all-skills.zip` holds one such folder per skill. The `-copilot-cowork.zip` files hold
the same files without that folder, because Microsoft 365 Copilot Cowork looks for `SKILL.md`
at the root of the ZIP, while Claude's skill upload looks for it inside the folder.

Prefer a marketplace install from [Install](#install) where your agent supports one: it can be
updated from the agent, while a ZIP stays at the release you downloaded. Skill ZIPs are for
agents that read skills from a folder or accept a skill upload. Plugin ZIPs are for products
that load a whole plugin from a folder or an uploaded archive, such as claude.ai and Claude Code.

| Product | What to do with a skill ZIP |
|---------|-----------------------------|
| Microsoft 365 Copilot Cowork | Use the `-copilot-cowork.zip` files. In Cowork, open Customize > Skills, select the arrow next to Add, then Upload skill, and choose for example `sap-abap-standard-copilot-cowork.zip`. Cowork saves the skill to your OneDrive and uses it from your next conversation. For a whole plugin, open Customize > Plugins > Upload plugin and choose for example `plugin-sap-abap-copilot-cowork.zip`; Cowork converts Claude plugin packages and asks who in your organization may use the plugin. Custom skills do not work in Cowork on mobile. |
| claude.ai and the Claude desktop app, including Claude Cowork | In Customize > Skills, select +, then Create skill, then Upload a skill, and choose the ZIP. Then turn the skill on. Skills need a Pro, Max, Team, or Enterprise plan and Code execution and file creation turned on in Settings > Capabilities; on Team and Enterprise plans, an Owner turns it on in Organization settings > Capabilities. A plugin ZIP goes in Customize > Plugins > Add > Upload plugin. |
| Claude Code | Unzip into `~/.claude/skills/` for all projects or `.claude/skills/` for one project. To load a plugin ZIP for one session, start Claude Code with `claude --plugin-dir ./plugin-sap-abap.zip`. |
| GitHub Copilot CLI | Unzip into `~/.copilot/skills/` or `~/.agents/skills/` for all projects, or into `.github/skills/`, `.agents/skills/`, or `.claude/skills/` in a project. |
| GitHub Copilot in VS Code | Unzip into `~/.copilot/skills/`, `~/.agents/skills/`, or `~/.claude/skills/` for all projects, or into `.github/skills/`, `.agents/skills/`, or `.claude/skills/` in a project. |
| OpenAI Codex (CLI, IDE extension, and ChatGPT desktop app) | Unzip into `~/.agents/skills/` for all projects or `.agents/skills/` in a repository. |
| Cursor | Unzip into `~/.agents/skills/` or `~/.cursor/skills/` for all projects, or into `.agents/skills/` or `.cursor/skills/` in a project. |
| Gemini CLI | Unzip into `~/.gemini/skills/` or `~/.agents/skills/` for all projects, or into `.gemini/skills/` or `.agents/skills/` in a workspace. |
| Other agents that read Agent Skills | Use the `npx skills add` command under [Install](#install). |

To add every skill at once, unzip `all-skills.zip` into one of these folders; on claude.ai,
upload the single skill ZIPs instead. In Microsoft 365 Copilot Cowork, upload each
`-copilot-cowork.zip` file, or copy skill folders from `all-skills.zip` into
`/Documents/Cowork/skills/` in your OneDrive (up to 50 custom skills). The `abap-reviewer` agent is only in
`plugin-sap-abap.zip`. Agents load in Claude Code and Cowork; claude.ai chat ignores them.

To check a download, run one of these commands in the folder that holds the ZIP files and
`SHA256SUMS.txt`. With `--ignore-missing`, files you did not download are skipped.

| System | Command |
|--------|---------|
| Linux | `sha256sum -c --ignore-missing SHA256SUMS.txt` |
| macOS | `shasum -a 256 -c --ignore-missing SHA256SUMS.txt` |
| Windows PowerShell | `Get-FileHash <file> -Algorithm SHA256`, then compare the hash with the file's line in `SHA256SUMS.txt`; letter case does not matter |

To check that a ZIP was built by a GitHub Actions workflow in this repository, run
`gh attestation verify <file> --repo enterprise-agent-skills/enterprise-agent-skills` with the
[GitHub CLI](https://cli.github.com).

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

For SAP, every scenario and every ABAP or CDS sample has a target system, from ECC 6.0 on
SAP_BASIS 7.00 to S/4HANA 2025 or ABAP Cloud. ABAP and CDS samples that start with a file marker,
in the skills, the acceptance criteria, and the test answers, are parsed for their target
release. The abaplint parser uses the grammar of that release, or the nearest older one where
abaplint has none. Release and database rules catch what the grammar lets through, such as AMDP
on a database other than SAP HANA. The release checks have their own unit tests: for each
feature in `config/abap-language-features.yaml`, a program that uses it must fail on the release
before SAP introduced the feature and pass on that release and on S/4HANA 2025.

All of this holds within the limits listed in
[What the offline checks cannot prove](docs/sap-environments.md#what-the-offline-checks-cannot-prove)
and in the [Validators](docs/testing.md#validators) section of docs/testing.md. There is no SAP
system in CI, so activation, ATC, and ABAP Unit still need your own system. Behavior definitions
are checked only by the release rules. Metadata extensions, service definitions, and code blocks
without a file marker are not parsed. `line_exists( )` passes the offline check only from
7.40 SP08, although SAP supports it from SP02.

## Platform support

| Platform | How this repository supports it | Status |
|----------|---------------------------------|--------|
| Claude Code | `.claude-plugin/plugin.json` per plugin, `.claude-plugin/marketplace.json` | Installed from the marketplace and used on 2026-10-21 (`sap-abap` 0.2.0) |
| Claude Cowork and claude.ai | Same plugin folders through the marketplace | Generated; not yet verified end to end |
| Microsoft 365 Copilot Cowork | Skill and plugin ZIPs with the files at the root (`-copilot-cowork.zip` release assets) | Packaged; not yet verified end to end |
| GitHub Copilot CLI | Agent Plugins `plugin.json`, `.github/plugin/marketplace.json` | Installed from the marketplace and used on 2026-10-21 (`sap-abap` 0.2.0); see the notes in [platform-compatibility.md](docs/platform-compatibility.md#recording-a-verification) |
| GitHub Copilot in VS Code, Cursor, Gemini CLI, others | `npx skills add`, plus `.cursor-plugin` and `gemini-extension.json` manifests | Generated; not yet verified end to end |
| OpenAI Codex | Agent Plugins `plugin.json`, `.agents/plugins/marketplace.json` | Generated; not yet verified end to end |

Details, sources, and the verification plan are in [docs/platform-compatibility.md](docs/platform-compatibility.md),
including how each platform starts and configures the bundled `sap-system` MCP server
([Bundled MCP server](docs/platform-compatibility.md#bundled-mcp-server)).

## Repository layout

```text
plugins/<plugin>/plugin.yaml            Plugin source of truth (edit this)
plugins/<plugin>/skills/<skill>/        Agent Skills: SKILL.md plus references/, scripts/, assets/
plugins/<plugin>/agents/                Optional custom agents (*.agent.md)
plugins/<plugin>/mcp/<server>/          MCP servers published from this repository (sap-abap: sap-system)
plugins/<plugin>/*.json, .*-plugin/     Generated platform manifests (do not edit)
tests/scenarios/<skill>/                acceptance-criteria.md, scenarios.yaml, generated vally/eval.yaml
tests/harness/                          Mock evaluator and language validators
mcp/servers.yaml                        Curated MCP servers that plugins may bundle or document, including the bundled ones
config/                                 SAP environment registry, ABAP release features, domain and security allowlists
schemas/                                JSON schemas, including vendored Agent Plugins schemas
LICENSES/                               Full texts of third-party licenses (Apache-2.0); see ATTRIBUTION.md
scripts/                                Build, validation, security, Vally, packaging, export tooling
incubator/                              Notes on legacy drafts; the drafts themselves are not published
docs/                                   Architecture, testing, SAP environments, platform support, contributor guides
dist/                                   Release ZIPs built by npm run package (not committed)
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In short: open an issue with the Skill proposal
template, scaffold with `npm run new:skill`, write acceptance criteria and scenarios with at
least one known-bad answer per scenario, run `npm run check` and `npm run eval:vally`, and open a
pull request. For an SAP skill, the proposal names the SAP products, the release range, and the
SAP documentation you will rely on.

Skills that are specific to Microsoft products are written so they can be proposed to
[microsoft/skills](https://github.com/microsoft/skills) with little rework; see
[docs/upstream-contributions.md](docs/upstream-contributions.md).

## Trademarks

SAP, ABAP, SAP Fiori, SAP HANA, SAP NetWeaver, SAP S/4HANA, and other SAP products and services
mentioned here are trademarks or registered trademarks of SAP SE (or an SAP affiliate company) in
Germany and other countries. Microsoft, Azure, GitHub Copilot, Microsoft Fabric, and Power BI are
trademarks of the Microsoft group of companies. Salesforce and Apex are trademarks of
Salesforce, Inc. Other names are trademarks of their owners. They are used here only to identify
the products the skills work with.

## License

[MIT](LICENSE), except the third-party files listed in [ATTRIBUTION.md](ATTRIBUTION.md), which
keep their own licenses.
