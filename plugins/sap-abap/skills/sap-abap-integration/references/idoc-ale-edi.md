# IDoc, ALE, and EDI

An IDoc (intermediate document) carries one business object between systems: a control record
(table EDIDC), data records with the segments (EDID4), and status records (EDIDS). ALE sends
IDocs between SAP systems, usually through tRFC ports; EDI sends them to external partners
through an EDI subsystem, usually through file or XML ports. The IDoc interface and
`MASTER_IDOC_DISTRIBUTE` have not changed for many releases, so the samples here use classic
syntax and work on every release in scope.

The samples use a customer message type `ZFA_ORDER` with basic type `ZFA_ORDER01`, header
segment `Z1FA_ORDER_HDR` (fields `ORDER_ID`, `CUSTOMER`, `ORDER_DATE`, `CURRENCY`, `EXT_REF`),
and item segment `Z1FA_ORDER_ITM` (fields `MATERIAL`, `QUANTITY`, `UNIT`).

## Development objects and configuration

| Object | Transaction | Notes |
|--------|-------------|-------|
| Segment type | WE31 | Fields are typed with data elements, which set the length; data travels as characters. The segment structure has the name of the segment type |
| IDoc type (basic type or extension) | WE30 | Release it only after testing |
| Logical message type | WE81 | Customer names start with Z |
| Message type to IDoc type | WE82 | Partner profiles check this assignment |
| Logical system | BD54 (IMG: SALE), assigned to the client in SCC4 | One per system and client |
| RFC destination | SM59 | Type 3 for ALE between ABAP systems |
| Port | WE21 | Transactional RFC (ALE), file (most EDI subsystems), XML, programming interface (PSS) |
| Distribution model | BD64 | Which message types go from which sender to which receiver |
| Partner profile | WE20 | Partner type LS (logical system) for ALE, LI (vendor) and others for EDI. Outbound: port, output mode (immediately or collect), basic type. Inbound: process code |
| Generate partner profiles | BD82 | From the distribution model |
| Inbound function module | WE57, BD51 | Assign it to basic type, message type, and direction 2; set the input type |
| Process code | WE42 | "Processing with ALE" and "Processing by function module" |

The RFC user that receives ALE IDocs needs S_IDOC, S_IDOCDEFT, B_ALE_RECV, S_RFC, and
S_BTCH_JOB in the receiving system. In WE20, queue processing over qRFC needs a receiving
system on SAP Web AS 6.20 or later; the queue name rules are maintained in WE85.

## Outbound: MASTER_IDOC_DISTRIBUTE, then COMMIT WORK

Rules from SAP's ALE programming documentation:

- Fill only `MESTYP` and `IDOCTP` in the control record (`CIMTYP` for an extension). Leave
  `RCVPRT` and `RCVPRN` both empty so ALE determines the receivers from the distribution
  model, or fill both, for example `LS` and the receiver's logical system. Leave all other
  fields initial.
- Each data record needs only `SEGNAM` and `SDATA`, a 1000-character field that holds the
  segment structure.
- `COMMIT WORK` after `MASTER_IDOC_DISTRIBUTE` is mandatory. Without it the IDoc is created but
  not dispatched; the database commit at the end of the transaction is not enough. The commit
  may come later in the caller, for example once after several IDocs.
- When the application document is saved in the update task, call `MASTER_IDOC_DISTRIBUTE
  IN UPDATE TASK` so the IDoc is created only when the document is saved.
- If no receiver is preset and the distribution model has none, no exception is raised and
  `COMMUNICATION_IDOC_CONTROL` comes back empty. Check it.
- IDocs stay locked until the transaction ends. When a program creates many IDocs, unlock
  them after each commit with `EDI_DOCUMENT_DEQUEUE_LATER` (check its interface in SE37), or
  with `DEQUEUE_ALL` only when the program holds no other SAP locks it still needs:
  `DEQUEUE_ALL` releases every lock of the program.

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_order_idoc_send.prog.abap
REPORT zfa_order_idoc_send.

PARAMETERS p_order TYPE zfa_order_id OBLIGATORY.

DATA gs_order TYPE zfa_order.
DATA gt_items TYPE STANDARD TABLE OF zfa_order_item WITH DEFAULT KEY.
DATA gs_item TYPE zfa_order_item.
DATA gs_header_segment TYPE z1fa_order_hdr.
DATA gs_item_segment TYPE z1fa_order_itm.
DATA gs_control TYPE edidc.
DATA gt_data TYPE STANDARD TABLE OF edidd WITH DEFAULT KEY.
DATA gs_data TYPE edidd.
DATA gt_created TYPE STANDARD TABLE OF edidc WITH DEFAULT KEY.
DATA gs_created TYPE edidc.

START-OF-SELECTION.
  SELECT SINGLE * FROM zfa_order INTO gs_order WHERE order_id = p_order.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Order' p_order 'does not exist'.
  ENDIF.
  SELECT * FROM zfa_order_item INTO TABLE gt_items WHERE order_id = p_order.

  " Receivers come from the distribution model (BD64): RCVPRT and RCVPRN stay empty.
  gs_control-mestyp = 'ZFA_ORDER'.
  gs_control-idoctp = 'ZFA_ORDER01'.

  gs_header_segment-order_id   = gs_order-order_id.
  gs_header_segment-customer   = gs_order-customer.
  gs_header_segment-order_date = gs_order-order_date.
  gs_header_segment-currency   = gs_order-currency.
  gs_header_segment-ext_ref    = gs_order-ext_ref.
  gs_data-segnam = 'Z1FA_ORDER_HDR'.
  gs_data-sdata  = gs_header_segment.
  APPEND gs_data TO gt_data.

  LOOP AT gt_items INTO gs_item.
    CLEAR: gs_item_segment, gs_data.
    gs_item_segment-material = gs_item-material.
    gs_item_segment-quantity = gs_item-quantity.
    gs_item_segment-unit     = gs_item-unit.
    gs_data-segnam = 'Z1FA_ORDER_ITM'.
    gs_data-sdata  = gs_item_segment.
    APPEND gs_data TO gt_data.
  ENDLOOP.

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
    " 1: message type or IDoc type wrong; 4: own logical system missing (BD54, SCC4).
    MESSAGE e398(00) WITH 'MASTER_IDOC_DISTRIBUTE failed, return code' sy-subrc.
  ENDIF.

  " Mandatory: without COMMIT WORK the IDocs exist but are never sent.
  COMMIT WORK.

  IF gt_created IS INITIAL.
    WRITE: / 'No IDoc created: no receiver for ZFA_ORDER in the distribution model.'.
  ENDIF.
  LOOP AT gt_created INTO gs_created.
    WRITE: / 'IDoc', gs_created-docnum, 'for', gs_created-rcvprn, 'status', gs_created-status.
  ENDLOOP.
```

Optional checks before building the IDoc: `ALE_MODEL_DETERMINE_IF_TO_SEND` returns whether the
distribution model contains a receiver (`IDOC_MUST_BE_SENT`), and `ALE_MODEL_INFO_GET` reads
the model. Check their interfaces in SE37 on your release before you use them.

## Inbound: the function module

The interface below is SAP's standard inbound interface and must match exactly. Keep the
SE37 parameter names; the ALE layer calls the function module dynamically.

Rules:

- Never commit, neither `COMMIT WORK` nor `BAPI_TRANSACTION_COMMIT`. The ALE layer commits
  after the function module has returned and the status records are written, so the posted
  document and the IDoc status end up in the same LUW. `CALL TRANSACTION` commits implicitly,
  so use it only with transactions that are ALE-enabled.
- Return one status record per IDoc: status 53 (application document posted) on success,
  status 51 (application document not posted) with the message on error.
- Set `WORKFLOW_RESULT` to `0` when all IDocs were posted and to `99999` when one failed;
  `99999` starts the error workflow.
- Fill `RETURN_VARIABLES`: `Processed_IDOCs` with the IDoc number and `Appl_Objects` with the
  document number for each posted IDoc, `Error_IDOCs` for each failed one. The names are
  case-sensitive. In mass processing `Retry_IDOCs` and `Continue_IDOCs` also exist.
- Set `IN_UPDATE_TASK` to `X` when the posting runs in the update task, and
  `CALL_TRANSACTION_DONE` when it used `CALL TRANSACTION`.
- Raise `WRONG_FUNCTION_CALLED` when the control record has another message type.
- Segment data arrives as characters. Moving a segment field into a typed field, such as a
  quantity, raises `CX_SY_CONVERSION_NO_NUMBER` when a partner sends `10,5` or `1,500.000`,
  and the uncaught exception ends the processing with a short dump instead of status 51.
  Catch `CX_SY_CONVERSION_ERROR` around such moves and return status 51 with a message.
- EDI partners often send ISO codes for units of measure and currencies. Convert them to SAP
  codes before posting, for example with `UNIT_OF_MEASURE_ISO_TO_SAP` and
  `CURRENCY_CODE_ISO_TO_SAP`; check their interfaces in SE37.

SAP's include MBDCONWF defines constants for these values; to use them, add
`INCLUDE mbdconwf.` to the TOP include of the function group. The sample uses literals because
the constant names should be checked in your system first.

This sample is validated for ECC 6.0 EHP7 on SAP_BASIS 7.40 SP08 and uses classic syntax, so it
compiles on every release in scope. It posts through `Z_FA_ORDER_CREATE`, the BAPI-style
function module from [bapi-and-rfc.md](bapi-and-rfc.md), which saves in the update task and
does not commit. Message 020 of message class ZFA_ORDER is a customer message such as
"Quantity &1 is not a valid number".

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
* Inbound processing for message type ZFA_ORDER. Registered in WE57 (basic
* type ZFA_ORDER01, direction 2), BD51 (input type), WE42 (process code
* ZFA_ORDER), and WE20 (inbound parameter of the sending partner).
  CONSTANTS: lc_posted     TYPE bdidocstat-status VALUE '53',
             lc_not_posted TYPE bdidocstat-status VALUE '51',
             lc_result_ok  TYPE bdwf_param-result VALUE '0',
             lc_result_err TYPE bdwf_param-result VALUE '99999'.

  DATA: ls_control TYPE edidc,
        ls_data    TYPE edidd,
        ls_status  TYPE bdidocstat,
        ls_retvar  TYPE bdwfretvar,
        ls_hdr_seg TYPE z1fa_order_hdr,
        ls_itm_seg TYPE z1fa_order_itm,
        ls_header  TYPE zfa_s_order_header,
        ls_item    TYPE zfa_s_order_item,
        lt_items   TYPE STANDARD TABLE OF zfa_s_order_item,
        lt_return  TYPE STANDARD TABLE OF bapiret2,
        ls_return  TYPE bapiret2,
        ls_error   TYPE bapiret2,
        lv_order   TYPE zfa_order_id,
        lv_failed  TYPE c LENGTH 1.

  CLEAR: application_variable, call_transaction_done.
  workflow_result = lc_result_ok.
* Z_FA_ORDER_CREATE saves through the update task.
  in_update_task = 'X'.

  LOOP AT idoc_contrl INTO ls_control.
    IF ls_control-mestyp <> 'ZFA_ORDER'.
      RAISE wrong_function_called.
    ENDIF.

    CLEAR: ls_header, lt_items, lt_return, ls_error, lv_order, lv_failed.
    LOOP AT idoc_data INTO ls_data WHERE docnum = ls_control-docnum.
      CASE ls_data-segnam.
        WHEN 'Z1FA_ORDER_HDR'.
          ls_hdr_seg = ls_data-sdata.
          ls_header-customer   = ls_hdr_seg-customer.
          ls_header-order_date = ls_hdr_seg-order_date.
          ls_header-currency   = ls_hdr_seg-currency.
          ls_header-ext_ref    = ls_hdr_seg-ext_ref.
        WHEN 'Z1FA_ORDER_ITM'.
          ls_itm_seg = ls_data-sdata.
          CLEAR ls_item.
          ls_item-material = ls_itm_seg-material.
          ls_item-unit     = ls_itm_seg-unit.
          TRY.
*             Segment fields are characters: '10,5' is not a number for ABAP.
              ls_item-quantity = ls_itm_seg-quantity.
            CATCH cx_sy_conversion_error.
              IF lv_failed IS INITIAL.
                lv_failed           = 'X'.
                ls_error-type       = 'E'.
                ls_error-id         = 'ZFA_ORDER'.
                ls_error-number     = '020'.
                ls_error-message_v1 = ls_itm_seg-quantity.
              ENDIF.
          ENDTRY.
          APPEND ls_item TO lt_items.
      ENDCASE.
    ENDLOOP.

    IF lv_failed IS INITIAL.
      CALL FUNCTION 'Z_FA_ORDER_CREATE'
        EXPORTING
          is_header   = ls_header
        IMPORTING
          ev_order_id = lv_order
        TABLES
          it_items    = lt_items
          return      = lt_return.

      LOOP AT lt_return INTO ls_return WHERE type = 'E' OR type = 'A'.
        lv_failed = 'X'.
        ls_error = ls_return.
        EXIT.
      ENDLOOP.
    ENDIF.

    CLEAR: ls_status, ls_retvar.
    ls_status-docnum = ls_control-docnum.
    ls_retvar-doc_number = ls_control-docnum.
    IF lv_failed = 'X'.
      ls_status-status = lc_not_posted.
      ls_status-msgty  = ls_error-type.
      ls_status-msgid  = ls_error-id.
      ls_status-msgno  = ls_error-number.
      ls_status-msgv1  = ls_error-message_v1.
      ls_status-msgv2  = ls_error-message_v2.
      ls_status-msgv3  = ls_error-message_v3.
      ls_status-msgv4  = ls_error-message_v4.
      APPEND ls_status TO idoc_status.
      workflow_result = lc_result_err.
      ls_retvar-wf_param = 'Error_IDOCs'.
      APPEND ls_retvar TO return_variables.
    ELSE.
      ls_status-status = lc_posted.
      ls_status-msgty  = 'S'.
      ls_status-msgid  = 'ZFA_ORDER'.
      ls_status-msgno  = '010'.
      ls_status-msgv1  = lv_order.
      APPEND ls_status TO idoc_status.
      ls_retvar-wf_param = 'Processed_IDOCs'.
      APPEND ls_retvar TO return_variables.
      CLEAR ls_retvar.
      ls_retvar-wf_param   = 'Appl_Objects'.
      ls_retvar-doc_number = lv_order.
      APPEND ls_retvar TO return_variables.
    ENDIF.
  ENDLOOP.
ENDFUNCTION.
```

SAP does not document whether a custom inbound function module may roll back on its own when
posting fails, and the ALE layer commits after the call. Make sure the posting function
registers nothing when it reports E or A, as the BAPI-style function does, so a failed IDoc
leaves no partial document behind.

The body was checked for syntax only, because the interface lives in SE37 and not in the
source. Run the syntax check in SE37 once the interface exists.

## Registering the inbound function module

1. Create the function module in its own function group (SE37) with the interface above.
2. WE57: enter the function module with type F (function module), basic type `ZFA_ORDER01`,
   message type `ZFA_ORDER`, and direction 2 (inbound). The field Object type takes the
   Business Object Repository (BOR) object type of the application object, if it has one;
   SAP's example uses BUS2032 (sales order).
3. BD51: maintain the function module's input type (for a function that posts directly,
   individual or mass input; input type 2 means individual input with an IDoc lock in
   `CALL TRANSACTION`) and whether dialog is allowed.
4. WE42: create the inbound process code, for example `ZFA_ORDER`, with "Processing with ALE"
   and "Processing by function module", and assign the function module.
5. WE20: in the partner profile of the sender, add an inbound parameter for message type
   `ZFA_ORDER` with the process code. Choose "Trigger immediately" or "Trigger by background
   program"; IDocs of the second kind wait in status 64 for report RBDAPP01.
6. Test with WE19: build an IDoc from the basic type or copy an existing one, and send it to
   standard inbound processing or call the function module directly.

## Change pointers for master data

Change pointers turn change documents into IDocs. All of these must be in place:

1. BD61: activate change pointers in general.
2. BD50: activate them for the message type.
3. BD52: define the change-relevant fields per message type.
4. BD64 and WE20: the distribution model and partner profiles for the message type.
5. BD60: the function module that evaluates the pointers for the message type (SAP's
   standard ones are named `MASTERIDOC_CREATE_SMD_<message type>`). It reads the pointers,
   calls `MASTER_IDOC_DISTRIBUTE`, marks the pointers as processed, and commits about every 50
   IDocs. Use table BDCP2 (BD60 setting) on NetWeaver 6.x and later, as SAP Note 305462
   describes.
6. Schedule BD21 (report RBDMIDOC) periodically, one job per message type, and BD22 (report
   RBDCPCLR) to delete processed and obsolete pointers.

## Status values

| Direction | Status | Meaning |
|-----------|--------|---------|
| Outbound | 01 | IDoc generated |
| Outbound | 02 | Error passing data to port |
| Outbound | 03 | Data passed to port OK |
| Outbound | 12 | Dispatch OK (set by report RBDMOIND after the tRFC was sent) |
| Outbound | 26 | Syntax error |
| Outbound | 29 | Error in ALE service |
| Outbound | 30 | Ready for dispatch (output mode collect: report RSEOUT00 sends them) |
| Inbound | 50 | IDoc added |
| Inbound | 51 | Application document not posted |
| Inbound | 53 | Application document posted |
| Inbound | 56 | IDoc with errors added |
| Inbound | 60 | Syntax error |
| Inbound | 62 | IDoc passed to application |
| Inbound | 63 | Error passing IDoc to application |
| Inbound | 64 | IDoc ready to be transferred to application |
| Inbound | 66 | Waiting for predecessor (serialization) |
| Inbound | 68 | Error, no further processing |

## Monitoring and reprocessing

| Task | Transaction or report |
|------|-----------------------|
| List and display IDocs by status, message type, partner | WE02, WE05 |
| Search IDocs by content, also in the archive | WE09 |
| ALE status monitor; process IDocs again by status | BD87 |
| Post inbound IDocs in status 64 or 66 in the background | RBDAPP01 |
| Repost inbound IDocs in status 51 or 63 | RBDMANI2 |
| Send collected outbound IDocs (status 30) | RSEOUT00 |
| Test inbound or outbound processing | WE19 |
| tRFC calls of ALE ports | SM58 |
| Status values and error handling settings | WE47, WE46 |

Before reprocessing an IDoc in status 51, fix the cause (missing customizing or master
data), then reprocess in BD87 or with RBDMANI2. Do not edit IDoc data in production unless the
business owner agrees; an edited IDoc keeps the original in status 70.

## EDI specifics

- The EDI subsystem translates between IDocs and EDIFACT, ANSI X12, or other formats. SAP's
  message types are named after EDIFACT messages (for example ORDERS).
- Message Control (output medium 6, EDI) feeds outbound IDocs for documents such as purchase
  orders. Dispatch time 4 (immediately) combined with "transfer IDoc immediately" sends in real
  time.
- On S/4HANA, check which output control the application uses before you configure EDI
  output: message control (NAST) as above, or S/4HANA output management, which is based on
  BRFplus and sends IDocs through the output channel IDOC. SAP documents the second for
  purchase orders, where it must be enabled first. The configuration steps differ.
- The subsystem can be started through an RFC destination of type T, and it reports status
  back through a status file (file port) or IDoc type SYSTAT01.

## Sources (checked 2026-10-15)

- [Inbound function module interface, NetWeaver 7.3](https://help.sap.com/SAPhelp_nw73/helpdata/en/4a/6d4fe6c952619fe10000000a421937/content.htm)
  and [result conventions](https://help.sap.com/SAPhelp_nw73/helpdata/en/4a/684ebd4d686fbde10000000a42189c.html)
- [Parameters of the inbound function module, 4.6C](https://help.sap.com/saphelp_46c/helpdata/en/dc/6b7df143d711d1893e0000e8323c4f/content.htm)
- [No commit in the application function module](https://help.sap.com/docs/ABAP_PLATFORM_NEW/8f3819b0c24149b5959ab31070b64058/4a6d851657a960e6e10000000a42189b.html)
- [MASTER_IDOC_DISTRIBUTE, 4.70](https://help.sap.com/saphelp_470/helpdata/EN/78/21783151ce11d189570000e829fbbd/content.htm)
  and [control record](https://help.sap.com/saphelp_470/helpdata/EN/78/2177f051ce11d189570000e829fbbd/content.htm)
- [Registering inbound function modules](https://help.sap.com/docs/ABAP_PLATFORM_NEW/8f3819b0c24149b5959ab31070b64058/4b44ee1a71dd2475e10000000a421937.html)
  and [WE57, assigning a function module](https://help.sap.com/docs/ABAP_PLATFORM_NEW/8f3819b0c24149b5959ab31070b64058/4b4c76174a712597e10000000a42189b.html)
- [BRFplus output management with output channel IDOC (SAP Ariba Cloud Integration Gateway guide)](https://help.sap.com/docs/sisgw/sap-ariba-cloud-integration-gateway-overview-guide/brfplus-output-management-881ff8d9b2234807a9ddd6b8ea731477)
- [ALE configuration checklist](https://help.sap.com/docs/ABAP_PLATFORM_NEW/9d6aa238582042678952ab3b4aa5cc71/e6066c85a22b4bfda11e90243ab0bc8b.html)
- [Change pointers](https://help.sap.com/docs/ABAP_PLATFORM_NEW/8f3819b0c24149b5959ab31070b64058/4a6dcbe9c95261a3e10000000a421937.html)
- [IDoc status values, S/4HANA](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/18fe3fab96864826bfa0be0de4f65b85/5f1d9c221c1841e0b202c5536fc1fa87.html)
- [Monitoring](https://help.sap.com/docs/ABAP_PLATFORM_NEW/8f3819b0c24149b5959ab31070b64058/4ab7c1736dbe6d8be10000000a42189c.html)
- [Port types](https://help.sap.com/docs/ABAP_PLATFORM_NEW/8f3819b0c24149b5959ab31070b64058/4b69785558d241a9e10000000a421937.html)
  and [partner profiles](https://help.sap.com/docs/ABAP_PLATFORM_NEW/8f3819b0c24149b5959ab31070b64058/4b408cddf6951ff8e10000000a42189c.html)
