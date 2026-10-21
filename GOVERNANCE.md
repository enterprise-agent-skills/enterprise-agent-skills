# Governance

## Roles

| Role | Responsibilities |
|------|------------------|
| Maintainers | Merge rights for the whole repository, releases, security response, conduct enforcement, changes to tooling, CI, and policy |
| Domain owners | Review and approve changes to one vendor area (for example `plugins/sap-*`), listed in `.github/CODEOWNERS` |
| Contributors | Anyone who opens an issue or pull request |

Pull requests need approval from a domain owner for the affected plugin and must pass the
required checks. Changes to `scripts/`, `tests/harness/`, `schemas/`, `config/`,
`.github/`, or policy documents need a maintainer.

## Decisions

Maintainers decide by consensus in issues or pull requests. If consensus is not reached in two
weeks, a majority of maintainers decides. Decisions that change policy are recorded in
`docs/ARCHITECTURE.md` (design) or this file (governance).

## Becoming a domain owner or maintainer

Contributors who have landed several reviewed pull requests in an area can be nominated by a
maintainer. Domain owners should work with the products they review. A new maintainer needs
agreement from the existing maintainers.

## Maintainers

| Name | GitHub | Areas | Affiliation |
|------|--------|-------|-------------|
| Amit Lal | [@amitlals](https://github.com/amitlals) | All areas | Microsoft (personal capacity) |

The maintainer works at Microsoft and runs this project in a personal capacity; Microsoft does not review, support, or endorse it.

The project starts with one maintainer. Until more maintainers and domain owners join, the
maintainer reviews every pull request, and required checks must pass before a merge.

To report a conduct problem privately, use the repository's private reporting form
([open the form](https://github.com/enterprise-agent-skills/enterprise-agent-skills/security/advisories/new),
or select **Report a vulnerability** on the **Security and quality** tab) and start the title
with "Conduct:". Only the maintainers and the person who reports can see these reports. If a
report concerns the maintainer, report it to GitHub instead, as described in
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Vendor neutrality

No vendor controls this project. People employed by vendors are welcome as contributors and
domain owners, and should disclose that affiliation in their profile or pull requests that
concern their employer's products. Maintainers list their affiliation in the table above.
