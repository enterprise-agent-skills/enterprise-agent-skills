# sap-system MCP server

A read-only MCP server that connects the SAP skills of this plugin to one SAP ABAP system:
SAP ECC 6.0, SAP S/4HANA, or the ABAP Platform trial (A4H). It uses two HTTP interfaces every
ABAP system has, ADT REST and OData V2, so nothing is installed in SAP and no SAP NetWeaver RFC
SDK is needed. The skills call it to learn the release of the system, read existing objects, and
look at table definitions and sample rows before they write or review code.

Derived from "SAP A4H Conversational Scout" by Amit Lal (MIT), the same author.
[docs/sap-mcp-servers.md](../../../../docs/sap-mcp-servers.md) compares it with SAP's ADT MCP
Server and the community servers, and says when one of those is the better choice.

## What it needs

- Python 3.10 or later with the packages `mcp` (2.x) and `httpx`:
  `python -m pip install "mcp>=2,<3" "httpx>=0.28,<1"`
- Node.js, which the agents that load plugins already have. `launch.mjs` finds the Python
  interpreter (`python3`, `python`, or the `py` launcher) and starts the server with it. To
  use a specific interpreter, for example one in a virtual environment, set
  `SAP_SYSTEM_MCP_PYTHON` to its path.
- An SAP user that may read the objects you ask about, and the URL of the system's ICM, for
  example `https://sap.example.com:44300`. Trial systems in Docker usually expose
  `http://localhost:50000`. ADT (`/sap/bc/adt`) must be active in SICF, which it is on every
  system that supports ABAP Development Tools.

## Tools

| Tool | What it reads |
|------|---------------|
| `sap_connection_info` | Connection check: URL, client, user, read-only mode |
| `sap_system_info` | Installed components from table CVERS: SAP_BASIS release and support package, S4CORE or SAP_APPL, and a product hint such as "SAP S/4HANA 1909 (SAP_BASIS 7.54)" |
| `sap_search_objects` | Repository search by name pattern, optionally by object type |
| `sap_list_package` | Objects in a package |
| `sap_read_source` | Current source of a class, program, include, function group, table, CDS entity, behavior definition, and other object types |
| `sap_describe_table` | Field list and DDL of a table, structure, view, or CDS entity |
| `sap_read_table` | Rows of a table through a SELECT the server builds and validates |
| `sap_odata_list_services`, `sap_odata_metadata`, `sap_odata_query` | SAP Gateway OData V2 catalog, metadata, and entity queries |

`SAP_MODE=full` adds `sap_adt_discovery` and `sap_run_select`; the free-form SELECT stays
blocked unless `SAP_BLOCK_FREE_SQL=false`.

## How the connection details reach the server

- **Claude Code**: when you enable the plugin, Claude Code asks for the SAP URL, user,
  password, client, and logon language and stores the password in its secure credential
  store. Nothing else to do.
- **Gemini CLI**: when the plugin folder is installed as an extension, Gemini CLI asks for
  the same values and keeps the password in the system keychain;
  `gemini extensions config sap-abap` changes them later.
- **Claude Cowork and claude.ai** do not start local servers with prompted values; the skills
  ask you for the release instead.
- **GitHub Copilot CLI, Cursor, and other Agent Plugins hosts**: run the one-time setup from
  the installed plugin folder. It tests the connection and writes a config file outside the
  plugin:

  ```text
  node <plugin folder>/mcp/sap-system/launch.mjs setup
  ```

  The file is `%APPDATA%\enterprise-agent-skills\sap-system.env` on Windows and
  `~/.config/enterprise-agent-skills/sap-system.env` elsewhere (`SAP_SYSTEM_MCP_ENV` overrides
  the path). Environment variables with the same names take precedence over the file.
- **Microsoft 365 Copilot Cowork** cannot start a local server. Run the same server in HTTPS
  mode on your own host next to the SAP system and add it to the Cowork plugin as a connector
  with Microsoft Entra ID sign-in. See [docs/copilot-cowork.md](../../../../docs/copilot-cowork.md)
  and [deploy/sap-system-mcp](../../../../deploy/sap-system-mcp/README.md).

## Safety

- Read-only: HTTP verbs that could change the system are refused, and the SAP user's
  authorizations still apply to every read.
- Object names are validated against SAP naming rules, WHERE clauses are character-filtered,
  and row counts are capped (`SAP_MAX_ROWS`, default 500).
- The server talks only to `SAP_URL`. Credentials never appear in tool results. In HTTPS mode
  the SAP credentials stay on the host that runs the server; Cowork users sign in with their
  Microsoft Entra ID account instead.
- Prefer the HTTPS port of your system. With a plain HTTP URL (no TLS) to a remote host the
  server warns that the SAP password travels unencrypted.

## Commands

```text
node launch.mjs serve          MCP over stdio (what the plugin manifests start)
node launch.mjs setup          test the connection and write the config file
node launch.mjs selftest       six connection checks
node launch.mjs print-tools    the tools and their input schemas as JSON
node launch.mjs --which        which Python interpreter would be used
python sap_system_mcp.py self-check   offline checks of the guards (what the unit tests run)
```
