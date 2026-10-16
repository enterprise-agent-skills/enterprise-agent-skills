# Review checklist

Reviewers apply this list to every pull request that adds or changes a skill or plugin. CI
covers the mechanical checks; reviewers own the judgment calls.

## Scope

- [ ] An issue confirmed the scope and the target plugin.
- [ ] The skill does one job and does not overlap an existing skill.
- [ ] The description's `USE FOR:` and `DO NOT USE FOR:` lists would route real requests
      correctly, including requests for neighboring skills.

## Accuracy

- [ ] Every product fact, API, setting, and command was checked against official
      documentation linked in the PR, with the date.
- [ ] Release-dependent statements say which releases they apply to.
- [ ] Code samples follow current recommended practice, not just valid syntax.

## Tests

- [ ] Acceptance criteria cover the rules the skill teaches, with Correct and Incorrect
      examples.
- [ ] Scenarios use realistic prompts that do not name the skill.
- [ ] Negative responses represent mistakes agents actually make, and `caught_by` is set.
- [ ] No pattern was weakened just to make a check pass.

## Safety

- [ ] Bundled scripts were read in full: no downloads and execution, no unexpected network
      calls, no writes outside their purpose.
- [ ] No instructions that ask the agent to hide actions, skip confirmation for destructive
      operations, or bypass security controls.
- [ ] MCP servers come from `mcp/servers.yaml`.
- [ ] Placeholders are obviously fake; no real hosts, tenants, keys, or customer data.

## Maintenance

- [ ] `npm run build` output is committed.
- [ ] Plugin version is raised when skill content changes.
- [ ] Sources and authors are credited (`metadata.upstream-source`, `metadata.authors`,
      ATTRIBUTION.md).
