# sap-abap-enhancements Acceptance Criteria

**Skill**: `plugins/sap-abap/skills/sap-abap-enhancements`
**Product**: Enhancements of SAP standard with Standard ABAP on SAP ECC 6.0, SAP NetWeaver AS ABAP, and SAP S/4HANA (on premises, IaaS, or SAP private cloud)
**Purpose**: Criteria for choosing and building enhancements that respect the target release, the logical unit of work, and upgrade behavior. Each "Incorrect" example is rejected by a forbidden pattern in `scenarios.yaml` or by a validator under the environment named in its `abap-env` line. Each complete "Correct" example is parsed with abaplint for its environment.

---

## 1. Technology choice

### 1.1 Correct: Customizing named before code, and the user exit described honestly

```text
Customizing first: an incompleteness procedure (Sales and Distribution > Basic Functions >
Log of Incomplete Items) makes the approval number mandatory for order type ZOR, and the
sales document type decides whether incomplete documents can be saved. It cannot test the
net value. If the 10,000 EUR threshold must stay, use USEREXIT_SAVE_DOCUMENT_PREPARE in
MV45AFZZ. That is a modification of an SAP include. On ECC it needs an SSCR object key, and
the key becomes invalid after a release upgrade; S/4HANA has no SSCR keys, but the change is
still a modification. It appears in SPAU only when an upgrade delivers a new version of the
include, so check it after every upgrade.
```

### 1.2 Incorrect: a modification as the first answer

```text
Request an access key for program SAPMV45A and insert the check at the start of
FORM BELEG_SICHERN.
```

### 1.3 Incorrect: an implicit enhancement as the default choice

```text
Create an implicit enhancement at the start of FORM BELEG_SICHERN in SAPMV45A and add
the check there.
```

---

## 2. Implementing a kernel BAdI

### 2.1 Correct: implementing class of a filtered single-use BAdI, with a unit test

The interface is repeated in the block so the class validates with it.

```abap
* file: src/zif_fa_order_check.intf.abap
INTERFACE zif_fa_order_check PUBLIC.
  INTERFACES if_badi_interface.
  TYPES: BEGIN OF ty_order,
           vbeln TYPE vbak-vbeln,
           auart TYPE vbak-auart,
           vkorg TYPE vbak-vkorg,
           netwr TYPE vbak-netwr,
           waerk TYPE vbak-waerk,
         END OF ty_order.
  TYPES ty_flag TYPE c LENGTH 1.
  METHODS check_order
    IMPORTING is_order   TYPE ty_order
    EXPORTING ev_blocked TYPE ty_flag
              ev_reason  TYPE string.
ENDINTERFACE.
* file: src/zcl_fa_order_check_1000.clas.abap
CLASS zcl_fa_order_check_1000 DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_fa_order_check.
    CONSTANTS gc_order_type TYPE vbak-auart VALUE 'ZOR'.
    CONSTANTS gc_currency TYPE vbak-waerk VALUE 'EUR'.
    CONSTANTS gc_limit TYPE vbak-netwr VALUE '50000.00'.
ENDCLASS.

CLASS zcl_fa_order_check_1000 IMPLEMENTATION.
  METHOD zif_fa_order_check~check_order.
    CLEAR: ev_blocked, ev_reason.
    IF is_order-auart <> gc_order_type OR is_order-waerk <> gc_currency.
      RETURN.
    ENDIF.
    IF is_order-netwr > gc_limit.
      ev_blocked = 'X'.
      ev_reason = 'Net value above 50,000 EUR needs approval'.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
* file: src/zcl_fa_order_check_1000.clas.testclasses.abap
CLASS ltc_order_check DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS blocks_large_standard_order FOR TESTING.
ENDCLASS.

CLASS ltc_order_check IMPLEMENTATION.
  METHOD blocks_large_standard_order.
    DATA lo_cut TYPE REF TO zif_fa_order_check.
    DATA ls_order TYPE zif_fa_order_check=>ty_order.
    DATA lv_blocked TYPE zif_fa_order_check=>ty_flag.
    DATA lv_reason TYPE string.
    CREATE OBJECT lo_cut TYPE zcl_fa_order_check_1000.
    ls_order-auart = 'ZOR'.
    ls_order-waerk = 'EUR'.
    ls_order-netwr = '60000.00'.
    lo_cut->check_order( EXPORTING is_order   = ls_order
                         IMPORTING ev_blocked = lv_blocked
                                   ev_reason  = lv_reason ).
    cl_abap_unit_assert=>assert_equals( act = lv_blocked exp = 'X' ).
  ENDMETHOD.
ENDCLASS.
```

### 2.2 Incorrect: COMMIT WORK inside a BAdI method

The BAdI runs inside the caller's logical unit of work; the commit posts whatever the caller
has registered so far.

```abap
METHOD zif_fa_order_check~check_order.
  UPDATE zfa_order_log SET checked = 'X' WHERE vbeln = is_order-vbeln.
  COMMIT WORK.
ENDMETHOD.
```

### 2.3 Correct: multiple-use BAdI with importing and changing parameters only

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zif_fa_order_saved.intf.abap
INTERFACE zif_fa_order_saved PUBLIC.
  INTERFACES if_badi_interface.
  TYPES ty_messages TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
  METHODS on_saved
    IMPORTING iv_vbeln    TYPE vbak-vbeln
    CHANGING  ct_messages TYPE ty_messages.
ENDINTERFACE.
* file: src/zfa_order_saved_700.prog.abap
REPORT zfa_order_saved_700.

DATA go_badi TYPE REF TO zbadi_fa_order_saved.
DATA gt_messages TYPE zif_fa_order_saved=>ty_messages.

PARAMETERS p_vbeln TYPE vbak-vbeln OBLIGATORY.

START-OF-SELECTION.
  GET BADI go_badi.
  CALL BADI go_badi->on_saved
    EXPORTING
      iv_vbeln    = p_vbeln
    CHANGING
      ct_messages = gt_messages.
```

### 2.4 Incorrect: a message and a direct table write inside a BAdI method that returns its result

The BAdI returns EV_BLOCKED and EV_REASON, so the caller decides what to show. An error message
ends the caller's dialog step, and the direct write bypasses the update task.

```abap
METHOD zif_fa_order_check~check_order.
  IF is_order-netwr > '50000.00'.
    INSERT zfa_order_log FROM ls_log.
    MESSAGE e001(zfa_sd).
  ENDIF.
ENDMETHOD.
```

---

## 3. Calling a kernel BAdI from your own code

### 3.1 Correct: GET BADI once with FILTERS, CALL BADI, fallback class, on ECC 6.0 (7.00)

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zif_fa_order_check.intf.abap
INTERFACE zif_fa_order_check PUBLIC.
  INTERFACES if_badi_interface.
  TYPES: BEGIN OF ty_order,
           vbeln TYPE vbak-vbeln,
           auart TYPE vbak-auart,
           vkorg TYPE vbak-vkorg,
           netwr TYPE vbak-netwr,
           waerk TYPE vbak-waerk,
         END OF ty_order.
  TYPES ty_flag TYPE c LENGTH 1.
  METHODS check_order
    IMPORTING is_order   TYPE ty_order
    EXPORTING ev_blocked TYPE ty_flag
              ev_reason  TYPE string.
ENDINTERFACE.
* file: src/zcl_fa_order_check_fallback.clas.abap
CLASS zcl_fa_order_check_fallback DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_fa_order_check.
ENDCLASS.

CLASS zcl_fa_order_check_fallback IMPLEMENTATION.
  METHOD zif_fa_order_check~check_order.
    CLEAR: ev_blocked, ev_reason.
  ENDMETHOD.
ENDCLASS.
* file: src/zfa_order_check_700.prog.abap
REPORT zfa_order_check_700.

DATA go_badi TYPE REF TO zbadi_fa_order_check.
DATA gs_order TYPE zif_fa_order_check=>ty_order.
DATA gv_vtweg TYPE vbak-vtweg.
DATA gv_spart TYPE vbak-spart.
DATA gv_blocked TYPE zif_fa_order_check=>ty_flag.
DATA gv_reason TYPE string.

PARAMETERS p_vbeln TYPE vbak-vbeln OBLIGATORY.

START-OF-SELECTION.
  SELECT SINGLE vbeln auart vkorg vtweg spart netwr waerk
    FROM vbak
    INTO (gs_order-vbeln, gs_order-auart, gs_order-vkorg, gv_vtweg,
          gv_spart, gs_order-netwr, gs_order-waerk)
    WHERE vbeln = p_vbeln.
  IF sy-subrc <> 0.
    MESSAGE 'Sales document not found' TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.
  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
    ID 'VKORG' FIELD gs_order-vkorg
    ID 'VTWEG' FIELD gv_vtweg
    ID 'SPART' FIELD gv_spart
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE 'No display authorization for this sales document' TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.
  TRY.
      GET BADI go_badi
        FILTERS
          vkorg = gs_order-vkorg.
      CALL BADI go_badi->check_order
        EXPORTING
          is_order   = gs_order
        IMPORTING
          ev_blocked = gv_blocked
          ev_reason  = gv_reason.
    CATCH cx_badi_not_implemented.
      CLEAR gv_blocked.
  ENDTRY.
  IF gv_blocked = 'X'.
    WRITE: / 'Blocked:', gv_reason.
  ENDIF.
```

### 3.2 Incorrect: CL_EXITHANDLER for a kernel BAdI

`CL_EXITHANDLER=>GET_INSTANCE` is the factory of classic BAdIs. A kernel BAdI is reached with
`GET BADI` through a reference typed with the BAdI name.

```abap
DATA lo_exit TYPE REF TO zif_fa_order_check.
CALL METHOD cl_exithandler=>get_instance
  EXPORTING
    exit_name = 'ZBADI_FA_ORDER_CHECK'
  CHANGING
    instance  = lo_exit.
```

### 3.3 Incorrect: 7.40 syntax in a caller for ECC 6.0 EHP5

Inline declarations and `VALUE #( )` need SAP_BASIS 7.40 SP02; the program does not compile on
7.02.

<!-- abap-env: product=ecc release=ehp5 database=anydb -->
```abap
* file: src/zfa_order_check_bad.prog.abap
REPORT zfa_order_check_bad.
PARAMETERS p_vkorg TYPE vbak-vkorg OBLIGATORY.
DATA go_badi TYPE REF TO zbadi_fa_order_check.
START-OF-SELECTION.
  GET BADI go_badi FILTERS vkorg = p_vkorg.
  CALL BADI go_badi->check_order
    EXPORTING is_order   = VALUE #( vkorg = p_vkorg )
    IMPORTING ev_blocked = DATA(lv_blocked)
              ev_reason  = DATA(lv_reason).
```

### 3.4 Incorrect: GET BADI for every row when the filter value does not change

```abap
LOOP AT gt_orders INTO gs_order.
  GET BADI go_badi FILTERS vkorg = p_vkorg.
  CALL BADI go_badi->check_order
    EXPORTING is_order   = gs_order
    IMPORTING ev_blocked = gv_blocked
              ev_reason  = gv_reason.
ENDLOOP.
```

### 3.5 Incorrect: a customer exit call in your own program

`CALL CUSTOMER-FUNCTION` is meant for SAP programs and is obsolete; define a kernel BAdI for
your own call points.

```abap
START-OF-SELECTION.
  CALL CUSTOMER-FUNCTION '001'
    EXPORTING
      is_order = gs_order.
```

---

## 4. Classic BAdIs

### 4.1 Correct: instance fetched once, null instance accepted, reference checked before each call

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zif_ex_fa_order_exit.intf.abap
INTERFACE zif_ex_fa_order_exit PUBLIC.
  METHODS change_net_value
    IMPORTING flt_val  TYPE vbak-vkorg
    CHANGING  cv_netwr TYPE vbak-netwr.
ENDINTERFACE.
* file: src/zcl_fa_order_service.clas.abap
CLASS zcl_fa_order_service DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS constructor.
    METHODS adjust_net_value
      IMPORTING iv_vkorg TYPE vbak-vkorg
      CHANGING  cv_netwr TYPE vbak-netwr.
  PRIVATE SECTION.
    DATA mo_exit TYPE REF TO zif_ex_fa_order_exit.
ENDCLASS.

CLASS zcl_fa_order_service IMPLEMENTATION.
  METHOD constructor.
    CALL METHOD cl_exithandler=>get_instance
      EXPORTING
        exit_name              = 'ZFA_ORDER_EXIT'
        null_instance_accepted = 'X'
      CHANGING
        instance               = mo_exit
      EXCEPTIONS
        OTHERS                 = 1.
    IF sy-subrc <> 0.
      CLEAR mo_exit.
    ENDIF.
  ENDMETHOD.

  METHOD adjust_net_value.
    IF mo_exit IS NOT INITIAL.
      CALL METHOD mo_exit->change_net_value
        EXPORTING
          flt_val  = iv_vkorg
        CHANGING
          cv_netwr = cv_netwr.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

### 4.2 Incorrect: the null instance is called without a check

With `null_instance_accepted = 'X'` the reference stays initial when no implementation is
active, and the method call dumps.

```abap
CALL METHOD cl_exithandler=>get_instance
  EXPORTING
    exit_name              = 'ZFA_ORDER_EXIT'
    null_instance_accepted = 'X'
  CHANGING
    instance               = lo_exit.
CALL METHOD lo_exit->change_net_value
  EXPORTING
    flt_val  = lv_vkorg
  CHANGING
    cv_netwr = lv_netwr.
```

### 4.3 Incorrect: GET_INSTANCE for every document

```abap
LOOP AT lt_orders INTO ls_order.
  CALL METHOD cl_exithandler=>get_instance
    EXPORTING
      exit_name              = 'ZFA_ORDER_EXIT'
      null_instance_accepted = 'X'
    CHANGING
      instance               = lo_exit.
  IF lo_exit IS NOT INITIAL.
    CALL METHOD lo_exit->change_net_value
      EXPORTING
        flt_val  = ls_order-vkorg
      CHANGING
        cv_netwr = ls_order-netwr.
  ENDIF.
ENDLOOP.
```

### 4.4 Incorrect: GET BADI for a classic BAdI that was never migrated

`GET BADI` needs a BAdI defined in an enhancement spot. A classic BAdI is reached through
`CL_EXITHANDLER=>GET_INSTANCE` until its owner migrates it in SE18.

```abap
DATA lo_exit TYPE REF TO zif_ex_fa_order_exit.
GET BADI lo_exit FILTERS vkorg = lv_vkorg.
```

---

## 5. Customer exits

### 5.1 Correct: a short customer include that hands over to a class

```abap
*----------------------------------------------------------------------*
*   INCLUDE ZXMG0U02: customer include of EXIT_SAPLMGMU_001 (MGA00001)
*----------------------------------------------------------------------*
* Runs inside the SAP function module. Globals: ZXMG0TOP. Subroutines: ZXMG0ZZZ.
*   zcl_fa_material_check=>check( <parameters of the exit function module> ).
```

### 5.2 Incorrect: COMMIT WORK in a customer exit include

```abap
* Include ZXMG0U02
UPDATE zfa_material_log SET checked = 'X' WHERE matnr = lv_matnr.
COMMIT WORK.
```

### 5.3 Correct: an exit that does nothing after a transport is checked in CMOD first

```text
CALL CUSTOMER-FUNCTION calls EXIT_SAPLMGMU_001 only when enhancement MGA00001 belongs to an
active CMOD project. Open CMOD in the quality system and check that project ZFAMM01 exists,
contains MGA00001, and is active; activate it there if it is not. Put the project itself on
the transport next time, not only the include, and check the activation after every import.
```

### 5.4 Incorrect: putting the code into SAP's exit function module

```text
Put your check directly into function module EXIT_SAPLMGMU_001 so that it runs without a
CMOD project.
```

---

## 6. Application user exits and the logical unit of work

### 6.1 Correct: the rule in a tested class, the user exit routine kept short

The error message stops the save. In VA01 and VA02 it can also leave the order screen
display-only, so the answer says so and asks for a test in dialog and in every other channel
before the transport.

<!-- abap-env: product=ecc release=ehp7 support_package=8 database=anydb -->
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
ENDCLASS.
```

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

### 6.2 Incorrect: COMMIT WORK in a user exit

```abap
FORM userexit_save_document.
  UPDATE zfa_order_stats SET netwr = vbak-netwr WHERE vbeln = vbak-vbeln.
  COMMIT WORK.
ENDFORM.
```

### 6.3 Incorrect: writing the SAP document table directly

The direct update bypasses SAP's update logic, change documents, and locks, and the next
implicit database commit makes it permanent even if the save is cancelled.

```abap
FORM userexit_save_document_prepare.
  UPDATE vbak SET zzapproval = 'AUTO' WHERE vbeln = vbak-vbeln.
ENDFORM.
```

### 6.4 Incorrect: calling a transaction while the document is saved

```abap
FORM userexit_save_document_prepare.
  CALL TRANSACTION 'VA02' AND SKIP FIRST SCREEN.
ENDFORM.
```

### 6.5 Incorrect: checks with error messages in USEREXIT_SAVE_DOCUMENT

The routine runs right before the commit and is meant for writing your own tables; checks
belong in USEREXIT_SAVE_DOCUMENT_PREPARE.

```abap
FORM userexit_save_document.
  IF vbak-zzapproval IS INITIAL.
    MESSAGE e001(zfa_sd).
  ENDIF.
ENDFORM.
```

---

## 7. Source code plug-ins

### 7.1 Correct: explicit enhancement options in your own program (7.00)

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

### 7.2 Incorrect: a plug-in typed by hand into SAP code

The Enhancement Builder generates `ENHANCEMENT` and `ENDENHANCEMENT`; text typed into an SAP
include is a modification, not a plug-in.

```abap
FORM userexit_save_document_prepare.
ENHANCEMENT 1 ZEI_FA_TYPED_BY_HAND.
  vbak-zzapproval = 'X'.
ENDENHANCEMENT.
ENDFORM.
```

### 7.3 Correct: a plug-in for an explicit section in a program another team owns

The rule lives in a tested class; the plug-in that the Enhancement Builder generates for the
section holds one line. The class compiles on ECC 6.0 EHP6 (7.31).

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zcl_fa_es_discount_rule.clas.abap
CLASS zcl_fa_es_discount_rule DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES ty_amount TYPE p LENGTH 8 DECIMALS 2.
    CONSTANTS gc_threshold TYPE vbak-netwr VALUE '5000.00'.

    CLASS-METHODS discount
      IMPORTING iv_netwr           TYPE vbak-netwr
      RETURNING VALUE(rv_discount) TYPE ty_amount.
ENDCLASS.

CLASS zcl_fa_es_discount_rule IMPLEMENTATION.
  METHOD discount.
    CLEAR rv_discount.
    IF iv_netwr >= gc_threshold.
      rv_discount = iv_netwr / 10.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

```abap
* Code inside the plug-in for ENHANCEMENT-SECTION zfa_es_price_discount. The editor generates
* the ENHANCEMENT and ENDENHANCEMENT lines around it.
  gv_discount = zcl_fa_es_discount_rule=>discount( p_netwr ).
```

### 7.4 Incorrect: copying the program instead of implementing the option

The copy no longer receives the central team's corrections, and the section exists precisely so
that subsidiaries can replace the block.

```text
Copy ZFA_PRICE_REPORT to ZFA_PRICE_REPORT_ES and change the discount in the copy.
```

---

## 8. Release limits

### 8.1 Correct: optional BAdI methods on ECC 6.0 EHP7 with SAP_BASIS 7.40 SP08

<!-- abap-env: product=ecc release=ehp7 support_package=8 database=anydb -->
```abap
* file: src/zif_fa_order_events.intf.abap
INTERFACE zif_fa_order_events PUBLIC.
  INTERFACES if_badi_interface.
  METHODS on_saved DEFAULT IGNORE
    IMPORTING iv_vbeln TYPE vbak-vbeln.
  METHODS on_deleted DEFAULT FAIL
    IMPORTING iv_vbeln TYPE vbak-vbeln.
ENDINTERFACE.
```

### 8.2 Incorrect: optional BAdI methods on ECC 6.0 EHP6 (7.31)

`DEFAULT IGNORE` and `DEFAULT FAIL` need SAP_BASIS 7.40 SP08.

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zif_fa_order_events.intf.abap
INTERFACE zif_fa_order_events PUBLIC.
  INTERFACES if_badi_interface.
  METHODS on_saved DEFAULT IGNORE
    IMPORTING iv_vbeln TYPE vbak-vbeln.
ENDINTERFACE.
```

---

## 9. Upgrades and S/4HANA conversions

### 9.1 Correct: a dead call point explained and moved to SAP's successor

```text
SPAU and SPAU_ENH only list objects that SAP changed. Your implementation of
MD_CHANGE_MRP_DATA is intact but no longer called: MRP Live (MD01N) plans in AMDPs on SAP
HANA (simplification item "MRP in HANA", SAP Note 2268085). Move the logic to the AMDP BAdI
PPH_MRP_RUN_BADI, method MDPS_ADJUST, and use MD_ADD_ELEMENTS for the classic MRP
transactions that SAP optimized for SAP HANA.
```

### 9.2 Incorrect: forcing the old BAdI back with an implicit enhancement

```text
Create an implicit enhancement in the function module that reads the MRP data and call
your MD_CHANGE_MRP_DATA implementation from there again.
```

---

## 10. Test scenarios checklist

- [ ] Implementing a customer-defined single-use kernel BAdI with a filter on ECC 6.0 EHP8
- [ ] Calling your own BAdI from a report on ECC 6.0 EHP5, safe without implementations
- [ ] SD save check on ECC 6.0 EHP7 with SAP_BASIS 7.40 SP08: Customizing first, then USEREXIT_SAVE_DOCUMENT_PREPARE described as a modification
- [ ] Classic MRP BAdI not called after a conversion to S/4HANA 2023
- [ ] Calling a customer classic BAdI from a class on ECC 6.0 EHP4 (7.01): instance once, null instance checked
- [ ] Implementing an explicit enhancement section in a program another team owns, on ECC 6.0 EHP6
- [ ] A customer exit that does nothing after the transport: the CMOD project is not active

## Notes on the offline checks

- abaplint accepts the dynamic `GET BADI ... TYPE (name) FILTERS ...` on 7.00 and 7.01 and
  reports a parser error for `FILTER-TABLE` on every release (checked on 2026-10-15). The
  dynamic variant in `references/badi-patterns.md` is therefore a fragment that no validator
  checks; its 7.02 limit is reviewed by hand.
- abaplint accepts hand-typed `ENHANCEMENT` and `ENDENHANCEMENT` statements, so example 7.2 is
  caught by the forbidden pattern `^\s*ENDENHANCEMENT\s*\.`, not by a validator.
- Patterns for recommendations ("create an implicit enhancement", "request an object key")
  skip a verb that a nearby "not", "never", "avoid", or similar word negates, and they work on
  one line at a time. Keep a recommendation and its object on one line in negative responses.
