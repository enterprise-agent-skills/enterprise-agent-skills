# SAP environments

How the SAP skills and their tests describe a target system, which skill applies to which
system, and what the offline checks can and cannot prove. The tables marked as generated come
from [config/sap-environments.yaml](../config/sap-environments.yaml) and
[config/abap-language-features.yaml](../config/abap-language-features.yaml); edit those files
and run `npm run build`.

## Where SAP runs does not decide the code

Two questions are kept apart:

1. **Where does the system run?** In a customer data center, on virtual machines the customer
   manages on Microsoft Azure, AWS, or Google Cloud, in SAP's private cloud (S/4HANA Cloud
   Private Edition), or as SAP-managed SaaS (S/4HANA Cloud Public Edition, SAP BTP ABAP
   environment).
2. **Which ABAP applies?** The product and release, the SAP_BASIS release and support
   package, the ABAP language version (Standard ABAP or ABAP for Cloud Development), and the
   database (SAP HANA or another database).

Only the second question changes what code is valid. An ECC 6.0 EHP8 system on Oracle runs the
same ABAP on Azure virtual machines as in a data center, and the tests treat both identically.
Running SAP on IaaS adds operating system, database, kernel, and VM prerequisites, which SAP
documents per provider:

| Provider | Supported products and VM types | Support prerequisites |
|----------|---------------------------------|-----------------------|
| Microsoft Azure | SAP Note 1928533 | SAP Note 2015553 |
| AWS | SAP Note 1656099 | SAP Note 1656250 |
| Google Cloud | SAP Note 2456432 | SAP Note 2456406 |

ABAP Cloud restrictions apply only where the language version is ABAP for Cloud Development:
always in S/4HANA Cloud Public Edition and the SAP BTP ABAP environment, and per object in
S/4HANA 2022 or later (on premises, on IaaS, or in Private Edition), where Standard ABAP
remains allowed alongside it.

## Which skill applies

<!-- BEGIN GENERATED: sap-skills (edit with npm run build) -->
| Skill | SAP systems | ABAP model | Minimum SAP_BASIS | Where SAP runs |
| --- | --- | --- | --- | --- |
| [sap-abap-enhancements](../plugins/sap-abap/skills/sap-abap-enhancements/SKILL.md) | SAP ECC 6.0, SAP NetWeaver AS ABAP, SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition | Standard ABAP | 7.00 | On premises (customer data center); Microsoft Azure virtual machines (customer-managed); AWS EC2 (customer-managed); Google Compute Engine (customer-managed); SAP-managed private cloud (RISE with SAP; S/4HANA Cloud Private Edition or SAP ERP private edition) |
| [sap-abap-integration](../plugins/sap-abap/skills/sap-abap-integration/SKILL.md) | SAP ECC 6.0, SAP NetWeaver AS ABAP, SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition | Standard ABAP | 7.00 | On premises (customer data center); Microsoft Azure virtual machines (customer-managed); AWS EC2 (customer-managed); Google Compute Engine (customer-managed); SAP-managed private cloud (RISE with SAP; S/4HANA Cloud Private Edition or SAP ERP private edition) |
| [sap-abap-standard](../plugins/sap-abap/skills/sap-abap-standard/SKILL.md) | SAP ECC 6.0, SAP NetWeaver AS ABAP, SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition | Standard ABAP | 7.00 | On premises (customer data center); Microsoft Azure virtual machines (customer-managed); AWS EC2 (customer-managed); Google Compute Engine (customer-managed); SAP-managed private cloud (RISE with SAP; S/4HANA Cloud Private Edition or SAP ERP private edition) |
| [sap-clean-core-check](../plugins/sap-abap/skills/sap-clean-core-check/SKILL.md) | SAP ECC 6.0, SAP NetWeaver AS ABAP, SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition, SAP S/4HANA Cloud Public Edition, SAP BTP ABAP environment | Standard ABAP, ABAP Cloud | 7.00 | On premises (customer data center); Microsoft Azure virtual machines (customer-managed); AWS EC2 (customer-managed); Google Compute Engine (customer-managed); SAP-managed private cloud (RISE with SAP; S/4HANA Cloud Private Edition or SAP ERP private edition); SAP-managed public cloud (S/4HANA Cloud Public Edition, SAP BTP ABAP environment) |
| [sap-rap-business-object](../plugins/sap-abap/skills/sap-rap-business-object/SKILL.md) | SAP S/4HANA (on-premise), SAP S/4HANA Cloud Private Edition, SAP S/4HANA Cloud Public Edition, SAP BTP ABAP environment | ABAP Cloud | 7.57 | On premises (customer data center); Microsoft Azure virtual machines (customer-managed); AWS EC2 (customer-managed); Google Compute Engine (customer-managed); SAP-managed private cloud (RISE with SAP; S/4HANA Cloud Private Edition or SAP ERP private edition); SAP-managed public cloud (S/4HANA Cloud Public Edition, SAP BTP ABAP environment) |
<!-- END GENERATED: sap-skills -->

In short:

- Standard ABAP on ECC 6.0, NetWeaver AS ABAP, or S/4HANA, wherever it runs:
  [sap-abap-standard](../plugins/sap-abap/skills/sap-abap-standard/SKILL.md).
- ABAP Cloud and RAP on S/4HANA 2022 or later, Private Edition, Public Edition, or the BTP ABAP
  environment: [sap-rap-business-object](../plugins/sap-abap/skills/sap-rap-business-object/SKILL.md).
  RAP also exists in Standard ABAP from S/4HANA 1909 (unmanaged) and 2020 (managed with
  draft); the feature rules below catch BDEF syntax that is too new for the target.
- Checking classic code against released APIs before an upgrade or a move to ABAP Cloud:
  [sap-clean-core-check](../plugins/sap-abap/skills/sap-clean-core-check/SKILL.md).

## Products

<!-- BEGIN GENERATED: sap-products (edit with npm run build) -->
| Product | Databases | ABAP language versions | Where it runs |
| --- | --- | --- | --- |
| SAP ECC 6.0 | Other database (Oracle, IBM Db2, Microsoft SQL Server, SAP ASE, SAP MaxDB); SAP HANA | Standard ABAP | On premises (customer data center); Microsoft Azure virtual machines (customer-managed); AWS EC2 (customer-managed); Google Compute Engine (customer-managed); SAP-managed private cloud (RISE with SAP; S/4HANA Cloud Private Edition or SAP ERP private edition) |
| SAP NetWeaver AS ABAP | Other database (Oracle, IBM Db2, Microsoft SQL Server, SAP ASE, SAP MaxDB); SAP HANA | Standard ABAP | On premises (customer data center); Microsoft Azure virtual machines (customer-managed); AWS EC2 (customer-managed); Google Compute Engine (customer-managed) |
| SAP S/4HANA (on-premise) | SAP HANA | Standard ABAP, ABAP Cloud (SAP_BASIS 7.57 and later) | On premises (customer data center); Microsoft Azure virtual machines (customer-managed); AWS EC2 (customer-managed); Google Compute Engine (customer-managed) |
| SAP S/4HANA Cloud Private Edition | SAP HANA | Standard ABAP, ABAP Cloud (SAP_BASIS 7.57 and later) | SAP-managed private cloud (RISE with SAP; S/4HANA Cloud Private Edition or SAP ERP private edition) |
| SAP S/4HANA Cloud Public Edition | SAP HANA | ABAP Cloud | SAP-managed public cloud (S/4HANA Cloud Public Edition, SAP BTP ABAP environment) |
| SAP BTP ABAP environment | SAP HANA | ABAP Cloud | SAP-managed public cloud (S/4HANA Cloud Public Edition, SAP BTP ABAP environment) |
<!-- END GENERATED: sap-products -->

## Releases and grammars

Each customer-managed release maps to one SAP_BASIS release. Where abaplint has no grammar for
that exact release, the mapping goes down to the nearest older grammar, so code that needs a
newer release is never accepted. For SAP_BASIS 7.40 the support package selects the grammar,
because SAP added syntax in SP02, SP05, and SP08.

<!-- BEGIN GENERATED: sap-releases (edit with npm run build) -->
| Product | Release | product / release id | SAP_BASIS | ABAP language versions | abaplint grammar (Standard ABAP) |
| --- | --- | --- | --- | --- | --- |
| SAP ECC 6.0 | ECC 6.0 | `ecc` / `ehp0` | 7.00 | Standard ABAP | `v700` |
| SAP ECC 6.0 | ECC 6.0 EHP1 | `ecc` / `ehp1` | 7.00 | Standard ABAP | `v700` |
| SAP ECC 6.0 | ECC 6.0 EHP2 | `ecc` / `ehp2` | 7.00 | Standard ABAP | `v700` |
| SAP ECC 6.0 | ECC 6.0 EHP3 | `ecc` / `ehp3` | 7.00 | Standard ABAP | `v700` |
| SAP ECC 6.0 | ECC 6.0 EHP4 | `ecc` / `ehp4` | 7.01 | Standard ABAP | `v700` (mapped down) |
| SAP ECC 6.0 | ECC 6.0 EHP5 | `ecc` / `ehp5` | 7.02 | Standard ABAP | `v702` |
| SAP ECC 6.0 | ECC 6.0 EHP6 | `ecc` / `ehp6` | 7.31 | Standard ABAP | `v702` (mapped down) |
| SAP ECC 6.0 | ECC 6.0 EHP6 for SAP HANA | `ecc` / `ehp6-hana` | 7.40 | Standard ABAP | SP00-01: `v702`; SP02-04: `v740sp02`; SP05-07: `v740sp05`; SP08+: `v740sp08` |
| SAP ECC 6.0 | ECC 6.0 EHP7 | `ecc` / `ehp7` | 7.40 | Standard ABAP | SP00-01: `v702`; SP02-04: `v740sp02`; SP05-07: `v740sp05`; SP08+: `v740sp08` |
| SAP ECC 6.0 | ECC 6.0 EHP8 | `ecc` / `ehp8` | 7.50 | Standard ABAP | `v750` |
| SAP NetWeaver AS ABAP | NetWeaver 7.0 | `netweaver` / `700` | 7.00 | Standard ABAP | `v700` |
| SAP NetWeaver AS ABAP | NetWeaver 7.0 EHP1 | `netweaver` / `701` | 7.01 | Standard ABAP | `v700` (mapped down) |
| SAP NetWeaver AS ABAP | NetWeaver 7.0 EHP2 | `netweaver` / `702` | 7.02 | Standard ABAP | `v702` |
| SAP NetWeaver AS ABAP | NetWeaver 7.0 EHP3 | `netweaver` / `703` | 7.31 | Standard ABAP | `v702` (mapped down) |
| SAP NetWeaver AS ABAP | NetWeaver 7.3 | `netweaver` / `730` | 7.30 | Standard ABAP | `v702` (mapped down) |
| SAP NetWeaver AS ABAP | NetWeaver 7.3 EHP1 | `netweaver` / `731` | 7.31 | Standard ABAP | `v702` (mapped down) |
| SAP NetWeaver AS ABAP | NetWeaver 7.4 | `netweaver` / `740` | 7.40 | Standard ABAP | SP00-01: `v702`; SP02-04: `v740sp02`; SP05-07: `v740sp05`; SP08+: `v740sp08` |
| SAP NetWeaver AS ABAP | NetWeaver 7.5 | `netweaver` / `750` | 7.50 | Standard ABAP | `v750` |
| SAP NetWeaver AS ABAP | AS ABAP 7.51 innovation package | `netweaver` / `751` | 7.51 | Standard ABAP | `v751` |
| SAP NetWeaver AS ABAP | AS ABAP 7.52 | `netweaver` / `752` | 7.52 | Standard ABAP | `v752` |
| SAP S/4HANA (on-premise) | S/4HANA 1511 | `s4hana` / `1511` | 7.50 | Standard ABAP | `v750` |
| SAP S/4HANA (on-premise) | S/4HANA 1610 | `s4hana` / `1610` | 7.51 | Standard ABAP | `v751` |
| SAP S/4HANA (on-premise) | S/4HANA 1709 | `s4hana` / `1709` | 7.52 | Standard ABAP | `v752` |
| SAP S/4HANA (on-premise) | S/4HANA 1809 | `s4hana` / `1809` | 7.53 | Standard ABAP | `v753` |
| SAP S/4HANA (on-premise) | S/4HANA 1909 | `s4hana` / `1909` | 7.54 | Standard ABAP | `v754` |
| SAP S/4HANA (on-premise) | S/4HANA 2020 | `s4hana` / `2020` | 7.55 | Standard ABAP | `v755` |
| SAP S/4HANA (on-premise) | S/4HANA 2021 | `s4hana` / `2021` | 7.56 | Standard ABAP | `v756` |
| SAP S/4HANA (on-premise) | S/4HANA 2022 | `s4hana` / `2022` | 7.57 | Standard ABAP, ABAP Cloud | `v757` |
| SAP S/4HANA (on-premise) | S/4HANA 2023 | `s4hana` / `2023` | 7.58 | Standard ABAP, ABAP Cloud | `v758` |
| SAP S/4HANA (on-premise) | S/4HANA 2025 | `s4hana` / `2025` | 8.16 | Standard ABAP, ABAP Cloud | `v816` |
| SAP S/4HANA Cloud Private Edition | Private Edition 2020 | `s4hana-private-cloud` / `2020` | 7.55 | Standard ABAP | `v755` |
| SAP S/4HANA Cloud Private Edition | Private Edition 2021 | `s4hana-private-cloud` / `2021` | 7.56 | Standard ABAP | `v756` |
| SAP S/4HANA Cloud Private Edition | Private Edition 2022 | `s4hana-private-cloud` / `2022` | 7.57 | Standard ABAP, ABAP Cloud | `v757` |
| SAP S/4HANA Cloud Private Edition | Private Edition 2023 | `s4hana-private-cloud` / `2023` | 7.58 | Standard ABAP, ABAP Cloud | `v758` |
| SAP S/4HANA Cloud Private Edition | Private Edition 2025 | `s4hana-private-cloud` / `2025` | 8.16 | Standard ABAP, ABAP Cloud | `v816` |
| SAP S/4HANA Cloud Public Edition | current release | `s4hana-public-cloud` / `current` | current cloud release | ABAP Cloud | `Cloud` |
| SAP BTP ABAP environment | current release | `btp-abap` / `current` | current cloud release | ABAP Cloud | `Cloud` |
<!-- END GENERATED: sap-releases -->

Facts behind the mapping, from SAP's ABAP release news and platform documentation:

- 7.01 has no ABAP changes compared with 7.00. 7.02 brought string templates, string
  functions, secondary keys, and more from the 7.1/7.2 codeline.
- SAP NetWeaver 7.0 EHP3 (7.03) was renamed 7.3 EHP1 (7.31); both are SAP_BASIS 731. ECC 6.0
  EHP6 runs on it. NetWeaver 7.3 (7.30) is a separate release track.
- ECC 6.0 EHP6 for SAP HANA runs on 7.40, outside the regular EHP sequence. ECC on SAP HANA
  needs SAP_BASIS 7.40 or later.
- AS ABAP 7.51 and 7.52 also shipped standalone and support other databases. From 7.53 the
  ABAP platform ships only with S/4HANA and runs on SAP HANA only.
- S/4HANA 2025 runs ABAP release 8.16, the successor of 7.58. There is no S/4HANA 2024 and no
  ABAP 7.59.
- ABAP for Cloud Development is available on premises and in Private Edition from S/4HANA
  2022 (7.57).

## Describing a target

The same keys work in three places.

In `tests/scenarios/<skill>/scenarios.yaml`, as a default for all scenarios and as an override
per scenario:

```yaml
environment:
  product: ecc
  release: ehp7
  support_package: 8
  database: anydb
  deployment: azure-iaas
```

In Markdown (acceptance criteria and skill references), on the line before a code fence:

```text
<!-- abap-env: product=s4hana release=2023 -->
```

In skill metadata, `abap-env-default` gives the environment for code blocks without a
directive. SAP skills also declare `sap-products`, `sap-deployments`, `abap-language-version`,
and `sap-basis-min`, which feed the catalog.

| Key | Values | Required |
|-----|--------|----------|
| `product` | `ecc`, `netweaver`, `s4hana`, `s4hana-private-cloud`, `s4hana-public-cloud`, `btp-abap` | Yes |
| `release` | A release id from the table above, for example `ehp6` or `2023` | `release` or `sap_basis` |
| `sap_basis` | For example `7.31` | `release` or `sap_basis` |
| `support_package` | Number; required for SAP_BASIS 7.40 | For 7.40 |
| `database` | `hana` or `anydb` | When the product supports both |
| `language_version` | `standard` or `cloud` | No; defaults to `standard` where available |
| `deployment` | `on-premise`, `azure-iaas`, `aws-iaas`, `gcp-iaas`, `sap-private-cloud`, `sap-saas` | No; informational |

Contradictory targets are rejected before any code is checked, for example SAP_BASIS 7.40
without a support package, ECC on SAP HANA below 7.40, or ABAP for Cloud Development on
S/4HANA 2021.

## How a target becomes checks

1. The environment resolves to an SAP_BASIS release, support package, language version, and
   database.
2. The release selects the abaplint grammar (table above). ABAP for Cloud Development uses
   abaplint's `Cloud` grammar.
3. Standard ABAP runs abaplint's parser, CDS parser, and syntax check. The syntax check
   catches statements the release does not know and undefined variables. ABAP Cloud runs the
   parser, CDS parser, and cloud object-type rules.
4. The error namespace is limited to the objects in the answer, so references to SAP
   standard objects, or to customer objects that are not part of the answer, count as
   external instead of failing.
5. Feature rules cover release and database requirements the grammar does not enforce. They
   run on the code with comments and literal contents removed.

<!-- BEGIN GENERATED: sap-feature-rules (edit with npm run build) -->
| Rule | Detects | Needs | Source |
| --- | --- | --- | --- |
| `cds-ddic-based-view` | DDIC-based CDS views (define view with an SQL view name) | SAP_BASIS 7.40 SP05 or later | ABAP Keyword Documentation, release news 7.40 SP05 (ABAP CDS) |
| `cds-view-entity` | CDS view entities (define view entity) | SAP_BASIS 7.55 or later | ABAP Keyword Documentation, release news 7.55 (CDS view entities) |
| `amdp` | ABAP Managed Database Procedures (AMDP) | SAP_BASIS 7.40 SP05 or later; SAP HANA | ABAP Keyword Documentation, release news 7.40 SP05 (AMDP); AMDP runs on SAP HANA only |
| `cds-table-function` | CDS table functions (define table function), implemented with AMDP | SAP_BASIS 7.50 or later; SAP HANA | ABAP Keyword Documentation, ABAP CDS in Release 7.50 (CDS table functions need a database that supports AMDP) |
| `rap-unmanaged` | RAP unmanaged business object (behavior definition) | SAP_BASIS 7.54 or later | ABAP Platform for SAP S/4HANA 1909 (RAP generally available for queries and unmanaged scenarios) |
| `rap-managed` | RAP managed business object (behavior definition) | SAP_BASIS 7.55 or later | ABAP Platform for SAP S/4HANA 2020 (managed scenario with draft support) |
| `rap-draft` | RAP draft handling (with draft) | SAP_BASIS 7.55 or later | ABAP Keyword Documentation, RAP BDL in Release 7.55 (with draft) |
| `bdef-strict` | Behavior definition strict mode (strict;) | SAP_BASIS 7.56 or later | ABAP Keyword Documentation, RAP BDL in Release 7.56 (strict mode) |
| `bdef-strict-2` | Behavior definition strict mode version 2 (strict ( 2 );) | SAP_BASIS 7.57 or later | ABAP Keyword Documentation, RAP BDL in Release 7.57 (strict mode version 2) |
| `abap-unit-test-properties` | RISK LEVEL and DURATION additions of CLASS ... FOR TESTING | SAP_BASIS 7.02 or later | ABAP Keyword Documentation, Tools in Release 7.0 EhP2 (ABAP Unit; 7.0 uses "#AU pseudo comments) |
| `abap-unit-assert-class` | Class CL_ABAP_UNIT_ASSERT | SAP_BASIS 7.02 or later | ABAP Keyword Documentation, Tools in Release 7.0 EhP2 (CL_ABAP_UNIT_ASSERT replaces CL_AUNIT_ASSERT) |
| `string-concat-operator` | Concatenation operator && | SAP_BASIS 7.02 or later | ABAP Keyword Documentation, Changes in Release 7.02 (string expressions) |
| `string-functions` | Built-in string functions such as condense( ), to_upper( ), and substring( ) | SAP_BASIS 7.02 or later | ABAP Keyword Documentation, Changes in Release 7.02 (string functions) |
| `method-chaining` | Chained method calls such as lo_alv->get_functions( )->set_all( ) | SAP_BASIS 7.02 or later | ABAP Keyword Documentation, Changes in Release 7.02 (method call chaining) |
| `dynamic-badi-access` | Dynamic BAdI access, GET BADI ... TYPE (name) and CALL BADI badi->(method) | SAP_BASIS 7.02 or later | ABAP Keyword Documentation, Enhancements in Release 7.0 EhP2 (dynamic GET BADI and CALL BADI) |
| `chained-call-statement` | Chained method call as a standalone statement, for example lo_alv->get_functions( )->set_all( abap_true ). | SAP_BASIS 7.31 or later | ABAP Keyword Documentation, ABAP Objects in Release 7.0 EhP3 and 7.3 EhP1 (chained method call executed as a statement) |
| `secondary-table-keys` | Secondary table keys (KEY name COMPONENTS, USING KEY) | SAP_BASIS 7.02 or later | ABAP Keyword Documentation, Changes in Release 7.02 (secondary table keys) |
| `inline-declarations` | Inline declarations DATA( ) and FIELD-SYMBOL( ); also checks function modules, which abaplint cannot syntax-check without the function group XML | SAP_BASIS 7.40 SP02 or later | ABAP Keyword Documentation, Expressions and Functions in Release 7.40 SP02 (inline declarations) |
| `final-inline-declarations` | Immutable inline declarations FINAL( ) | SAP_BASIS 7.57 or later | ABAP Keyword Documentation, Expressions and Functions in Release 7.57 (FINAL declaration operator) |
| `wait-for-asynchronous-tasks` | WAIT FOR ASYNCHRONOUS TASKS (replaces WAIT UNTIL for aRFC callbacks) | SAP_BASIS 7.40 SP02 or later | ABAP Keyword Documentation, ABAP Channels in Release 7.40 SP02 (new variants of WAIT UNTIL) |
| `let-expressions` | LET expressions in constructor expressions | SAP_BASIS 7.40 SP05 or later | ABAP Keyword Documentation, Expressions in Release 7.40 SP05 (LET expressions) |
| `conditional-iterations` | Conditional iterations FOR ... UNTIL and FOR ... WHILE | SAP_BASIS 7.40 SP08 or later | ABAP Keyword Documentation, Expressions in Release 7.40 SP08 (iteration expressions) |
| `sql-inline-declarations` | Inline declarations in ABAP SQL, INTO @DATA( ) | SAP_BASIS 7.40 SP08 or later | ABAP Keyword Documentation, ABAP SQL in Release 7.40 SP08 (inline declarations for the target area of SELECT) |
| `sql-into-last` | INTO as the last clause of SELECT (after WHERE, GROUP BY, HAVING, or ORDER BY) | SAP_BASIS 7.40 SP08 or later | ABAP Keyword Documentation, ABAP SQL in Release 7.40 SP08 (position of the INTO clause) |
| `sql-searched-case` | Searched CASE (CASE WHEN condition ...) in ABAP SQL | SAP_BASIS 7.40 SP08 or later | ABAP Keyword Documentation, ABAP SQL in Release 7.40 SP08 (SQL expressions) |
| `value-lines-of` | LINES OF inside VALUE and NEW | SAP_BASIS 7.40 SP08 or later | ABAP Keyword Documentation, Expressions in Release 7.40 SP08 (inserting table lines in constructed tables) |
| `base-addition` | BASE addition in VALUE, NEW, and CORRESPONDING | SAP_BASIS 7.40 SP08 or later | ABAP Keyword Documentation, Changes in Release 7.40 SP08 (BASE for constructor expressions) |
| `sql-host-expressions` | Host expressions @( ... ) in ABAP SQL | SAP_BASIS 7.50 or later | ABAP Keyword Documentation, Changes in Release 7.50 (host expressions) |
<!-- END GENERATED: sap-feature-rules -->

A failure from abaplint counts as `validator`; a failure from a feature rule counts as
`environment`. Negative controls in `scenarios.yaml` name the one they expect in `caught_by`,
so a known-bad answer must fail for the right reason.

## Release fixtures

[config/abap-language-features.yaml](../config/abap-language-features.yaml) lists ABAP
features with the release that introduced them, a program that uses the feature, and the
equivalent without it. [tests/unit/abap-release-features.test.mjs](../tests/unit/abap-release-features.test.mjs)
checks, for every feature, that the program fails on the release before and passes from that
release up to S/4HANA 2025, and that the equivalent compiles on the older release. A
classic program full of look-alikes (`FOR ALL ENTRIES`, `OPEN DATASET ... FOR INPUT`, comments
and literals with newer syntax) must pass on 7.00, which guards the feature rules against
false positives. The same manifest generates the table in
[release-syntax.md](../plugins/sap-abap/skills/sap-abap-standard/references/release-syntax.md),
so the skill and the tests cannot drift apart.

## What the offline checks cannot prove

- There is no SAP system in CI. The checks do not know the customer's dictionary, so a wrong
  field name on an SAP table, a wrong function module parameter, or a missing authorization
  object is not detected.
- abaplint is not the SAP compiler. Activation, ATC, unit test execution, and runtime behavior
  need a real system.
- The grammar plus rules model what SAP documents per release. Support packages are modeled
  only for 7.40, where SAP added syntax in support packages.
- One known case is stricter than SAP: `line_exists( )` in a condition is accepted only from
  7.40 SP08, although SAP supports it from SP02. The fixture records this so the test fails
  when abaplint changes.
- Feature rules are regular expressions. They are tested against classic code, but unusual
  formatting can slip through.

## Optional backend checks (not implemented)

Planned, not built: run the same samples against real systems (SAP trial systems, a company
sandbox) through ABAP Development Tools or abapGit to get the SAP syntax check, activation,
ABAP Unit, and ATC results. The design keeps this out of the mandatory pipeline: a manually
triggered workflow, disabled by default, using a GitHub environment with required reviewers
and environment secrets, never run for pull requests from forks, and limited to a sandbox
package. Until then, the "What could not be verified" section of every answer tells users to
run these checks themselves.

## Why ECC support matters

SAP ERP 6.0 EHP6 to EHP8 have mainstream maintenance until the end of 2027 and optional
extended maintenance until the end of 2030; EHP0 to EHP5 left mainstream maintenance at the end
of 2025. Many customers will run ECC, often on IaaS, for years, and their code has to compile
on 7.31, 7.40, or 7.50 rather than on the newest release.

## Sources

- SAP ABAP Keyword Documentation, release news:
  [7.0 EhP2](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-71.html),
  [7.40](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-740.html),
  [7.5x](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-75.html),
  [8.1x](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-81.html)
- [ABAP platform releases and consumers](https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-sap/abap-platform-releases-and-consumers/ba-p/13438776) (SAP Community, SAP employee blog)
- [SAP NetWeaver maintenance strategy](https://pages.community.sap.com/topics/abap/netweaver-maintenance-strategy)
- SAP on IaaS: [Azure](https://learn.microsoft.com/en-us/azure/sap/workloads/certifications), [AWS](https://docs.aws.amazon.com/sap/latest/general/overview-sap-on-aws.html), [Google Cloud](https://docs.cloud.google.com/sap/docs/certifications-sap-apps)
