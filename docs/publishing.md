# Publishing and launch checklist

## First release

1. Create the GitHub organization and the repository `frontier-agent-skills-plugins`.
2. Set `repository.owner` in `repo.config.yaml` to the organization name, run
   `npm run build`, and commit. The owner placeholder warning in `npm run validate` disappears.
3. Fill in maintainer names and the private conduct contact in [GOVERNANCE.md](../GOVERNANCE.md),
   and replace the team names in `.github/CODEOWNERS` with real teams or users.
4. Push. In repository settings:
   - enable private vulnerability reporting, Dependabot alerts, and secret scanning with push
     protection;
   - enable Discussions;
   - protect `main`: require pull requests and the status checks
     `validate / static-and-mock` and `security / scan`; require one approving review once
     there is more than one maintainer (a sole maintainer cannot approve their own pull
     requests);
   - add topics such as `agent-skills`, `claude-code`, `github-copilot`, `sap`, `abap`,
     `microsoft-fabric`, `salesforce`, `mcp`.
5. Run `npm run check` and `npm run eval:vally` on a clean checkout and attach the reports to a
   GitHub release `v0.1.0`.
6. Run `claude plugin validate` on each plugin folder and record the result in
   [platform-compatibility.md](platform-compatibility.md).
7. Install each plugin on at least one platform and record it in the verification table.

## Listings

After end-to-end verification on a platform:

| Listing | How |
|---------|-----|
| Claude plugin directory | Submit each plugin from the developer portal at claude.ai/directory/manage |
| github/awesome-copilot external plugins | Use the external plugin issue form in that repository |
| skills.sh | Listing follows installs through `npx skills add` |
| Agent Skills and MCP community directories | Submit the repository link where accepted |

## Versioning

- Plugins use semantic versioning in `plugin.yaml`. Raise the patch version for fixes, minor
  for new skills or new guidance, major for renamed or removed skills.
- Skills carry their own `metadata.version`.
- Never rename a released plugin or skill; deprecate it (`maturity: deprecated`) and add a new
  one.

## Community

Grow through usefulness and accuracy rather than volume.

- Announce each new vendor area where its practitioners already meet: SAP Community blogs
  and SAP developer events, the Microsoft Fabric Community and Power BI user groups, and the
  Salesforce Trailblazer Community. Show a real before-and-after from a skill, with the test
  report.
- Recruit a domain owner per vendor area before adding many skills to it.
- Label beginner-friendly work (`good first issue`), for example migrating an incubator
  skill or adding a negative scenario.
- Publish the quality report summary with each release so users can see what is tested.
- Avoid tactics that damage trust: bulk-generated skills, inflated claims, or star requests.
