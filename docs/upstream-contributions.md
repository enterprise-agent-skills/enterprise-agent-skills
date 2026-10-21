# Contributing skills to microsoft/skills

[microsoft/skills](https://github.com/microsoft/skills) (MIT) collects skills for Azure SDKs,
Microsoft Foundry, and related Microsoft products. Some Microsoft-specific skills from this
repository may fit there. This page explains how we stay compatible and what to check first.

## Eligibility is not automatic

Only skills for Microsoft products can be candidates, and the microsoft/skills maintainers
decide what fits their scope. SAP, Salesforce, vendor-neutral, and cross-vendor skills are not
candidates. A plugin declares its status in `plugin.yaml`:

| `upstream.microsoft_skills` | Meaning |
|-----------------------------|---------|
| `not-applicable` | Not a Microsoft-only skill, or out of their scope |
| `candidate` | Microsoft-specific; ask the maintainers in an issue before exporting |
| `submitted` | A pull request is open upstream |
| `accepted` | Merged upstream; keep both copies in sync or point to upstream |

## How the formats line up

| This repository | microsoft/skills |
|-----------------|------------------|
| `plugins/<plugin>/skills/<skill>/SKILL.md` | `.github/plugins/<plugin>/skills/<skill>/SKILL.md` |
| Frontmatter `name`, `description`, `compatibility` | Same fields; `metadata` and `license` are removed on export |
| `USE FOR:` and `DO NOT USE FOR:` in descriptions | Same convention (their highest description quality level) |
| `tests/scenarios/<skill>/acceptance-criteria.md` | Same path and format |
| `tests/scenarios/<skill>/scenarios.yaml` | Same path; our extra fields (`description`, `validators`, `negative_responses`) are removed |
| `tests/scenarios/<skill>/vally/eval.yaml` | Same location; ours uses a grader script that is not exported |

## Export

```bash
npm run export:upstream -- --skill fabric-lakehouse-incremental-merge --out ../export/microsoft-skills --target-plugin <their-plugin-folder>
```

The exporter refuses skills whose plugin is not a candidate. It writes the skill folder, the
tests, and an `UPSTREAM-CHECKLIST.md` with the remaining manual steps: confirm scope in an
issue, follow their naming conventions, run their mock harness
(`cd tests && pnpm harness <skill> --mock --verbose`), and add the README catalog entry.

## Credit

Mention the origin in the upstream pull request description. The MIT license allows reuse in
either direction; keep license notices intact.

Export only content you wrote, or get the agreement of each author first. List the authors
with `git log --format=%an -- plugins/<plugin>/skills/<skill> tests/scenarios/<skill> | sort -u`.
Accept the upstream repository's contribution terms only for content you own.
