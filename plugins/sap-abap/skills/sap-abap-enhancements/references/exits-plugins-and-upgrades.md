# Exits, plug-ins, and upgrades

Customer exits, application user exits, LUW rules, source code plug-ins, class and function
module enhancements, how to find enhancement options, what happens to enhancements during
upgrades and S/4HANA conversions, and how the clean core levels rate them. Facts were checked
against SAP documentation on 2026-10-15; the sources are listed at the end.

## Customer exits (SMOD and CMOD)

SAP programs call customer exits with `CALL CUSTOMER-FUNCTION 'nnn'`. The statement calls the
function module `EXIT_<program>_<nnn>` only when the SAP enhancement that contains it is part
of an active CMOD project; otherwise nothing happens and `sy-subrc` keeps its previous value.
The keyword documentation lists the statement and CMOD enhancements as obsolete, but SAP still
documents customer exits in S/4HANA 2025. For the material master, for example, enhancement
MGA00001 adds checks and limited data changes (`EXIT_SAPLMGMU_001`), and MGA00002 controls
material number assignment (`EXIT_SAPLMG02_001` with include `ZXMG0U03` for internal and
`EXIT_SAPLMG02_002` with `ZXMG0U04` for external number assignment). Pick the exit by what
SAP documents it for: a check belongs in MGA00001, not in a number assignment exit.
Do not use `CALL CUSTOMER-FUNCTION` in your own programs; define a kernel BAdI instead.

Kinds of customer exits: function module exits, menu exits (function codes starting with `+`,
text set in the project), and screen exits (subscreen areas filled by a customer subscreen).

Steps:

1. SMOD: read the documentation and components of the SAP enhancement. SAP defines the
   function module interface there; never change the function module or its interface.
2. CMOD: create a project and assign the SAP enhancement. An enhancement can belong to only
   one project, and a project can hold several enhancements, so check first whether another
   project already uses it.
3. Double-click the function module exit and create the customer include `ZX<fg>U<nn>`; the
   `INCLUDE` line in the function module source names it, for example `ZXMG0U02` in
   `EXIT_SAPLMGMU_001`. Write the code there. The include runs inside the SAP function module,
   so it contains no `FUNCTION`, `FORM`, or `ENDFORM` statements.
4. Put your own global data in `ZX<fg>TOP` and your own `FORM` routines in `ZX<fg>ZZZ`. SAP's
   globals are in `LX<fg>TOP`.
5. Activate the project. Activation switches on all exits of the project together; individual
   exits cannot be activated, and you deactivate the project to change it.
6. Put the project and its components (includes, subscreens, menu texts) on a transport.
   After the import, check in CMOD that the project is active in each target system, and
   activate it there if it is not.

Keep the include short. Pass the function module parameters to a class that holds the logic,
so the logic can be unit tested and moved to a BAdI later. Fragment (the parameter names come
from the function module interface in SE37):

```abap
*----------------------------------------------------------------------*
*   INCLUDE ZXMG0U02: customer include of EXIT_SAPLMGMU_001 (MGA00001)
*----------------------------------------------------------------------*
* Runs inside the SAP function module. Globals: ZXMG0TOP. Subroutines: ZXMG0ZZZ.
* Call a class with the interface parameters, for example:
*   zcl_fa_material_check=>check( <parameters of the exit function module> ).
```

## Application user exits (USEREXIT_* routines)

Some applications, mainly Sales and Distribution, call empty `FORM` routines whose names start
with `USEREXIT_` from includes reserved for customers. SAP classifies these "application-specific
user exits" as type **Modification**, because the include belongs to SAP's module pool:

- On ECC and NetWeaver, changing the include needs an SSCR object key, and the key becomes
  invalid after a release upgrade, so the next change needs a new one.
- S/4HANA has no SSCR keys (SAP Note 2309060, from S/4HANA 1511). Changes to SAP objects are
  controlled by the system change option (SE06), the client settings (SCC4), and the
  authorization object S_DEVELOP. The change is still a modification.
- In both, SE95 lists the change. It appears in SPAU only when an upgrade or support package
  delivers a new version of the include. Whether SAP ever delivers these customer-reserved
  includes again is not documented, so check your modified includes after every upgrade
  instead of relying on SPAU.

SAP's modification analysis treats SD user exits as technical rather than business
modifications, and the ATC check "Search for customer modifications" gets the parameter "Only
Business Modifications" with SAP Note 3679781 to filter them. SAP still uses `MV45AFZZ` in
S/4HANA 2025 documentation.

Overview in the SAP Reference IMG: Sales and Distribution > System Modification > User exits.

Sales document processing (program `SAPMV45A`):

| Routine | Called | Use it for |
|---------|--------|------------|
| `USEREXIT_SAVE_DOCUMENT_PREPARE` (MV45AFZZ) | At the beginning of `FORM BELEG_SICHERN` | The last changes or checks before the document is saved |
| `USEREXIT_SAVE_DOCUMENT` (MV45AFZZ) | In `BELEG_SICHERN`, before the commit | Writing your own tables, for example statistics, in the update task |
| `USEREXIT_MOVE_FIELD_TO_VBAK`, `_VBAP`, `_VBEP`, `_VBKD` | At the end of `VBAK_FUELLEN`, `VBAP_FUELLEN`, and so on | Defaulting fields, including customer fields |
| `USEREXIT_NUMBER_RANGE` | In `BELEG_SICHERN` | Choosing the number range |
| `USEREXIT_FIELD_MODIFICATION` | From module `FELDAUSWAHL` | Changing screen field attributes |

Related includes: `MV45ATZZ` for your data declarations and `MV45AOZZ` (PBO) and `MV45AIZZ`
(PAI) for your modules; SAP's documentation asks for names starting with `ZZ`. Fields you
append to SAP tables start with `ZZ` or `YY`.

Put the rule in a class, unit test it there, and keep the `FORM` routine to a few lines. The
class and its test compile on SAP_BASIS 7.02 and later. On 7.00 and 7.01 the class needs the
type group ABAP (`TYPE-POOLS abap`) for `abap_bool` and `abap_true`, and the test class needs
the 7.00 form described in [badi-patterns.md](badi-patterns.md). `ZZAPPROVAL` is a customer
append field of VBAK in this example:

<!-- abap-env: product=ecc release=ehp5 database=anydb -->
```abap
* file: src/zcl_fa_sd_approval_rule.clas.abap
CLASS zcl_fa_sd_approval_rule DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CONSTANTS gc_order_type TYPE vbak-auart VALUE 'ZOR'.
    CONSTANTS gc_sales_org TYPE vbak-vkorg VALUE '1000'.
    CONSTANTS gc_currency TYPE vbak-waerk VALUE 'EUR'.
    CONSTANTS gc_limit TYPE vbak-netwr VALUE '10000.00'.

    CLASS-METHODS approval_missing
      IMPORTING iv_auart          TYPE vbak-auart
                iv_vkorg          TYPE vbak-vkorg
                iv_netwr          TYPE vbak-netwr
                iv_waerk          TYPE vbak-waerk
                iv_approval       TYPE vbak-zzapproval
      RETURNING VALUE(rv_missing) TYPE abap_bool.
ENDCLASS.

CLASS zcl_fa_sd_approval_rule IMPLEMENTATION.
  METHOD approval_missing.
    rv_missing = abap_false.
    IF iv_auart = gc_order_type
       AND iv_vkorg = gc_sales_org
       AND iv_waerk = gc_currency
       AND iv_netwr >= gc_limit
       AND iv_approval IS INITIAL.
      rv_missing = abap_true.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
* file: src/zcl_fa_sd_approval_rule.clas.testclasses.abap
CLASS ltc_approval_rule DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS missing_at_limit FOR TESTING.
    METHODS filled_above_limit FOR TESTING.
    METHODS below_limit FOR TESTING.
ENDCLASS.

CLASS ltc_approval_rule IMPLEMENTATION.
  METHOD missing_at_limit.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fa_sd_approval_rule=>approval_missing( iv_auart    = 'ZOR'
                                                       iv_vkorg    = '1000'
                                                       iv_netwr    = '10000.00'
                                                       iv_waerk    = 'EUR'
                                                       iv_approval = space )
      exp = abap_true ).
  ENDMETHOD.

  METHOD filled_above_limit.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fa_sd_approval_rule=>approval_missing( iv_auart    = 'ZOR'
                                                       iv_vkorg    = '1000'
                                                       iv_netwr    = '25000.00'
                                                       iv_waerk    = 'EUR'
                                                       iv_approval = 'A-4711' )
      exp = abap_false ).
  ENDMETHOD.

  METHOD below_limit.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fa_sd_approval_rule=>approval_missing( iv_auart    = 'ZOR'
                                                       iv_vkorg    = '1000'
                                                       iv_netwr    = '9999.99'
                                                       iv_waerk    = 'EUR'
                                                       iv_approval = space )
      exp = abap_false ).
  ENDMETHOD.
ENDCLASS.
```

The routine in `MV45AFZZ` (a fragment, because it uses the globals of `SAPMV45A`; a functional
method call as an operand of the comparison works on 7.00 too):

```abap
FORM userexit_save_document_prepare.
  IF zcl_fa_sd_approval_rule=>approval_missing( iv_auart    = vbak-auart
                                                iv_vkorg    = vbak-vkorg
                                                iv_netwr    = vbak-netwr
                                                iv_waerk    = vbak-waerk
                                                iv_approval = vbak-zzapproval ) = abap_true.
    MESSAGE e001(zfa_sd).
  ENDIF.
ENDFORM.
```

SAP's IMG documentation describes this routine as the last place to change or check the
document before posting. Before you transport a check like this, settle three points:

1. **Dialog behavior.** In VA01 and VA02 the save runs while the function code is processed,
   outside any `FIELD` or `CHAIN` statement. After an error message, SAP's dynpro rules make
   only the fields named in `FIELD` or `CHAIN` ready for input, so here no field is: users
   report that the order screen becomes display-only, and they must leave the order without
   saving. Where that is not acceptable, a common approach is to send the message in dialog as
   type S with `DISPLAY LIKE 'E'` and return with `LEAVE TO SCREEN sy-dynnr`, which skips the
   save and keeps the order editable. SAP does not document this for `SAPMV45A`, so test it in
   VA01 and VA02 on your release. Without a screen (BAPI, IDoc, batch input) the save must
   still be rejected, and how `SAPMV45A` tells these modes apart is release-specific: check
   it in your system rather than guessing a flag. When the business accepts it, the
   incompleteness procedure avoids the problem.
2. **Other channels.** SD BAPIs such as `BAPI_SALESORDER_CREATEFROMDAT2` take customer fields
   of VBAK only through the `EXTENSIONIN` table, and the field must also be added to the
   extension structures that SAP Note 143580 describes (`BAPE_VBAK`, `BAPE_VBAKX`, `VBAKKOZ`,
   `VBAKKOZX`). IDoc inbound processing needs its own mapping. Until every interface that
   creates the affected orders supplies the field, the check rejects those orders, so agree on
   it with the interface owners.
3. **The right routine.** SAP also documents check routines in `MV45AFZB`, for example
   `USEREXIT_CHECK_VBAK` for additional header checks and `USEREXIT_CHECK_VBAP` for items. Use
   them for checks on data the user enters on the header or an item. A rule on the net value of
   the whole order belongs at save time, when all items are priced.

Test the exit in VA01 and VA02 and in every BAPI, IDoc, or batch channel that creates the
affected orders.

To save your own data with the document, register an update function module in
`USEREXIT_SAVE_DOCUMENT`, which SAP documents for user-specific statistics tables. The update
then runs with SAP's `COMMIT WORK`, or not at all if the document is not saved. Pass every
value from the dialog, including the date: the update module can run later than the save, for
example when a terminated update is repeated in SM13, so `sy-datum` inside it is not
necessarily the save date:

```abap
FORM userexit_save_document.
  CALL FUNCTION 'Z_FA_ORDER_STATS_UPDATE' IN UPDATE TASK
    EXPORTING
      iv_vbeln    = vbak-vbeln
      iv_netwr    = vbak-netwr
      iv_saved_on = sy-datum.
ENDFORM.
```

The update function module writes only your own table (processing type "update module" in
SE37; update modules take their importing parameters by value):

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zfa_order_stats.fugr.z_fa_order_stats_update.abap
FUNCTION z_fa_order_stats_update.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_VBELN) TYPE  VBAK-VBELN
*"     VALUE(IV_NETWR) TYPE  VBAK-NETWR
*"     VALUE(IV_SAVED_ON) TYPE  SY-DATUM
*"----------------------------------------------------------------------
  DATA ls_stats TYPE zfa_order_stats.

  ls_stats-vbeln = iv_vbeln.
  ls_stats-netwr = iv_netwr.
  ls_stats-saved_on = iv_saved_on.
  MODIFY zfa_order_stats FROM ls_stats.
ENDFUNCTION.
```

## LUW and message rules inside exits and BAdIs

Exits and BAdIs run inside the calling application's logical unit of work (SAP LUW). The
application decides when to commit, once, at the end. These rules apply to customer exits,
user exits, BAdI implementations, and source code plug-ins that run in the dialog part, before
the application's `COMMIT WORK`.

| Do not | Why |
|--------|-----|
| `COMMIT WORK` or `ROLLBACK WORK` | A commit starts the update of whatever the application has registered so far, so a document can be posted half-finished. A rollback discards changes the application has already prepared. |
| `CALL TRANSACTION` or `SUBMIT` while a document is saved | The called program runs its own dialog steps and commits in the middle of the save. SAP's BAPI rules forbid both in BAPIs for the same reason. |
| Synchronous or asynchronous RFC (sRFC, aRFC) while a document is saved | Each sRFC or aRFC triggers an implicit database commit in the calling work process (except during the update). To inform another system, register a bgRFC unit (`CALL FUNCTION ... IN BACKGROUND UNIT`, complete from 7.0 EhP2) or a tRFC (`CALL FUNCTION ... IN BACKGROUND TASK`). Both are registered in the SAP LUW and run only after the application's `COMMIT WORK`; `ROLLBACK WORK` deletes tRFC registrations. bgRFC needs a supervisor destination in SBGRFCCONF. |
| `INSERT`, `UPDATE`, `MODIFY`, or `DELETE` on SAP tables such as VBAK or VBAP | Bypasses SAP's update logic, change documents, and locks. The next implicit database commit makes the change permanent even if the application cancels the document. Writing to SAP tables is clean core level D. |
| Messages where the exit documentation does not allow them | Error, information, and warning messages interrupt the dialog step, which triggers an implicit database commit, and they behave differently in dialog, background, BAPI, and IDoc processing. |

Change document fields only through the parameters or work areas the exit provides (for
example `VBAK` in `USEREXIT_MOVE_FIELD_TO_VBAK`), and write your own tables in the update task
as shown above.

**Exits that run in the update task.** Some SAP BAdI methods and exits are called from update
function modules, after the application's `COMMIT WORK`. Their documentation says so, and the
debugger call stack shows an update function module. There the rules differ:

- `CALL FUNCTION ... IN UPDATE TASK` is ignored during the update, so write your own tables
  directly. A runtime error rolls back the whole update.
- Send no messages. In an update work process, every message type except S ends the update
  with a database rollback, and the user is notified by SAP mail; SM13 shows the update as
  terminated.
- Make no authorization checks. None are possible during the update: `AUTHORITY-CHECK` checks
  nothing there and sets `sy-subrc` to 0 (in local updates too, from 7.54).
- Never commit or roll back: database commits and rollbacks are forbidden in updates and cause
  runtime errors.

## Source code plug-ins (Enhancement Framework)

A source code plug-in is code you attach to an enhancement option in a program you do not own.
Plug-ins are stored in your enhancement implementation, not in the SAP program, so they are not
overwritten by upgrades and need no object key.

**Explicit options** are delivered by the program's owner, grouped in simple enhancement
spots:

- `ENHANCEMENT-POINT ... SPOTS ...`: your plug-ins run at that point. A dynamic point runs only
  plug-ins whose switch is on (no switch counts as on); `STATIC` also includes plug-ins in
  stand-by and is meant for data declarations. `FORM` routines, methods, and local classes
  belong in static options.
- `ENHANCEMENT-SECTION ... END-ENHANCEMENT-SECTION`: exactly one plug-in replaces the code of
  the section; without a plug-in the original code runs. A new plug-in starts with a copy of
  the original code. Do not use `STATIC` with sections.
- From 7.02, plug-ins can contain options themselves, and implicit options exist before the
  first and after the last line of a plug-in.

To implement an option, open the program, switch to enhancement mode with the Enhance button,
choose Enhancement Implementation > Create Implementation in the context menu of the option,
and pick or create a simple enhancement implementation. The editor generates
`ENHANCEMENT` and `ENDENHANCEMENT` with an ID; write only the code between them. Never type
these statements yourself, into SAP code or anywhere else. Offline parsers such as abaplint
accept typed `ENHANCEMENT` blocks, so look for them in code reviews.

A plug-in without a switch is active for every user of the system. When several companies
share one system, an explicit option implemented for one of them changes the program for all;
check the company code or sales organization in the plug-in, or implement the option only in
the systems where it applies.

**Implicit options** exist without any preparation by SAP: at the end of programs, function
groups, module pools, subroutine pools, and includes; before the first and after the last line
of `FORM`, `FUNCTION`, and `METHOD` implementations; at the end of visibility sections and
parameter lists of local classes; and before `END OF` in structure definitions. Global class
sections and the parameter interfaces of function modules and global methods have implicit
options that you edit in the Class Builder and Function Builder. AMDP methods have none.
Show them in the editor with Edit > Enhancement Operations > Show Implicit Enhancement Points.

Use implicit options only when nothing else works, and say why in the code review:

- They attach to SAP's internal code at places SAP never designed as interfaces. The variables
  you read can be renamed or removed by any support package.
- SPAU_ENH asks for adjustment when the code before the option changes or the enhanced
  procedure is deleted.
- The clean core level concept rates implicit enhancements as level D, next to modifications.

**Explicit options in your own code.** Prefer a BAdI for your own call points, because it has
an interface and can be tested. Use source code options when other teams must be able to add
declarations or replace a block, for example in code you deliver to several companies. Create
them with the editor's context menu (Enhancements > Create Option); once saved, an option can
be removed only with Enhancement Operations > Delete Enhancement. This program compiles on
SAP_BASIS 7.00:

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zfa_price_report.prog.abap
REPORT zfa_price_report.

DATA gv_discount TYPE p LENGTH 8 DECIMALS 2.
ENHANCEMENT-POINT zfa_ep_price_data SPOTS zfa_es_price_report STATIC.

PARAMETERS p_netwr TYPE vbak-netwr OBLIGATORY.

START-OF-SELECTION.
  ENHANCEMENT-SECTION zfa_es_price_discount SPOTS zfa_es_price_report.
    IF p_netwr > 1000.
      gv_discount = p_netwr / 20.
    ENDIF.
  END-ENHANCEMENT-SECTION.
  ENHANCEMENT-POINT zfa_ep_price_output SPOTS zfa_es_price_report.
  WRITE: / 'Discount:', gv_discount.
```

## Class and function module enhancements

- Global classes and interfaces can get new attributes, new methods, and new optional
  parameters (no new exceptions), and methods can get pre-methods, post-methods, or an
  overwrite method. An overwrite method replaces the original and excludes pre- and
  post-methods for the same method.
- Since SAP NetWeaver 7.0 EhP1, a post-method runs even when the original method ends with
  `CHECK`, `EXIT`, or `RETURN` (SAP Note 1083387).
- Function modules can get new optional parameters.
- ADT does not support class and function group enhancements on any release; use SAP GUI.
- These are enhancement implementations (object type ENHO) and are adjusted in SPAU_ENH. Their
  clean core level is not stated in SAP's public material; see the clean core section.

## Finding enhancement options

| Where | What you find |
|-------|---------------|
| Customizing (SPRO), next to the relevant activity | Classic BAdIs as IMG activities, BAdI implementations SAP delivers, and the SD user exits under Sales and Distribution > System Modification > User exits |
| SE18 and SE19 | BAdI definitions with interface, filters, and documentation; implementations |
| SE80, Enhancement Information System | Enhancement spots, kernel BAdIs, and enhancement implementations. Add it under Utilities > Settings > Workbench (General) if it is missing. |
| SMOD and CMOD | SAP enhancements (customer exits) with documentation; your projects. CMOD > Utilities > SAP enhancements searches by package. |
| SE84 | The Enhancements node lists customer exits, BAdIs, enhancement spots, and enhancement implementations (node names vary slightly by release) |
| Debugger | Breakpoint at statement `GET BADI` or `CALL BADI` for kernel BAdIs, at statement `CALL CUSTOMER-FUNCTION` for customer exits, and at method `CL_EXITHANDLER=>GET_INSTANCE` for classic BAdIs (the parameter `EXIT_NAME` shows the BAdI). Run the transaction and note what stops. |
| Source code | Search the main program and its includes for `GET BADI`, `CALL CUSTOMER-FUNCTION`, and `cl_exithandler` |
| SCFD_REGISTRY (S/4HANA) | BAdIs registered for key user extensibility. Implement these in the Custom Logic app, never in SE18 or SE19: an SE19 implementation blocks the Custom Logic app for that BAdI. |
| SAP Cloudification Repository ([github.com/SAP/abap-atc-cr-cv-s4hc](https://github.com/SAP/abap-atc-cr-cv-s4hc)) | Released BAdIs (object type `BADI_DEF`) for clean core level A. The release files track SAP's cloud releases, so confirm the release state in the target system: in ADT (from SAP_BASIS 7.53) on the API State tab of the object's properties or in the Released Objects tree. |
| FIBF (FI) | Business transaction events: publish and subscribe interfaces and process interfaces, with SAP's sample function modules (`SAMPLE_INTERFACE_<event>`, `SAMPLE_PROCESS_<process>`) to copy into your own function module |
| GGB0, GGB1, OB28, OBBH, GCX2 (FI) | Validations (GGB0) and substitutions (GGB1), activated for accounting documents in OB28 and OBBH. Exit routines go into your copy of `RGGBR000` or `RGGBS000`, assigned in GCX2. |
| VOFM (SD) | Routines for requirements, copy control, and pricing formulas |

The clean core level of business transaction events, validations and substitutions, and VOFM
routines is not stated in the public SAP material checked for this skill.

Read the documentation of the BAdI or exit before coding: it usually states when the call
happens, which parameters can be changed, whether messages are allowed, and whether the code
runs in the update task.

## Upgrades and conversions

During an upgrade, update, or S/4HANA conversion, the SAP objects that the update delivers are
overwritten. Modifications are part of those objects, so every overwritten modification must
be adjusted. Enhancements are separate objects in your packages; they are never overwritten,
and only incompatible ones need adjustment.

| Tool | Adjusts | When |
|------|---------|------|
| SPDD | Modified ABAP Dictionary objects | During the upgrade or conversion in SUM; adjusted objects are activated by the mass activation, not by you |
| SPAU | Modified programs, function modules, screens, interfaces, and documentation that the update delivered again; SAP Notes; migrations of classic BAdIs and SMOD exits (Migrations tab); deletions; translations | After SUM |
| SPAU_ENH | Enhancement Framework implementations: source code plug-ins, BAdI implementations, class and function module enhancements | After SUM, only where the enhanced object changed incompatibly |

A modified user exit include such as `MV45AFZZ` is listed in SPAU only if the update delivered
a new version of it. Keep your own list of modified includes, or use SE95, and check each of
them after every upgrade.

SPAU_ENH flags a source code plug-in when the enhanced object or procedure was deleted, an
`ENHANCEMENT-POINT` or `ENHANCEMENT-SECTION` was deleted, the code inside a section changed,
the code before the option in its processing block changed, a function module moved to another
function group, or a static option became dynamic or the other way round.

Assign the adjustment transports with Modification Adjustment > Assign Transport so that the
upgrades of later systems reuse them. SUM exports the marked SPDD and SPAU transports after you
confirm; with SPAM and SAINT you release them yourself.

Neither SPAU nor SPAU_ENH tells you whether a call point still runs. An implementation that
needs no adjustment can still be dead because SAP replaced the code that called it.

### S/4HANA conversion

1. Before the conversion, run the S/4HANA custom code checks remotely from a central check
   system with the check variant for the target release, for example `S4HANA_READINESS_2025`
   (or `S4HANA_READINESS_2025_NO_FLE` with an 18-character material number). The checked
   system needs SAP Note 2485231 so that modifications and enhancements are checked remotely.
2. During the conversion, adjust Dictionary modifications in SPDD.
3. After the conversion, adjust in SPAU and SPAU_ENH, then run ATC locally with
   `S4HANA_READINESS` (or `S4HANA_READINESS_NO_FLE`), preferably in ADT.
4. For every process you enhanced, read its simplification item. Where SAP replaced the
   process, your enhancement may no longer be called at all.

### Example: MRP Live and the classic MRP BAdIs

The simplification item "MRP in HANA" (SAP Note 2268085; checked in the simplification lists
for 1610 and 2022) explains that MRP Live (transaction MD01N) runs its calculations in
SQLScript, CDS views, and AMDPs on the database. BAdI implementations and enhancements of the classic MRP
run do not work for materials that MRP Live plans. Even the classic transactions MD01, MD02,
and MD03 read receipts and requirements with an AMDP in S/4HANA, which cannot be switched off as
it could in ECC 617 and 618. SAP lists these successors:

| Classic BAdI or exit | Successor in MRP Live (AMDP BAdI and method) |
|----------------------|-----------------------------------------------|
| `MD_CHANGE_MRP_DATA`, `MD_STOCK_TRANSFER`, `MD_ADD_ELEMENTS`, `MD_PIR_FLEX_CONS`, `MD_SUBCONT_LOGIC` | `PPH_MRP_RUN_BADI`, method `MDPS_ADJUST` |
| `MD_MRP_PARAMETERS` | `PPH_MRP_LOTSIZING_BADI`, method `LOT_SIZE_CALC`, and `PPH_MRP_NETTING_BADI`, method `NET_REQ_CALC` |
| `MD_PURREQ_CHANGE`, `MD_PURREQ_POST` | `PPH_MRP_RUN_BADI`, method `PURREQ_BEFORE_UPDATE_ADJUST` |
| `MD_PLDORD_CHANGE`, `MD_PLDORD_POST` | `PPH_MRP_RUN_BADI`, method `PLANORD_BEFORE_UPDATE_ADJUST` |
| `MD_MODIFY_SOURCE`, `MD_MODIFY_PRODVERS` | `PPH_MRP_SOURCING_BADI`, method `SOS_DET_ADJUST` |
| `MD_MRP_RUN_PARALLEL` | `MRP_DISPATCHER_BADI`, method `DISPATCH_CREATE_TASK` |
| Customer exit `M61X0001` | `PPH_MRP_NETTING_BADI`, method `AT_PLANNING_FILE_ENTRIES_READ` |

For classic MRP transactions that read data with SAP HANA optimization (MD01, MD02, MD03, and
materials that MRP Live hands over to classic MRP), the 2022 list names the ABAP BAdI
`MD_ADD_ELEMENTS` as the replacement for `MD_CHANGE_MRP_DATA`. Planning transactions that are
not optimized for SAP HANA (for example MD50, MD51, and long-term planning) still support the
classic data-reading BAdIs such as `MD_CHANGE_MRP_DATA`. AMDP BAdIs need SAP HANA, which
S/4HANA always has, and are edited in ADT.

Other processes changed as well, for example credit management and the customer and supplier
master (business partner). This skill verified the details only for MRP; check the
simplification item of each process before you assume an old exit still runs.

## Clean core levels

In August 2025 SAP replaced the three-tier extensibility model with four clean core levels.
ATC findings map to them as follows:

| Level | Meaning | ATC result |
|-------|---------|------------|
| A | Released APIs and released extension points only (ABAP Cloud on the stack, or side-by-side on SAP BTP) | No finding |
| B | Also classic APIs and classic extension points; SAP's description names user exits and BAdIs | Priority 3 (information) |
| C | SAP internal objects not classified for customer use, including read access to SAP tables | Priority 2 (warning) |
| D | Objects SAP does not recommend, modifications, implicit enhancements, and write access to SAP tables | Priority 1 (error) |

- An extension is rated by the lowest-ranked technology it uses. A kernel BAdI implementation
  that updates an SAP table is level D.
- SAP's technology list (summarized in SAP Learning) rates the kernel BAdI technology A and
  the classic BAdI technology B. A specific BAdI counts as a released extension point only if
  SAP released it; the released ones are in the Cloudification Repository.
- Not stated in the public SAP material checked for this skill: the level of customer exits,
  explicit enhancement points and sections, class and function module enhancements, business
  transaction events, validations and substitutions, and VOFM routines. SAP Note 3578329
  (login required) is the authoritative list. SD user exits are technically modifications,
  although SAP's modification analysis counts them as technical rather than business
  modifications, and SAP's level B description names "user exits" without saying whether it
  means them. Do not state a level for these without checking the note.
- The ATC checks "Allowed SAP enhancement technologies" and "Usage of APIs" are standard in
  S/4HANA 2025 and need SAP Note 3565942 on S/4HANA 2023. For ECC and S/4HANA below 2023 they
  run only remotely: from ATC on SAP BTP with the check variant `ABAP_CLEAN_CORE_READINESS`,
  or from a central ATC system on S/4HANA 2023 (with SAP Note 3565942) or 2025 with your own
  check variant that contains the checks of the Clean Core category. "Allowed SAP enhancement
  technologies" reports enhancement implementations (object type ENHO); modified user exit
  includes show up in "Search for customer modifications".

## Sources

Checked on 2026-10-15.

- ABAP Keyword Documentation 7.58: [CALL CUSTOMER-FUNCTION](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abapcall_customer-function.htm), [ENHANCEMENT-SECTION](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abapenhancement-section.htm), [database commits](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abendb_commit.htm), [CALL FUNCTION IN UPDATE TASK](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abapcall_function_update.htm), [messages in dialog processing](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abenabap_message_dialog.htm), [messages in updates](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abenabap_message_update.htm), [functional methods in expressions since 4.6A](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abennews-46-objects-entwicklungen.htm)
- ABAP Keyword Documentation, release news: [authorization checks in updates (7.54)](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-754-UPDATE.html), [bgRFC in 7.0 EhP2](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-71-RFC.html)
- ABAP Keyword Documentation 7.52: [ENHANCEMENT-POINT](https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abapenhancement-point.htm), [ENHANCEMENT](https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abapenhancement.htm), [implicit enhancement options](https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abenimplicit_enh_points.htm)
- ABAP platform 2025 documentation: [application-specific user exits](https://help.sap.com/docs/ABAP_PLATFORM_NEW/2b28ffa716c24348903f8ffbfeb81df8/bfec07a25db911d295ae0000e82de14a.html?version=202510.002), [modification adjustment](https://help.sap.com/docs/ABAP_PLATFORM_NEW/2b28ffa716c24348903f8ffbfeb81df8/57f148a3c3eb4689aca27f2e4fb1aec3.html?version=202510.002), [adjusting enhancements](https://help.sap.com/docs/ABAP_PLATFORM_NEW/46a2cfc13d25463b8b9a3d2a3c3ba0d9/819a3942ec4ae22ce10000000a1550b0.html?version=202510.002), [Enhancement Information System](https://help.sap.com/docs/ABAP_PLATFORM_NEW/46a2cfc13d25463b8b9a3d2a3c3ba0d9/29503e423a95b36be10000000a155106.html?version=202510.002), [ADT and enhancements](https://help.sap.com/docs/ABAP_PLATFORM_NEW/c238d694b825421f940829321ffa326a/4ec1abd36e391014adc9fffe4e204223.html?version=202510.002)
- ABAP platform 2022 documentation: [key user BAdIs in SCFD_REGISTRY](https://help.sap.com/docs/ABAP_PLATFORM_NEW/b5670aaaa2364a29935f40b16499972d/228e93706169472abdb1665293378e8b.html?version=202210.latest)
- SAP NetWeaver 7.0 EhP1 documentation: [customer exit includes](https://help.sap.com/doc/saphelp_em700_ehp01/7.0.1/en-US/c8/19764143b111d1896f0000e8322d00/content.htm), [CMOD projects](https://help.sap.com/doc/saphelp_em700_ehp01/7.0.1/en-US/c8/19760043b111d1896f0000e8322d00/content.htm), [class enhancements](https://help.sap.com/doc/saphelp_em700_ehp01/7.0.1/en-US/58/4fb541d3d52d31e10000000a155106/content.htm)
- SAP R/3 4.6C documentation: [user exits in sales document processing](https://help.sap.com/saphelp_46c/helpdata/en/1c/f62c7dd435d1118b3f0060b03ca329/content.htm)
- SAP S/4HANA 2025 FPS02 documentation: [material master customer exits](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/36802406aebb4b96b1598246e1d316ee/9414c453f57eb44ce10000000a174cb4.html?version=2025.002); the same list with the purpose of each exit in the [SAP ERP documentation](https://help.sap.com/saphelp_me60/helpdata/en/94/14c453f57eb44ce10000000a174cb4/content.htm)
- [Simplification List for SAP S/4HANA 2022](https://help.sap.com/doc/59bf7d0f62d24af78f87c560da8f18ce/2022/en-US/SIMPL_OP2022.pdf) (version 1.29, items "S4TWL - MRP in HANA" and "ABAPTWL - SSCR license key procedure is no longer supported", SAP Note 2309060) and [Custom Code Migration Guide for SAP S/4HANA 2025](https://help.sap.com/doc/9dcbc5e47ba54a5cbb509afaa49dd5a1/2025.002/en-US/CustomCodeMigration_EndToEnd.pdf)
- Finding exits in FI (FIBF, GGB0, GGB1): [archived SAP Community wiki content on help.sap.com](https://help.sap.com/docs/SUPPORT_CONTENT/abap/3353525969.html); exit routines in validations and substitutions (`RGGBR000`, `RGGBS000`): [SAP R/3 4.6C documentation](https://help.sap.com/saphelp_46c/helpdata/en/5b/d231a843c611d182b30000e829fbfe/content.htm); GCX2, OB28, and OBBH are confirmed only by SAP Community threads
- SD BAPI extension fields (`EXTENSIONIN`, SAP Note 143580): SAP Community threads only, for example [BAPI extensions](https://community.sap.com/t5/application-development-and-automation-discussions/bapi-extensions/m-p/1408876); check the note and the BAPI documentation in your system
- Display-only VA01 screen after an error message in `USEREXIT_SAVE_DOCUMENT_PREPARE`: reported in SAP Community threads, not documented by SAP
- Clean core: [SAP Cloud ALM help, extensibility levels](https://help.sap.com/docs/cloud-alm/applicationhelp/extensibility), [SAP Learning, clean core extensibility](https://learning.sap.com/courses/practicing-clean-core-extensibility-for-sap-s-4hana-cloud/explaining-extensibility-model-best-practices_e290f382-800e-40ef-a203-85a13115f487), [ATC recommendations for clean core governance](https://community.sap.com/t5/technology-blog-posts-by-sap/abap-test-cockpit-atc-recommendations-for-governance-of-clean-core-abap/ba-p/14186130) (SAP employee blog)
