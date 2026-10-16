# Incubator

Drafts that are kept for reuse but do not meet the publishing bar. Nothing here appears in the
catalog, the marketplaces, or install commands. `npm run validate` reports problems in these
files as warnings only.

## legacy-cowork-skills

Six single-file skills written before the repository was restructured. They contain useful
material but are too broad (several exceed the 500-line limit), use frontmatter names that are
not valid skill names, lack `USE FOR` and `DO NOT USE FOR` routing, and have no tests. Some
statements in them are inaccurate or outdated and must be verified before reuse. Drafts from
the same collection that are out of scope for this repository (personal productivity and
general AI topics) were not published.

Migration plan, in priority order:

| Draft | Plan | Status |
|-------|------|--------|
| `sap-abap-fiori-dev` | Split into focused skills | Done for RAP (`sap-rap-business-object`), Standard ABAP (`sap-abap-standard`), enhancements (`sap-abap-enhancements`), and integration (`sap-abap-integration`). Remaining: CDS view entities and access control, Fiori elements annotations, UI5 freestyle |
| `sap-integration-btp` | Split: Cloud Integration iFlows and Groovy, API Management policies, Event Mesh, Cloud Connector and destinations | Not started |
| `azure-devops-sap` | ABAP CI with gCTS or abapGit and ATC in pipelines | Not started |
| `power-platform-sap` | Power Automate and Power Apps with the SAP ERP connector | Not started |
| `sap-azure-architecture` | SAP on Azure reference architecture review (HA/DR, sizing checks) | Not started |
| `copilot-extension-builder` | Microsoft 365 Copilot declarative agents and API plugins | Not started; candidate for microsoft/skills |

To migrate a draft, scaffold a new skill with `npm run new:skill`, move verified material into
it, write tests, and delete the draft section you used in the same pull request.
