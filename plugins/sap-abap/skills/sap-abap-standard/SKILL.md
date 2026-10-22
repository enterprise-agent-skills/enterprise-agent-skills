---
name: sap-abap-standard
description: >-
  Write, fix, and review Standard ABAP for customer-managed SAP systems: SAP ECC 6.0, SAP
  NetWeaver AS ABAP, and SAP S/4HANA, on premises or on Azure, AWS, or Google Cloud VMs. Covers
  reports and ALV, ABAP Objects, DDIC objects, ABAP SQL and HANA-aware performance, authorization
  checks, error handling, ABAP Unit, ATC, transports, and troubleshooting, using only syntax the
  target release supports. USE FOR: new or changed reports, classes, function modules, and DDIC
  objects on ECC or S/4HANA; making code compile on an older release; SQL performance problems;
  dumps and debugging; S/4HANA conversion findings (S4HANA_READINESS); unit tests and ATC
  findings in classic development. DO NOT USE FOR: BAdIs, exits, or enhancement implementations
  (use sap-abap-enhancements), BAPI, RFC, IDoc, or SAP Gateway work (use sap-abap-integration),
  RAP (use sap-rap-business-object; RAP on S/4HANA 1909 to 2021 is not covered), or ABAP Cloud
  classes and released-API assessments (use sap-clean-core-check).
license: MIT
compatibility: >-
  SAP ECC 6.0 (any enhancement package), SAP NetWeaver AS ABAP 7.0 or later, or SAP S/4HANA
  on-premise or Private Edition with Standard ABAP, on SAP HANA or another supported database.
  SAP GUI; ABAP Development Tools for Eclipse on SAP_BASIS 7.31 SP04 or later. SAP's ABAP tools
  for VS Code (first release Q2 2026) start with ABAP Cloud on SAP BTP, S/4HANA Cloud, or
  S/4HANA 2025 and later. Authorization to create objects in the customer namespace and a
  transport request.
metadata:
  vendor: sap
  product: abap
  category: development
  maturity: beta
  version: "0.1.0"
  sap-products: "ecc, netweaver, s4hana, s4hana-private-cloud"
  sap-deployments: "on-premise, azure-iaas, aws-iaas, gcp-iaas, sap-private-cloud"
  abap-language-version: "standard"
  sap-basis-min: "7.00"
  abap-env-default: "product=ecc release=ehp8 database=anydb"
  derived-from: earlier draft sap-abap-fiori-dev, never released as a skill
---

# Standard ABAP development for ECC, NetWeaver, and S/4HANA

Standard ABAP is the classic development model of every customer-managed SAP system. ABAP
Cloud restrictions (released APIs only, no `WRITE`, no access to SAP tables or other SAP
objects that are not released) do not apply here unless the object uses the ABAP for Cloud
Development language version. The hard constraint is the release: code that compiles on
S/4HANA 2023 can fail on ECC 6.0 EHP6.

Reference files:

- [references/release-syntax.md](references/release-syntax.md): which statements each SAP_BASIS
  release supports, and the ECC and S/4HANA release mapping.
- [references/report-sample-750.md](references/report-sample-750.md): a complete report with
  selection screen, authorization check, SQL, ALV, and ABAP Unit for 7.50 and later.
- [references/report-sample-702.md](references/report-sample-702.md): the same report written
  for 7.02 and 7.31 (ECC EHP5 and EHP6) without 7.40 syntax.
- [references/sql-and-performance.md](references/sql-and-performance.md): ABAP SQL rules,
  SAP HANA guidance, and S/4HANA data model changes.
- [references/quality-and-operations.md](references/quality-and-operations.md): ABAP Unit, ATC,
  transports, and troubleshooting transactions.

## Step 1: Pin down the target system

If tools named `sap_*` are available (the sap-system MCP server of this plugin, or any SAP MCP
server with the same tool names), call `sap_connection_info` and then `sap_system_info` before
you ask. Take the SAP_BASIS release and support package (`release` 754 with `support_package`
0003 is 7.54 SP03), S4CORE or SAP_APPL, and the product hint from the result, and say in the
answer that the target came from the connected system, with the URL and client from
`sap_connection_info`. Ask only for what the tools cannot tell: the database when `database`
is null, and the language version of the object. When a tool returns `ok: false` with a setup
message, tell the user how to finish the setup (Claude Code: enable the plugin and enter the
connection details when asked; Copilot CLI and other hosts: run the setup command named in
the error) and continue with the questions below. Without `sap_*` tools, say once that the
plugin's sap-system server can supply the release from a connected system, then ask.

Ask for anything you cannot see. Do not assume the newest release.

1. **Product and release**: ECC 6.0 with enhancement package, NetWeaver AS ABAP release, or
   S/4HANA release (for example 1909, 2023, or 2025).
2. **SAP_BASIS release and support package**: System > Status > Component information in SAP
   GUI. SAP_APPL shows the ECC enhancement package (for example 617 = EHP7). For SAP_BASIS
   7.40 the support package matters, because syntax differs between SP02, SP05, and SP08.
3. **Database**: SAP HANA or another database (Oracle, Db2, SQL Server, SAP ASE, MaxDB). ECC can
   run on either (on SAP HANA only from SAP_BASIS 7.40); S/4HANA always runs on SAP HANA.
4. **Language version of the object** on S/4HANA 2022 or later: Standard ABAP or ABAP for
   Cloud Development. It is set per object and shown in the object's properties in ADT. Use
   this skill only for Standard ABAP.
5. **Where SAP runs** (on premises, Azure, AWS, Google Cloud) is useful for operations
   questions but never changes the ABAP you write.

With a connected system, read before you write: `sap_search_objects` and `sap_read_source`
show the current source of a program or class, `sap_list_package` lists a package, and
`sap_describe_table` and `sap_read_table` show a table's definition and sample rows, which
helps when you troubleshoot a dump or a slow `SELECT`. The server is read-only: never claim to
have changed, activated, or transported anything in the system.

## Step 2: Choose the syntax level

Use the highest feature level the target supports, and nothing above it. Each level includes
the ones before it. Summary (the full table with tested examples and older equivalents is in
[references/release-syntax.md](references/release-syntax.md)):

| SAP_BASIS | Typical systems | Adds |
|-----------|-----------------|------|
| 7.00, 7.01 | ECC 6.0 up to EHP4 | Classic ABAP only; test classes use `"#AU` pseudo comments and `CL_AUNIT_ASSERT` |
| 7.02 | ECC EHP5 | String templates, `&&`, string functions such as `to_upper( )`, secondary table keys, method chaining inside expressions, pragmas, `RISK LEVEL` and `DURATION`, `CL_ABAP_UNIT_ASSERT` |
| 7.31 | ECC EHP6 (NetWeaver 7.0 EHP3, renamed 7.3 EHP1) | Chained method calls as standalone statements |
| 7.40 SP02 | ECC EHP7 | Inline declarations `DATA( )`, `VALUE`, `NEW`, `CONV`, `CAST`, `COND`, `SWITCH`, table expressions `itab[ ]`, `line_exists( )`, `ipow( )`, `WITH EMPTY KEY` |
| 7.40 SP05 | ECC EHP7 | New ABAP SQL syntax (comma lists, `@` host variables, SQL expressions; `INTO` still before `WHERE`), `CORRESPONDING`, `LET`, `FOR ... IN` inside `VALUE`, DDIC-based CDS views, AMDP (SAP HANA only) |
| 7.40 SP08 | ECC EHP7 | `INTO` as the last clause and `INTO TABLE @DATA( )` in ABAP SQL, searched `CASE WHEN` in SQL, `REDUCE`, `FILTER`, `FOR ... UNTIL`, `LOOP AT ... GROUP BY`, `BASE`, `LINES OF` in `VALUE`, `OPTIONAL` and `DEFAULT` for table expressions, `xsdbool( )` |
| 7.50 | ECC EHP8, S/4HANA 1511 | Test seams, host expressions `@( )`, `UNION`, `IS INSTANCE OF`, CDS table functions (SAP HANA only) |
| 7.51 to 7.54 | S/4HANA 1610 to 1909 | Common table expressions `WITH`, `OFFSET`, and enumerated types (7.51), `SELECT ... FROM @itab` (7.52), `+=` and the time stamp type `utclong` (7.54) |
| 7.55 and later | S/4HANA 2020 and later | CDS view entities |
| 7.57 and later | S/4HANA 2022 and later | `FINAL( )` declarations, `LOOP AT ... STEP` |
| 8.16 | S/4HANA 2025 | Successor of 7.58 (there is no 7.59) |

When the release is unknown, write for the lowest release the user might have and say so.
Never mix levels in one object: a single 7.40 statement breaks the whole program on 7.31.

## Step 3: Structure the code

- **Reports**: `REPORT`, selection screen (`PARAMETERS`, `SELECT-OPTIONS`), events
  (`INITIALIZATION`, `AT SELECTION-SCREEN`, `START-OF-SELECTION`), and logic in local classes
  rather than `FORM` routines. Display tables with `CL_SALV_TABLE`; use `CL_GUI_ALV_GRID` only
  when users must edit cells.
- **Global classes** for logic used by more than one program, with small public methods and
  class-based exceptions.
- **Function modules** where the technology requires them: RFC, update tasks, or exits (see
  sap-abap-integration and sap-abap-enhancements).
- **DDIC**: data elements with domains for every custom field, transparent tables with the
  right delivery class and a technical key, maintenance views and table maintenance (SM30) for
  customizing tables. Never change SAP tables; use append structures or customizing includes.
- **Naming**: customer namespace (`Z`, `Y`, or a registered `/NAMESPACE/`), and the naming
  conventions of the customer if they exist.

## Step 4: Data access and performance

- One database round trip per need: no `SELECT` inside `LOOP`. Use joins, `FOR ALL ENTRIES`
  (only after checking that the driver table is not empty, and with duplicates removed), or a
  CDS view where the release supports it.
- Select only the columns you need, with the full key or an index in the `WHERE` clause.
- Aggregate in the database (`SUM`, `COUNT`, `GROUP BY`) instead of looping in ABAP.
- Internal tables: `SORTED` or `HASHED` tables or secondary keys for repeated reads; never
  `READ TABLE` on a large standard table without `BINARY SEARCH` on sorted data.
- On SAP HANA, push calculations down with SQL expressions, CDS views, or AMDP. On other
  databases do not use AMDP.
- On S/4HANA, respect data model changes, for example status fields moved from VBUK and VBUP
  into the document tables, and the 40-character material number. See
  [references/sql-and-performance.md](references/sql-and-performance.md).

## Step 5: Security, errors, and messages

- Check authorization before showing or changing data: `AUTHORITY-CHECK OBJECT` with the
  application's authorization object, then test `sy-subrc`. Use `DUMMY` only for fields the
  check deliberately ignores.
- Use class-based exceptions (`CX_STATIC_CHECK` for errors callers must handle). Do not ignore
  `sy-subrc` after statements that set it.
- In reports, raise user errors with `MESSAGE ... TYPE 'E'` during selection-screen
  processing and use `TYPE 'S' DISPLAY LIKE 'E'` or `'W'` after `START-OF-SELECTION`.
- Write lasting technical problems to the application log (transaction SLG1).
- Never use dynamic `WHERE` clauses, dynamic program names, or native SQL built from user input
  without validation (SQL injection, code injection).

## Step 6: Test and transport

- Add ABAP Unit tests for calculation and validation logic (local test classes with
  `FOR TESTING RISK LEVEL HARMLESS DURATION SHORT`). Isolate database and external calls behind
  interfaces so tests do not need data.
- Run the extended program check (SLIN), Code Inspector, or ATC with the customer's check
  variant, and fix priority 1 and 2 findings.
- Keep one change per transport request, release tasks before the request, and import into
  quality before production.

Details, including which test tools exist on which release, are in
[references/quality-and-operations.md](references/quality-and-operations.md).

## Output format

1. State the target: product, release, SAP_BASIS and support package, database, and whether
   you read it from the connected system (URL and client) or assumed it.
2. Return each object in its own code block starting with an abapGit file marker, for example
   `* file: src/zfa_sales_orders.prog.abap` or `* file: src/zcl_fa_pricing.clas.abap`.
3. List the DDIC objects, authorization objects, messages, and transport steps the user must
   create manually.
4. Name what could not be verified without the system or through the read-only connection:
   syntax check (Ctrl+F2), activation, ATC, and unit test runs.
