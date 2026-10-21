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
| GitHub Copilot CLI | Agent Plugins `plugin.json` (preferred), `.github/plugin/marketplace.json`, `skills/`, `com.github.copilot/agents/`, `mcp.json` | `copilot plugin marketplace add <owner>/<repo>` then `copilot plugin install <plugin>@enterprise-agent-skills` | https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference | Schema-checked; installed and used (see the verification table below) |
| GitHub Copilot in VS Code | Agent Skills in project or user skill folders | `npx skills add <owner>/<repo> --skill <skill>` | https://code.visualstudio.com/docs/copilot/customization/agent-skills | Schema-checked (skills follow the Agent Skills spec) |
| OpenAI Codex | Agent Plugins `plugin.json`, `.agents/plugins/marketplace.json`, `skills/`, `mcp.json` | Codex CLI: `codex plugin marketplace add <owner>/<repo>`, then enter `/plugins`, install the plugin, and start a new session. The Codex IDE extension does not support plugins. | https://developers.openai.com/plugins/build/plugins; https://learn.chatgpt.com/docs/plugins (checked 2026-10-21) | Schema-checked; Codex `category` values not yet confirmed |
| Cursor | `.cursor-plugin/plugin.json`, `skills/`, `.mcp.json`; Agent Skills via `npx skills` | `npx skills add <owner>/<repo> --skill <skill>` | Manifest modeled on github.com/microsoft/skills | Schema-checked |
| Gemini CLI | `gemini-extension.json` (MCP servers); Agent Skills via `npx skills` | `npx skills add <owner>/<repo> --skill <skill>` | Gemini CLI extension docs; github.com/microsoft/skills | Schema-checked; skill loading from extensions depends on CLI version |
| Other Agent Skills agents | `SKILL.md` folders | `npx skills add <owner>/<repo>` | https://agentskills.io | Schema-checked |

## Notes

- **Skill names must be unique.** Copilot and `npx skills` deduplicate by `name`; a project or
  personal skill with the same name overrides a plugin skill.
- **Agents.** Claude Code reads `agents/`. In Agent Plugins mode, Copilot reads agents from
  `com.github.copilot/agents/`, so the build copies them there. Agent files omit `tools`
  because tool names differ between products.
- **MCP servers.** The Agent Plugins `mcp.json` uses `streamable-http` for remote servers;
  Claude's `.mcp.json` uses `http`; Gemini uses `httpUrl`. All three are generated from
  `mcp/servers.yaml`.
- **Hooks.** Not used. Hook formats differ by product and hooks execute code automatically.

## Recording a verification

When you install a plugin on a platform and confirm a skill loads and triggers, add a row to
the table below in your pull request.

| Date | Platform and version | Plugin and version | Result | Verified by |
|------|---------------------|--------------------|--------|-------------|
| 2026-10-14 | Claude Code 2.1.281, `claude plugin validate` | sap-abap (pre-release name sap-abap-cloud), microsoft-fabric, salesforce-platform 0.1.0, and the marketplace | Validation passed (manifest check only, not an install) | Initial setup |
| 2026-10-15 | Claude Code 2.1.281, `claude plugin validate` | sap-abap 0.2.0, microsoft-fabric 0.1.0, salesforce-platform 0.1.0, and the marketplace | Validation passed (manifest check only, not an install) | Pre-release check |
| 2026-10-21 | Claude Code 2.1.281 | sap-abap 0.2.0 from the enterprise-agent-skills marketplace on GitHub (release v0.1.0) | Installed. `claude plugin details` lists the 5 skills and the agent (shown as `abap-reviewer.agent`, from its file name). A headless prompt about ECC 6.0 EHP6 used `sap-abap-standard` without being told to and answered correctly | Maintainer |
| 2026-10-21 | GitHub Copilot CLI 1.0.86 | sap-abap 0.2.0 from the enterprise-agent-skills marketplace on GitHub (release v0.1.0) | Installed; 5 skills. In a non-interactive run (`copilot -p`) the same question was answered without the skill. With the skill named in the prompt and `--allow-tool skill`, it used `sap-abap-standard` and answered correctly | Maintainer |
