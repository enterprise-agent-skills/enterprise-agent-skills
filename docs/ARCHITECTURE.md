# Architecture

This document describes how the repository is organized, why, and where to extend it.

## Goals

1. One source folder per plugin that installs in every major agent with minimal tuning.
2. Every skill carries evidence: acceptance criteria, scenarios, and checks that run without
   paid model credentials.
3. Contributors can add a skill without learning the tooling internals.
4. Microsoft-specific skills can move to github.com/microsoft/skills with little rework.
5. Nothing published can harm users silently: no hidden instructions, no unreviewed code
   execution, no credentials.

## Layers

```text
Source (edited by people)          Generated (npm run build)                    Consumed by
-------------------------          -------------------------                    -----------
repo.config.yaml                   README.md catalog regions, llms.txt          People, search, LLM crawlers
plugins/<p>/plugin.yaml      --->  plugins/<p>/plugin.json (Agent Plugins 1.0)  Copilot CLI, Codex, Agent Plugins clients
                                   plugins/<p>/.claude-plugin/plugin.json       Claude Code, Cowork, claude.ai
                                   plugins/<p>/.cursor-plugin/plugin.json       Cursor
                                   plugins/<p>/gemini-extension.json            Gemini CLI
mcp/servers.yaml             --->  plugins/<p>/mcp.json, .mcp.json              Agent Plugins clients, Claude Code, Cursor
plugins/<p>/agents/*.agent.md ---> plugins/<p>/com.github.copilot/agents/       Copilot (Agent Plugins mode); Claude reads agents/
all plugins                  --->  .claude-plugin/marketplace.json              Claude Code, Cowork, npx skills, Copilot CLI fallback
                                   .github/plugin/marketplace.json              Copilot CLI
                                   .agents/plugins/marketplace.json             Codex
                                   catalog/catalog.json                         Tools, future website
tests/scenarios/<s>/scenarios.yaml ---> tests/scenarios/<s>/vally/eval.yaml     Vally (offline oracle now, live later)
```

`npm run build:check` fails CI when any generated file differs from what the sources produce,
so generated files never drift.

## Why skills live inside plugin folders

Plugin installers copy a plugin folder into a cache, and the Agent Plugins format discovers
skills only in `skills/` directly under the plugin root. Skills must therefore be physically
inside their plugin. This also matches microsoft/skills (`.github/plugins/<plugin>/skills/`).
The `npx skills` installer finds them through `metadata.pluginRoot` and `plugins[].skills` in
`.claude-plugin/marketplace.json`. Each skill belongs to exactly one plugin and skill names
are unique across the repository, because Copilot and `npx skills` deduplicate by name.

## Why a separate plugin.yaml

Each platform wants a slightly different manifest, and the Agent Plugins schema is closed, so
catalog data (vendor, category, maturity, upstream status) cannot sit in `plugin.json`. One
YAML source with comments, validated by `schemas/plugin-source.schema.json`, generates all of
them. A plugin author edits one file.

## Skill format

`SKILL.md` uses only Agent Skills specification fields at the top level (`name`,
`description`, `license`, `compatibility`, `metadata`, `allowed-tools`), so a skill folder
copied anywhere stays valid. Repository data lives under `metadata` (`vendor`, `product`,
`category`, `maturity`, `version`, optional `last-verified`, `authors`, `upstream-source`).
Descriptions follow the microsoft/skills pattern: what the skill does, `USE FOR:` triggers,
`DO NOT USE FOR:` anti-triggers. `compatibility` holds prerequisites.

## Testing layers

| Layer | Tool | Runs | Proves |
|-------|------|------|--------|
| Generated files in sync | `build:check` | every PR | Manifests and catalog match sources |
| Structure | `validate` | every PR | Schemas, naming, taxonomy, links, references, size limits, placeholders |
| Snippets | `validate` | every PR | JSON/YAML in skills parse; marked code samples pass language parsers |
| Security | `security` | every PR | No secrets, hidden characters, or risky commands in shipped content |
| Tooling | `test:unit` | every PR | Parsers, validators, evaluator, rules, and the bundled script behave, including negative fixtures |
| Mock evaluation | `eval:mock` | every PR | Reference answers pass; empty and known-bad answers fail for the intended reason; criteria and tests agree |
| Vally offline | `eval:vally` | every PR | Skills pass Vally lint; golden patches pass graders; graders fail without them |
| Live model | Vally with Copilot token | manual, off by default | How a model performs with the skill loaded |
| Live system | planned | manual | Code activates and runs on a real SAP, Salesforce, or Fabric system |

Details are in [testing.md](testing.md).

## Release-aware ABAP validation

SAP customers run many releases at once: ECC 6.0 on SAP_BASIS 7.00 to 7.50, S/4HANA 1511 to
2025 on 7.50 to 8.16, on premises, on IaaS, or in SAP's private cloud. ABAP that compiles on
one release fails on an older one, so every ABAP sample and test answer is validated against a
named target.

```text
config/sap-environments.yaml        products, releases -> SAP_BASIS, abaplint grammar per
                                    release, feature rules (release and database gates)
config/abap-language-features.yaml  ABAP features with the release SAP introduced them in,
                                    plus a program using each and its older equivalent
tests/harness/sap-env.mjs           resolves an environment, applies feature rules
tests/harness/validators.mjs        runs abaplint with the grammar for that environment
tests/unit/abap-release-features    proves each feature fails before its release and passes from it
```

Where SAP runs is recorded but never changes validation. abaplint has no grammar for some
releases and accepts some statements earlier than SAP does; the registry maps such releases
down to an older grammar, and feature rules close the known gaps. Both are tested, so a change
in abaplint's behavior shows up as a failing unit test rather than as silently wrong advice.
[sap-environments.md](sap-environments.md) has the full matrix, generated from the registry.

## Security model

Shipped content (everything under `plugins/`) is treated as executable. The scanner blocks
secret patterns, invisible Unicode, pipe-to-shell downloads, TLS bypasses, destructive
commands, and instruction-override phrasing. Plugins cannot ship hooks or `bin/`. MCP servers
come only from `mcp/servers.yaml`, must be vendor-published and version-pinned, and may be
bundled only when they need no credentials. Bundled scripts are listed for human review.
Workflows use read-only tokens unless a job needs more, and actions are pinned to commit SHAs.

## Decisions

| Decision | Reason |
|----------|--------|
| Plain Node.js tooling with five dependencies, no TypeScript build | Easy to read and run on any machine; nothing to compile |
| Scenario schema as a superset of microsoft/skills | Upstream export removes fields instead of rewriting tests |
| Mock evaluation with negative controls and `caught_by` | A mock-only harness can pass vacuously; negative controls prove each check rejects bad output |
| Language parsers instead of LLM judges in required CI | Deterministic, free, and they catch real errors |
| Vally oracle plus `--no-golden-input` baseline | Uses the same graders a live run will use, and proves they are not trivially passing |
| `incubator/` for legacy drafts | Keeps earlier work without publishing content that does not meet the bar |
| Explicit SAP target for every ABAP sample, release facts in a tested registry | The same ABAP is right on S/4HANA 2023 and wrong on ECC 6.0 EHP6; release claims must be checkable, not remembered |
| Vendor-neutral name and no vendor logos | Avoids trademark problems and implied endorsement |

## Extension points

- New language validator: add it to `tests/harness/validators.mjs`, map file extensions, and
  add positive and negative unit tests.
- New platform manifest: add a generator in `scripts/lib/generate.mjs`, a schema in
  `schemas/platform/`, and a row in [platform-compatibility.md](platform-compatibility.md).
- New vendor or category: add it to `repo.config.yaml`.
- New SAP release: add it to `config/sap-environments.yaml` (release, SAP_BASIS, grammar
  mapping) and a release point in `tests/unit/abap-release-features.test.mjs`.
- New ABAP release gate: add the feature to `config/abap-language-features.yaml` with the SAP
  source; if abaplint does not enforce it, add a feature rule in
  `config/sap-environments.yaml`. The unit tests and the generated table in
  `release-syntax.md` pick it up.
