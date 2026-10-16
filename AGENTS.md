# Instructions for coding agents working in this repository

This repository publishes Agent Skills and plugins. Most changes are Markdown and YAML; the
tooling is plain Node.js (ES modules, Node 22 or later) with five small dependencies.

## Commands

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Regenerate manifests, catalog, README regions, Vally specs | `npm run build` |
| All credential-free checks | `npm run check` |
| Vally lint and oracle (downloads the CLI with npx) | `npm run eval:vally` |
| One skill's mock evaluation | `npm run eval:mock -- --skill <name>` |
| Scaffold a skill | `npm run new:skill -- --plugin <p> --name <s> --product <id> --category <id>` |

Run `npm run build` after editing any `plugin.yaml`, `SKILL.md`, `scenarios.yaml`, or
`repo.config.yaml`, and commit the generated files. CI fails when they are stale.

## Files you edit and files you do not

- Edit: `plugins/*/plugin.yaml`, `plugins/*/skills/**`, `plugins/*/agents/*.agent.md`,
  `tests/scenarios/*/acceptance-criteria.md`, `tests/scenarios/*/scenarios.yaml`,
  `mcp/servers.yaml`, docs, and tooling under `scripts/` and `tests/harness/`.
- Do not edit by hand: `plugins/*/plugin.json`, `plugins/*/.claude-plugin/`,
  `plugins/*/.cursor-plugin/`, `plugins/*/gemini-extension.json`, `plugins/*/mcp.json`,
  `plugins/*/.mcp.json`, `plugins/*/com.github.copilot/`, `plugins/*/README.md`, the three
  marketplace files, `catalog/catalog.json`, `llms.txt`, `tests/scenarios/*/vally/eval.yaml`,
  and the generated regions of `README.md`.

## Rules

- Follow [docs/style-guide.md](docs/style-guide.md) for all prose: plain, specific, no emoji.
- Never invent product facts. Verify APIs, release states, and commands against official
  documentation, and record the date you checked.
- A skill is not done until its acceptance criteria and scenarios exist, every "Incorrect"
  example is caught by a forbidden pattern, and each scenario has at least one negative
  response with `caught_by` set.
- Do not weaken a test to make it pass. Fix the skill or the reference answer instead.
- Do not add dependencies, network calls in required checks, or anything that needs model
  credentials in required CI.
- Do not put credentials, tokens, or real customer data anywhere in the repository.
