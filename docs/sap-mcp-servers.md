# MCP servers for SAP ABAP systems: the bundled one and the alternatives

The `sap-abap` plugin bundles `sap-system`, a read-only MCP server
([plugins/sap-abap/mcp/sap-system](../plugins/sap-abap/mcp/sap-system)). Several other MCP
servers connect AI agents to ABAP systems, one of them from SAP. This page says what each one
does, so you can pick the right one for a job, and why the plugin bundles its own.

Facts about the other servers come from their public pages, checked on 2026-10-22 (see
[Sources](#sources)). None of them was run against a system for this comparison. Stars and
dates change; check the pages before you decide.

## What the plugin needs from a server

The skills need three things from a connected system: the installed release and support
package (to pick the syntax level), the current source and definitions of existing objects,
and a guarantee that nothing is changed while an agent explores. They do not need to create,
activate, or transport objects: the skills write code for a person to review and the person
puts it into the system.

## Comparison

| Server | Publisher and license | Connects to | Reads | Writes | Transport and sign-in | Fit for the skills |
|--------|-----------------------|-------------|-------|--------|-----------------------|--------------------|
| `sap-system` (this repository) | Enterprise Agent Skills contributors, MIT | Any ABAP system with ADT active (SAP ECC, S/4HANA, the A4H trial), over ADT REST and OData v2; tested on an ABAP Platform trial with SAP_BASIS 7.54 | Installed components from CVERS (`sap_system_info`), repository search, package contents, source of classes, programs, CDS, and RAP objects, table definitions and rows, OData catalog and queries | None: HTTP verbs that could change the system are refused, free SQL is blocked | stdio on your machine with the agent's own prompt or a setup command; HTTPS mode with Microsoft Entra ID tokens for Microsoft 365 Copilot Cowork | Built for them: release detection, read-only by design, bundled in the plugin with the connection prompts, packaged for Cowork |
| ADT MCP Server (SAP) | SAP, part of ABAP Development Tools for Visual Studio Code; marked experimental | Systems that ADT for VS Code supports: ABAP Cloud on SAP BTP and SAP S/4HANA Cloud, and SAP S/4HANA 2025 or later | Lists destinations and creatable object types | Creates objects and transports, generates RAP applications, activates objects, runs ATC (including AI quick fixes) and ABAP Unit | Local HTTP server on port 2236 inside VS Code; only in agent mode, GitHub Copilot confirmed | A development tool, not a reader: no source or table reads, no ECC or older S/4HANA, and it runs only inside VS Code. Use it next to the skills when you develop on ABAP Cloud in VS Code |
| Vibing Steampunk (`vsp`) | oisee, MIT, Go; 511 stars | "any system with ADT enabled, 7.50 upwards" | Source with dependency context, table data by free SQL, where-used, dumps, traces | Yes: edit, activate, transports, ABAP Unit, ATC, debugger, abapGit import; safety flags `--read-only`, `--allowed-packages`, `--block-free-sql` | stdio and HTTP; password, cookie, or SNC single sign-on | The most capable community server. Choose it when an agent must change objects or debug, with `--read-only` or `--allowed-packages` set deliberately |
| `@mcp-abap-adt/core` | fr0ster, servers AGPL-3.0, libraries Apache-2.0 and LGPL-3.0; 98 stars | SAP ECC and S/4HANA on premises and SAP BTP ABAP Cloud; "Legacy systems (BASIS < 7.50) are not supported at present" | Search, package contents, class, program, view, table definitions and contents, where-used, AST | Yes (CRUD, activation, transports, ATC, unit tests); separate `-ro` binaries with the read-only tools only | stdio, HTTP, SSE; basic, SNC, JWT with service keys | Strong on ABAP Cloud with service keys. The AGPL license of the servers needs a check in company settings |
| `@janfr/mcp-abap-adt` | janfrl, MIT (fork of mario-andreschak) | ABAP systems reachable over HTTPS with ADT active; RAP tools need about 7.54 | Source of most object types, tables and contents, CDS, where-used, syntax check, ATC findings, system release | None ("Nothing it does changes repository objects, Customizing or business data") | stdio; passwords in the OS keychain, several systems | The closest read-only alternative in Node.js. It has no release detection in the shape the skills expect and no HTTPS mode for Cowork |
| `mcp-abap-adt` | mario-andreschak, MIT; 200 stars | ABAP systems with ADT active | Sixteen read-only tools: source, structures, tables and contents, packages, search | None | stdio; user and password from environment variables | The original of the read-only servers; the fork above adds the keychain and more tools |
| superclaude-for-sap (`sc4sap`) | babamba2, MIT; 65 stars | SAP ECC and S/4HANA on premises, S/4HANA Cloud | Reads through its bundled ADT bridge | Yes, "150+ tools" including create, update, and delete; a two-layer guard for QA and production profiles | stdio; passwords in the OS keychain | A full development assistant for Claude Code with its own skills and agents. Larger than the skills need, and its tools are named differently |
| OData bridges (`lemaiwo/btp-sap-odata-to-mcp-server`, `oisee/odata_mcp_go`) | MIT; 138 and 145 stars | Any OData v2 or v4 service, including SAP Gateway on ECC and S/4HANA | Business data through the services | Depends on the service | stdio or HTTP; service-specific | For business data, not for ABAP objects or the release; `sap-system` covers the same OData reads for exploration |

## Why the plugin bundles its own server

- **Read-only is a property of the code, not a flag.** The skills promise never to change a
  system while they read it. `sap-system` cannot: the HTTP client refuses every verb that
  could change the system, free SQL is blocked, object names and WHERE clauses are validated.
  The capable servers above can all write, and their read-only modes are options a user can
  turn off.
- **Release detection in the form the skills use.** `sap_system_info` returns the SAP_BASIS
  release and support package, S4CORE or SAP_APPL, and a product hint; every SAP skill reads
  it first. No other server returns that directly.
- **One connection story on every platform.** The plugin's manifests make Claude Code and
  Gemini CLI prompt for the connection details, give the other hosts a setup command, and the
  same code runs in HTTPS mode for Microsoft 365 Copilot Cowork with Microsoft Entra ID
  tokens. No alternative offers the Cowork path.
- **Coverage of older systems.** SAP ECC 6.0 on SAP_BASIS 7.31 and 7.40 is where many
  customers are; `sap-system` needs only ADT (`/sap/bc/adt`) to be active, which every
  release that supports ABAP Development Tools has. Two of the servers above start at 7.50,
  and SAP's own server starts at S/4HANA 2025.
- **Small and reviewable.** One Python file, two dependencies, listed by the security scan
  for review before every merge.

## When another server is the better choice

- **An agent must change objects**: create, activate, test, and transport. Use Vibing
  Steampunk with the safety flags set, or `@mcp-abap-adt/core`, or SAP's ADT MCP Server when
  you develop on ABAP Cloud or SAP S/4HANA 2025 in VS Code. The skills still work next to
  them: they read the release through `sap-system` and the agent writes through the other
  server.
- **Service keys and ABAP Cloud on SAP BTP**: `@mcp-abap-adt/core` signs in with service keys
  and JWTs; `sap-system` uses an SAP user and password or, in HTTPS mode, Entra ID.
- **Debugging and traces**: Vibing Steampunk.
- **Business data from OData services only**: an OData bridge is lighter than an ADT server.

Any server can be added to an agent next to the plugin. The skills look for tools named
`sap_*`; with a server that uses other names, tell the agent which tools to use for the
release and the objects.

## Sources

Checked on 2026-10-22.

- SAP AI MCP servers and skills, a curated list by marianfoo with licenses, stars, and dates:
  https://github.com/marianfoo/sap-ai-mcp-servers
- Enable the ADT MCP Server in ABAP Development Tools for VS Code (SAP tutorial; tools,
  port 2236, experimental status, agent mode): https://developers.sap.com/tutorials/abap-dev-adt-mcp-server-tools.html
- Supported systems of ABAP Development Tools for VS Code (SAP BTP, S/4HANA Cloud, S/4HANA
  2025 or later): recorded in the sap-abap-standard skill's compatibility note and in
  [sap-environments.md](sap-environments.md)
- Vibing Steampunk: https://github.com/oisee/vibing-steampunk
- fr0ster/mcp-abap-adt: https://github.com/fr0ster/mcp-abap-adt
- janfrl/mcp-abap-adt: https://github.com/janfrl/mcp-abap-adt
- mario-andreschak/mcp-abap-adt: https://github.com/mario-andreschak/mcp-abap-adt
- superclaude-for-sap: https://github.com/babamba2/superclaude-for-sap
- OData bridges: https://github.com/lemaiwo/btp-sap-odata-to-mcp-server and
  https://github.com/oisee/odata_mcp_go
