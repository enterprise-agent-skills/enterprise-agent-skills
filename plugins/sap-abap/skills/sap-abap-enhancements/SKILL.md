---
name: sap-abap-enhancements
description: >-
  Choose and build enhancements of SAP standard code in Standard ABAP on SAP ECC 6.0 and SAP
  S/4HANA: Customizing first, then BAdIs and exits, modifications last.
  Covers kernel BAdIs (enhancement spots, filters, fallback classes, GET BADI, CALL BADI),
  classic BAdIs, customer exits (SMOD, CMOD), SD user exits such as MV45AFZZ, source code
  plug-ins, class and function module enhancements, LUW rules in exits, release limits from
  SAP_BASIS 7.00 to 8.16, SPAU and SPAU_ENH, and clean core levels. USE FOR: implementing or
  calling a BAdI, finding the right exit for a requirement, customer exit or user exit code,
  reviewing enhancement code, enhancements that stopped working after an upgrade or S/4HANA
  conversion. DO NOT USE FOR: reports, classes, or performance work without an enhancement
  (use sap-abap-standard), BAPI, RFC, IDoc, or OData work (use sap-abap-integration), RAP (use
  sap-rap-business-object; RAP on S/4HANA 1909 to 2021 is not covered), or released-API
  assessments (use sap-clean-core-check).
license: MIT
compatibility: >-
  SAP ECC 6.0 (any enhancement package), SAP NetWeaver AS ABAP 7.0 or later, or SAP S/4HANA
  on-premise or Private Edition up to 2025, with Standard ABAP. SAP GUI for SE18, SE19, SE80,
  SMOD, CMOD, SPAU, and SPAU_ENH; ABAP Development Tools edit source code plug-ins from
  SAP_BASIS 7.53 and BAdI implementations from 7.57. Authorization for the customer namespace
  and a transport request; on ECC and NetWeaver, an SSCR object key for user exits and
  modifications (S/4HANA has no SSCR keys).
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
---

# Enhancing SAP standard in ECC and S/4HANA

An enhancement changes what SAP standard code does without copying it. Pick the technology by
what SAP offers at the point you need, by the release, and by how the change survives
upgrades. Where the system runs (on premises, on Azure, AWS, or Google Cloud VMs, or in SAP's
private cloud) never changes the code.

Every ECC 6.0 system has the Enhancement Framework: kernel BAdIs, `GET BADI`, `CALL BADI`, and
source code plug-ins arrived with SAP_BASIS 7.00. Later additions need later releases (Step 7).

Reference files:

- [references/badi-patterns.md](references/badi-patterns.md): kernel and classic BAdIs,
  defining, implementing, and calling them, the CX_BADI exceptions, release-dependent
  variants, and validated code for 7.00 and later.
- [references/exits-plugins-and-upgrades.md](references/exits-plugins-and-upgrades.md):
  customer exits, SD user exits, LUW rules, source code plug-ins, class and function module
  enhancements, finding enhancement options, SPDD, SPAU, SPAU_ENH, S/4HANA conversions, and
  clean core levels.

## Step 1: Pin down the target and the requirement

Ask for anything you cannot see. Do not assume the newest release.

1. **Product and release**: ECC 6.0 with enhancement package, NetWeaver AS ABAP, or S/4HANA
   release. **SAP_BASIS release and support package** from System > Status > Component
   information; for 7.40 the support package matters. SAP_APPL shows the ECC enhancement
   package (617 = EHP7).
2. **The process**: transaction, program, document, and moment (create, change, save,
   output), and every channel that runs it: dialog, BAPI, IDoc, batch input, background jobs.
   An exit that works in VA01 can break an IDoc inbound run.
3. **Who owns the calling code**: SAP (implement what SAP offers there) or you (define a
   kernel BAdI, Step 5).
4. **Language version** on S/4HANA 2022 or later is set per object and shown in the object's
   properties in ADT; the package only sets the default for new objects. This skill covers
   Standard ABAP. If the implementing class uses ABAP for Cloud Development, implement only
   released BAdIs, create the implementation in ADT, and use only released APIs in the class.
   Released BAdIs are entries with objectType BADI_DEF in the Cloudification Repository file of
   the target; look them up by BAdI name with sap-clean-core-check. Customer exits, source code
   plug-ins, and SE19 are not available in that language version.
5. **Key user BAdIs** on S/4HANA: if the BAdI is registered in SCFD_REGISTRY, implement it in
   the Custom Logic app. Never create an SE19 implementation for it: SAP states that the
   Custom Logic app can then no longer be used for that BAdI at all.

## Step 2: Choose the technology

SAP's rule since R/3: before you modify the system or develop your own solution, make sure
the requirement cannot be met by Customizing or personalization, or by the exits and BAdIs SAP
provides. Work down this list and stop at the first option that meets the requirement:

| Order | Technology | Why it sits here |
|-------|------------|------------------|
| 1 | Customizing and personalization | No code to test, transport, or adjust |
| 2 | A BAdI SAP provides: on S/4HANA a released or key user BAdI first, otherwise the kernel BAdI, or the classic BAdI where that is what SAP offers | Defined interface; your objects stay separate from SAP's |
| 3 | A customer exit (SMOD, CMOD) or an explicit enhancement point or section SAP provides | Designed by SAP as extension points; CMOD exits are obsolete but supported |
| 4 | An application user exit such as `USEREXIT_SAVE_DOCUMENT_PREPARE` in MV45AFZZ | Designed by SAP, but changing the include is a modification (on ECC with an SSCR object key) |
| 5 | An implicit enhancement option, including pre-, post-, and overwrite methods and new parameters in SAP classes and function modules | Attaches to SAP's internal code. Implicit source code enhancements are clean core level D; SAP's public material gives no level for class and function module enhancements |
| 6 | A modification | Must be adjusted whenever SAP delivers a new version of the object; level D |

The order is a synthesis. SAP documents Customizing and personalization first, then exits and
BAdIs, then modifications; it marks classic BAdIs and CMOD exits as superseded by kernel BAdIs,
and implicit enhancements as level D. At most call points SAP offers exactly one technology,
so the choice is mainly between Customizing, the option SAP offers, and anything worse.

Some applications have their own options, which fit into the same order. In FI, validations
and substitutions (GGB0, GGB1; activated for accounting documents in OB28 and OBBH) are
Customizing. Their exit routines (in your copy of RGGBR000 or RGGBS000, assigned in GCX2) and
business transaction events (FIBF) are call points SAP provides, like row 3. In SD, pricing,
copy control, and requirement routines are maintained in VOFM. Public SAP material does not
state the clean core level of these technologies.

Say which Customizing you checked before you propose code, even if it does not fit, so the
user can confirm it with the functional consultant. Name the IMG path when you know it, and say
so when you do not. For a field that must be filled in a sales document, that is the
incompleteness procedure (Sales and Distribution > Basic Functions > Log of Incomplete Items):
it makes a field mandatory per sales document type, but it cannot test a condition such as a
net value threshold.

## Step 3: Find the enhancement option

- Customizing (SPRO), next to the relevant activity: classic BAdIs as IMG activities, and the
  SD user exits under Sales and Distribution > System Modification > User exits.
- SE18 and SE19 for BAdIs, SE80 Enhancement Information System for enhancement spots and
  implementations, SMOD and CMOD (Utilities > SAP enhancements) for customer exits.
- Debugger: breakpoint at statement `GET BADI` or `CALL BADI`, at statement
  `CALL CUSTOMER-FUNCTION`, or at method `CL_EXITHANDLER=>GET_INSTANCE` (parameter
  `EXIT_NAME`), then run the transaction.
- FI and SD: FIBF for business transaction events, GGB0 and GGB1 for validations and
  substitutions, VOFM for SD routines.
- On S/4HANA: SCFD_REGISTRY for key user BAdIs and the Cloudification Repository for released
  BAdIs. The repository tracks SAP's cloud releases, so confirm the release state in your
  system (ADT, API State tab of the object's properties) before you rely on it.
- Read the BAdI or exit documentation: it usually states when the call happens, what may be
  changed, whether messages are allowed, and whether the code runs in the update task.

Details: [references/exits-plugins-and-upgrades.md](references/exits-plugins-and-upgrades.md).

## Step 4: Implement a BAdI SAP provides

**Kernel BAdI.** In SE19 choose "New BAdI" and enter the enhancement spot. SAP GUI is the only
option on ECC and on S/4HANA before 2022; ADT has an editor for BAdI implementations from
SAP_BASIS 7.57. Create the simple enhancement implementation, the BAdI implementation, and the
implementing class; set the filter values; keep "Implementation is active" set; activate.

- For a single-use BAdI, only one active implementation may match a filter combination. If
  conflict resolution cannot pick one, `GET BADI` raises `CX_BADI_MULTIPLY_IMPLEMENTED` in
  the calling program. Check for other active implementations before you activate yours.
- Methods of multiple-use BAdIs have only importing and changing parameters; implementations
  run one after another and each sees the changing parameters of the previous one.
- An implementation without a switch is always on. SAP's own implementations can depend on
  business functions switched on in SFW5, which usually cannot be reverted.

**Classic BAdI.** In SE19 (or the IMG activity) create the implementation; SE19 generates the
class. Keep it `CREATE PUBLIC` and not abstract, otherwise the call dumps. For a classic BAdI
that is not multiple use, only one implementation can be active per filter value, or only one
in total if the BAdI has no filter. Filter-dependent methods receive the filter value in
`FLT_VAL`.

In both cases put the business rule in the implementing class (or a class it calls) and give
it ABAP Unit tests. On 7.00 and 7.01, test classes use the pseudo comments `"#AU Risk_Level`
and `"#AU Duration` and the class `CL_AUNIT_ASSERT` instead of `RISK LEVEL`, `DURATION`, and
`CL_ABAP_UNIT_ASSERT`. Code: [references/badi-patterns.md](references/badi-patterns.md).

## Step 5: Define and call your own BAdI

For call points in code you own, always define a kernel BAdI, never a classic one, and never
`CALL CUSTOMER-FUNCTION`.

1. Create an enhancement spot and a BAdI definition named `ZBADI_...` (BAdI names share the
   namespace of DDIC types, classes, and interfaces).
2. Create the interface with `INTERFACES if_badi_interface.` and the methods.
3. Choose single use when the caller expects one answer (exporting and returning parameters
   allowed) and multiple use for events (importing and changing parameters only).
4. Add filters if implementations depend on values such as the sales organization.
5. Give a single-use BAdI a fallback class. `GET BADI` returns it when no implementation is
   active and also when none matches the filter values, so callers keep working in systems
   without an implementation.
6. In the caller, type the reference with the BAdI name (`TYPE REF TO zbadi_...`, not the
   interface), get it once with `GET BADI ... FILTERS ...` outside loops, and call methods with
   `CALL BADI`.

| Exception | Raised when |
|-----------|-------------|
| `CX_BADI_NOT_IMPLEMENTED` | Single use, and no active, default, or fallback implementation qualifies; dumps unless caught |
| `CX_BADI_MULTIPLY_IMPLEMENTED` | Single use, and several implementations remain after conflict resolution |
| `CX_BADI_INITIAL_REFERENCE` | `CALL BADI` with an initial reference to a single-use BAdI |
| `CX_BADI_INITIAL_CONTEXT` | `GET BADI ... CONTEXT` with an initial context (context-dependent BAdIs only) |
| `CX_BADI_CONTEXT_ERROR`, `CX_BADI_FILTER_ERROR`, `CX_BADI_UNKNOWN_ERROR` | Dynamic `GET BADI` only |

Multiple-use BAdIs never raise the first two, and `CALL BADI` without implementations does
nothing. `CL_EXITHANDLER=>GET_INSTANCE` is for classic BAdIs only; when you call a classic BAdI,
pass `null_instance_accepted = 'X'`, check the reference with `IS NOT INITIAL` before each
call, and get the instance once rather than per document.

Complete examples for 7.00, 7.02, and 7.40 SP08 are in
[references/badi-patterns.md](references/badi-patterns.md).

## Step 6: Customer exits, user exits, and source code plug-ins

**Customer exits.** Read the SAP enhancement in SMOD and assign it to a CMOD project (an SAP
enhancement can belong to only one project; a project can hold several). Write the code in the
customer include `ZX<fg>U<nn>`, global data in `ZX<fg>TOP`, and `FORM` routines in
`ZX<fg>ZZZ`, never in the `U` include. The project is activated as a whole. Transport the
project and includes, and check that the project is active in every target system. When the
project is inactive, `CALL CUSTOMER-FUNCTION` does nothing and leaves `sy-subrc` unchanged.

**Application user exits.** Routines such as `USEREXIT_SAVE_DOCUMENT_PREPARE` (start of
saving, for checks and last changes) and `USEREXIT_SAVE_DOCUMENT` (right before the commit, for
writing your own tables in the update task) live in SAP includes such as MV45AFZZ. SAP
classifies them as modifications: say so plainly.

- On ECC and NetWeaver the change needs an SSCR object key, which becomes invalid after a
  release upgrade. S/4HANA has no SSCR keys (SAP Note 2309060); there the system change option
  (SE06), the client settings (SCC4), and the authorization object S_DEVELOP control changes
  to SAP objects. Either way the change is a modification, listed in SE95.
- The include appears in SPAU only when an upgrade delivers a new version of it, so check your
  modified includes after every upgrade instead of relying on SPAU.
- Keep the `FORM` routine to a few lines that call a Z class.
- In VA01 and VA02, an error message at save time can leave the order screen display-only, and
  SD BAPIs take customer fields of VBAK only through `EXTENSIONIN` (SAP Note 143580). Read the
  reference before you write a save check.

**Source code plug-ins.** Implement explicit options (`ENHANCEMENT-POINT`,
`ENHANCEMENT-SECTION`) in enhancement mode with Enhancement Implementation > Create
Implementation. The editor generates `ENHANCEMENT` and `ENDENHANCEMENT`; never type them
yourself. Use implicit options (start and end of procedures, end of programs and includes, and
the class and function module enhancements built on implicit options) only when nothing else
works: they depend on SAP's internal code, and SPAU_ENH asks for adjustment when that code
changes. Implicit source code enhancements are clean core level D; for class and function
module enhancements SAP's public material states no level. State the reason in the code review.

## Step 7: Respect release limits

| Feature | Needs | Typical systems |
|---------|-------|-----------------|
| Customer exits, classic BAdIs | Before 7.00 (classic BAdIs from 4.6A) | All ECC and S/4HANA |
| Kernel BAdIs, static `GET BADI` and `CALL BADI`, `ENHANCEMENT-POINT` and `ENHANCEMENT-SECTION`, implicit options, SPAU_ENH | SAP_BASIS 7.00 | Every ECC 6.0 |
| Dynamic `GET BADI badi TYPE (name)`, `FILTER-TABLE`, `CALL BADI badi->(meth)`; plug-ins inside plug-ins | 7.02 | ECC 6.0 EHP5 and later |
| `METHODS meth DEFAULT IGNORE` or `DEFAULT FAIL` (optional interface methods); AMDP BAdIs (SAP HANA only) | 7.40 SP08 | ECC 6.0 EHP7 on SAP_BASIS 7.40 SP08 or later, EHP8 |
| ADT shows plug-in markers | 7.31 SP11 or 7.40 SP05 | ECC 6.0 EHP6 on 7.31 SP11 or later, EHP7 on 7.40 SP05 or later, EHP8 |
| ADT edits source code plug-ins / creates plug-in enhancement implementations | 7.53 / 7.54 | S/4HANA 1809 / 1909 |
| ADT editors for BAdI definitions and implementations | 7.57 | S/4HANA 2022 |
| Class and function group enhancements in ADT | Not supported | Use SAP GUI everywhere |

Read the SAP_BASIS support package in System > Status. ERP 6.0 support package stacks are
numbered separately from SAP_BASIS support packages: EHP7 stack 08 does not mean SAP_BASIS
7.40 SP08.

ECC tops out at SAP_BASIS 7.50, so enhancement work on ECC happens mostly in SAP GUI. The code
inside an exit or BAdI follows the syntax rules of the release (sap-abap-standard): no inline
declarations before 7.40 SP02, no 7.02 string functions on 7.00 and 7.01.

## Step 8: Keep the logical unit of work intact

Exits and BAdIs run inside the application's SAP LUW, and the application commits once, at
the end. First find out where your code runs: the BAdI or exit documentation says whether it
is called in the dialog part or from an update function module, and the debugger call stack
shows it. In the dialog part, inside an exit, BAdI method, or plug-in:

- No `COMMIT WORK` and no `ROLLBACK WORK`. A commit posts whatever is registered so far, so a
  document can be saved half-finished.
- No `CALL TRANSACTION` or `SUBMIT` while a document is saved, and no synchronous or
  asynchronous RFC (sRFC, aRFC) there: each triggers an implicit database commit. To inform
  another system, register a bgRFC unit (`CALL FUNCTION ... IN BACKGROUND UNIT`, complete from
  7.0 EhP2) or a tRFC (`IN BACKGROUND TASK`); both run only after SAP's `COMMIT WORK`.
- No `INSERT`, `UPDATE`, `MODIFY`, or `DELETE` on SAP tables such as VBAK. Change document
  fields only through the parameters or work areas the exit provides; write your own tables
  with an update function module (`CALL FUNCTION ... IN UPDATE TASK`).
- Messages only where the exit documentation allows them. Error, information, and warning
  messages interrupt the dialog step and trigger an implicit database commit, and they behave
  differently in dialog, background, BAPI, and IDoc processing. Test every channel.

In the update task the rules change. `IN UPDATE TASK` is ignored there, so write your own
tables directly. Send no messages: every type except S ends the update with a database
rollback, which SM13 shows as a terminated update. Make no authorization checks, because none
are possible there. `COMMIT WORK` and `ROLLBACK WORK` cause runtime errors.

## Step 9: Transport, test, and plan for upgrades

- Record enhancement spots, enhancement implementations, classes, CMOD projects, and includes
  on workbench requests. After the import, check in CMOD that the projects are active in each
  target system.
- Unit test the class that holds the rule; then test the transaction in every channel from
  Step 1.
- After upgrades and conversions, SPDD adjusts modified Dictionary objects during SUM. SPAU
  adjusts modified programs that the update delivered again, SAP Notes, and the migration of
  classic BAdIs and SMOD exits. SPAU_ENH adjusts enhancement implementations, and only where
  SAP changed the enhanced object incompatibly.
- Neither SPAU nor SPAU_ENH tells you whether a call point still runs. In S/4HANA, MRP Live
  does not call the BAdIs of the classic MRP run, so an implementation of `MD_CHANGE_MRP_DATA`
  must move to the AMDP BAdI `PPH_MRP_RUN_BADI` (method `MDPS_ADJUST`). Read the
  simplification item of every process you enhanced, and run ATC with the S/4HANA readiness
  checks (`S4HANA_READINESS` on the converted system).
- Clean core levels (August 2025): A uses released APIs and released extension points (no ATC
  finding), B classic APIs and classic extension points such as BAdIs that SAP has not
  released (ATC priority 3), C SAP internal objects including reads of SAP tables (priority
  2), D modifications, implicit enhancements, and writes to SAP tables (priority 1).
- SAP's level B description also names user exits, but SAP classifies SD user exits as
  modifications. Public SAP material does not state the level of SD user exits, customer
  exits, explicit enhancement points, class and function module enhancements, business
  transaction events, or VOFM routines. Do not state one without checking SAP Note 3578329.

Details and sources: [references/exits-plugins-and-upgrades.md](references/exits-plugins-and-upgrades.md).

## Output format

1. State the target you assumed: product, release, SAP_BASIS and support package, database.
2. State the decision: the Customizing you checked, the technology you chose, and why the
   options above it in Step 2 do not fit.
3. List the objects to create and where: enhancement spot, BAdI, enhancement implementation,
   class, CMOD project, message class, append fields, transport request.
4. Return objects you own in code blocks starting with an abapGit file marker, for example
   `* file: src/zcl_fa_order_check_1000.clas.abap`. Show code that lives in SAP objects
   (MV45AFZZ, `ZX` includes inside SAP function modules, plug-ins) as clearly marked fragments.
5. Name the LUW and message rules that apply, and the activation steps per system.
6. Name the upgrade and clean core impact: SPAU or SPAU_ENH, object keys (ECC and NetWeaver
   only), level where SAP states one.
7. Name what could not be verified without the system: syntax check, activation, filter values,
   the exit's documentation, and tests in each channel.
