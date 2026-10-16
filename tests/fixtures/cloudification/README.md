# Fixture: Cloudification Repository sample

`objectReleaseInfo-sample.json` contains seven unmodified entries copied from
`src/objectReleaseInfoLatest.json` in SAP's Cloudification Repository.

| Field | Value |
|-------|-------|
| Source | https://github.com/SAP/abap-atc-cr-cv-s4hc |
| Commit | `60cb7485a8f6cb1e5cfd0e9ebd7b9f4306519e43` |
| Retrieved | 2026-10-14 |
| License | Apache License 2.0 |
| Copyright | SAP SE or an SAP affiliate company |

The fixture lets `tests/unit/skill-scripts.test.mjs` test the `lookup_api_state.py` script
offline. Do not use it as a source of truth; the skill reads the live file.
