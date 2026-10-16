# Vendored schemas: Agent Plugins

The files in `1.0.0/` are unmodified copies of the Agent Plugins 1.0.0 JSON schemas.

| Field | Value |
|-------|-------|
| Source | https://github.com/agentplugins/agent-plugins-spec/tree/main/schemas/1.0.0 |
| Commit | `ff8ab5e392cc87bd88d87c060815a87490e51003` |
| Retrieved | 2026-10-14 |
| License | Apache License 2.0 (schemas and software material in that repository) |
| Copyright | Agent Plugins contributors |

They are used offline by `scripts/validate.mjs` to check every generated `plugin.json` and `mcp.json`. The validator never fetches schemas at run time, which matches the client rule in the Agent Plugins specification.

To update: download the new schema version into a new folder (for example `1.1.0/`), update the commit and date above, and change `AGENT_PLUGINS_SCHEMA_VERSION` in `scripts/lib/constants.mjs`.
