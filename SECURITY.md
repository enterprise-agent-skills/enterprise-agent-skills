# Security policy

Agents read skills and act on them, and they run bundled scripts on users' machines. Treat a
skill like code.

## Reporting a vulnerability

Do not open a public issue. Use GitHub private vulnerability reporting: the **Report a
vulnerability** button on the repository's Security tab. Include the affected file, what an
attacker could do, and steps to reproduce. Maintainers acknowledge reports within five working
days and agree on a fix and disclosure timeline with the reporter.

## What counts as a vulnerability here

- Instructions in a skill, reference, or agent file that could make an agent run harmful
  commands, leak data, or hide actions from the user (prompt injection).
- Bundled scripts that download and execute code, send data to unexpected hosts, or modify
  files outside their stated scope.
- MCP server configurations that point to an untrusted or unpinned package.
- Credentials or personal data committed to the repository.
- Weaknesses in the validation tooling that let unsafe content pass the security checks.

## Controls in place

| Control | Where |
|---------|-------|
| Secret patterns, hidden Unicode, pipe-to-shell, TLS bypass, destructive commands, injection phrasing | `npm run security` on every pull request |
| URL domain allowlist for skills | `vally lint --known-domains config/known-domains.txt` |
| No hooks or top-level `bin/` folders in plugins | `npm run validate` |
| Only vendor-published, pinned MCP servers; only credential-free servers may be bundled | `mcp/servers.yaml` and `npm run validate` |
| Bundled scripts listed for mandatory human review | security report and the pull request template |
| Dependency review, CodeQL, OpenSSF Scorecard | `.github/workflows/security.yml`, `scorecard.yml` |
| Least-privilege workflow tokens, actions pinned to commit SHAs | all workflows |

## Hooks

Plugin hooks run commands automatically on users' machines, so they are not accepted yet. A
future policy will define review requirements (readable source, no network access, scoped
file access, sign-off by two maintainers) before the validator allows them.

## Supported versions

Only the latest commit on the default branch is supported. Plugins are versioned; users should
update to the latest version through their agent's plugin manager.
