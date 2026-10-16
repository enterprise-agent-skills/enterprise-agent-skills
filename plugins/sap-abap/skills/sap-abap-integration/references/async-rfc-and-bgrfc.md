# Asynchronous RFC, tRFC, qRFC, and bgRFC

Samples for calls that do not wait for the partner: asynchronous RFC (aRFC) with callbacks for
parallel processing, the legacy tRFC and qRFC, and bgRFC, which replaces them. Each sample is
validated offline for the release named above it. Synchronous RFC, destinations, and RFC
security are in [bapi-and-rfc.md](bapi-and-rfc.md).

| Need | Technique | Release |
|------|-----------|---------|
| Several calls in parallel, results collected in the same program | aRFC with `CALLING ... ON END OF TASK`, usually `DESTINATION IN GROUP` | All releases in scope; `WAIT FOR ASYNCHRONOUS TASKS` from 7.40 SP02 |
| Exactly once, caller does not wait | bgRFC type t (tRFC in old code) | bgRFC from 7.0 SP14, complete from 7.02 |
| Exactly once in order | bgRFC type q (qRFC in old code) | bgRFC from 7.0 SP14, complete from 7.02 |

## Parallel processing with asynchronous RFC (ECC 6.0 EHP6, SAP_BASIS 7.31)

The program counts open items per company code in parallel with the customer function
`Z_FA_OPEN_ITEMS_COUNT` (`IV_BUKRS TYPE BUKRS`, exporting `EV_ITEMS TYPE I`). Rules from the
7.31 keyword documentation:

- Task IDs have at most eight characters and must be unique per call.
- The callback method is public and has one non-optional importing parameter `p_task` of type
  `clike`. It must not execute statements that interrupt it or commit, and it must handle
  class-based exceptions itself.
- Always execute `RECEIVE RESULTS` in the callback. Without it the connection stays open, as
  with `KEEPING TASK`.
- Parallel processing is recommended only with `DESTINATION IN GROUP`. `RESOURCE_FAILURE`
  means no application server of the group has free resources; it does not accept `MESSAGE`.
- aRFC cannot call external programs, and the calling program triggers a database commit.
- Control when callbacks run with `WAIT UNTIL`. It returns `sy-subrc` 0 when the condition is
  true, 4 when no asynchronous calls exist, and 8 when `UP TO` expired. Each `WAIT` commits
  the database, so never wait while a database cursor is open.
- `CALLING meth ON END OF TASK` exists from Release 6.20, so on every release in scope.
  `PERFORMING subr ON END OF TASK` is the variant with a form routine.

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_parallel_counts.prog.abap
REPORT zfa_parallel_counts.

DATA gv_bukrs TYPE bukrs.

SELECT-OPTIONS s_bukrs FOR gv_bukrs.
PARAMETERS p_tasks TYPE i DEFAULT 4.

CLASS lcl_receiver DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_result,
             task    TYPE c LENGTH 8,
             bukrs   TYPE bukrs,
             items   TYPE i,
             subrc   TYPE sysubrc,
             message TYPE c LENGTH 255,
           END OF ty_result,
           tt_results TYPE STANDARD TABLE OF ty_result WITH DEFAULT KEY.
    DATA mt_results TYPE tt_results.
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
DATA gv_task_number TYPE n LENGTH 5.
DATA gv_running TYPE i.
DATA gv_message TYPE c LENGTH 255.

START-OF-SELECTION.
  CREATE OBJECT go_receiver.
  SELECT bukrs FROM t001 INTO TABLE gt_company_codes
    WHERE bukrs IN s_bukrs
    ORDER BY bukrs.

  LOOP AT gt_company_codes INTO gv_bukrs.
    gv_task_number = sy-tabix.
    CLEAR gs_result.
    CONCATENATE 'ZFA' gv_task_number INTO gs_result-task.
    gs_result-bukrs = gv_bukrs.
    APPEND gs_result TO go_receiver->mt_results.

    DO 10 TIMES.
      " Keep at most p_tasks calls running at the same time.
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
      IF gs_result-subrc = 3.
        gs_result-message = 'No free resources in RFC server group DEFAULT'.
      ELSE.
        gs_result-message = gv_message.
      ENDIF.
      MODIFY go_receiver->mt_results FROM gs_result TRANSPORTING subrc message
        WHERE task = gs_result-task.
    ENDIF.
  ENDLOOP.

  " Wait for the remaining callbacks.
  WAIT UNTIL go_receiver->mv_running = 0 UP TO 600 SECONDS.

  LOOP AT go_receiver->mt_results INTO gs_result.
    WRITE: / gs_result-bukrs, gs_result-items, gs_result-subrc, gs_result-message.
  ENDLOOP.
```

From SAP_BASIS 7.40 SP02, `WAIT FOR ASYNCHRONOUS TASKS` replaces `WAIT UNTIL`, which remains
only as an obsolete short form. The 7.40 and later documentation allows task IDs of up to 32
characters:

```abap
WAIT FOR ASYNCHRONOUS TASKS UNTIL go_receiver->mv_running = 0 UP TO 600 SECONDS.
```

Do not use `WAIT FOR ASYNCHRONOUS TASKS` below SAP_BASIS 7.40 SP02: on 7.31 and older, and on
7.40 SP00 and SP01, it is a syntax error. Confirm the support package in System > Status before
you use it, and use `WAIT UNTIL` otherwise.

## tRFC and qRFC (legacy, all releases)

Recognize this pattern in existing code. SAP's current documentation calls tRFC and qRFC
obsolete and recommends bgRFC.

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zfa_order_replicate_qrfc.prog.abap
REPORT zfa_order_replicate_qrfc.

PARAMETERS p_order TYPE zfa_order_id OBLIGATORY.

START-OF-SELECTION.
  " qRFC: a tRFC call with a queue name set right before it.
  CALL FUNCTION 'TRFC_SET_QUEUE_NAME'
    EXPORTING
      qname              = 'ZFA_ORDERS'
    EXCEPTIONS
      invalid_queue_name = 1
      OTHERS             = 2.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Invalid qRFC queue name ZFA_ORDERS'.
  ENDIF.

  CALL FUNCTION 'Z_FA_ORDER_REPLICATE'
    IN BACKGROUND TASK
    DESTINATION 'ZFA_S4H_100'
    EXPORTING
      iv_order_id = p_order.

  " Registered calls are sent at COMMIT WORK; ROLLBACK WORK deletes them.
  COMMIT WORK.
```

How tRFC behaves: calls are registered under a transaction ID (tables ARFCSSTATE and
ARFCSDATA, visible in SM58) and sent at `COMMIT WORK` in the order they were registered. If
the destination is unavailable, report RSARFCSE retries (by default every 15 minutes, up to 30
times; configurable in SM59). The called function modules must not commit or roll back.
qRFC queues are monitored in SMQ1 (outbound) and SMQ2 (inbound), with the schedulers in SMQS
and SMQR.

## bgRFC (SAP_BASIS 7.0 SP14, complete from 7.02)

Type t units run exactly once; type q units run exactly once in the order of their queues.
Several unit objects can run in parallel, which replaces the `AS SEPARATE UNIT` addition of
tRFC. Configure bgRFC in SBGRFCCONF first: it does not run without a supervisor destination,
and it needs authorization object S_BGRFC. The outbound destination is a normal SM59
destination. Monitor units in SBGRFCMON. SAP's RFC documentation says tRFC and bgRFC cannot be
used in parallel, so move a whole scenario at once.

SAP's release news say that bgRFC was added to 7.0 in SP14 but shipped completely only with
7.0 EhP2 (7.02), without listing what the earlier support packages lack. On SAP_BASIS 7.00
SP14 to 7.01, confirm in SE24 that `CL_BGRFC_DESTINATION_OUTBOUND` and the unit interfaces
offer the methods the sample uses, and that transactions SBGRFCCONF and SBGRFCMON exist. If
anything is missing, keep tRFC or qRFC on that system.

<!-- abap-env: product=ecc release=ehp5 database=anydb -->
```abap
* file: src/zfa_order_replicate.prog.abap
REPORT zfa_order_replicate.

PARAMETERS p_order TYPE zfa_order_id OBLIGATORY.

CONSTANTS gc_destination TYPE bgrfc_dest_name_outbound VALUE 'ZFA_S4H_100'.

DATA go_destination TYPE REF TO if_bgrfc_destination_outbound.
DATA go_unit TYPE REF TO if_qrfc_unit_outbound.

START-OF-SELECTION.
  TRY.
      go_destination = cl_bgrfc_destination_outbound=>create( gc_destination ).
    CATCH cx_bgrfc_invalid_destination.
      MESSAGE e398(00) WITH 'bgRFC destination' gc_destination 'is not defined'.
  ENDTRY.

  " Type q: exactly once, in queue order. For type t use create_trfc_unit( ).
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

  " The commit starts the unit. Its function modules must not commit.
  COMMIT WORK.
  WRITE: / 'Order', p_order, 'queued for replication'.
```

Rules for bgRFC units:

- No `COMMIT WORK`, `ROLLBACK WORK`, or statement that triggers an implicit database commit
  inside the function modules of a unit.
- Units registered in the same LUW as update modules run only after the update. SAP offers
  `IF_BGRFC_UNIT~SEPARATE_FROM_UPDATE_TASK` to decouple them.
- A single queue serializes all units in it. Use one queue per business object (for example
  per order) when only the order per object matters, so unrelated objects run in parallel.
- bgRFC replaces tRFC and qRFC except qRFC no-send, which the Local Data Queue (7.02) replaces.

## Sources (checked 2026-10-15)

- [STARTING NEW TASK, ABAP Keyword Documentation 7.31](https://help.sap.com/doc/abapdocu_731_index_htm/7.31/en-US/abapcall_function_starting.htm)
  and [SAP NetWeaver 7.3 Library](https://help.sap.com/saphelp_nw73/helpdata/en/48/89389984b84e6fe10000000a421937/content.htm)
  (a method as callback routine "as of Release 6.20")
- [WAIT UNTIL, ABAP Keyword Documentation 7.31](https://help.sap.com/doc/abapdocu_731_index_htm/7.31/en-US/abapwait_until.htm)
- [Release news 7.40 SP02, ABAP Channels (WAIT FOR ASYNCHRONOUS TASKS)](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-740-ABAP_CHANNELS.html)
- [tRFC](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPCALL_FUNCTION_BACKGROUND_TASK.html)
  and [bgRFC units](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPCALL_FUNCTION_BACKGROUND_UNIT.html)
- [Release news 7.0 EhP2, RFC (bgRFC, Local Data Queue)](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-71-RFC.html)
- [NetWeaver 7.3 bgRFC programming](https://help.sap.com/saphelp_nw73/helpdata/en/48/9620d6a0230e27e10000000a421937/content.htm)
  and [bgRFC configuration](https://help.sap.com/docs/ABAP_PLATFORM_NEW/753088fc00704d0a80e7fbd6803c8adb/489709f255493987e10000000a421937.html)
- [qRFC programming](https://help.sap.com/docs/ABAP_PLATFORM_NEW/753088fc00704d0a80e7fbd6803c8adb/48bb8094b22337e3e10000000a42189d.html)
  and [qRFC administration](https://help.sap.com/docs/ABAP_PLATFORM_NEW/753088fc00704d0a80e7fbd6803c8adb/489c43f42ab0062fe10000000a42189d.html)
- [RFC variants and the bgRFC recommendation](https://help.sap.com/docs/ABAP_PLATFORM_NEW/753088fc00704d0a80e7fbd6803c8adb/4899b53cee2b73e7e10000000a42189b.html)
