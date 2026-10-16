# sap-abap-integration Acceptance Criteria

**Skill**: `plugins/sap-abap/skills/sap-abap-integration`
**Product**: BAPI, RFC, IDoc, and SAP Gateway OData V2 integration in Standard ABAP on SAP ECC 6.0, SAP NetWeaver AS ABAP, and SAP S/4HANA (on premises, on IaaS, or in SAP's private cloud)
**Purpose**: Criteria for integration code that controls its transactions, handles partner failures, keeps logon data out of code, and uses only syntax the target release supports. Each "Incorrect" example is rejected by a forbidden pattern in `scenarios.yaml` or by a validator under the environment named in its `abap-env` line; the one exception carries a `not-detectable` note that names the scenario which checks the rule through an expected pattern instead. Each complete "Correct" example is parsed with abaplint for its environment. Function module bodies are parsed without the function group XML, so only their syntax is checked. Example 4.1 contains a stand-in for the class SEGW generates, only so that the redefinition can be validated; an answer delivers the `_EXT` class alone.

---

## 1. BAPI calls and transaction control

### 1.1 Correct: RETURN checked for E and A, then commit or rollback, and the commit's RETURN checked (ECC 6.0 EHP6)

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_order_create_one.prog.abap
REPORT zfa_order_create_one.

PARAMETERS: p_cust  TYPE zfa_s_order_header-customer OBLIGATORY,
            p_waers TYPE zfa_s_order_header-currency OBLIGATORY,
            p_matnr TYPE zfa_s_order_item-material OBLIGATORY,
            p_menge TYPE zfa_s_order_item-quantity OBLIGATORY,
            p_meins TYPE zfa_s_order_item-unit OBLIGATORY,
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA gs_header TYPE zfa_s_order_header.
DATA gs_item TYPE zfa_s_order_item.
DATA gt_items TYPE STANDARD TABLE OF zfa_s_order_item WITH DEFAULT KEY.
DATA gt_return TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
DATA gs_return TYPE bapiret2.
DATA gs_commit_return TYPE bapiret2.
DATA gv_order_id TYPE zfa_order_id.
DATA gv_failed TYPE abap_bool.

START-OF-SELECTION.
  gs_header-customer   = p_cust.
  gs_header-order_date = sy-datum.
  gs_header-currency   = p_waers.
  gs_item-material     = p_matnr.
  gs_item-quantity     = p_menge.
  gs_item-unit         = p_meins.
  APPEND gs_item TO gt_items.

  CALL FUNCTION 'Z_FA_ORDER_CREATE'
    EXPORTING
      is_header   = gs_header
      iv_testrun  = p_test
    IMPORTING
      ev_order_id = gv_order_id
    TABLES
      it_items    = gt_items
      return      = gt_return.

  LOOP AT gt_return INTO gs_return WHERE type = 'E' OR type = 'A'.
    gv_failed = abap_true.
    EXIT.
  ENDLOOP.

  IF gv_failed = abap_true OR p_test = 'X'.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait   = 'X'
      IMPORTING
        return = gs_commit_return.
    IF gs_commit_return-type = 'E' OR gs_commit_return-type = 'A'.
      APPEND gs_commit_return TO gt_return.
    ENDIF.
  ENDIF.

  LOOP AT gt_return INTO gs_return.
    WRITE: / gs_return-type, gs_return-message.
  ENDLOOP.
```

### 1.2 Incorrect: commit before RETURN is read

The rollback after the commit cannot undo the order any more.

```abap
CALL FUNCTION 'Z_FA_ORDER_CREATE'
  EXPORTING
    is_header   = ls_header
  IMPORTING
    ev_order_id = lv_order_id
  TABLES
    it_items    = lt_items
    return      = lt_return.
CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
  EXPORTING
    wait = 'X'.
LOOP AT lt_return INTO ls_return WHERE type = 'E' OR type = 'A'.
  CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
ENDLOOP.
```

### 1.3 Incorrect: COMMIT WORK inside a BAPI-style function module

The caller loses control over the LUW and cannot combine or roll back calls.

```abap
  CALL FUNCTION 'Z_FA_ORDER_SAVE' IN UPDATE TASK
    EXPORTING
      iv_order_id = lv_order_id
      is_header   = is_header
    TABLES
      it_items    = it_items.
  COMMIT WORK.
```

### 1.4 Correct: BAPI-style RFC function module that reports errors in RETURN and never commits

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zfa_order_api.fugr.z_fa_order_check.abap
FUNCTION z_fa_order_check.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IS_HEADER) TYPE  ZFA_S_ORDER_HEADER
*"  TABLES
*"      RETURN STRUCTURE  BAPIRET2
*"----------------------------------------------------------------------
  DATA lv_text TYPE bapi_msg.
  DATA ls_return TYPE bapiret2.

  CLEAR return[].
  IF is_header-customer IS INITIAL.
    MESSAGE e002(zfa_order) INTO lv_text.
    ls_return-type       = sy-msgty.
    ls_return-id         = sy-msgid.
    ls_return-number     = sy-msgno.
    ls_return-message    = lv_text.
    APPEND ls_return TO return.
  ENDIF.
ENDFUNCTION.
```

### 1.5 Incorrect: MESSAGE of type E in a BAPI-style function module

Over RFC the message ends the call with `SYSTEM_FAILURE`; a local caller loses control. Report
it in `RETURN` with `MESSAGE ... INTO` instead.

```abap
  IF is_header-customer IS INITIAL.
    MESSAGE e002(zfa_order).
  ENDIF.
```

### 1.6 Incorrect: posting and committing inside SELECT ... ENDSELECT

The commit closes the database cursor, so the next fetch ends in a runtime error.

```abap
SELECT * FROM zfa_order_stage INTO ls_stage WHERE status = space.
  CALL FUNCTION 'Z_FA_ORDER_CREATE'
    EXPORTING
      is_header   = ls_header
    IMPORTING
      ev_order_id = lv_order_id
    TABLES
      it_items    = lt_items
      return      = lt_return.
  IF lv_failed IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
  ENDIF.
ENDSELECT.
```

### 1.7 Correct: the source row is marked in the same LUW as the document

The update module runs in the same update as the order, so the row is marked only if the order
is saved, and a second run skips it.

```abap
CALL FUNCTION 'Z_FA_ORDER_STAGE_SET_POSTED' IN UPDATE TASK
  EXPORTING
    iv_stage_id = is_stage-stage_id.
CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
  EXPORTING
    wait   = 'X'
  IMPORTING
    return = ls_commit_return.
```

---

## 2. RFC

### 2.1 Correct: synchronous RFC with SYSTEM_FAILURE, COMMUNICATION_FAILURE, MESSAGE, and the RETURN check (ECC 6.0 EHP4)

<!-- abap-env: product=ecc release=ehp4 database=anydb -->
```abap
* file: src/zfa_s4_order_count.prog.abap
REPORT zfa_s4_order_count.

" The SM59 destination holds the logon data; this program contains none.
CONSTANTS gc_destination TYPE rfcdest VALUE 'ZFA_S4H_100'.

PARAMETERS p_kunnr TYPE kunnr OBLIGATORY.

DATA gt_orders TYPE STANDARD TABLE OF zfa_s_open_order WITH DEFAULT KEY.
DATA gt_return TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
DATA gs_return TYPE bapiret2.
DATA gv_rfc_message TYPE c LENGTH 255.
DATA gv_failed TYPE c LENGTH 1.
DATA gv_lines TYPE i.

START-OF-SELECTION.
  CALL FUNCTION 'Z_FA_OPEN_ORDERS_GET'
    DESTINATION gc_destination
    EXPORTING
      iv_customer           = p_kunnr
    TABLES
      et_orders             = gt_orders
      return                = gt_return
    EXCEPTIONS
      customer_not_found    = 1
      system_failure        = 2 MESSAGE gv_rfc_message
      communication_failure = 3 MESSAGE gv_rfc_message
      OTHERS                = 4.
  CASE sy-subrc.
    WHEN 0.
      " The call worked; RETURN says whether the function did.
      LOOP AT gt_return INTO gs_return WHERE type = 'E' OR type = 'A'.
        WRITE: / gs_return-type, gs_return-message.
        gv_failed = 'X'.
      ENDLOOP.
      IF gv_failed IS INITIAL.
        DESCRIBE TABLE gt_orders LINES gv_lines.
        WRITE: / 'Open orders:', gv_lines.
      ENDIF.
    WHEN 1.
      WRITE: / 'Customer not found in S/4HANA'.
    WHEN 2 OR 3.
      WRITE: / 'RFC error:', gv_rfc_message.
    WHEN OTHERS.
      WRITE: / 'Remote call failed with return code', sy-subrc.
  ENDCASE.
```

### 2.2 Incorrect: remote call without the RFC exceptions

A dump in the partner system and a network failure look the same, and the error text is lost.

```abap
CALL FUNCTION 'Z_FA_OPEN_ORDERS_GET'
  DESTINATION 'ZFA_S4H_100'
  EXPORTING
    iv_customer = p_kunnr
  TABLES
    et_orders   = gt_orders
    return      = gt_return.
```

### 2.3 Incorrect: logon data in code

User and password belong in the SM59 destination, not in constants that every reader of the
code can see.

```abap
CONSTANTS: lc_rfc_user     TYPE c LENGTH 12 VALUE 'RFC_S4READ',
           lc_rfc_password TYPE c LENGTH 20 VALUE 'Example-Pw-1'.
```

### 2.4 Incorrect: logon data in code under other names

The names do not matter: any logon data in code is visible to every reader of the code.

```abap
CONSTANTS: gc_logon TYPE c LENGTH 12 VALUE 'RFC_S4READ',
           gc_pw    TYPE c LENGTH 20 VALUE 'Example-Pw-1'.
```

### 2.5 Correct: asynchronous RFC with a limit on running tasks, a callback, and WAIT UNTIL (ECC 6.0 EHP6)

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_arfc_counts.prog.abap
REPORT zfa_arfc_counts.

DATA gv_bukrs TYPE bukrs.
SELECT-OPTIONS s_bukrs FOR gv_bukrs.
PARAMETERS p_tasks TYPE i DEFAULT 5.

CLASS lcl_receiver DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_result,
             task    TYPE c LENGTH 8,
             bukrs   TYPE bukrs,
             items   TYPE i,
             subrc   TYPE sysubrc,
             message TYPE c LENGTH 255,
           END OF ty_result.
    DATA mt_results TYPE STANDARD TABLE OF ty_result WITH DEFAULT KEY.
    DATA mv_running TYPE i.
    METHODS on_end_of_task IMPORTING p_task TYPE clike.
ENDCLASS.

CLASS lcl_receiver IMPLEMENTATION.
  METHOD on_end_of_task.
    DATA ls_result TYPE ty_result.
    RECEIVE RESULTS FROM FUNCTION 'Z_FA_OPEN_ITEMS_COUNT'
      IMPORTING
        ev_items              = ls_result-items
      EXCEPTIONS
        system_failure        = 1 MESSAGE ls_result-message
        communication_failure = 2 MESSAGE ls_result-message
        OTHERS                = 3.
    ls_result-subrc = sy-subrc.
    MODIFY mt_results FROM ls_result TRANSPORTING items subrc message
      WHERE task = p_task.
    mv_running = mv_running - 1.
  ENDMETHOD.
ENDCLASS.

DATA go_receiver TYPE REF TO lcl_receiver.
DATA gt_company_codes TYPE STANDARD TABLE OF bukrs WITH DEFAULT KEY.
DATA gs_result TYPE lcl_receiver=>ty_result.
DATA gv_number TYPE n LENGTH 5.
DATA gv_running TYPE i.
DATA gv_message TYPE c LENGTH 255.

START-OF-SELECTION.
  CREATE OBJECT go_receiver.
  SELECT bukrs FROM t001 INTO TABLE gt_company_codes WHERE bukrs IN s_bukrs.
  LOOP AT gt_company_codes INTO gv_bukrs.
    gv_number = sy-tabix.
    CLEAR gs_result.
    CONCATENATE 'ZFA' gv_number INTO gs_result-task.
    gs_result-bukrs = gv_bukrs.
    APPEND gs_result TO go_receiver->mt_results.
    DO 10 TIMES.
      " At most p_tasks calls run at the same time.
      WAIT UNTIL go_receiver->mv_running < p_tasks UP TO 600 SECONDS.
      go_receiver->mv_running = go_receiver->mv_running + 1.
      CALL FUNCTION 'Z_FA_OPEN_ITEMS_COUNT'
        STARTING NEW TASK gs_result-task
        DESTINATION IN GROUP DEFAULT
        CALLING go_receiver->on_end_of_task ON END OF TASK
        EXPORTING
          iv_bukrs              = gv_bukrs
        EXCEPTIONS
          system_failure        = 1 MESSAGE gv_message
          communication_failure = 2 MESSAGE gv_message
          resource_failure      = 3
          OTHERS                = 4.
      gs_result-subrc = sy-subrc.
      IF gs_result-subrc = 0.
        EXIT.
      ENDIF.
      go_receiver->mv_running = go_receiver->mv_running - 1.
      IF gs_result-subrc <> 3.
        EXIT.
      ENDIF.
      " RESOURCE_FAILURE: wait until one of our tasks ends, then try again.
      gv_running = go_receiver->mv_running.
      IF gv_running > 0.
        WAIT UNTIL go_receiver->mv_running < gv_running UP TO 600 SECONDS.
      ELSE.
        WAIT UP TO 1 SECONDS.
      ENDIF.
    ENDDO.
    IF gs_result-subrc <> 0.
      gs_result-message = gv_message.
      MODIFY go_receiver->mt_results FROM gs_result TRANSPORTING subrc message
        WHERE task = gs_result-task.
    ENDIF.
  ENDLOOP.
  WAIT UNTIL go_receiver->mv_running = 0 UP TO 600 SECONDS.
  LOOP AT go_receiver->mt_results INTO gs_result.
    WRITE: / gs_result-bukrs, gs_result-items, gs_result-subrc, gs_result-message.
  ENDLOOP.
```

### 2.6 Incorrect: WAIT FOR ASYNCHRONOUS TASKS on ECC 6.0 EHP6 (SAP_BASIS 7.31)

The statement exists from SAP_BASIS 7.40 SP02; on 7.31 it is a syntax error.

```abap
WAIT FOR ASYNCHRONOUS TASKS UNTIL go_receiver->mv_running = 0 UP TO 600 SECONDS.
```

### 2.7 Incorrect: IMPORTING in an asynchronous call

`STARTING NEW TASK` does not allow `IMPORTING`; results come back with `RECEIVE RESULTS` in the
callback.

```abap
CALL FUNCTION 'Z_FA_OPEN_ITEMS_COUNT'
  STARTING NEW TASK gv_task
  DESTINATION IN GROUP DEFAULT
  EXPORTING
    iv_bukrs = gv_bukrs
  IMPORTING
    ev_items = gv_items.
```

### 2.8 Incorrect: task ID longer than 8 characters on SAP_BASIS 7.31

The 7.31 keyword documentation allows task IDs of at most eight characters.

```abap
DATA gv_task TYPE c LENGTH 32.
CONCATENATE 'ZFA_OPEN_ITEMS_' gv_bukrs INTO gv_task.
```

### 2.9 Correct: bgRFC unit of type q instead of qRFC (ECC 6.0 EHP5)

<!-- abap-env: product=ecc release=ehp5 database=anydb -->
```abap
* file: src/zfa_order_replicate_bg.prog.abap
REPORT zfa_order_replicate_bg.

PARAMETERS p_order TYPE zfa_order_id OBLIGATORY.

DATA go_destination TYPE REF TO if_bgrfc_destination_outbound.
DATA go_unit TYPE REF TO if_qrfc_unit_outbound.
DATA gv_destination TYPE bgrfc_dest_name_outbound VALUE 'ZFA_S4H_100'.

START-OF-SELECTION.
  TRY.
      go_destination = cl_bgrfc_destination_outbound=>create( gv_destination ).
    CATCH cx_bgrfc_invalid_destination.
      MESSAGE e398(00) WITH 'bgRFC destination' gv_destination 'is not defined'.
  ENDTRY.
  go_unit = go_destination->create_qrfc_unit( ).
  TRY.
      go_unit->add_queue_name_outbound( 'ZFA_ORDERS' ).
    CATCH cx_qrfc_duplicate_queue_name.
      " The unit already contains this queue.
  ENDTRY.
  CALL FUNCTION 'Z_FA_ORDER_REPLICATE'
    IN BACKGROUND UNIT go_unit
    EXPORTING
      iv_order_id = p_order.
  COMMIT WORK.
```

---

## 3. IDoc and ALE

### 3.1 Correct: outbound IDoc with MASTER_IDOC_DISTRIBUTE followed by COMMIT WORK (ECC 6.0 EHP6)

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_order_idoc_out.prog.abap
REPORT zfa_order_idoc_out.

PARAMETERS p_order TYPE zfa_order_id OBLIGATORY.

DATA gs_order TYPE zfa_order.
DATA gs_segment TYPE z1fa_order_hdr.
DATA gs_control TYPE edidc.
DATA gt_data TYPE STANDARD TABLE OF edidd WITH DEFAULT KEY.
DATA gs_data TYPE edidd.
DATA gt_created TYPE STANDARD TABLE OF edidc WITH DEFAULT KEY.

START-OF-SELECTION.
  SELECT SINGLE * FROM zfa_order INTO gs_order WHERE order_id = p_order.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Order' p_order 'does not exist'.
  ENDIF.

  gs_control-mestyp = 'ZFA_ORDER'.
  gs_control-idoctp = 'ZFA_ORDER01'.

  gs_segment-order_id = gs_order-order_id.
  gs_segment-customer = gs_order-customer.
  gs_data-segnam = 'Z1FA_ORDER_HDR'.
  gs_data-sdata  = gs_segment.
  APPEND gs_data TO gt_data.

  CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE'
    EXPORTING
      master_idoc_control            = gs_control
    TABLES
      communication_idoc_control     = gt_created
      master_idoc_data               = gt_data
    EXCEPTIONS
      error_in_idoc_control          = 1
      error_writing_idoc_status      = 2
      error_in_idoc_data             = 3
      sending_logical_system_unknown = 4
      OTHERS                         = 5.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'MASTER_IDOC_DISTRIBUTE failed, return code' sy-subrc.
  ENDIF.
  COMMIT WORK.
  IF gt_created IS INITIAL.
    WRITE: / 'No receiver for ZFA_ORDER in the distribution model.'.
  ENDIF.
```

### 3.2 Incorrect: MASTER_IDOC_DISTRIBUTE without a COMMIT WORK

The IDoc is created but never sent.

<!-- not-detectable: a forbidden pattern cannot flag a missing statement, and the commit may legitimately come from a caller at a higher level; scenario idoc_outbound_commit_ehp6 requires the COMMIT WORK statement through an expected pattern and a negative response -->
```abap
CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE'
  EXPORTING
    master_idoc_control        = gs_control
  TABLES
    communication_idoc_control = gt_created
    master_idoc_data           = gt_data.
WRITE: / 'IDoc sent'.
```

### 3.3 Incorrect: receiver partner number without partner type

`RCVPRT` and `RCVPRN` must both be empty, so that ALE takes the receivers from the
distribution model, or both filled.

```abap
gs_control-mestyp = 'ZFA_ORDER'.
gs_control-idoctp = 'ZFA_ORDER01'.
gs_control-rcvprn = 'ZFAPARTNER'.
```

### 3.4 Correct: inbound function module with the standard interface, status records, and no commit (ECC 6.0 EHP7 on SAP_BASIS 7.40 SP08)

<!-- abap-env: product=ecc release=ehp7 support_package=8 database=anydb -->
```abap
* file: src/zfa_order_idoc.fugr.z_fa_idoc_input_order.abap
FUNCTION z_fa_idoc_input_order.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(INPUT_METHOD) LIKE  BDWFAP_PAR-INPUTMETHD
*"     VALUE(MASS_PROCESSING) LIKE  BDWFAP_PAR-MASS_PROC
*"  EXPORTING
*"     VALUE(WORKFLOW_RESULT) LIKE  BDWF_PARAM-RESULT
*"     VALUE(APPLICATION_VARIABLE) LIKE  BDWF_PARAM-APPL_VAR
*"     VALUE(IN_UPDATE_TASK) LIKE  BDWFAP_PAR-UPDATETASK
*"     VALUE(CALL_TRANSACTION_DONE) LIKE  BDWFAP_PAR-CALLTRANS
*"  TABLES
*"      IDOC_CONTRL STRUCTURE  EDIDC
*"      IDOC_DATA STRUCTURE  EDIDD
*"      IDOC_STATUS STRUCTURE  BDIDOCSTAT
*"      RETURN_VARIABLES STRUCTURE  BDWFRETVAR
*"      SERIALIZATION_INFO STRUCTURE  BDI_SER
*"  EXCEPTIONS
*"      WRONG_FUNCTION_CALLED
*"----------------------------------------------------------------------
  DATA: ls_control TYPE edidc,
        ls_data    TYPE edidd,
        ls_status  TYPE bdidocstat,
        ls_retvar  TYPE bdwfretvar,
        ls_hdr_seg TYPE z1fa_order_hdr,
        ls_header  TYPE zfa_s_order_header,
        lt_items   TYPE STANDARD TABLE OF zfa_s_order_item,
        lt_return  TYPE STANDARD TABLE OF bapiret2,
        ls_return  TYPE bapiret2,
        lv_order   TYPE zfa_order_id.

  workflow_result = '0'.
  in_update_task = 'X'.
  LOOP AT idoc_contrl INTO ls_control.
    IF ls_control-mestyp <> 'ZFA_ORDER'.
      RAISE wrong_function_called.
    ENDIF.
    CLEAR: ls_header, lt_items, lt_return, lv_order.
    LOOP AT idoc_data INTO ls_data WHERE docnum = ls_control-docnum.
      IF ls_data-segnam = 'Z1FA_ORDER_HDR'.
        ls_hdr_seg = ls_data-sdata.
        ls_header-customer = ls_hdr_seg-customer.
      ENDIF.
    ENDLOOP.
    CALL FUNCTION 'Z_FA_ORDER_CREATE'
      EXPORTING
        is_header   = ls_header
      IMPORTING
        ev_order_id = lv_order
      TABLES
        it_items    = lt_items
        return      = lt_return.
    CLEAR: ls_status, ls_retvar.
    ls_status-docnum = ls_control-docnum.
    ls_retvar-doc_number = ls_control-docnum.
    LOOP AT lt_return INTO ls_return WHERE type = 'E' OR type = 'A'.
      EXIT.
    ENDLOOP.
    IF sy-subrc = 0.
      ls_status-status = '51'.
      ls_status-msgty  = ls_return-type.
      ls_status-msgid  = ls_return-id.
      ls_status-msgno  = ls_return-number.
      ls_status-msgv1  = ls_return-message_v1.
      workflow_result = '99999'.
      ls_retvar-wf_param = 'Error_IDOCs'.
    ELSE.
      ls_status-status = '53'.
      ls_retvar-wf_param = 'Processed_IDOCs'.
    ENDIF.
    APPEND ls_status TO idoc_status.
    APPEND ls_retvar TO return_variables.
  ENDLOOP.
ENDFUNCTION.
```

### 3.5 Incorrect: commit inside the inbound function module

The ALE layer commits after it has written the status records; a commit here saves the
document before its IDoc status.

```abap
    IF lv_failed IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      ls_status-status = '53'.
    ENDIF.
```

### 3.6 Incorrect: syntax newer than the target in the inbound function module (ECC 6.0 EHP7 on SAP_BASIS 7.40 SP08)

The calculation assignment `+=` needs SAP_BASIS 7.54; the function group does not compile on
7.40 SP08.

<!-- abap-env: product=ecc release=ehp7 support_package=8 database=anydb -->
```abap
* file: src/zfa_order_idoc.fugr.z_fa_idoc_input_count.abap
FUNCTION z_fa_idoc_input_count.
  DATA ls_control TYPE edidc.
  DATA lv_posted TYPE i.
  LOOP AT idoc_contrl INTO ls_control.
    lv_posted += 1.
  ENDLOOP.
ENDFUNCTION.
```

---

## 4. SAP Gateway OData V2 (SEGW)

### 4.1 Correct: GET_ENTITYSET with a filter guard, counts in the database, a page size limit, and a skiptoken (ECC 6.0 EHP8)

The part marked `context` is the method as SEGW generates it in the base class, so that the
redefinition can be validated; it is not part of an answer.

<!-- abap-env: product=ecc release=ehp8 database=anydb -->
```abap
* context: src/zcl_zfa_product_dpc.clas.abap
" Generated by SEGW. Superclass and other methods omitted.
CLASS zcl_zfa_product_dpc DEFINITION PUBLIC CREATE PUBLIC.
  PROTECTED SECTION.
    METHODS productset_get_entityset
      IMPORTING
        iv_entity_name           TYPE string
        iv_entity_set_name       TYPE string
        iv_source_name           TYPE string
        it_filter_select_options TYPE /iwbep/t_mgw_select_option
        is_paging                TYPE /iwbep/s_mgw_paging
        it_key_tab               TYPE /iwbep/t_mgw_name_value_pair
        it_navigation_path       TYPE /iwbep/t_mgw_navigation_path
        it_order                 TYPE /iwbep/t_mgw_sorting_order
        iv_filter_string         TYPE string
        iv_search_string         TYPE string
        io_tech_request_context  TYPE REF TO /iwbep/if_mgw_req_entityset OPTIONAL
      EXPORTING
        et_entityset             TYPE zcl_zfa_product_mpc=>tt_product
        es_response_context      TYPE /iwbep/if_mgw_appl_srv_runtime=>ty_s_mgw_response_context
      RAISING
        /iwbep/cx_mgw_busi_exception
        /iwbep/cx_mgw_tech_exception.
ENDCLASS.

CLASS zcl_zfa_product_dpc IMPLEMENTATION.
  METHOD productset_get_entityset.
  ENDMETHOD.
ENDCLASS.
* file: src/zcl_zfa_product_dpc_ext.clas.abap
CLASS zcl_zfa_product_dpc_ext DEFINITION PUBLIC
  INHERITING FROM zcl_zfa_product_dpc CREATE PUBLIC.
  PROTECTED SECTION.
    METHODS productset_get_entityset REDEFINITION.
ENDCLASS.

CLASS zcl_zfa_product_dpc_ext IMPLEMENTATION.
  METHOD productset_get_entityset.
    CONSTANTS lc_page_size TYPE i VALUE 1000.
    CONSTANTS lc_max_offset TYPE i VALUE 10000.
    DATA lv_where TYPE string.
    DATA lv_filter TYPE string.
    DATA lv_top_text TYPE string.
    DATA lv_skiptoken TYPE string.
    DATA lv_top TYPE i.
    DATA lv_offset TYPE i.
    DATA lv_page TYPE i.
    DATA lv_rows TYPE i.
    DATA lv_lines TYPE i.
    DATA lv_count TYPE i.
    DATA lv_next_row TYPE i.
    DATA lv_next TYPE string.

    lv_where = io_tech_request_context->get_osql_where_clause( ).
    lv_filter = io_tech_request_context->get_filter( )->get_filter_string( ).
    IF lv_where IS INITIAL AND lv_filter IS NOT INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'This $filter is not supported'.
    ENDIF.
    lv_top_text = io_tech_request_context->get_top( ).
    lv_skiptoken = io_tech_request_context->get_skiptoken( ).
    TRY.
        IF lv_skiptoken IS INITIAL.
          lv_offset = io_tech_request_context->get_skip( ).
        ELSE.
          lv_offset = lv_skiptoken.
        ENDIF.
        lv_top = lv_top_text.
        IF io_tech_request_context->has_count( ) = abap_true.
          SELECT COUNT(*) FROM zfa_product INTO lv_count WHERE (lv_where).
          es_response_context-count = lv_count.
          RETURN.
        ENDIF.
        IF io_tech_request_context->has_inlinecount( ) = abap_true.
          SELECT COUNT(*) FROM zfa_product INTO lv_count WHERE (lv_where).
          es_response_context-inlinecount = lv_count.
        ENDIF.
        IF lv_offset < 0 OR lv_top < 0 OR lv_offset > lc_max_offset.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING
              textid  = /iwbep/cx_mgw_busi_exception=>business_error
              message = 'Page starts too deep; narrow the result with $filter'.
        ENDIF.
        IF lv_top_text IS INITIAL OR lv_top > lc_page_size.
          lv_page = lc_page_size.
        ELSE.
          lv_page = lv_top.
        ENDIF.
        IF lv_page = 0.
          RETURN.
        ENDIF.
        lv_rows = lv_offset + lv_page.
        SELECT * FROM zfa_product
          UP TO lv_rows ROWS
          INTO CORRESPONDING FIELDS OF TABLE et_entityset
          WHERE (lv_where)
          ORDER BY PRIMARY KEY.
      CATCH cx_sy_conversion_error cx_sy_dynamic_osql_error.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            textid  = /iwbep/cx_mgw_busi_exception=>business_error
            message = 'The request cannot be processed'.
    ENDTRY.
    IF lv_offset > 0.
      DELETE et_entityset TO lv_offset.
    ENDIF.
    DESCRIBE TABLE et_entityset LINES lv_lines.
    IF lv_lines = lv_page AND ( lv_top_text IS INITIAL OR lv_top > lv_page ).
      lv_next_row = lv_offset + lv_page.
      lv_next = lv_next_row.
      CONDENSE lv_next.
      es_response_context-skiptoken = lv_next.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

### 4.2 Incorrect: reading rows and cutting out the page in ABAP with LOOP AT ... FROM

Every page costs as much as the whole result.

```abap
SELECT * FROM zfa_product INTO CORRESPONDING FIELDS OF TABLE lt_all WHERE (lv_where).
LOOP AT lt_all INTO ls_product FROM lv_from TO lv_to.
  APPEND ls_product TO et_entityset.
ENDLOOP.
```

### 4.3 Incorrect: cutting out the page with APPEND LINES OF ... FROM

The same mistake as 4.2 in one statement.

```abap
SELECT * FROM zfa_product UP TO 5000 ROWS
  INTO CORRESPONDING FIELDS OF TABLE lt_all
  WHERE (lv_where).
APPEND LINES OF lt_all FROM lv_from TO lv_to TO et_entityset.
```

### 4.4 Incorrect: $inlinecount taken from the returned page

`$inlinecount` must be the number of rows after `$filter` and before paging.

```abap
es_response_context-inlinecount = lines( et_entityset ).
```

### 4.5 Incorrect: $inlinecount taken from the returned page through a variable

```abap
lv_count = lines( et_entityset ).
es_response_context-inlinecount = lv_count.
```

### 4.6 Incorrect: reading obsolete importing parameters

SAP marks every importing parameter except `IO_TECH_REQUEST_CONTEXT` as obsolete, `IS_PAGING`
among them; read `$top` and `$skip` with `get_top( )` and `get_skip( )`.

```abap
lv_top  = is_paging-top.
lv_skip = is_paging-skip.
```

### 4.7 Incorrect: dynamic WHERE built from select-option values

Request values concatenated into SQL allow SQL injection. Use `get_osql_where_clause( )`, or the
select options as a range table with `IN` in a static `WHERE`.

```abap
lt_options = io_tech_request_context->get_filter( )->get_filter_select_options( ).
LOOP AT lt_options INTO ls_option WHERE property = 'CATEGORY'.
  LOOP AT ls_option-select_options INTO ls_select.
    CONCATENATE 'CATEGORY = ''' ls_select-low '''' INTO lv_where.
  ENDLOOP.
ENDLOOP.
SELECT * FROM zfa_product INTO CORRESPONDING FIELDS OF TABLE et_entityset WHERE (lv_where).
```

### 4.8 Incorrect: a SELECT for every returned row

```abap
LOOP AT et_entityset ASSIGNING <ls_product>.
  SELECT SINGLE name FROM zfa_product_t INTO <ls_product>-name
    WHERE product_id = <ls_product>-product_id AND langu = sy-langu.
ENDLOOP.
```

### 4.9 Incorrect: code in the generated base class

Regeneration in SEGW overwrites the base class; redefine the method in the `_DPC_EXT` class.

```abap
CLASS zcl_zfa_product_dpc IMPLEMENTATION.
  METHOD productset_get_entityset.
    SELECT * FROM zfa_product INTO CORRESPONDING FIELDS OF TABLE et_entityset.
  ENDMETHOD.
ENDCLASS.
```

### 4.10 Incorrect: unguarded commit in an entity method of a service that accepts multi-operation changesets

The class redefines `CHANGESET_BEGIN` to accept several operations per changeset and sets
`mv_in_changeset` there. The entity method still commits every time, so inside such a
changeset the framework ends the request with a short dump. Commit only when
`mv_in_changeset` is not set; inside the changeset the framework commits after
`CHANGESET_END`.

```abap
  METHOD productset_create_entity.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_product ).
    CALL FUNCTION 'Z_FA_PRODUCT_CREATE'
      EXPORTING
        is_product = ls_product
      TABLES
        return     = lt_return.
    LOOP AT lt_return INTO ls_return WHERE type = 'E' OR type = 'A'.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = ls_return-message.
    ENDLOOP.
    " Missing: IF mv_in_changeset = abap_false.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    er_entity = ls_product.
  ENDMETHOD.
```

### 4.11 Incorrect: OFFSET on ECC 6.0 EHP8 (SAP_BASIS 7.50)

`OFFSET` in ABAP SQL needs SAP_BASIS 7.51.

<!-- abap-env: product=ecc release=ehp8 database=anydb -->
```abap
* file: src/zfa_product_page.prog.abap
REPORT zfa_product_page.
DATA gt_products TYPE STANDARD TABLE OF zfa_product WITH EMPTY KEY.
PARAMETERS: p_top  TYPE i DEFAULT 20,
            p_skip TYPE i DEFAULT 40.
START-OF-SELECTION.
  SELECT * FROM zfa_product
    ORDER BY PRIMARY KEY
    INTO TABLE @gt_products
    UP TO @p_top ROWS
    OFFSET @p_skip.
```

---

## 5. Test scenarios checklist

- [ ] ECC 6.0 EHP6 report that posts staged rows through a BAPI-style function module, one LUW per row, marks each row in the same LUW, and uses classic syntax
- [ ] ECC 6.0 EHP4 report that calls an S/4HANA function module by synchronous RFC, evaluates RETURN, and keeps logon data only in SM59
- [ ] ECC 6.0 EHP7 on SAP_BASIS 7.40 SP08 inbound IDoc function module with status records, E and A checks, and no commit
- [ ] ECC 6.0 EHP8 SEGW `GET_ENTITYSET` redefinition with `$filter`, counts, a page size limit, and server-side paging
- [ ] ECC 6.0 EHP6 parallel processing with aRFC, a task limit, and `WAIT UNTIL` instead of `WAIT FOR ASYNCHRONOUS TASKS`
- [ ] ECC 6.0 EHP6 outbound IDoc report with `MASTER_IDOC_DISTRIBUTE` and `COMMIT WORK`
- [ ] ECC 6.0 EHP4 BAPI-style RFC function module that saves through the update task and never commits
