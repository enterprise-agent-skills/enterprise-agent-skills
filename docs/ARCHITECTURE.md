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
plugin and skill folders     --->  dist/ (npm run package, not committed)       GitHub release assets for each v* tag
```

`npm run build:check` fails CI when any generated file differs from what the sources produce,
so generated files never drift. Release packages are the exception: they are built from the
tagged commit and attached to the GitHub release, never committed (see
[Packaging and releases](#packaging-and-releases)).

## Why skills live inside plugin folders

Plugin installers copy a plugin folder into a cache, and the Agent Plugins format discovers
skills only in `skills/` directly under the plugin root. Skills must therefore be physically
inside their plugin. This also matches microsoft/skills (`.github/plugins/<plugin>/skills/`).
The `npx skills` installer also reads the skill paths declared in
`.claude-plugin/marketplace.json`. Its documentation (checked 2026-10-21) says that it searches
the repository recursively when its standard locations hold no skill, and that `--full-depth`
also finds `SKILL.md` files outside those locations. A `SKILL.md` elsewhere in the repository
can therefore appear in its skill list, which is one reason legacy drafts are kept out of the
repository. Each skill belongs to exactly one plugin and skill names are unique across the
repository, because Copilot and `npx skills` deduplicate by name.

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
one release fails on an older one, so ABAP and CDS samples that start with a file marker, in
skills and in test answers, are validated against a named target.

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

## Packaging and releases

`scripts/package.mjs` turns the plugin folders into downloadable ZIP files: one per skill
(`<skill>.zip`), one per plugin (`plugin-<plugin>.zip`), and `all-skills.zip`. A skill or plugin
ZIP holds one top-level folder named after it; `all-skills.zip` holds every skill folder at the
top level. The `-copilot-cowork.zip` variants hold the same files at the archive root, because
Microsoft 365 Copilot Cowork's upload looks for `SKILL.md` there, while Claude's skill upload
requires the folder. Every skill or plugin folder in an archive gets `LICENSE.txt`, a copy of the
repository license: the MIT License asks for its notice in every copy, and installs copy only
that folder. The script also writes `SHA256SUMS.txt` and `RELEASE_NOTES.md`. The ZIP writer
(`scripts/lib/zip.mjs`) sorts entries and fixes timestamps and permissions, so the same files
give the same bytes with the same Node.js version. Locally, `npm run package` writes to
`dist/`, which Git ignores.

Pushing a tag that starts with `v` runs `.github/workflows/release.yml`, which stops unless the
tag points at a commit on `main`. Its two jobs keep the token that can write away from
repository and dependency code:

```text
build    read-only token   npm ci --ignore-scripts, npm run check, npm run package; tests
                           every ZIP and the checksums; uploads dist/ as a workflow artifact
publish  can write         downloads the artifact, attests build provenance of the ZIP files,
                           creates the GitHub release with RELEASE_NOTES.md as its text
```

The release assets and how to check a download are listed in
[publishing.md](publishing.md#releases).

## Decisions

| Decision | Reason |
|----------|--------|
| Plain Node.js tooling with five dependencies, no TypeScript build | Easy to read and run on any machine; nothing to compile |
| Scenario schema as a superset of microsoft/skills | Upstream export removes fields instead of rewriting tests |
| Mock evaluation with negative controls and `caught_by` | A mock-only harness can pass vacuously; negative controls prove each check rejects bad output |
| Language parsers instead of LLM judges in required CI | Deterministic, free, and they catch real errors |
| Vally oracle plus `--no-golden-input` baseline | Uses the same graders a live run will use, and proves they are not trivially passing |
| Legacy drafts are not part of the repository; `incubator/` holds only a README | Earlier drafts are migrated into focused skills with tests before they are published, so nothing below the bar is public and installers that search the repository find only published skills |
| Release packages built from the tagged commit in a read-only job; the job that publishes runs no repository code | Keeps the write token away from third-party code; checksums and build provenance let users check a download |
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
