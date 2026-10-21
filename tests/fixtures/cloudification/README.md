# Fixture: Cloudification Repository sample

`objectReleaseInfo-sample.json` is an excerpt of `src/objectReleaseInfoLatest.json` in SAP's
Cloudification Repository: seven entries copied without changes, inside the same top-level
structure (`formatVersion` and `objectReleaseInfo`). Nothing else from that repository is
included.

| Field | Value |
|-------|-------|
| Source | [SAP/abap-atc-cr-cv-s4hc](https://github.com/SAP/abap-atc-cr-cv-s4hc), file `src/objectReleaseInfoLatest.json` |
| Commit | `60cb7485a8f6cb1e5cfd0e9ebd7b9f4306519e43` |
| Retrieved | 2026-10-14 |
| License | Apache License 2.0 (SPDX `Apache-2.0`), applied to every file in that repository by its `REUSE.toml` |
| License text | [LICENSES/Apache-2.0.txt](../../../LICENSES/Apache-2.0.txt) |
| NOTICE file | None in the upstream repository, so there is no NOTICE text to pass on |
| License checked | 2026-10-21 |

## Copyright notice

SAP's repository states the copyright in two places. Both are quoted exactly as they appear at
the commit above.

- `REUSE.toml`, which covers every file (`path = "**"`):
  `SPDX-FileCopyrightText = "2020-2023 SAP SE or an SAP affiliate company and project abap-atc-cr-cv-s4hc contributors"`
- `README.md`, section "Licensing":
  "Copyright 2020-2025 SAP SE or an SAP affiliate company and abap-atc-cr-cv-s4hc contributors."

## Use

The fixture lets `tests/unit/skill-scripts.test.mjs` test the `lookup_api_state.py` script
offline. Do not use it as a source of truth; the skill reads the live file.
