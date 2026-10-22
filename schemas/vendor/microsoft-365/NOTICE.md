# Vendored schema: Microsoft 365 app manifest v1.29

`app-manifest-v1.29.json` is an unmodified copy of the Microsoft 365 app manifest JSON schema,
version 1.29, the manifest format of a Microsoft 365 Copilot Cowork plugin package.

| Field | Value |
|-------|-------|
| Source | [OfficeDev/microsoft-teams-app-schema](https://github.com/OfficeDev/microsoft-teams-app-schema/blob/a2a2ebc/MicrosoftTeams.schema.json), file `MicrosoftTeams.schema.json` at tag `v1.29` |
| Commit | `a2a2ebc` (tag `v1.29`, release "Schema v1.29", 2026-06-22) |
| Published copy | https://developer.microsoft.com/json-schemas/teams/v1.29/MicrosoftTeams.schema.json, byte for byte the same file (SHA-256 `53e860fd650fd03fe587379d92af6c91374e791f041ce3f26c92d5e74aeafa0b`) |
| Retrieved | 2026-10-22 |
| License | MIT License (SPDX `MIT`) |
| License text | [LICENSE](LICENSE) in this folder, an unmodified copy of the upstream `LICENSE` file |
| Copyright | Microsoft Corporation, as stated in the upstream `LICENSE` file |
| NOTICE file | None in the upstream repository, so there is no NOTICE text to pass on |
| License checked | 2026-10-22 |

The file name does not end in `.schema.json` on purpose: `scripts/lib/schema.mjs` registers
every `*.schema.json` file under `schemas/` with a JSON Schema 2020-12 validator, and this schema
declares draft-04. `scripts/cowork-package.mjs` loads it on its own, with the draft-07 validator
in Ajv and the `$schema` keyword removed, which accepts the draft-04 keywords this schema uses
(it uses no boolean `exclusiveMinimum` or `exclusiveMaximum` and no `id`).

To update: download the new version from the published URL above into a new file, compare it
with the file at the matching tag in the upstream repository, update the table, check the
upstream license again, and change the file name in `scripts/cowork-package.mjs`.
