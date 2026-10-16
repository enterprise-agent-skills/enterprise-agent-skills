# Testing skills

Required checks run without any model API key. This page explains what each check proves, how
to write tests for a skill, and how the optional live evaluations fit in.

## What the required checks prove, and what they do not

They prove that:

- every manifest, the catalog, and the README regions match their sources;
- skills, plugins, and scenarios follow the schemas and naming rules;
- code samples marked with a file marker parse in the real language parser;
- each skill's reference answers satisfy its own expected and forbidden patterns;
- each check can fail: empty answers fail, and every documented bad answer fails for the
  reason named in `caught_by`;
- every "Incorrect" example in the acceptance criteria is caught by a forbidden pattern, or by
  a validator under the example's target environment;
- ABAP samples use only syntax that the target SAP release supports (for SAP skills);
- Vally's own lint accepts the skills, and its graders pass on golden answers and fail
  without them.

They do not prove that a model will use the skill well, that generated code activates or
compiles against a real system (parsers check syntax, not types or released APIs), or that a
product behaves as the skill describes. Those need live evaluations and live-system tests.

## Writing acceptance criteria

`tests/scenarios/<skill>/acceptance-criteria.md` lists the rules for good output.

- Number the sections (`## 1. Authentication`) and give each rule a `### 1.1 Correct: ...`
  example and a `### 1.2 Incorrect: ...` example. The headings use the words "Correct" and
  "Incorrect" so the microsoft/skills loader understands them too.
- Start complete examples with a file marker so they are parsed:
  `// file: path` (Apex, CDS, JavaScript), `# file: path` (Python, YAML), `* file: path`
  (ABAP, at column 1). ABAP files need abapGit names such as `zcl_name.clas.abap`,
  `zcl_name.clas.locals_imp.abap`, or `zr_entity.ddls.asddls`.
- Each "Incorrect" example must be caught by a forbidden pattern in one of the skill's
  scenarios. If no automated check can catch it, put
  `<!-- not-detectable: reason -->` on the line before the code block; the report lists it.

## Writing scenarios

`tests/scenarios/<skill>/scenarios.yaml` follows `schemas/skill-scenarios.schema.json`, a
compatible superset of the microsoft/skills schema.

| Field | Purpose |
|-------|---------|
| `prompt` | A realistic request, phrased the way a user would type it, without naming the skill |
| `expected_patterns` | Regexes a correct answer must contain (multiline mode; invalid regexes match literally) |
| `forbidden_patterns` | Regexes that catch known mistakes |
| `validators` | Language validators that must run on the answer: `abaplint`, `apex`, `python`, `javascript`, `json`, `yaml` |
| `mock_response` | A complete reference answer, with file markers for code |
| `negative_responses` | Known-bad answers; each needs `name`, `reason`, `caught_by`, `response` |
| `environment` | SAP target for ABAP answers (see below); top-level default plus per-scenario override |
| `context_files` | Objects that already exist in the target system and that the prompt quotes, for example a BAdI interface: a list of `path` and `content`. Validators parse them together with the answer so references resolve, but only the answer is graded |

Set `caught_by` to `forbidden_pattern`, `validator`, `expected_pattern`, or `environment`. The
check fails if the bad answer is rejected for some other reason, which keeps each negative
control honest.

Use `context_files` only for objects the user would really have, and quote them in the prompt
as well. Without them, an implementation of an interface that is not part of the answer fails
abaplint's syntax check, because the methods cannot be resolved.

Put explanatory prose before the first file marker. Text after a file marker belongs to that
file until the next marker or the end of a fenced code block.

## Validators

| Validator | Files | What it checks | Limits |
|-----------|-------|----------------|--------|
| abaplint (`@abaplint/core`) | `.abap`, `.asddls` | ABAP syntax with the grammar of the target release; for Standard ABAP also abaplint's syntax check (undefined variables, statements the release does not support); for ABAP Cloud the cloud object-type rules; CDS DDL syntax | Syntax only: no SAP type information, no released-API check, no runtime; behavior definitions, metadata extensions, and service definitions are not parsed |
| SAP environment rules (`config/sap-environments.yaml`) | ABAP, CDS, and behavior definition files | Release and database requirements the grammar does not cover: syntax abaplint accepts on releases that are too old (for example `INTO` as the last clause before 7.40 SP08), CDS view entities before 7.55, AMDP and CDS table functions without SAP HANA, RAP behavior definition features before the release that introduced them | Only the features listed in the registry; patterns run on code with comments and literals removed |
| Apex parser (`@apexdevtools/apex-parser`) | `.cls`, `.trigger` | Apex syntax including inline SOQL | Syntax only |
| Python `ast` | `.py` | Python 3 syntax | Needs Python 3 on PATH; required in CI |
| `node --check` | `.js`, `.mjs`, `.cjs` | JavaScript syntax | Syntax only |
| JSON and YAML parsers | `.json`, `.yaml`, `.yml` | Well-formed documents | No schema unless the scenario adds patterns |

Files without a parser are reported as unvalidated, never as passed. In CI (`CI=true`) an
unavailable validator fails the run.

## SAP environments for ABAP

ABAP that is valid on S/4HANA 2023 can be invalid on ECC 6.0 on NetWeaver 7.31, so ABAP and
CDS samples are always validated against an explicit target. Declare it once at the top of
`scenarios.yaml`, and override it per scenario where needed:

```yaml
environment:              # default for all scenarios and criteria examples
  product: ecc            # ecc, netweaver, s4hana, s4hana-private-cloud, s4hana-public-cloud, btp-abap
  release: ehp7           # a release id from config/sap-environments.yaml, or set sap_basis
  support_package: 8      # needed for SAP_BASIS 7.40, where syntax differs by support package
  database: anydb         # hana or anydb (Oracle, Db2, SQL Server, SAP ASE, MaxDB)
  deployment: azure-iaas  # on-premise, azure-iaas, aws-iaas, gcp-iaas, sap-private-cloud, sap-saas
  language_version: standard   # standard or cloud
```

In acceptance criteria and skill reference files, put
`<!-- abap-env: product=ecc release=ehp6 database=anydb -->` on the line before a code block
to validate that block against a different target. Skills declare a default for their own
samples in `metadata.abap-env-default`.

How the target is used:

- **Product, release, and support package** select the SAP_BASIS release and the abaplint
  grammar. When abaplint has no grammar for a release (7.01, 7.30, 7.31, 7.40 SP00 and SP01),
  the nearest older grammar is used, so valid code can be rejected but code that needs a newer
  release is never accepted. Feature rules add the release gates the grammar misses.
- **Language version** switches between Standard ABAP and ABAP Cloud rules. ECC and NetWeaver
  support only Standard ABAP.
- **Database** decides whether SAP HANA-only features such as AMDP are allowed.
- **Deployment** is recorded for documentation and does not change validation. ECC on Azure
  VMs is validated exactly like ECC on premises.

Negative scenarios can use `caught_by: environment` to prove a release or database rule
rejects code, or `caught_by: validator` to prove the grammar rejects syntax the release does
not support. [sap-environments.md](sap-environments.md) lists the products, releases, and
rules.

The release checks themselves are tested. `config/abap-language-features.yaml` lists ABAP
statements and expressions with the release that introduced them, according to SAP's release
news, a program that uses each one, and the equivalent without it.
`tests/unit/abap-release-features.test.mjs` requires every program to fail on the release
before and pass from that release up to S/4HANA 2025, every equivalent to compile on the older
release, and a classic program full of look-alikes to pass on 7.00. When abaplint changes its
release gating, these tests show it.

## Vally

`npm run build` generates `tests/scenarios/<skill>/vally/eval.yaml` from the scenarios: one
stimulus per scenario with the reference answer as a golden patch and one `run-command` grader
that runs `tests/harness/vally-grade.mjs` (the same checks as the mock evaluation). The grader
sees only files, so the explanation part of a reference answer goes into the golden patch as
`answer.md`, and the stimulus asks a live agent to write its explanation there too.
`npm run eval:vally` then runs, with telemetry disabled:

1. `vally lint <plugin>/skills --known-domains config/known-domains.txt --strict`
2. `vally lint --eval-spec <spec> --strict`
3. `vally oracle --eval-spec <spec>`: graders must pass on the golden patch
4. `vally oracle --eval-spec <spec> --no-golden-input`: graders must fail without it

## Live model evaluations (optional, off by default)

The generated specs work for live runs too, because the graders inspect files the agent
writes. To enable the `live-evals` workflow:

1. Create a fine-grained token with the Copilot Requests permission and store it as the
   repository secret `COPILOT_TOKEN`.
2. Set the repository variable `ENABLE_LIVE_EVALS` to `true`.
3. Run the workflow manually and choose a skill.

Locally: `FA_REPO_ROOT=$PWD npx @microsoft/vally-cli@<version> eval -e tests/scenarios/<skill>/vally/eval.yaml`.
Live runs cost model requests and are never part of required checks. After a successful live
verification, a maintainer may set `metadata.last-verified` and move the skill toward stable.

## Live-system tests (planned)

Live-system tests will be opt-in jobs that read credentials from repository secrets, never
run on pull requests from forks, and publish only pass or fail results.

| Product | Planned environment | Planned check |
|---------|--------------------|---------------|
| SAP ABAP Cloud | SAP BTP ABAP environment trial or a company sandbox | Import the reference objects with abapGit, activate, run ATC with the ABAP Cloud variant |
| SAP Standard ABAP | An on-premise ABAP trial system or a company sandbox, ideally one older (ECC 6.0) and one current (S/4HANA) release | Import the reference objects with abapGit into a sandbox package, run the SAP syntax check, activate, run ABAP Unit and ATC, and compare with the offline release checks |
| Salesforce | Developer Edition or scratch org | `sf project deploy start` and `sf apex run test` for the reference code |
| Microsoft Fabric | Fabric trial capacity | Run the reference notebook twice and assert the second run changes nothing |

## Reports

Every command writes Markdown and JSON to `reports/` (ignored by Git). `npm run report`
combines them into `reports/summary.md`; CI attaches the reports as workflow artifacts and
writes them to the job summary.
