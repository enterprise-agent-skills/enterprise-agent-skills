# BAPI and RFC

Complete samples for calling BAPIs, writing a BAPI-style RFC function module, and synchronous
RFC, plus destinations and RFC security. Each sample is validated offline for the release
named above it. Asynchronous calls (aRFC, tRFC, qRFC, bgRFC) are in
[async-rfc-and-bgrfc.md](async-rfc-and-bgrfc.md). All samples use classic syntax unless a
section says otherwise, so they also compile on newer releases. Samples for
SAP_BASIS 7.00 and 7.01 use `'X'` instead of `abap_true`, because on those releases the
constants of type pool ABAP need a `TYPE-POOLS abap.` statement; from 7.02 the compiler loads
type pools without it.

The samples use customer objects whose definitions you create yourself. Replace the names with
your own:

| Object | Kind | Purpose |
|--------|------|---------|
| `Z_FA_ORDER_CREATE` in function group `ZFA_ORDER_API` | Remote-enabled function module | Creates an order, BAPI style |
| `ZFA_S_ORDER_HEADER`, `ZFA_S_ORDER_ITEM` | DDIC structures | Header (customer, order date, currency, external reference) and item (material, quantity, unit) |
| `ZFA_ORDER_ID` | Data element | Order number |
| `ZFA_ORDER` | Message class, authorization object (field `ACTVT`), number range object | Messages, authorization, numbering |
| `Z_FA_ORDER_SAVE` | Update function module | Writes the order tables when the caller commits |
| `ZFA_ORDER_STAGE` | Database table | Staged order rows waiting to be posted; an empty `STATUS` means open |
| `EZFA_ORDER_STAGE` | Lock object on `ZFA_ORDER_STAGE` (SE11) | Generates `ENQUEUE_EZFA_ORDER_STAGE` and `DEQUEUE_EZFA_ORDER_STAGE` |
| `Z_FA_ORDER_STAGE_SET_POSTED` in function group `ZFA_ORDER_UPD` | Update function module | Marks a staged row as posted in the same LUW as the order |
| `ZFA_S4H_100` | SM59 destination (type 3) | Connection to the partner system |

## A BAPI-style RFC function module (all releases)

Set "Remote-Enabled Module" in the function module attributes (SE37). The interface is
maintained in SE37; the comment block at the top is what SE37 generates, and abapGit stores the
interface in the function group's XML file. The body was checked for syntax only; run the
syntax check in SE37 once the interface exists.

Rules this function follows, from SAP's BAPI programming guide:

- No `COMMIT WORK`, no `CALL TRANSACTION` or `SUBMIT`, no screen output. The order is written
  by the update module `Z_FA_ORDER_SAVE`, so nothing is saved until the caller commits. An RFC
  call ends with an implicit database commit in the called system, which is another reason to
  write only through the update task.
- No exceptions and no `MESSAGE` of type E or A that would end the call. Every message goes
  into `RETURN`; `MESSAGE ... INTO` only fills the text and the `sy-msg*` fields.
- Its own authorization check. S_RFC decides only who may call the function group or module,
  not what the caller may do with the data.
- A test run (`IV_TESTRUN` of data element TESTRUN) runs all checks, writes nothing, and does
  not draw an order number.
- A function that changes an existing object locks it first with the `ENQUEUE` function module
  of its lock object, before the checks. When it returns an error and registers no update, it
  releases the lock itself with the `DEQUEUE` function module: SAP's BAPI guide requires
  releasing locks when no commit follows. This sample only creates orders, so it sets no lock.

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zfa_order_api.fugr.z_fa_order_create.abap
FUNCTION z_fa_order_create.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IS_HEADER) TYPE  ZFA_S_ORDER_HEADER
*"     VALUE(IV_TESTRUN) TYPE  TESTRUN DEFAULT SPACE
*"  EXPORTING
*"     VALUE(EV_ORDER_ID) TYPE  ZFA_ORDER_ID
*"  TABLES
*"      IT_ITEMS STRUCTURE  ZFA_S_ORDER_ITEM
*"      RETURN STRUCTURE  BAPIRET2
*"----------------------------------------------------------------------
  DATA lv_text TYPE bapi_msg.
  DATA lv_lines TYPE i.
  DATA lv_order_id TYPE zfa_order_id.

  CLEAR ev_order_id.
  CLEAR return[].

  AUTHORITY-CHECK OBJECT 'ZFA_ORDER'
    ID 'ACTVT' FIELD '01'.
  IF sy-subrc <> 0.
    MESSAGE e001(zfa_order) INTO lv_text.
    PERFORM append_message TABLES return.
    RETURN.
  ENDIF.

* Validate everything first and report all errors together.
  IF is_header-customer IS INITIAL.
    MESSAGE e002(zfa_order) INTO lv_text.
    PERFORM append_message TABLES return.
  ENDIF.
  DESCRIBE TABLE it_items LINES lv_lines.
  IF lv_lines = 0.
    MESSAGE e003(zfa_order) INTO lv_text.
    PERFORM append_message TABLES return.
  ENDIF.
  READ TABLE return TRANSPORTING NO FIELDS WITH KEY type = 'E'.
  IF sy-subrc = 0.
    RETURN.
  ENDIF.

  IF iv_testrun = 'X'.
    MESSAGE s004(zfa_order) INTO lv_text.
    PERFORM append_message TABLES return.
    RETURN.
  ENDIF.

  CALL FUNCTION 'NUMBER_GET_NEXT'
    EXPORTING
      nr_range_nr = '01'
      object      = 'ZFA_ORDER'
    IMPORTING
      number      = lv_order_id
    EXCEPTIONS
      OTHERS      = 1.
  IF sy-subrc <> 0.
    MESSAGE e005(zfa_order) INTO lv_text.
    PERFORM append_message TABLES return.
    RETURN.
  ENDIF.

* Registered now, executed when the caller commits.
  CALL FUNCTION 'Z_FA_ORDER_SAVE' IN UPDATE TASK
    EXPORTING
      iv_order_id = lv_order_id
      is_header   = is_header
    TABLES
      it_items    = it_items.

  ev_order_id = lv_order_id.
  MESSAGE s010(zfa_order) WITH lv_order_id INTO lv_text.
  PERFORM append_message TABLES return.
ENDFUNCTION.
```

The helper lives in an include of the same function group:

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zfa_order_api.fugr.lzfa_order_apif01.abap
*----------------------------------------------------------------------*
* Append the current system message to RETURN. Call it directly after
* MESSAGE ... INTO, which fills sy-msgty, sy-msgid, sy-msgno, sy-msgv1-4.
*----------------------------------------------------------------------*
FORM append_message TABLES pt_return STRUCTURE bapiret2.
  DATA ls_return TYPE bapiret2.

  ls_return-type       = sy-msgty.
  ls_return-id         = sy-msgid.
  ls_return-number     = sy-msgno.
  ls_return-message_v1 = sy-msgv1.
  ls_return-message_v2 = sy-msgv2.
  ls_return-message_v3 = sy-msgv3.
  ls_return-message_v4 = sy-msgv4.
  MESSAGE ID sy-msgid TYPE sy-msgty NUMBER sy-msgno
          WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4
          INTO ls_return-message.
  APPEND ls_return TO pt_return.
ENDFORM.
```

## Calling a BAPI and committing per document (ECC 6.0 EHP6, SAP_BASIS 7.31)

The program posts each staged row as its own order. It evaluates `RETURN` before it decides:
`E` or `A` means roll back, anything else means commit. The commit comes after the check,
because `BAPI_TRANSACTION_ROLLBACK` cannot undo work that a commit has already passed to the
update task. Committing per order keeps orders independent: a failure undoes only its own
order.

Before you call a BAPI, check the type of its `RETURN` parameter in SE37 or the BAPI Explorer.
BAPIRET2 is the reference structure for new BAPIs. Older BAPIs use BAPIRET1 or BAPIRETURN,
which have fewer fields, and some BAPIs return a single structure instead of a table; for a
structure, test `ls_return-type` directly instead of looping.

Design choices in the sample:

- The staged rows are read into an internal table before the loop, because a commit inside
  `SELECT ... ENDSELECT` would close the database cursor.
- The success branch registers `Z_FA_ORDER_STAGE_SET_POSTED` in the update task right before
  the commit, so the order and the staging status are saved in the same LUW, and a second run
  skips the row. A direct `UPDATE` of the staging table would be committed even when the V1
  update of the order fails, and would leave the row marked as posted.
- Each row is locked with `ENQUEUE_EZFA_ORDER_STAGE`, and its status is read again under the
  lock, so two runs at the same time cannot post the same row. The status is read again
  because another run may have posted the row after the first `SELECT`.
- `wait = 'X'` makes the commit wait until the V1 update modules have run, so the order exists
  when the program continues. It does not wait for V2 updates or for tRFC and bgRFC units
  that the commit starts. Look in SM13 for terminated updates.
- The program also checks the `RETURN` of `BAPI_TRANSACTION_COMMIT`. With `wait = 'X'` the
  function runs `COMMIT WORK AND WAIT`, whose `sy-subrc` reports a failed update. SAP's
  documentation does not describe the function's `RETURN`; community analyses of its source
  report that it carries that failure, so treat `E` or `A` there as a failed posting.

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_order_upload.prog.abap
REPORT zfa_order_upload.

TYPES: BEGIN OF ty_log,
         stage_id TYPE zfa_order_stage-stage_id,
         order_id TYPE zfa_order_id,
         type     TYPE bapiret2-type,
         message  TYPE bapiret2-message,
       END OF ty_log,
       tt_log TYPE STANDARD TABLE OF ty_log WITH DEFAULT KEY.

PARAMETERS p_test AS CHECKBOX DEFAULT 'X'.

CLASS lcl_order_upload DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS run
      IMPORTING iv_testrun    TYPE c
      RETURNING value(rt_log) TYPE tt_log.
  PRIVATE SECTION.
    METHODS post_order
      IMPORTING is_stage   TYPE zfa_order_stage
                iv_testrun TYPE c
      CHANGING  ct_log     TYPE tt_log.
ENDCLASS.

CLASS lcl_order_upload IMPLEMENTATION.
  METHOD run.
    DATA lt_stage TYPE STANDARD TABLE OF zfa_order_stage WITH DEFAULT KEY.
    DATA ls_stage TYPE zfa_order_stage.
    DATA ls_log TYPE ty_log.

    SELECT * FROM zfa_order_stage INTO TABLE lt_stage
      WHERE status = space
      ORDER BY stage_id.
    LOOP AT lt_stage INTO ls_stage.
      CLEAR ls_log.
      ls_log-stage_id = ls_stage-stage_id.
      " Lock the row so that a second run cannot post it at the same time.
      CALL FUNCTION 'ENQUEUE_EZFA_ORDER_STAGE'
        EXPORTING
          stage_id       = ls_stage-stage_id
        EXCEPTIONS
          foreign_lock   = 1
          system_failure = 2
          OTHERS         = 3.
      IF sy-subrc <> 0.
        ls_log-type    = 'W'.
        ls_log-message = 'Locked by another run; skipped'.
        APPEND ls_log TO rt_log.
        CONTINUE.
      ENDIF.
      " Read the status again under the lock: another run may have posted the
      " row after the SELECT above.
      SELECT SINGLE status FROM zfa_order_stage INTO ls_stage-status
        WHERE stage_id = ls_stage-stage_id.
      IF sy-subrc = 0 AND ls_stage-status = space.
        post_order( EXPORTING is_stage   = ls_stage
                              iv_testrun = iv_testrun
                    CHANGING  ct_log     = rt_log ).
      ELSE.
        ls_log-type    = 'I'.
        ls_log-message = 'Already posted by another run'.
        APPEND ls_log TO rt_log.
      ENDIF.
      CALL FUNCTION 'DEQUEUE_EZFA_ORDER_STAGE'
        EXPORTING
          stage_id = ls_stage-stage_id.
    ENDLOOP.
  ENDMETHOD.

  METHOD post_order.
    DATA ls_header TYPE zfa_s_order_header.
    DATA ls_item TYPE zfa_s_order_item.
    DATA lt_items TYPE STANDARD TABLE OF zfa_s_order_item WITH DEFAULT KEY.
    DATA lt_return TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
    DATA ls_return TYPE bapiret2.
    DATA ls_commit_return TYPE bapiret2.
    DATA lv_order_id TYPE zfa_order_id.
    DATA lv_failed TYPE abap_bool.
    DATA ls_log TYPE ty_log.

    ls_header-customer   = is_stage-customer.
    ls_header-order_date = is_stage-order_date.
    ls_header-currency   = is_stage-currency.
    ls_item-material     = is_stage-material.
    ls_item-quantity     = is_stage-quantity.
    ls_item-unit         = is_stage-unit.
    APPEND ls_item TO lt_items.

    CALL FUNCTION 'Z_FA_ORDER_CREATE'
      EXPORTING
        is_header   = ls_header
        iv_testrun  = iv_testrun
      IMPORTING
        ev_order_id = lv_order_id
      TABLES
        it_items    = lt_items
        return      = lt_return.

    " E (error) and A (abort) mean failure. An empty RETURN means success.
    LOOP AT lt_return INTO ls_return WHERE type = 'E' OR type = 'A'.
      lv_failed = abap_true.
      EXIT.
    ENDLOOP.

    IF lv_failed = abap_true OR iv_testrun = 'X'.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ELSE.
      " Same LUW as the order: the row is marked only if the order is saved.
      CALL FUNCTION 'Z_FA_ORDER_STAGE_SET_POSTED' IN UPDATE TASK
        EXPORTING
          iv_stage_id = is_stage-stage_id.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait   = 'X'
        IMPORTING
          return = ls_commit_return.
      IF ls_commit_return-type = 'E' OR ls_commit_return-type = 'A'.
        APPEND ls_commit_return TO lt_return.
      ENDIF.
    ENDIF.

    " Keep every message, not only the first one.
    LOOP AT lt_return INTO ls_return.
      CLEAR ls_log.
      ls_log-stage_id = is_stage-stage_id.
      ls_log-order_id = lv_order_id.
      ls_log-type     = ls_return-type.
      ls_log-message  = ls_return-message.
      APPEND ls_log TO ct_log.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.

DATA go_upload TYPE REF TO lcl_order_upload.
DATA gt_log TYPE tt_log.
DATA go_alv TYPE REF TO cl_salv_table.
DATA gx_salv TYPE REF TO cx_salv_msg.

START-OF-SELECTION.
  CREATE OBJECT go_upload.
  gt_log = go_upload->run( p_test ).
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = go_alv
                              CHANGING  t_table      = gt_log ).
      go_alv->display( ).
    CATCH cx_salv_msg INTO gx_salv.
      MESSAGE gx_salv TYPE 'E'.
  ENDTRY.
```

The update module that marks the row. Set its processing type to "Update Module" with
immediate start (V1) in SE37, so it runs in the same update as `Z_FA_ORDER_SAVE`:

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_order_upd.fugr.z_fa_order_stage_set_posted.abap
FUNCTION z_fa_order_stage_set_posted.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_STAGE_ID) TYPE  ZFA_ORDER_STAGE-STAGE_ID
*"----------------------------------------------------------------------
  UPDATE zfa_order_stage SET status = 'P'
    WHERE stage_id = iv_stage_id.
  IF sy-subrc <> 0.
*   A termination message ends the update and rolls back the whole LUW,
*   including the order, so order and staging status stay consistent.
    MESSAGE a398(00) WITH 'Staging row' iv_stage_id 'not found'.
  ENDIF.
ENDFUNCTION.
```

For an SAP BAPI, check its documentation for parameters that change the commit behavior and
for documented exceptions that commit themselves (SAP Note 131838). SAP community analyses of
the source code report that `BAPI_TRANSACTION_COMMIT` also resets BAPI buffers, which a plain
`COMMIT WORK` does not; SAP's documentation does not state this, so prefer the function module
for BAPI callers either way.

## Calling a BAPI in another system (all releases)

Call the BAPI and the commit through the same destination. Each destination has its own RFC
session in the partner, so the remote `BAPI_TRANSACTION_COMMIT` commits the work the remote
BAPI registered. A local `COMMIT WORK` would only commit the local LUW.

When the remote commit call itself fails, the result is unknown. The partner may have
committed before the connection broke, so a blind retry can create the order twice. Give each
order a unique external reference (`EXT_REF` here) and look the order up in the partner system
before you send it again; the partner function can also reject a second order with the same
reference. When a write must arrive exactly once without such checks, use bgRFC
([async-rfc-and-bgrfc.md](async-rfc-and-bgrfc.md)) or IDocs instead of synchronous RFC with a
remote commit.

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zfa_order_create_remote.prog.abap
REPORT zfa_order_create_remote.

" Logon data or trust settings live in the SM59 destination, not in code.
CONSTANTS gc_destination TYPE rfcdest VALUE 'ZFA_S4H_100'.

PARAMETERS: p_cust   TYPE zfa_s_order_header-customer OBLIGATORY,
            p_waers  TYPE zfa_s_order_header-currency OBLIGATORY,
            p_extref TYPE zfa_s_order_header-ext_ref OBLIGATORY,
            p_matnr  TYPE zfa_s_order_item-material OBLIGATORY,
            p_menge  TYPE zfa_s_order_item-quantity OBLIGATORY,
            p_meins  TYPE zfa_s_order_item-unit OBLIGATORY.

DATA gs_header TYPE zfa_s_order_header.
DATA gs_item TYPE zfa_s_order_item.
DATA gt_items TYPE STANDARD TABLE OF zfa_s_order_item WITH DEFAULT KEY.
DATA gt_return TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
DATA gs_return TYPE bapiret2.
DATA gs_commit_return TYPE bapiret2.
DATA gv_order_id TYPE zfa_order_id.
DATA gv_failed TYPE c LENGTH 1.
DATA gv_rfc_message TYPE c LENGTH 255.

START-OF-SELECTION.
  gs_header-customer   = p_cust.
  gs_header-order_date = sy-datum.
  gs_header-currency   = p_waers.
  " A unique external reference lets you find the order in the partner system.
  gs_header-ext_ref    = p_extref.
  gs_item-material     = p_matnr.
  gs_item-quantity     = p_menge.
  gs_item-unit         = p_meins.
  APPEND gs_item TO gt_items.

  CALL FUNCTION 'Z_FA_ORDER_CREATE'
    DESTINATION gc_destination
    EXPORTING
      is_header             = gs_header
    IMPORTING
      ev_order_id           = gv_order_id
    TABLES
      it_items              = gt_items
      return                = gt_return
    EXCEPTIONS
      system_failure        = 1 MESSAGE gv_rfc_message
      communication_failure = 2 MESSAGE gv_rfc_message
      OTHERS                = 3.
  IF sy-subrc <> 0.
    " No commit follows, and the function writes only through the update
    " task, so nothing is posted in the partner system.
    WRITE: / 'Remote call failed:', gv_rfc_message.
    RETURN.
  ENDIF.

  LOOP AT gt_return INTO gs_return WHERE type = 'E' OR type = 'A'.
    gv_failed = 'X'.
    EXIT.
  ENDLOOP.

  IF gv_failed = 'X'.
    " The function only registered updates; without a commit in the
    " partner session they are not saved, even if this call fails.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'
      DESTINATION gc_destination
      EXCEPTIONS
        system_failure        = 1 MESSAGE gv_rfc_message
        communication_failure = 2 MESSAGE gv_rfc_message
        OTHERS                = 3.
    LOOP AT gt_return INTO gs_return.
      WRITE: / gs_return-type, gs_return-message.
    ENDLOOP.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    DESTINATION gc_destination
    EXPORTING
      wait                  = 'X'
    IMPORTING
      return                = gs_commit_return
    EXCEPTIONS
      system_failure        = 1 MESSAGE gv_rfc_message
      communication_failure = 2 MESSAGE gv_rfc_message
      OTHERS                = 3.
  IF sy-subrc <> 0.
    " The commit may have run before the call failed. Look the order up by its
    " external reference in the partner system before you send it again.
    WRITE: / 'Commit result unknown; check order', p_extref, 'in the partner system:'.
    WRITE: / gv_rfc_message.
    RETURN.
  ENDIF.
  IF gs_commit_return-type = 'E' OR gs_commit_return-type = 'A'.
    WRITE: / 'The partner system did not save the order:', gs_commit_return-message.
    RETURN.
  ENDIF.

  LOOP AT gt_return INTO gs_return.
    WRITE: / gs_return-type, gs_return-message.
  ENDLOOP.
```

The connection stays open until the program ends or calls `RFC_CONNECTION_CLOSE`. Close it
when the program continues with unrelated work for a long time.

## Synchronous RFC with complete error handling (all releases)

Written for ECC 6.0 EHP4 (SAP_BASIS 7.01), so it avoids string templates and every other 7.02
feature. The remote function `Z_FA_OPEN_ORDERS_GET` in the partner system has the interface
`IV_CUSTOMER TYPE KUNNR`, `TABLES ET_ORDERS STRUCTURE ZFA_S_OPEN_ORDER` and
`RETURN STRUCTURE BAPIRET2`, and the classic exception `CUSTOMER_NOT_FOUND`.

Create `ZFA_S_OPEN_ORDER` in the calling system with the same components, types, and lengths,
and compare both versions in SE11. The same data element can have different lengths in ECC and
S/4HANA: the material number (`MATNR`) has 18 characters in ECC and up to 40 in S/4HANA. A
component typed with such a data element gives the structure a different layout on each side,
and data can arrive cut off or misplaced. Type the components with types that are identical in
both systems, or keep the short field and add a long one at the end, and test with values of
full length.

<!-- abap-env: product=ecc release=ehp4 database=anydb -->
```abap
* file: src/zfa_s4_open_orders.prog.abap
REPORT zfa_s4_open_orders.

" SM59 destination (type 3) to the S/4HANA system. It holds the logon data or
" the trust settings. Use the same name in every system of the landscape.
CONSTANTS gc_destination TYPE rfcdest VALUE 'ZFA_S4H_100'.

PARAMETERS p_kunnr TYPE kunnr OBLIGATORY.

DATA gt_orders TYPE STANDARD TABLE OF zfa_s_open_order WITH DEFAULT KEY.
DATA gt_return TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
DATA gs_return TYPE bapiret2.
DATA gv_rfc_message TYPE c LENGTH 255.
DATA gv_failed TYPE c LENGTH 1.
DATA go_alv TYPE REF TO cl_salv_table.
DATA gx_salv TYPE REF TO cx_salv_msg.
DATA gv_text TYPE string.

AT SELECTION-SCREEN.
  " The RFC user in S/4HANA may see more than the person running this report.
  AUTHORITY-CHECK OBJECT 'ZFA_S4ORD'
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'No authorization to read S/4HANA orders'.
  ENDIF.

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
      " The call worked. RETURN says whether the function did.
    WHEN 1.
      WRITE: / 'Customer', p_kunnr, 'does not exist in S/4HANA.'.
      RETURN.
    WHEN 2.
      " Runtime error, or message of type A, E, or X, in S/4HANA. The text is in
      " gv_rfc_message; runtime errors are also logged in ST22 there.
      WRITE: / 'Error in S/4HANA:', gv_rfc_message.
      RETURN.
    WHEN 3.
      " No connection, failed logon, or broken network: test the destination in SM59.
      WRITE: / 'Connection to S/4HANA failed:', gv_rfc_message.
      RETURN.
    WHEN OTHERS.
      WRITE: / 'Remote call failed with return code', sy-subrc.
      RETURN.
  ENDCASE.

  LOOP AT gt_return INTO gs_return WHERE type = 'E' OR type = 'A'.
    WRITE: / gs_return-type, gs_return-message.
    gv_failed = 'X'.
  ENDLOOP.
  IF gv_failed = 'X'.
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = go_alv
                              CHANGING  t_table      = gt_orders ).
      go_alv->display( ).
    CATCH cx_salv_msg INTO gx_salv.
      gv_text = gx_salv->get_text( ).
      WRITE: / gv_text.
  ENDTRY.
```

Notes:

- `SYSTEM_FAILURE` covers errors on the server: runtime errors, messages of type A, E, or X,
  and class-based exceptions raised in the remote function. `COMMUNICATION_FAILURE` covers
  connection, logon, and network errors. `MESSAGE` returns the first line of the error text.
- The addition `ERROR_MESSAGE` has no effect in RFC.
- The call triggers a database commit in the calling program. Do not call RFC inside
  `SELECT ... ENDSELECT` or while a database cursor is open.
- On 7.57 and later, `PARAMETER-TABLE` and `EXCEPTION-TABLE` can pass parameters and classic
  exceptions dynamically in sRFC. On 8.16 (S/4HANA 2025), `CALL FUNCTION ... IN REMOTE
  SESSION` adds a new synchronous RFC through communication targets, with class-based
  exceptions instead of `SYSTEM_FAILURE` and `COMMUNICATION_FAILURE`. Do not use either on
  older releases.

## Asynchronous calls

Parallel processing with aRFC, the legacy tRFC and qRFC, and bgRFC are in
[async-rfc-and-bgrfc.md](async-rfc-and-bgrfc.md).

## Destinations

Destinations are stored in table RFCDES and maintained in SM59.

| Type | Meaning | Typical use |
|------|---------|-------------|
| 3 | ABAP connection | sRFC, aRFC, tRFC, bgRFC, ALE to another ABAP system |
| I | Internal connection (same system) | aRFC to another application server |
| T | TCP/IP connection to an external program | RFC servers written with the SAP RFC SDK or JCo |
| G | HTTP connection to an external server | HTTP clients |
| H | HTTP connection to an ABAP system | HTTP clients to SAP systems |
| L | Logical destination | Refers to another destination |

Predefined destinations: `NONE` (same server, own RFC context), `BACK` (call back the caller
of a synchronous RFC), and from 7.56 `SELF` (like `NONE`, with fast serialization). aRFC needs
type 3 or I and fails with `CALL_FUNCTION_DESTINATION_NO_T` otherwise.

## Security

- Logon data belongs in the destination. A program refers to the destination by name; it never
  contains a user, password, or client.
- Protect destinations that store logon data. In SM59, tab Logon & Security, enter a value in
  "Authorization for Destination"; the calling user then needs authorization object S_ICF with
  `ICF_FIELD` = `DEST` and `ICF_VALUE` = that value. The check runs only when the field has a
  value, so without it every program that may call RFC can use the destination with the
  technical user's rights. Grant that S_ICF value only to the roles that need the destination.
- Create technical RFC users with user type System or Communication (SU01), which cannot log
  on in dialog. Give them S_RFC for the function groups they call and the business
  authorizations those functions check, nothing more.
- S_RFC in the called system: fields `RFC_TYPE` (`FUGR` for a function group or `FUNC` for a
  single function module), `RFC_NAME`, and `ACTVT` 16 (execute). The check runs on the first
  call in an RFC session. Missing authorization ends the call with `RFC_NO_AUTHORITY` or
  `CALL_FUNCTION_NO_AUTH`. Grant the function groups a scenario needs, never `*`.
- A technical RFC user often has wider authorizations than the person who triggers the call.
  Check the person's authorization in the calling program before the call.
- Trusted RFC: the trust relationship is maintained in SMT1, and the trusting system checks
  authorization object S_RFCACL. From 7.02 the trusting system also checks the installation
  number of the calling system when SMT1 contains it. Users log on without a password, so set
  it up only as a deliberate decision with the security team.
- From 7.50, CL_DYNAMIC_DESTINATION creates dynamic destinations at runtime. Read the logon
  data for them from secure configuration, never from code.

## Troubleshooting

| Runtime error or symptom | Where to look | Cause |
|--------------------------|---------------|-------|
| `CALL_FUNCTION_NOT_REMOTE` | ST22 of the called system; the caller gets `SYSTEM_FAILURE` | The function module is not remote-enabled |
| `RFC_NO_AUTHORITY`, `CALL_FUNCTION_NO_AUTH` | Called system, where S_RFC is checked | The RFC user lacks S_RFC for the function group or module |
| `CALL_FUNCTION_DESTINATION_NO_T` | ST22 of the calling system | aRFC with a destination that is not type 3 or I |
| `SYSTEM_FAILURE` after a call that raised a class-based exception | Calling program | Class-based exceptions cannot cross RFC in customer releases |
| Document missing right after a successful BAPI | SM13 of the system that posted | Commit without `wait = 'X'`, or the V1 update failed |
| tRFC calls hanging | SM58 of the calling system | Restart after fixing the destination or the called function |

## Sources (checked 2026-10-15)

- BAPI transaction model and BAPIRET2:
  [SAP Library 4.6C, BAPI transaction model](https://help.sap.com/saphelp_46c/helpdata/en/a5/3ec8654ac011d1894e0000e829fbbd/content.htm),
  [return parameter](https://help.sap.com/saphelp_46c/helpdata/en/a5/3ec9f74ac011d1894e0000e829fbbd/content.htm),
  [test run parameter](https://help.sap.com/saphelp_46c/helpdata/en/df/0495dbbd6f11d1ad09080009b0fb56/content.htm)
- [BAPI programming guide, ABAP Platform](https://help.sap.com/docs/ABAP_PLATFORM_NEW/166400f6be7b46e8adc6b90fd20f3516/4d4f424ab3ee468de10000000a42189c.html)
- [COMMIT WORK, ABAP Keyword Documentation 7.58](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abapcommit.htm)
- RFC: [CALL FUNCTION DESTINATION](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPCALL_FUNCTION_DESTINATION_PARA.html),
  [RFC exceptions](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENRFC_EXCEPTION.html),
  [RFC sessions](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENRFC_CONTEXT.html)
- Release news: [7.0 EhP2 RFC (trusted systems)](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-71-RFC.html),
  [7.50 RFC](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-750-RFC.html),
  [7.56 RFC](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-RFC_756.html),
  [7.57 RFC](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-757-RFC.html),
  [8.16 RFC](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-816-RFC.html),
  [7.0 EhP3 and 7.3 EhP1](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-703.html)
- Destinations and S_RFC:
  [RFC destinations](https://help.sap.com/docs/ABAP_PLATFORM_NEW/753088fc00704d0a80e7fbd6803c8adb/4899b539ee2b73e7e10000000a42189b.html),
  [connection types and S_RFC_ADM](https://help.sap.com/docs/ABAP_PLATFORM_NEW/c495ada972d045b2be2869f5573af8e7/488d1c05ae444e6ee10000000a421937.html),
  [S_RFC](https://help.sap.com/docs/ABAP_PLATFORM_NEW/c495ada972d045b2be2869f5573af8e7/488d1bd1ae444e6ee10000000a421937.html)
- Destination authorization (S_ICF, field "Authorization for Destination"):
  [SAP NetWeaver 7.3 Library, SM59 security options](https://help.sap.com/saphelp_nw73/helpdata/en/48/8c727789603987e10000000a421937/content.htm);
  the `ICF_VALUE` field of S_RFC_ADM on the page above refers to the same SM59 field
- Material number length in S/4HANA (field length extension):
  [Custom code migration guide, S/4HANA 2025](https://help.sap.com/doc/9dcbc5e47ba54a5cbb509afaa49dd5a1/2025.002/en-US/CustomCodeMigration_EndToEnd.pdf)
