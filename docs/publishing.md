# Publishing and launch checklist

## Repository setup

The repository was first published on 2026-10-15. These setup steps are done; the dates come
from the commits and from the Publication row of [ROADMAP.md](ROADMAP.md).

1. Done on 2026-10-15: GitHub organization and repository created. Both were renamed on
   2026-10-21 (see [Name change](#name-change)).
2. Done on 2026-10-15: `repository.owner` set in `repo.config.yaml` and the generated files
   rebuilt. The owner and the repository name were changed to `enterprise-agent-skills` on
   2026-10-21.
3. Done on 2026-10-15: maintainer and private conduct contact in
   [GOVERNANCE.md](../GOVERNANCE.md); `.github/CODEOWNERS` assigns every path to `@amitlals`.
4. Done on 2026-10-15: repository settings:
   - private vulnerability reporting, Dependabot, and secret scanning with push protection;
   - Discussions;
   - `main` protected: pull requests required, and the status checks `static-and-mock`
     (workflow `validate`) and `scan` (workflow `security`) must pass.
5. Done: topics, including `sap`, `abap`, `s4hana`, `agent-skills`, `claude-code`,
   `github-copilot`, `microsoft-fabric`, `salesforce`, and `mcp` (checked 2026-10-21).

Still open: require one approving review on `main` once there is more than one maintainer (a
sole maintainer cannot approve their own pull requests).

## Name change

The project was published as `frontier-agent-skills/frontier-agent-skills-plugins` until
2026-10-21. On that day the organization and the repository were renamed to
`enterprise-agent-skills/enterprise-agent-skills`, and the marketplace name changed from
`frontier-agent-skills` to `enterprise-agent-skills`, so install names now end in
`@enterprise-agent-skills`, for example `sap-abap@enterprise-agent-skills`.

What GitHub's documentation says about redirects (checked 2026-10-21):

- [Renaming a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository):
  all existing information except project site URLs is redirected to the new name, including
  issues, wikis, stars, and followers. `git clone`, `git fetch`, and `git push` to the old
  location keep working. If a new repository with the old name is later created under the
  same owner, the redirects to the renamed repository stop working.
- [Renaming an organization](https://docs.github.com/en/organizations/managing-organization-settings/renaming-an-organization):
  web links to the organization's existing repositories keep working, and pushing to the old
  remote URL keeps working, although GitHub recommends updating remotes. The old organization
  name becomes available to anyone, and a new owner of that name can create repositories that
  override the redirects. Links to the old organization profile page and API requests that use
  the old organization name return a 404 error, and team @mentions are not redirected.

To update a clone made before the rename, run
`git remote set-url origin https://github.com/enterprise-agent-skills/enterprise-agent-skills.git`.

## Releases

### Steps

1. Merge the changes for the release to `main` through a pull request.
2. Make sure the `validate` and `security` workflows passed on the commit you will tag.
   `validate` also runs `npm run eval:vally`, which the release workflow does not run.
3. Tag that commit and push the tag, for example for the first release:
   `git tag v0.1.0 && git push origin v0.1.0`.
4. Check that the release lists one ZIP per skill and per plugin, the same again with the
   `-copilot-cowork` suffix, `all-skills.zip`, `SHA256SUMS.txt`, and `provenance.sigstore.json`.
5. Run `claude plugin validate` on each plugin folder and record the result in
   [platform-compatibility.md](platform-compatibility.md).
6. Install each plugin on at least one platform and record it in the verification table of
   [platform-compatibility.md](platform-compatibility.md).

### What the release workflow does

Pushing a tag that starts with `v` runs `.github/workflows/release.yml`. The workflow stops with
an error unless the tag points at a commit on `main`. It has two jobs:

1. `build`, with a read-only token: runs `npm ci --ignore-scripts`, `npm run check`, and
   `npm run package -- --version <tag>`; tests every ZIP file with `unzip -tq`; checks that
   `SHA256SUMS.txt` matches the ZIP files; and uploads `dist/` as a workflow artifact that is
   kept for seven days.
2. `publish`, the only job that can write, which runs no code from the repository or its
   dependencies: downloads the artifact, attests the build provenance of the ZIP files with
   `actions/attest-build-provenance`, and creates the GitHub release with `gh release create`,
   using the tag as the title and `RELEASE_NOTES.md` as the release text.

### Release assets

Each release has these assets. `scripts/package.mjs` builds the ZIP files and
`SHA256SUMS.txt`, and the `publish` job adds `provenance.sigstore.json`.

| Asset | Contents |
|-------|----------|
| `<skill>.zip` | One folder named after the skill, with `SKILL.md` and the rest of the skill folder, plus `LICENSE.txt` |
| `plugin-<plugin>.zip` | One folder named after the plugin, with its skills, any agents, and every platform manifest, plus `LICENSE.txt` |
| `all-skills.zip` | Every skill folder at the top level, each with `LICENSE.txt` |
| `<skill>-copilot-cowork.zip` | The files of `<skill>.zip` without the top-level folder, so `SKILL.md` is at the root, as Microsoft 365 Copilot Cowork's Upload skill expects |
| `plugin-<plugin>-copilot-cowork.zip` | The files of `plugin-<plugin>.zip` without the top-level folder, so `.claude-plugin/plugin.json` is at the root, for Copilot Cowork's Upload plugin |
| `SHA256SUMS.txt` | SHA-256 checksums of the ZIP files |
| `provenance.sigstore.json` | The attestation bundle with the signed build provenance of the ZIP files |

`LICENSE.txt` is a copy of the repository [LICENSE](../LICENSE). `RELEASE_NOTES.md` lists the
files with their sizes, states that the project is independent of the vendors it names, points
to the README for using the ZIP files in each agent, and gives these commands to check a
download:

- Linux: `sha256sum -c --ignore-missing SHA256SUMS.txt`
- macOS: `shasum -a 256 -c --ignore-missing SHA256SUMS.txt`
- Windows PowerShell: `Get-FileHash <file> -Algorithm SHA256`, then compare the hash with the
  file's line in `SHA256SUMS.txt`
- GitHub CLI, to check that a ZIP was built by a GitHub Actions workflow in this repository:
  `gh attestation verify <file> --repo enterprise-agent-skills/enterprise-agent-skills`

The ZIP writer sorts entries and fixes every timestamp and permission, so the same files give
the same bytes with the same Node.js version. Build the packages locally with
`npm run package`; the output goes to `dist/`, which Git ignores. The script deletes and
rebuilds its output folder on every run, so it refuses an `--out` folder that is not empty
unless an earlier run created it.

## Listings

After end-to-end verification on a platform:

| Listing | How |
|---------|-----|
| Claude plugin directory | Submit each plugin from the developer portal at claude.ai/directory/manage |
| github/awesome-copilot external plugins | Use the external plugin issue form in that repository |
| skills.sh | Listing follows installs through `npx skills add` |
| Agent Skills and MCP community directories | Submit the repository link where accepted |

## Versioning

- A release tag such as `v0.1.0` versions the repository as a whole; plugins and skills keep
  their own versions.
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
- Label beginner-friendly work (`good first issue`), for example adding a negative scenario
  or an ABAP release fixture.
- Publish the quality report summary with each release so users can see what is tested.
- Avoid tactics that damage trust: bulk-generated skills, inflated claims, or star requests.
