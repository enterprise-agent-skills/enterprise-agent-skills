# Contributing

Thank you for helping. This repository values a few accurate, tested skills over many
untested ones. Read this page once; the review checklist in
[docs/review-checklist.md](docs/review-checklist.md) is what maintainers apply to your pull
request.

## What we accept

- New skills for enterprise platforms (SAP, Microsoft, Salesforce, AWS, Google Cloud,
  ServiceNow, Workday, Snowflake, Databricks, Oracle) and vendor-neutral integration skills.
- Improvements to existing skills, references, acceptance criteria, and scenarios.
- Tooling fixes and new offline validators for languages we do not parse yet (for example
  KQL, DAX, or SQL dialects).
- MCP server entries in `mcp/servers.yaml` for servers published by the product vendor.

We do not accept skills that restate product documentation without adding workflow or
judgment, skills generated without verification, content copied from sources whose license
does not allow it, or anything that needs credentials to pass required checks.

## Before you start

Open an issue with the **Skill proposal** template. Describe the task the skill handles, who
needs it, and the official documentation you will rely on. For an SAP skill, also name the SAP
products and the release range it covers, because ABAP samples that start with a file marker are
checked against the release they target. A maintainer for that vendor area confirms the scope
and the target plugin, so you do not write something that overlaps an existing skill.

This also applies to a draft you wrote earlier. Drafts are not published as they are: propose
the skill first, then migrate the verified material into a focused skill with acceptance
criteria and scenarios.

## Add a skill

1. Install: `npm ci` (Node 22 or later, Python 3.9 or later for Python validation).
2. Scaffold:

   ```bash
   npm run new:skill -- --plugin sap-abap --name sap-cds-access-control --product abap --category security
   ```

   Add `--vendor <id>` when the plugin folder does not exist yet.
3. Write `SKILL.md`. Keep it under 500 lines and move long examples into `references/`. The
   description must say what the skill does, then `USE FOR:` and `DO NOT USE FOR:` lists.
   Put prerequisites in `compatibility`. Follow [docs/style-guide.md](docs/style-guide.md).
4. Write `tests/scenarios/<skill>/acceptance-criteria.md` with numbered sections, each with
   "Correct" and "Incorrect" examples. Start complete examples with a file marker line
   (`// file: path`, `# file: path`, or `* file: path` for ABAP) so validators parse them.
5. Write `tests/scenarios/<skill>/scenarios.yaml`: realistic prompts, regex
   `expected_patterns` and `forbidden_patterns`, a reference `mock_response`, and at least one
   `negative_responses` entry with `caught_by` set to the check that must reject it.
6. For SAP ABAP skills, also fill in the SAP metadata the scaffold creates (`sap-products`,
   `sap-deployments`, `abap-language-version`, `sap-basis-min`, `abap-env-default`), set an
   `environment` in `scenarios.yaml`, and put an `<!-- abap-env: ... -->` line before code
   blocks that target a different release. Use only syntax the target release supports; the
   checks reject anything newer. [docs/sap-environments.md](docs/sap-environments.md) lists the
   products, releases, and rules.
7. Run `npm run build`, then `npm run check` and `npm run eval:vally`. Fix every error. Do not
   weaken a pattern to make a check pass; fix the reference answer or the skill.
8. Open a pull request using the template. Include the documentation links you verified
   against and the date.

New skills start as `experimental` or `beta`. A skill becomes `stable` only after a maintainer
records a live verification (a real system or a live model evaluation) in
`metadata.last-verified`.

## Add or change a plugin

Edit `plugins/<name>/plugin.yaml` only. Never rename a released plugin or skill: install
commands and marketplaces depend on the name. Plugins may bundle an MCP server only if
`mcp/servers.yaml` lists it with `bundle_policy: bundle`: either a vendor-published server
that needs no credentials, or a server published from this repository under
`plugins/<plugin>/mcp/<server>/` (`bundled_from_plugin`) that is read-only by default and
takes credentials only from the agent's prompt (`user_config`) or its own setup command.
Hooks and top-level `bin/` folders are not accepted; see [SECURITY.md](SECURITY.md).

## Credit and sources

Add your GitHub handle to `metadata.authors` in the skill's frontmatter (comma-separated) if
you want credit in the catalog. If you adapt material from elsewhere, add
`metadata.upstream-source` and `metadata.upstream-license` and a row in
[ATTRIBUTION.md](ATTRIBUTION.md). Only adapt material whose license allows it.

## Microsoft-specific skills

If a skill targets a Microsoft product and could belong in
[microsoft/skills](https://github.com/microsoft/skills), say so in the proposal issue.
[docs/upstream-contributions.md](docs/upstream-contributions.md) explains how such skills are
kept compatible and exported.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
