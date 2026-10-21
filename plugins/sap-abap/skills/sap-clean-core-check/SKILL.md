---
name: sap-clean-core-check
description: >-
  Assess custom ABAP code for ABAP Cloud and clean core readiness: find SAP objects that are not
  released, look up their successors in SAP's Cloudification Repository, and rewrite code to use
  released APIs. USE FOR: reviewing custom code before an S/4HANA Cloud or ABAP Cloud migration,
  choosing released APIs for new ABAP Cloud classes, replacing direct reads of SAP tables such
  as VBAK, MARA, BKPF, or KNA1 with released CDS views, explaining ATC findings from the "Usage
  of APIs" or cloud readiness checks, producing a remediation list for a package. DO NOT USE
  FOR: building new RAP business objects (use sap-rap-business-object), writing or fixing
  Standard ABAP that stays on ECC or classic S/4HANA development (use sap-abap-standard),
  S/4HANA conversion findings from S4HANA_READINESS (use sap-abap-standard), clean core levels
  of exits and BAdIs (use sap-abap-enhancements), SAP Basis, upgrade, or SUM tasks, functional
  configuration, or performance tuning.
license: MIT
compatibility: >-
  Custom ABAP code from SAP ECC or SAP S/4HANA, or ABAP Cloud code on SAP BTP ABAP environment.
  Python 3.9 or later for the bundled lookup script (standard library only). Internet access to
  raw.githubusercontent.com, or a downloaded copy of the repository JSON file.
metadata:
  vendor: sap
  product: abap
  category: quality
  maturity: beta
  version: "0.1.0"
  sap-products: "ecc, netweaver, s4hana, s4hana-private-cloud, s4hana-public-cloud, btp-abap"
  sap-deployments: "on-premise, azure-iaas, aws-iaas, gcp-iaas, sap-private-cloud, sap-saas"
  abap-language-version: "standard, cloud"
  sap-basis-min: "7.00"
  abap-env-default: "product=s4hana release=2023 language_version=cloud"
---

# SAP clean core and ABAP Cloud readiness check

ABAP Cloud code may only use SAP objects that are released for it. SAP publishes the release
state of its objects, and the successor for objects that will not be released, in the
Cloudification Repository on GitHub:
https://github.com/SAP/abap-atc-cr-cv-s4hc (Apache-2.0). The same data drives the ATC checks
customers run in their systems. Use the data, not memory, to decide whether an object is
released.

## Which file to use

| Target | File in `src/` |
|--------|----------------|
| SAP S/4HANA Cloud Public Edition | `objectReleaseInfoLatest.json` (the script default) |
| SAP BTP ABAP environment | `objectReleaseInfo_BTPLatest.json` |
| SAP S/4HANA on premises or Private Edition 2022, 2023, 2025 | The file for the release and feature pack stack: `objectReleaseInfo_PCE2022.json`, `objectReleaseInfo_PCE2022_1.json`, `objectReleaseInfo_PCE2022_2.json`, `objectReleaseInfo_PCE2023_0.json` to `objectReleaseInfo_PCE2023_3.json`, `objectReleaseInfo_PCE2025_0.json` to `objectReleaseInfo_PCE2025_2.json`; `objectReleaseInfo_PCELatest.json` is the newest |
| Classic APIs (clean core level B) on Private Edition, on premises, and ECC | `objectClassifications_SAP.json` |

For code that will move to another system, use the file of the target system. SAP's README
gives `objectReleaseInfo_PCE2025.json` as an example, but that file does not exist; check the
exact name in https://github.com/SAP/abap-atc-cr-cv-s4hc/tree/main/src (file list checked on
2026-10-18).

Each entry has `tadirObject`, `tadirObjName`, `state`, and for objects that will not be
released, `successors`. States are `released`, `deprecated`, and `notToBeReleased`. The PCE
files also use `notToBeReleasedStable`, which SAP's README does not define and which has no
successor in any current file; treat it as not released for ABAP Cloud. The classification
file uses `classicAPI` and `noAPI`. An object missing from the file is not released; treat it
like `notToBeReleased` without a successor.

## Workflow

1. **Inventory.** List every SAP object the code touches: tables and views in `SELECT`
   statements, function modules in `CALL FUNCTION`, classes and interfaces, BAdIs, and includes.
   Ignore objects in the customer namespace (Z, Y, or a registered namespace).
2. **Look up states.** Run the bundled script for the objects you found:

   ```bash
   python3 scripts/lookup_api_state.py VBAK KNA1 BKPF CL_ABAP_UNIT_ASSERT
   ```

   The script reads `objectReleaseInfoLatest.json` (Public Edition) unless you pass
   `--source`. For any other target, pass the file from the table, for example
   `python3 scripts/lookup_api_state.py --source https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src/objectReleaseInfo_PCE2023_3.json VBAK`,
   and name the file in the report. The script matches names across object types, so compare
   the Type column with the object you looked up (VBAK is both a table, TABL, and a function
   group, FUGR). Pass `--source <path-to-local-json>` when the machine has
   no internet access, and `--json` for machine-readable output. The script accepts only HTTPS
   URLs or local files.
3. **Plan replacements.** For each `notToBeReleased` or `deprecated` object, take the
   successor from the data. When there are several successors (for example `MARA` lists
   `I_PRODUCT`, `I_PRODUCTPROCUREMENT`, and others), pick the one whose fields the code
   actually reads. When there is no successor, propose a wrapper in a separate classic ABAP
   layer, or a released API on api.sap.com, and say that the choice needs an architect.
4. **Rewrite.** Replace table reads with the released CDS view, using its field names (they
   are CamelCase, for example `SalesDocument` and `SoldToParty` in `I_SalesDocument`).
   Confirm field names in ADT (F2 on the view) before finalizing; do not guess them.
5. **Report.** Return the table described under Output format, then the rewritten code.
6. **Confirm in the system.** The authoritative result is ATC in the customer system with the
   check "Usage of Released APIs (Cloudification Repository)" for cloud targets, or
   "Usage of APIs" for clean core in private cloud and on-premise (standard in S/4HANA 2025,
   SAP Note 3565942 on 2023; for ECC and older releases, run it remotely from ATC on SAP BTP
   or from a central ATC system). Recommend running it.

## Verified examples

Checked against `objectReleaseInfoLatest.json` on 2026-10-14. Re-run the script for current
data before quoting these to a customer.

| Object | Type | State | Successor |
|--------|------|-------|-----------|
| `VBAK` | Table | notToBeReleased | `I_SALESDOCUMENT` |
| `KNA1` | Table | notToBeReleased | `I_CUSTOMER` |
| `BKPF` | Table | notToBeReleased | `I_JOURNALENTRY` |
| `MARA` | Table | notToBeReleased | `I_PRODUCT` and several more specific views |
| `I_SALESORDER` | CDS view | released | none needed |
| `CL_ABAP_UNIT_ASSERT` | Class | released | none needed |

## Rewrite example

Before (classic ABAP, reads a table that will not be released):

```abap
SELECT vbeln, auart, kunnr FROM vbak
  WHERE erdat >= @lv_from
  INTO TABLE @DATA(orders).
```

After (ABAP Cloud, released CDS view `I_SalesDocument`):

```abap
SELECT SalesDocument, SalesDocumentType, SoldToParty
  FROM I_SalesDocument
  WHERE CreationDate >= @from_date
  INTO TABLE @DATA(orders).
```

A full class with this pattern is in [references/remediation-patterns.md](references/remediation-patterns.md),
together with patterns for function modules and for code that has no released successor.

## Clean core levels

In August 2025 SAP replaced the three-tier model with four levels (SAP Cloud ALM help and SAP
Learning, checked 2026-10-15; SAP Note 3578329 is the authoritative list). The table matches
sap-abap-enhancements.

| Level | Meaning | ATC result | How the data shows it |
|-------|---------|------------|-----------------------|
| A | Released APIs and extension points only, in ABAP for Cloud Development (or side-by-side on SAP BTP) | No finding | Every SAP object used is `released` in the release file of the target, and the object uses ABAP for Cloud Development |
| B | Classic or released APIs, built with Standard ABAP | Priority 3 | Objects used are `classicAPI` in `objectClassifications_SAP.json` or `released` |
| C | SAP internal objects, including reads of SAP tables | Priority 2 | Objects that are neither released nor classified, for example a read of the table VBAK (`notToBeReleased`; the classification file lists only the function group VBAK, type FUGR) |
| D | Objects SAP does not recommend, modifications, implicit enhancements, writes to SAP tables | Priority 1 | `noAPI` in `objectClassifications_SAP.json`, or any write to an SAP table |

An extension gets the level of the lowest-ranked technology it uses. The ATC checks "Usage of
APIs" and "Allowed SAP enhancement technologies" are standard in S/4HANA 2025 and need SAP
Note 3565942 on 2023. For ECC and S/4HANA below 2023 they run only remotely: from ATC on SAP
BTP with check variant `ABAP_CLEAN_CORE_READINESS`, or from a central ATC system on S/4HANA
2023 (with the note) or 2025. State which data files and dates your assessment used.

## Output format

1. A table with columns: Object, Type, State, Successor, Used in (program or class and line),
   Proposed change.
2. Rewritten code, one code block per object, each starting with an abapGit file marker such
   as `* file: src/zcl_sales_report.clas.abap`.
3. Open questions, for example objects without a successor.
4. The data source used: file name and retrieval date.
