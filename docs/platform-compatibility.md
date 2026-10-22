# Platform compatibility

Each plugin folder is built once and read by different agents through different manifests.
This page records what each platform reads, the source used, and what has been verified.

Status levels:

- **Schema-checked**: the generated file passes a schema in `schemas/` on every pull request.
- **Vendor-validated**: the vendor's own validation command accepted the file.
- **Installed**: someone installed the plugin in the product and used a skill. Recorded with date.

## Matrix

In the Install column, `<owner>/<repo>` is `enterprise-agent-skills/enterprise-agent-skills`
and every install name has the form `<plugin>@enterprise-agent-skills`. The README's Install
section shows the full commands for `sap-abap` and how to update.

| Platform | Reads | Install | Source (checked 2026-10-14) | Status |
|----------|-------|---------|------------------------------|--------|
| Claude Code | `.claude-plugin/marketplace.json`, `plugins/<p>/.claude-plugin/plugin.json`, `skills/`, `agents/`, `.mcp.json` | `/plugin marketplace add <owner>/<repo>` then `/plugin install <plugin>@enterprise-agent-skills` | https://claude.com/docs/plugins/build | Schema-checked; vendor-validated; installed and used (see the verification table below) |
| Claude Cowork and claude.ai | Same as Claude Code; local MCP servers and agents load in Cowork only | Customize > Plugins > Add > Add marketplace | https://claude.com/docs/plugins/platform-support | Schema-checked |
| Microsoft 365 Copilot Cowork | A skill ZIP with `SKILL.md` at its root, or skill folders in OneDrive `/Documents/Cowork/skills/`; a Claude plugin package ZIP, which Cowork converts | Customize > Skills > arrow next to Add > Upload skill with `<skill>-copilot-cowork.zip`; Customize > Plugins > Upload plugin with `plugin-<plugin>-copilot-cowork.zip` | https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-customize; https://learn.microsoft.com/microsoft-365/copilot/cowork/use-cowork (checked 2026-10-21) | Packaged; not yet verified |
| GitHub Copilot CLI | Agent Plugins `plugin.json` (preferred), `.github/plugin/marketplace.json`, `skills/`, `com.github.copilot/agents/`, `mcp.json` | `copilot plugin marketplace add <owner>/<repo>` then `copilot plugin install <plugin>@enterprise-agent-skills` | https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference | Schema-checked; installed and used (see the verification table below) |
| GitHub Copilot in VS Code | Agent Skills in project or user skill folders | `npx skills add <owner>/<repo> --skill <skill>` | https://code.visualstudio.com/docs/copilot/customization/agent-skills | Schema-checked (skills follow the Agent Skills spec) |
| OpenAI Codex | Agent Plugins `plugin.json`, `.agents/plugins/marketplace.json`, `skills/`, `mcp.json` | Codex CLI: `codex plugin marketplace add <owner>/<repo>`, then enter `/plugins`, install the plugin, and start a new session. The Codex IDE extension does not support plugins. | https://developers.openai.com/plugins/build/plugins; https://learn.chatgpt.com/docs/plugins (checked 2026-10-21) | Schema-checked; Codex `category` values not yet confirmed |
| Cursor | `.cursor-plugin/plugin.json` (with `mcpServers` as `./.mcp.json` or inline), `skills/`; Agent Skills via `npx skills` | `npx skills add <owner>/<repo> --skill <skill>` | Manifest modeled on github.com/microsoft/skills; https://cursor.com/docs/reference/plugins (checked 2026-10-22) | Schema-checked |
| Gemini CLI | `gemini-extension.json` (MCP servers and settings); Agent Skills via `npx skills` | `npx skills add <owner>/<repo> --skill <skill>` | https://geminicli.com/docs/extensions/reference/ (checked 2026-10-22); github.com/microsoft/skills | Schema-checked; skill loading from extensions depends on CLI version |
| Other Agent Skills agents | `SKILL.md` folders | `npx skills add <owner>/<repo>` | https://agentskills.io | Schema-checked |

## Notes

- **Skill names must be unique.** Copilot and `npx skills` deduplicate by `name`; a project or
  personal skill with the same name overrides a plugin skill.
- **Agents.** Claude Code reads `agents/`. In Agent Plugins mode, Copilot reads agents from
  `com.github.copilot/agents/`, so the build copies them there. Agent files omit `tools`
  because tool names differ between products.
- **MCP servers.** The Agent Plugins `mcp.json` uses `streamable-http` for remote servers;
  Claude's `.mcp.json` uses `http`; Gemini uses `httpUrl`. All of them, and the Cursor and
  Gemini manifests, are generated from `mcp/servers.yaml`. A server published from this
  repository is started from the plugin folder with each platform's own variable; see
  [Bundled MCP server](#bundled-mcp-server).
- **Hooks.** Not used. Hook formats differ by product and hooks execute code automatically.

## Bundled MCP server

The `sap-abap` plugin bundles `sap-system`, a read-only server whose code lives in
`plugins/sap-abap/mcp/sap-system/`. Each platform starts it as
`node <plugin root>/mcp/sap-system/launch.mjs serve`, with the plugin root written as the
variable that platform expands. The connection details (SAP URL, user, password, client,
language) reach the server as environment variables where the platform can ask for them, and
from a config file in the user's profile (written by `launch.mjs setup`) everywhere else; the
plugin itself never holds a value.

| Platform | File the build writes | Plugin root variable | How the connection details reach the server | Source (checked 2026-10-22) |
|----------|-----------------------|----------------------|---------------------------------------------|------------------------------|
| Claude Code | `.mcp.json` with `env` values `${user_config.<key>}`; `userConfig` in `.claude-plugin/plugin.json` | `${CLAUDE_PLUGIN_ROOT}` | Prompted when the plugin is enabled; sensitive values go to the platform's secure credential store, the rest to `pluginConfigs` in the user's settings | https://code.claude.com/docs/en/plugins-reference (User configuration, Environment variables) |
| Claude Cowork and claude.ai | Same files, but the server does not start: chat ignores local MCP servers, and Cowork ignores a server whose `${user_config.*}` reference names an option without a default and does not prompt for values | `${CLAUDE_PLUGIN_ROOT}` | Not on these surfaces; the skills ask you for the release instead | https://claude.com/docs/plugins/platform-support (checked 2026-10-22) |
| GitHub Copilot CLI | `mcp.json` (Agent Plugins), `type: stdio`, no `env` | `${PLUGIN_ROOT}` | Setup command. The Agent Plugins specification forbids secrets in `env` and expands only `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` | https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference; Agent Plugins specification 1.0.0, sections 7.2.1 and 9.2 |
| OpenAI Codex | `mcp.json` (Agent Plugins) | `${PLUGIN_ROOT}` | Setup command. Codex documents `PLUGIN_ROOT` for hook commands; its expansion in `mcp.json` is not confirmed, and local servers count as desktop-only plugins | https://developers.openai.com/plugins/build/plugins |
| Cursor | Inline `mcpServers` in `.cursor-plugin/plugin.json` | `${CURSOR_PLUGIN_ROOT}` (Cursor does not expand `${PLUGIN_ROOT}`) | Setup command. Cursor substitutes only its own plugin variables, not `${user_config.*}`, so the Claude file is not reused | https://cursor.com/docs/reference/plugins |
| Gemini CLI | `mcpServers` and `settings` in `gemini-extension.json` | `${extensionPath}` | Prompted when the extension is installed (`gemini extensions config <name>` later); sensitive values go to the system keychain. The server receives only the declared settings plus a few standard variables such as `HOME` and `PATH` | https://geminicli.com/docs/extensions/reference/ |
| Microsoft 365 Copilot Cowork | None; Cowork cannot start a local server | n/a | The same server in its HTTPS mode on your own host; see [copilot-cowork.md](copilot-cowork.md) | https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-customize |

The server reads its configuration from the process environment first, then from the file
named by `SAP_SYSTEM_MCP_ENV`, else from `%APPDATA%\enterprise-agent-skills\sap-system.env` on
Windows or `$XDG_CONFIG_HOME/enterprise-agent-skills/sap-system.env` (default
`~/.config/enterprise-agent-skills/sap-system.env`) elsewhere. `npm run validate` checks that
the launcher exists, that only `sap-abap` bundles the server, that the Agent Plugins
`mcp.json` passes the vendored schema, and that every `${user_config.*}` reference in
`.mcp.json` is declared in `userConfig`.

## Recording a verification

When you install a plugin on a platform and confirm a skill loads and triggers, add a row to
the table below in your pull request.

| Date | Platform and version | Plugin and version | Result | Verified by |
|------|---------------------|--------------------|--------|-------------|
| 2026-10-14 | Claude Code 2.1.281, `claude plugin validate` | sap-abap (pre-release name sap-abap-cloud), microsoft-fabric, salesforce-platform 0.1.0, and the marketplace | Validation passed (manifest check only, not an install) | Initial setup |
| 2026-10-15 | Claude Code 2.1.281, `claude plugin validate` | sap-abap 0.2.0, microsoft-fabric 0.1.0, salesforce-platform 0.1.0, and the marketplace | Validation passed (manifest check only, not an install) | Pre-release check |
| 2026-10-21 | Claude Code 2.1.281 | sap-abap 0.2.0 from the enterprise-agent-skills marketplace on GitHub (release v0.1.0) | Installed. `claude plugin details` lists the 5 skills and the agent (shown as `abap-reviewer.agent`, from its file name). A headless prompt about ECC 6.0 EHP6 used `sap-abap-standard` without being told to and answered correctly | Maintainer |
| 2026-10-21 | GitHub Copilot CLI 1.0.86 | sap-abap 0.2.0 from the enterprise-agent-skills marketplace on GitHub (release v0.1.0) | Installed; 5 skills. In a non-interactive run (`copilot -p`) the same question was answered without the skill. With the skill named in the prompt and `--allow-tool skill`, it used `sap-abap-standard` and answered correctly | Maintainer |
