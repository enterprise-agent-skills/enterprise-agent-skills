# Microsoft 365 Copilot Cowork: SAP ABAP skills with a connector to your SAP system

This guide builds one Microsoft 365 Copilot Cowork plugin package from the `sap-abap` plugin:
its five ABAP skills plus a connector to the sap-system MCP server, which your organization
runs on its own host and which reads from your SAP ABAP system (SAP ECC, SAP S/4HANA, or the
ABAP Platform trial A4H). Cowork cannot start a local MCP server, so the server runs in HTTPS
mode on a host you control, protected by Microsoft Entra ID.

If you only want the skills, you need no server: upload the `-copilot-cowork.zip` files from a
release as the README describes under
[Download skills as ZIP files](../README.md#download-skills-as-zip-files). Those packages have
no connector: Cowork then answers from the skills alone and, asked about a connection to your
SAP system, says it has none. The package this guide builds is different: it carries the
`sap-system` connector with the address of your own server, which is why it is built by you
and not published as a release file. If you uploaded a release package first, remove it under
Customize > Plugins before you upload the built one, so the skills are not listed twice.

The facts about Cowork, Microsoft Entra ID, and the Teams developer portal in this guide were
checked against the pages listed under [Sources](#sources) on 2026-10-22. The facts about the
server come from its README and from the deployment README in this repository. Product names
are trademarks of their owners; this is an independent project (see
[Terms of use](#terms-of-use)).

## How it works, in one paragraph

Cowork runs in Microsoft's cloud and cannot start a program on anyone's machine. So one person
in your organization runs the small `sap-system` server once, on a host that can reach the SAP
system, and gives Cowork its HTTPS address inside the plugin package. Every Cowork user who
gets the package then talks to that one server. The server signs in to SAP with one read-only
SAP user whose password lives only on that host; Cowork users never see it. The server cannot
change anything in SAP: there is no write tool and no setting that enables one. What a user
sees is their own Microsoft sign-in (in the Entra ID setup) and then answers that come from the
live system.

## Who does what

| Role | Does | Needs |
|------|------|-------|
| An administrator or SAP Basis colleague | Steps 1 and 2 once per organization: run the server, register the sign-in | A Linux host with Docker, a DNS name, an SAP user with display rights, the Application Developer role in Microsoft Entra ID |
| Whoever builds the package | Step 3 once, and again when the address or the skills change | Node.js 22 and a clone of this repository |
| Every Cowork user | Step 4: get the package (uploaded by themselves or shared with them), turn the plugin on, sign in once | A Microsoft 365 Copilot license; nothing to install |

Uploading a ZIP alone is enough only for the skills. The connection always needs Steps 1 to 3.

## Deployment runbook

Each step says what you get at the end and how to check it.

**Step 1: run the server** ([details](#step-1-deploy-the-server), about 15 minutes)

1. Pick a Linux host that can reach the SAP system's ICM port (the port ABAP Development
   Tools uses; the SAP system itself can run on its own VM, on premises, or in a managed
   cloud, and stays private) and that has Docker Engine and
   Docker Compose v2. The host needs a public DNS name and inbound TCP 443 from the internet.
   The A4H trial in Docker on the same host is reached at `http://127.0.0.1:50000`.
2. Create an SAP user for the server with display authorizations only.
3. As root on the host, download `deploy/sap-system-mcp/deploy.sh` from this repository, read
   it, and run it with the settings as environment variables (`PUBLIC_HOST`, `ACME_EMAIL`,
   `MCP_PUBLIC_URL`, `SAP_URL`, `SAP_USER`, `SAP_PASSWORD`, `SAP_CLIENT`; the `ENTRA_*`
   values come from Step 2 and can be added later by running the script again). It clones the
   repository, writes the settings to a private `.env` file, starts the server and Caddy, and
   obtains the TLS certificate from Let's Encrypt. On an Azure VM the same script runs
   through `az vm run-command` with the password as a protected parameter.
4. You get: `https://<host>/healthz` returns `{"ok": true, ...}` from anywhere, and
   `https://<host>/mcp` answers `401` to a request without a token.

**Step 2: register the sign-in** ([details](#step-2-register-the-connector-sign-in-in-microsoft-entra-id), about 20 minutes; skip for a trial system and use [Demo mode](#demo-mode))

1. In the Microsoft Entra admin center, register an app that represents the server: v2
   tokens, Application ID URI `https://<host>`, a scope `SAP.Read`, the Teams consent redirect
   URI, and the Microsoft Enterprise token store as an authorized client.
2. In the Teams developer portal, create a Microsoft Entra SSO client registration for that
   app with base URL `https://<host>/mcp`. It returns an auth config ID and an Application ID
   URI.
3. Add that URI to the app's `identifierUris`, put the tenant ID, client ID, audiences, scope,
   and allowed client ID into the server's `.env`, and restart the server.
4. You get: the auth config ID for Step 3, and
   `https://<host>/.well-known/oauth-protected-resource/mcp` names your tenant as the
   authorization server.

**Step 3: build the package** ([details](#step-3-build-the-package), one command, or the release template edited by hand)

```bash
npm ci
npm run package:cowork -- --mcp-url https://<host>/mcp --auth OAuthPluginVault --auth-config-id <auth config ID>
```

Without Node.js, use the template instead: every release attaches
`plugin-sap-abap-cowork-template.zip`, the same package with two placeholders. Unzip it, open
`manifest.json`, replace `https://sap-mcp.example.com/mcp` with your MCP URL and
`REPLACE-WITH-YOUR-AUTH-CONFIG-ID` with your auth config ID (or, for demo mode, set
`"authorization": {"type": "None"}` without a `referenceId` and use the secret URL), and zip
the contents again so that `manifest.json` sits at the root of the ZIP, not inside a folder.
On Windows PowerShell: `Compress-Archive -Path manifest.json, color.png, outline.png, skills -DestinationPath sap-abap-cowork-plugin.zip`;
on macOS or Linux: `zip -r sap-abap-cowork-plugin.zip manifest.json color.png outline.png skills`.

You get: `dist/copilot-cowork/sap-abap-cowork-plugin.zip`, validated against Microsoft's
manifest schema before it is written. The ZIP holds the five skills, the icons, and a
connector entry with your URL and auth config ID. It holds no passwords. Rebuild and
re-upload whenever the URL, the sign-in registration, or the skills change.

**Step 4: upload and use** ([details](#step-4-upload-in-cowork-and-test), five minutes)

1. In Cowork: Customize > Plugins > Upload plugin, choose the ZIP, and in the Share dialog pick
   yourself or specific colleagues. An administrator can instead upload it in the Microsoft 365
   admin center so it appears under Discover for everyone.
2. Each user starts a new conversation, checks under Sources & Skills that the plugin is on,
   and asks "Which SAP release is my system?". The first time, Cowork asks the user to connect
   the `sap-system` connector: they sign in with their work account and accept the `SAP.Read`
   permission, once.
3. You get: the SAP_BASIS release and support package from `sap_system_info`, and from then on
   the skills read the release and the objects from the system.

When something changes later: a new server address or sign-in registration means Step 3 and
Step 4 again (then **Re-share**); a new release of the skills means Step 3 and Step 4 again;
a new SAP user or password means editing `.env` on the host and `docker compose up -d`.

## What you get

The package contains two things.

**The five skills of the sap-abap plugin**, unchanged from the plugin folder:
`sap-abap-standard`, `sap-abap-enhancements`, `sap-abap-integration`,
`sap-rap-business-object`, and `sap-clean-core-check`. The
[plugin README](../plugins/sap-abap/README.md) describes each one. Cowork loads a skill when a
conversation matches its description and shows the skill in the side panel.

**A connector named `sap-system`** that gives Cowork read-only tools on your SAP system. In the
server's default mode (`SAP_MODE=focused`) the tools are:

| Tool | What it does |
|------|--------------|
| `sap_connection_info` | Shows the connection settings in effect (URL, client, language, mode, read-only flags); credentials never appear in tool results |
| `sap_system_info` | Reads table CVERS and returns the installed software components, for example SAP_BASIS release `754` support package `0003`, with a product hint such as "SAP S/4HANA 1909 (SAP_BASIS 7.54)" |
| `sap_search_objects` | Finds repository objects by name |
| `sap_describe_table` | Describes a table |
| `sap_read_table` | Reads rows of a table, at most `SAP_MAX_ROWS` (default 500) |
| `sap_read_source` | Reads the source code of an object |
| `sap_list_package` | Lists the contents of a package |
| `sap_odata_list_services`, `sap_odata_metadata`, `sap_odata_query` | Lists OData v2 services, reads a service's metadata, and runs a query |

The skills use `sap_system_info` to find the SAP_BASIS release and support package of the
system and pick the matching syntax level. `SAP_MODE=full` adds `sap_adt_discovery` and
`sap_run_select`; the latter stays blocked unless `SAP_BLOCK_FREE_SQL=false`. The exact tool
descriptions are in the [server README](../plugins/sap-abap/mcp/sap-system/README.md).

## Architecture

```text
Microsoft 365 Copilot Cowork, with the plugin package
    |
    |  HTTPS; a Microsoft Entra ID access token on every request (authorization type OAuthPluginVault)
    v
sap-system MCP server in HTTPS mode, on a host your organization controls
(Docker, behind Caddy, which obtains the TLS certificate)
    |
    |  ADT REST and OData v2, signed in as the SAP user from the server's env file
    v
Your SAP system: SAP ECC, SAP S/4HANA, or the ABAP Platform trial A4H
```

Where things live:

| Part | Where it runs | What it holds |
|------|---------------|---------------|
| The plugin package | Uploaded to Cowork; stored by Microsoft 365 | The skills, the connector's URL, and the auth config ID of the sign-in registration. No credentials |
| The sap-system server | A host you control, for example a VM in the same network as the SAP system | Its env file: the SAP URL, the SAP user and password, the client and language, the read-only switches, and the Entra settings |
| The SAP system | Your data center or cloud subscription | The data |

How a request flows: Cowork obtains an access token for the server through the Microsoft
Enterprise token store, using the auth config you register in [Step 2](#step-2-register-the-connector-sign-in-in-microsoft-entra-id),
and sends it as a bearer token. The server validates the token's tenant, issuer, audience, and
scope, runs the tool against the SAP system, and returns the result. Unauthenticated requests
are rejected, and the server publishes its OAuth 2.0 protected resource metadata at
`https://<host>/.well-known/oauth-protected-resource/mcp`, as the MCP authorization
specification requires (the document sits under the MCP path because the resource has one).

What the server refuses: every HTTP verb that could change the system, always, with no
setting that turns that off; free SQL while `SAP_BLOCK_FREE_SQL` is `true` (the default);
object names that break SAP naming rules; WHERE clauses with characters outside a narrow set;
results beyond `SAP_MAX_ROWS`.
The server sends data only to the SAP URL in its env file and to no other host, and it reports
nothing to the maintainers of this repository.

One SAP user for every Cowork user: in HTTPS mode the server signs in to SAP with the user in
its env file, so everyone whose Entra token passes the checks reads with that SAP user's
authorizations. Give that SAP user display authorizations only, and limit who can sign in to
the connector through the Entra scope and your tenant's consent settings.

## Enterprise topology: the same server behind Azure API Management

The setup in this guide is the smallest complete one: the sap-system server signs in to SAP
with one read-only SAP user, and every Cowork user who passes the Entra ID check reads with
that user's authorizations. Microsoft's reference picture for SAP and MCP adds two things,
and the server fits into it without a redesign.

```text
Copilot Studio, Microsoft 365 Copilot, GitHub Copilot ──MCP, Entra ID token──► sap-system MCP server
                                                                                     │
                                                                          Azure API Management
                                                                          (policies: throttling, logging,
                                                                           token exchange for the user)
                                                                                     │
                                                                               SAP ICM (ADT, OData)
```

| Concern | This guide | With Azure API Management in front of SAP |
|---------|------------|--------------------------------------------|
| Who signs in to SAP | One technical SAP user with display authorizations, from the server's env file | Each Cowork user: an APIM policy exchanges the user's Entra ID token for an SAP token (SAP's OAuth 2.0 SAML bearer flow, often called principal propagation), so SAP applies that user's own authorizations and writes that user into its audit logs |
| Throttling, IP allowlists, caching, central logging | None beyond the server's row limits and its own log | APIM policies, one place for every client |
| Reaching the SAP system | The connector host must reach the ICM port | Only APIM reaches SAP; the connector reaches APIM |
| What changes in the server | Nothing | `SAP_URL` points at the APIM endpoint, and the server forwards the user's token instead of a Basic auth header: a small, planned change (open an issue if you need it) |

When to use which: the guide's setup fits trial systems, demos, and read-only exploration where
a shared display user is acceptable. Use the APIM topology when SAP must see each user, when
several clients share one entry point, or when security asks for a gateway in front of SAP.
The skills and the Cowork package are the same in both.

Sources: Microsoft's reference architecture for MCP integration with SAP (Copilot Studio,
Microsoft 365 Copilot, and GitHub Copilot through an MCP server and Azure API Management with
Entra ID); SAP's OAuth 2.0 SAML bearer assertion flow for principal propagation (SAP Help
Portal, "OAuth 2.0 SAML Bearer Assertion Flow"); checked 2026-10-23.

## Prerequisites

- A Microsoft 365 tenant where Cowork is available. Users of Cowork plugins need Microsoft 365
  Copilot licenses.
- Permission to register applications in Microsoft Entra ID (at least the Application Developer
  role), access to the Microsoft Entra admin center, and access to the Teams developer portal
  (`dev.teams.microsoft.com`).
- A Linux host with Docker Engine and Docker Compose v2, with a public DNS name that Microsoft
  365 can reach on port 443 (port 80 can stay closed), and that can reach the SAP system's ICM
  port (for example `https://<sap-host>:44300`, or `http://127.0.0.1:50000` for a trial system
  in Docker on the same host). Cowork connectors require Streamable HTTP over HTTPS with TLS 1.2
  or later.
- An SAP user for the server with display authorizations only.
- Node.js 22 or later and a clone of this repository, to build the package.

## Step 1: Deploy the server

Follow [deploy/sap-system-mcp/README.md](../deploy/sap-system-mcp/README.md). It contains the
Docker setup for the server in HTTPS mode (`Dockerfile`, `compose.yaml`), a Caddy configuration
that obtains and renews the TLS certificate for your host name (`Caddyfile`), the env file
template (`.env.example`), and `deploy.sh`, which installs or updates the server on the host and
writes the `.env` file. In the env file you set:

- `SAP_URL`, `SAP_USER`, `SAP_PASSWORD`, `SAP_CLIENT` (default `001`), and `SAP_LANGUAGE`
  (default `EN`). Keep `SAP_BLOCK_FREE_SQL` at its default `true`; the server is read-only in
  every mode.
- `MCP_PUBLIC_URL`, the canonical MCP URL, `https://<host>/mcp`, plus `MCP_BIND_HOST` and
  `MCP_PORT` for the container.
- The `ENTRA_*` variables from [Step 2](#step-2-register-the-connector-sign-in-in-microsoft-entra-id).
  Deploy now, then come back to fill them in and restart.

Check the deployment before you continue: `https://<host>/.well-known/oauth-protected-resource/mcp`
must return a JSON document whose `resource` is your MCP URL and whose `authorization_servers`
entry is `https://login.microsoftonline.com/<tenant-id>/v2.0`, and a request to
`https://<host>/mcp` without a token must be rejected with HTTP 401.

## Step 2: Register the connector sign-in in Microsoft Entra ID

Two registrations are needed. The first is an app registration in Microsoft Entra ID that
secures the server; its client ID is the audience of the tokens the server accepts. The second
is a Microsoft Entra SSO client registration in the Teams developer portal, which creates the
auth config that Cowork uses to obtain tokens; its ID goes into the package. The steps follow
Microsoft's pages "Secure a Model Context Protocol (MCP) server with Microsoft Entra ID" and
"Configure Microsoft Entra SSO authentication" (see [Sources](#sources)). Replace `<host>` with
your server's host name.

### 2a: Register the app that secures the server

1. In the [Microsoft Entra admin center](https://entra.microsoft.com), open **Entra ID** >
   **App registrations** > **New registration**. Enter a name such as `SAP system MCP server`,
   keep the single-tenant option (accounts in this organizational directory only), and select
   **Register**.
2. On the **Overview** page, note the **Application (client) ID** and the **Directory (tenant)
   ID**. They become `ENTRA_CLIENT_ID` and `ENTRA_TENANT_ID` on the server.
3. Select **Manifest** and set the access token version to 2, then save. Do this before the
   next step: an HTTPS Application ID URI that matches your server URL needs v2 tokens.

   ```json
   "api": {
       "requestedAccessTokenVersion": 2
   }
   ```

4. Select **Expose an API**. Next to **Application ID URI**, select **Add** and enter
   `https://<host>` without a trailing slash (an Application ID URI cannot end with a slash).
   Save.
5. Still under **Expose an API**, select **Add a scope**. Scope name `SAP.Read`; who can
   consent: **Admins and users**; enter display names and descriptions such as "Read from the
   SAP system through Copilot Cowork"; state **Enabled**; select **Add scope**. The full scope
   value is `https://<host>/SAP.Read`.
6. Select **Authentication** > **Add a platform** > **Web** and add the redirect URI
   `https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect`.
7. Under **Expose an API**, select **Add a client application** and enter
   `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`, the client ID of the Microsoft Enterprise token
   store. Authorize the `SAP.Read` scope for it.

If you chose **Admins only** for the scope, or your tenant does not allow users to consent to
applications, an administrator must grant consent before users can connect (see
[Troubleshooting](#troubleshooting)).

### 2b: Create the auth config in the Teams developer portal

1. Open the [Teams developer portal tools page](https://dev.teams.microsoft.com/tools) and
   select **Microsoft Entra SSO client ID registration**.
2. Select **New client registration** (or **Register client ID** when the list is empty).
3. Fill in the form:

   | Field | Value |
   |-------|-------|
   | Registration name | A name such as `SAP system MCP server` |
   | Base URL | `https://<host>/mcp`, the MCP URL the connector uses |
   | Restrict usage by org | Your organization. (Microsoft's guidance to choose **Any Microsoft 365 Organization** is for plugins published across tenants; this package is for your tenant) |
   | Restrict usage by app | **Any Teams app** |
   | Client ID | The Application (client) ID from 2a |
   | Scope | `https://<host>/SAP.Read offline_access` |

   `offline_access` lets the token store obtain refresh tokens, so users do not sign in again
   when an access token expires; on the Microsoft identity platform an app must request it
   explicitly.
4. Select **Save**. The portal shows the **auth config ID** (currently labeled "Microsoft Entra
   SSO registration ID") and an **Application ID URI** it generated. Note both. The auth config
   ID is the `--auth-config-id` value in [Step 3](#step-3-build-the-package).

### 2c: Finish the app registration and configure the server

1. Back in the app registration from 2a, open **Manifest** and add the Application ID URI from
   2b to `identifierUris`, next to `https://<host>`. The admin center UI shows only the first
   entry, so use the manifest editor:

   ```json
   "identifierUris": [
       "https://<host>",
       "<the Application ID URI the Teams developer portal generated>"
   ]
   ```

2. Set the Entra variables in the server's env file and restart the server:

   | Variable | Value |
   |----------|-------|
   | `ENTRA_TENANT_ID` | The Directory (tenant) ID |
   | `ENTRA_CLIENT_ID` | The Application (client) ID; for v2 tokens it is the `aud` claim the server expects |
   | `ENTRA_SCOPE` | `SAP.Read` (the default) |
   | `ENTRA_AUDIENCES` | The Application ID URI the portal generated, and `https://<host>`, comma-separated: the server also accepts tokens whose audience is one of these |
   | `ENTRA_ALLOWED_CLIENT_IDS` | `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`, the Microsoft Enterprise token store |

## Step 3: Build the package

In a clone of this repository:

```bash
npm ci
npm run package:cowork -- --mcp-url https://<host>/mcp --auth OAuthPluginVault --auth-config-id <auth config ID>
```

The script writes `dist/copilot-cowork/sap-abap-cowork-plugin.zip` (`dist/` is ignored by Git)
and prints the manifest id, the connector, the skills, and whether the tool list was included.
The ZIP holds:

| Entry | Contents |
|-------|----------|
| `manifest.json` | Microsoft 365 app manifest version 1.29: name, description, developer, icons, `agentSkills`, and the `agentConnectors` entry with your MCP URL and authorization |
| `color.png`, `outline.png` | The 192 x 192 color icon and the 32 x 32 white-on-transparent outline icon, drawn by the script |
| `skills/<name>/` | One folder per skill with `SKILL.md`, its `references/` and `scripts/`, and `LICENSE.txt` |
| `tools/sap-system-tools.json` | Only with `--tools`: the server's tool list in the `tools/list` format, referenced from the manifest. Cowork discovers tools from the server and does not use this file, and on 2026-10-22 its upload validator rejected a package that declared the file although it was in the ZIP (`InvalidAgentConnector ... not found in the app package`). Leave it out for Cowork |

Before writing the ZIP, the script validates the manifest against the vendored Microsoft 365
app manifest schema ([schemas/vendor/microsoft-365/NOTICE.md](../schemas/vendor/microsoft-365/NOTICE.md))
and checks the upload rules from the Cowork documentation: at most 20 skills, at most 20
companion files per skill besides `SKILL.md` (5 MB each, 10 MB per skill), no hidden files, only
safe characters in file names, and no `referenceId` when the authorization type is `None`. The
same inputs always give the same bytes.

Options:

| Option | Meaning |
|--------|---------|
| `--mcp-url <url>` | The connector's MCP URL. Must start with `https://` |
| `--auth OAuthPluginVault` or `--auth None` | Sign-in through Microsoft Entra ID, or no sign-in (demo mode only) |
| `--auth-config-id <id>` | The auth config ID from Step 2b. Required with `OAuthPluginVault`, not allowed with `None` |
| `--out <dir>` | Output folder (default `dist/copilot-cowork`) |
| `--plugin <name>` | Plugin folder under `plugins/` (default `sap-abap`) |
| `--version x.y.z` | Manifest version (default: the plugin version). Raise it for every new upload; the schema expects a version change when the manifest changes |
| `--app-id <guid>` | Manifest id. By default a UUID v5 of the plugin name, the same on every build, so an updated package replaces the previous one. Use another GUID when two packages of the same plugin must coexist in one tenant, for example a demo build next to the production build |
| `--name <short name>` | The name Cowork shows, up to 30 characters (default: the plugin name, `sap-abap`) |
| `--tools` | Run the server on the build machine and reference its tool list from the manifest. Not for Cowork; see the table above |

The manifest's developer entry names this project, with `websiteUrl` pointing to the repository
and `privacyUrl` and `termsOfUseUrl` pointing to the [Privacy](#privacy) and
[Terms of use](#terms-of-use) sections of this page. Rebuild and re-upload the package whenever
the MCP URL, the authorization, or the skills change.

## Step 4: Upload in Cowork and test

1. In Cowork, open **Customize** from the left navigation and select the **Plugins** tab.
2. Select **Upload plugin** and choose `sap-abap-cowork-plugin.zip`.
3. In the **Share** dialog, choose **Only you** while you test, or **Specific users in your
   organization** and add people by name or email. Select **Apply**.
4. Start a new conversation. Check in the **Sources & Skills** panel that the plugin is on.
5. Ask: "Which SAP release is my system?" Cowork prompts you to connect the `sap-system`
   connector the first time: select **Connect**, sign in with your work account, and accept
   the `SAP.Read` permission. Cowork then calls `sap_system_info` and answers with the SAP_BASIS
   release and support package and the product hint. You sign in once per connector; Cowork
   keeps the authorization until you or an administrator revokes it.
6. Try a skill with the connector, for example: "Using the sap-abap-standard skill, write a
   report that lists flights from SFLIGHT for a carrier entered on the selection screen, for my
   system's release." The skill reads the release from `sap_system_info` first.

When you upload a newer version of a plugin you have shared, open its detail page and select
**Re-share** so everyone gets the new version.

To list the plugin under **Discover** for the whole organization, an administrator uploads the
ZIP in the Microsoft 365 admin center: **Manage apps** > **Upload custom app** > the ellipsis
(**...**) > **Add agent**. Admin-deployed plugins can also be installed for all users or for
specific groups from **Agents** in the admin center. Each user still completes the connector
sign-in themselves; an administrator cannot sign in on a user's behalf.

## Demo mode

Demo mode is for trial systems with demo data only, such as an ABAP Platform trial (A4H) with
the SFLIGHT data set. It serves the MCP endpoint without a bearer token at a secret URL, so
anyone who has the URL can read everything the configured SAP user can read, and Cowork cannot
tell users apart. Never use it for a system with real business data.

1. On the host, set `MCP_DEMO_PATH_SECRET` in the `.env` file to a random string of at least
   32 characters (the server prints one with `python sap_system_mcp.py new-secret`), leave every
   `ENTRA_*` value empty, and run `docker compose up -d`. The MCP endpoint is then served at
   `MCP_PUBLIC_URL/<secret>`, that is `https://<host>/mcp/<secret>`, without a token.
2. Build the package with authorization type `None` and the secret URL:

   ```bash
   npm run package:cowork -- --mcp-url https://<host>/mcp/<secret> --auth None --out dist/copilot-cowork-demo
   ```

   Add `--app-id <guid>` when the same tenant also has the production package, so the two do
   not replace each other.
3. Upload it as in [Step 4](#step-4-upload-in-cowork-and-test) and share it with specific
   people only. No sign-in prompt appears.

Treat the secret URL like a password. It is in the server's env file and in the package's
`manifest.json`, so the ZIP is a secret too: do not commit it, do not attach it to tickets, and
do not publish the plugin to the whole organization. The build script does not print the
secret.

To rotate the secret: set a new `MCP_DEMO_PATH_SECRET` and run `docker compose up -d` (the old
URL stops working at once), rebuild the package with the new URL, upload it again, and select
**Re-share**.

## Troubleshooting

| Symptom | Cause | What to do |
|---------|-------|------------|
| Upload fails with a message like `Property 'x' has not been defined and the schema does not allow additional properties` | The manifest has a field the schema version does not allow | The script validates the manifest before it writes the ZIP, so this should not happen with an unmodified build. Rebuild with the current script; if it persists, open an issue with the message |
| Upload fails with `InvalidAgentConnector: The agent connector with ID sap-system has its declared MCP tool description file ... not found in the app package` | The package declares the optional tool description file; Cowork's validator rejected it on 2026-10-22 even though the file was in the ZIP | Rebuild without `--tools` (builds before 2026-10-22 included the file by default) and upload again |
| Upload fails because a skill has more than 20 companion files, or a file is too large or has an unsafe name | Cowork's companion file limits | The script checks these rules and names the file; shorten the skill or remove the file |
| Upload fails in a tenant with Microsoft Purview Information Barriers | Plugin and skill uploads are blocked in tenants where Information Barriers are enabled | Ask your administrator; there is no package-side fix |
| Sign-in fails with `AADSTS9010010` | The Application ID URI on the app registration does not exactly match the `resource` the client requests. Common causes: a trailing slash, the app still issuing v1 tokens, or a requested scope that belongs to a different app registration | Remove the trailing slash, confirm `requestedAccessTokenVersion` is `2`, re-add the Application ID URI, and make sure `SAP.Read` is defined on the same registration as the URI |
| The consent page says that admin approval is needed | The scope allows admin consent only, or the tenant's user consent settings block it | An administrator grants consent for the application in the Microsoft Entra admin center (Enterprise applications > the app > Permissions > Grant admin consent), or you change the scope to **Admins and users** and the tenant allows user consent |
| Sign-in succeeds but every tool call fails and the server log shows a rejected token (HTTP 401) | The server's audience, issuer, scope, or client checks do not match the token | Check `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` (the `aud` of a v2 token), `ENTRA_AUDIENCES` (the Application ID URI from the portal), `ENTRA_SCOPE` (`SAP.Read`), and `ENTRA_ALLOWED_CLIENT_IDS` (the token store ID `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`); then restart |
| Tools return `{"ok": false, "error": ...}` with a setup message or an SAP error | The server's SAP settings or the connection to the SAP system | On the host, run the server's self test (see the server README) and check `SAP_URL`, user, password, and client |
| Cowork answers from the skill but never calls the connector | The plugin is off in **Sources & Skills**, or the question did not need the system | Turn the plugin on, or ask for something only the system knows, such as the release or a table's rows |
| The plugin is missing on a phone or tablet | Custom plugins are not supported in Cowork on mobile | Use Cowork in the browser or the desktop app |
| You want to see Cowork's requests in the server log | Cowork identifies itself | Every request from Cowork carries a `User-Agent` header that starts with `copilot-cowork`; match the prefix, not the version |

## Privacy

This section is the privacy statement the package's manifest links to.

- **What the connector sends.** When Cowork calls a connector tool, it sends the tool's
  arguments, such as object names, table names, filters, OData paths, and row limits, to the
  MCP URL in the package, which is the server your organization operates. With authorization
  type `OAuthPluginVault`, the request carries a Microsoft Entra ID access token for the user.
  The server forwards each request to the SAP system configured in its env file and to no
  other host. Tool results travel back the same way.
- **What Microsoft processes.** Cowork is a Microsoft service: the conversation, the skills,
  the tool arguments, and the tool results are processed by Microsoft 365 Copilot under your
  organization's Microsoft agreements. See Microsoft's page on enterprise data protection in
  Microsoft 365 Copilot, listed under [Sources](#sources). Plugin activity appears in Microsoft
  Purview audit logs for your tenant.
- **No telemetry.** The skills and the server contain no analytics, no update checks, and no
  calls to any host other than the SAP system. The server validates Entra tokens with the
  public keys of your tenant's Microsoft Entra ID issuer.
- **The maintainers see nothing.** The maintainers of this repository run no service and
  receive no data from the package, the server, or your SAP system. The only addresses in the
  package that are not yours are the GitHub pages of this repository, which open only when
  someone selects the website, privacy, or terms link.
- **Credentials.** The SAP user and password exist only in the server's env file on your host.
  The package contains no credentials. Tool results never contain credentials.
- **Demo mode.** With authorization type `None`, there is no sign-in, and the secret URL in the
  package is the only protection. Use it for trial systems with demo data only.

## Terms of use

This section is the terms of use the package's manifest links to.

- The skills, the packaging script, and the sap-system MCP server are released under the MIT
  License ([LICENSE](../LICENSE); each skill folder in the package carries a copy as
  `LICENSE.txt`). The software is provided "as is", without warranty of any kind, express or
  implied, and the authors are not liable for any claim or damages arising from its use.
- This is an independent community project. It is not affiliated with, sponsored by, or
  endorsed by SAP SE or Microsoft Corporation. Product names are trademarks of their owners and
  are used only to identify the products the skills and the server work with. As
  [GOVERNANCE.md](../GOVERNANCE.md) states: the maintainer works at Microsoft and runs this
  project in a personal capacity; Microsoft does not review, support, or endorse it.
- You operate the server, the host, the SAP user, and the Microsoft Entra ID configuration, and
  you are responsible for them: for keeping the server read-only, for giving the SAP user
  display authorizations only, for limiting who can sign in, and for using demo mode only with
  demo data.
- The skills are instructions to an AI assistant. Review generated code and answers before you
  use them in a system; see the README and [docs/testing.md](testing.md) for what is and is
  not tested.
- Report security problems as described in [SECURITY.md](../SECURITY.md).

## Sources

Checked on 2026-10-22 unless stated otherwise.

- Build plugins for Copilot Cowork (package layout, icons, manifest versions 1.28 and 1.29,
  validation rules, companion file limits, supported auth types, Dynamic Client Registration,
  the mobile limitation, publishing to the tenant, identifying Cowork traffic):
  https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development
- Customize Copilot Cowork (Upload plugin, the Share dialog, Re-share):
  https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-customize
- Use plugins with Copilot Cowork (the one-time connector sign-in, Sources & Skills):
  https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugins
- Manage plugins for Copilot Cowork (licenses, admin deployment, Information Barriers, audit
  logs, dynamic tool discovery, the supported auth types in Cowork):
  https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-manage-plugins
- Configure Microsoft Entra SSO authentication (the Teams developer portal registration, the
  auth config ID, the redirect URI, the token store client ID, `identifierUris`):
  https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso
- Secure a Model Context Protocol (MCP) server with Microsoft Entra ID (v2 access tokens, the
  Application ID URI, scopes and consent, protected resource metadata, token validation,
  `AADSTS9010010`): https://learn.microsoft.com/entra/agent-id/secure-mcp-server-with-entra-id
- Scopes and permissions in the Microsoft identity platform (`offline_access` and refresh
  tokens): https://learn.microsoft.com/entra/identity-platform/scopes-oidc
- Troubleshoot consent issues in Microsoft Entra ID (the "need admin approval" message and admin
  consent): https://learn.microsoft.com/troubleshoot/entra/entra-id/app-integration/troubleshoot-consent-issues
- Enterprise data protection in Microsoft 365 Copilot and Microsoft 365 Copilot Chat:
  https://learn.microsoft.com/microsoft-365/copilot/enterprise-data-protection
- Microsoft 365 app manifest schema v1.29 (field limits, the `agentSkills` and
  `agentConnectors` objects): https://developer.microsoft.com/json-schemas/teams/v1.29/MicrosoftTeams.schema.json,
  vendored in `schemas/vendor/microsoft-365/` (see its NOTICE.md)
- The sap-system server and its deployment: the [server README](../plugins/sap-abap/mcp/sap-system/README.md)
  and [deploy/sap-system-mcp/README.md](../deploy/sap-system-mcp/README.md) in this repository
