# MCP servers

`servers.yaml` lists the Model Context Protocol servers that skills in this repository may
reference. Plugins point to entries by `id` in `plugin.yaml`; `npm run build` writes the
platform-specific MCP configuration files.

## Policy

- Two kinds of servers are listed: servers published and maintained by the product vendor,
  and servers published from this repository under `plugins/<plugin>/mcp/<server>/`
  (`bundled_from_plugin`).
- `bundle_policy: bundle` is allowed for a vendor server only when it needs no credentials,
  and for a server from this repository only when it is read-only by default and takes
  credentials solely from the agent's own prompt (`user_config`) or from a config file the
  server's setup command writes outside the plugin. Bundled servers start or connect
  automatically in agents that support plugin MCP configuration. See
  [SECURITY.md](../SECURITY.md#bundled-mcp-servers).
- Vendor servers that need sign-in or keys are `document-only`: the plugin README explains
  them, and users add them to their own agent configuration.
- Package versions are pinned. Raise a version in its own pull request after checking the
  release notes, and update `last_verified`.

## Current entries

| ID | Server | Transport | Credentials | Bundled by |
|----|--------|-----------|-------------|------------|
| `sap-system` | sap-system MCP server (this repository, read-only SAP access) | stdio | SAP user and password, prompted by the agent or written by the setup command | `sap-abap` |
| `microsoft-learn` | Microsoft Learn MCP Server | streamable-http | none | `microsoft-fabric` |
| `microsoft-fabric` | Microsoft Fabric MCP Server | stdio | Microsoft Entra sign-in | documented only |
| `sap-ui5` | UI5 MCP Server | stdio | none | not yet used |
| `sap-cap` | CAP MCP Server | stdio | none | not yet used |
| `sap-fiori` | SAP Fiori MCP Server | stdio | none, changes files | documented only |
| `salesforce-dx` | Salesforce DX MCP Server | stdio | authorized org | documented only |

## Adding a server manually

Each entry in `servers.yaml` has the launch command. For example, to add the Salesforce DX
server to Claude Code for a scratch org you are already logged in to:

```bash
claude mcp add salesforce-dx -- npx -y @salesforce/mcp@0.30.15 --orgs DEFAULT_TARGET_ORG --toolsets orgs,metadata,data,users
```

Use sandboxes or scratch orgs, not production, when an agent has write tools.
