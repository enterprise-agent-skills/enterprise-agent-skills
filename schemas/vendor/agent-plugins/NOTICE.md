# Vendored schemas: Agent Plugins

The files in `1.0.0/` are unmodified copies of the two Agent Plugins 1.0.0 JSON schemas,
`plugin.schema.json` and `mcp.schema.json`.

| Field | Value |
|-------|-------|
| Source | [agentplugins/agent-plugins-spec](https://github.com/agentplugins/agent-plugins-spec/tree/ff8ab5e392cc87bd88d87c060815a87490e51003/schemas/1.0.0), folder `schemas/1.0.0` |
| Commit | `ff8ab5e392cc87bd88d87c060815a87490e51003` |
| Retrieved | 2026-10-14 |
| License | Apache License 2.0 (SPDX `Apache-2.0`) |
| License text | [LICENSES/Apache-2.0.txt](../../../LICENSES/Apache-2.0.txt), identical to `LICENSES/Apache-2.0.txt` in the upstream repository |
| Copyright | The contributors to agentplugins/agent-plugins-spec. That repository has no copyright line; its charter (`GOVERNANCE.md`, section 9) says: "Contributors retain copyright in their contributions." |
| NOTICE file | None in the upstream repository, so there is no NOTICE text to pass on |
| License checked | 2026-10-21 |

The upstream `LICENSE.md` says: "Schemas, source code, scripts, and other software material are
licensed under the Apache License 2.0." The two schema files carry no license notice of their
own.

`scripts/validate.mjs` uses the schemas offline to check every generated `plugin.json` and
`mcp.json`. It never fetches a schema at run time, which matches the rule in the specification:
"Clients MUST NOT retrieve a schema while loading a plugin."

To update: download the new schema version into a new folder (for example `1.1.0/`), update the
commit and dates above, check the upstream license and NOTICE files again, and change
`AGENT_PLUGINS_SCHEMA_VERSION` in `scripts/lib/constants.mjs`.
