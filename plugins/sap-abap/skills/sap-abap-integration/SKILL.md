---
name: sap-abap-integration
description: >-
  Write and review integration code in Standard ABAP on SAP ECC 6.0, SAP NetWeaver AS ABAP, and
  SAP S/4HANA: BAPI calls with RETURN checks and caller commit, BAPI-style RFC function modules,
  synchronous, asynchronous, and background RFC (tRFC, qRFC, bgRFC), IDocs with ALE and EDI, and
  SAP Gateway OData V2 services built in SEGW, using only syntax and APIs the target release
  supports. USE FOR: calling or writing BAPIs and RFC function modules, RFC destinations and
  authorizations, parallel processing with aRFC, moving tRFC or qRFC to bgRFC, IDoc function
  modules, partner profiles, SEGW DPC_EXT methods with $filter and paging, $batch commit errors,
  RFC, IDoc, and Gateway monitoring. DO NOT USE FOR: reports, ALV, DDIC, or SQL tuning (use
  sap-abap-standard), BAdIs or exits (use sap-abap-enhancements), RAP (use
  sap-rap-business-object; RAP on S/4HANA 1909 to 2021 is not covered), released-API checks (use
  sap-clean-core-check), code-based OData V4, or SAP Integration Suite or other BTP services.
license: MIT
compatibility: >-
  SAP ECC 6.0 (any enhancement package), SAP NetWeaver AS ABAP 7.0 or later, or SAP S/4HANA
  on-premise or Private Edition with Standard ABAP. SAP GUI (SE37, SM59, WE20, SEGW) or ABAP
  Development Tools. SEGW services need SAP Gateway: SAP_GWFND from SAP_BASIS 7.40, the IW_BEP
  add-on before. Authorization to create customer objects and a transport request.
metadata:
  vendor: sap
  product: abap
  category: integration
  maturity: beta
  version: "0.1.0"
  sap-products: "ecc, netweaver, s4hana, s4hana-private-cloud"
  sap-deployments: "on-premise, azure-iaas, aws-iaas, gcp-iaas, sap-private-cloud"
  abap-language-version: "standard"
  sap-basis-min: "7.00"
  abap-env-default: "product=ecc release=ehp8 database=anydb"
---

# SAP integration in Standard ABAP: BAPI, RFC, IDoc, and SAP Gateway

BAPIs, RFC, IDocs, and SAP Gateway OData V2 services are how customer-managed SAP systems
exchange data. What makes them reliable is transaction control: who commits, what forms one
logical unit of work (LUW), and what happens when the partner system is down. The hard
technical constraint is the release. `WAIT FOR ASYNCHRONOUS TASKS` does not exist on ECC 6.0
EHP6, `SELECT ... OFFSET` does not exist before 7.51, and the Gateway framework on an IW_BEP
add-on is older than SAP_GWFND. Where SAP runs (on premises, on Azure, AWS, or Google Cloud
virtual machines, or in SAP's private cloud) changes host names and network routes in SM59,
never the ABAP.

Reference files:

- [references/bapi-and-rfc.md](references/bapi-and-rfc.md): BAPI calls and commit, a
  BAPI-style RFC function module, remote BAPI calls, synchronous RFC, and RFC security.
- [references/async-rfc-and-bgrfc.md](references/async-rfc-and-bgrfc.md): parallel
  processing with aRFC, legacy tRFC and qRFC, and bgRFC units, with the release of each.
- [references/idoc-ale-edi.md](references/idoc-ale-edi.md): IDoc objects, ALE and EDI setup,
  outbound and inbound samples, change pointers, status values, and reprocessing.
- [references/gateway-odata-v2.md](references/gateway-odata-v2.md): SEGW classes, a
  `GET_ENTITYSET` with `$filter`, server-side paging, and counts, errors, `$batch`, and logs.

## Step 1: Pin down the target system

Ask for anything you cannot see. Do not assume the newest release.

1. **Product and release**: ECC 6.0 with enhancement package, NetWeaver AS ABAP release, or
   S/4HANA release (for example 1909 or 2023).
2. **SAP_BASIS release and support package**: System > Status > Component information. On
   SAP_BASIS 7.40 the support package decides whether `WAIT FOR ASYNCHRONOUS TASKS` (SP02) or
   `INTO` as the last `SELECT` clause (SP08) is available.
3. **Gateway components** for SEGW work, in the same list: SAP_GWFND (standard from 7.40) or
   the IW_BEP and IW_FND add-ons. Ask whether the service runs embedded or on a hub system.
4. **Partner**: another ABAP system (RFC, ALE), a non-SAP system through an EDI subsystem or
   middleware (IDoc file or XML port), or an HTTP client such as an SAP Fiori app (OData).
5. **Delivery guarantee**: does the caller need the answer now, exactly once, or exactly once
   in order? How many calls per hour, and how large?
6. **Where SAP runs** matters for SM59 host names, SAProuter strings, and firewalls. It never
   changes the code, so ECC on Azure virtual machines gets the same ABAP as ECC on premises.

## Step 2: Choose the technique

| Requirement | Technique | Available from | Notes |
|-------------|-----------|----------------|-------|
| Create or change a business document in the same system | BAPI or the application's API, called locally | R/3 4.0 | The caller commits |
| Call another ABAP system and use the answer now | Synchronous RFC (sRFC) | All releases | Fails when the partner is down |
| Run work in parallel and collect the results | Asynchronous RFC (aRFC) with a callback, often `DESTINATION IN GROUP` | All releases | `WAIT FOR ASYNCHRONOUS TASKS` from 7.40 SP02 |
| Send exactly once, or exactly once in order, without waiting | bgRFC unit of type t or q | 7.0 SP14, complete from 7.02 | Replaces tRFC and qRFC |
| Exchange business documents with status monitoring and reprocessing, also with EDI partners | IDoc with ALE or EDI | All releases | Partner profile, port, distribution model |
| Serve HTTP clients such as SAP Fiori apps | OData V2 service built in SEGW | Gateway add-on on NetWeaver 7.0 SP18; SAP_GWFND from 7.40 | On S/4HANA, SAP recommends RAP for new services |

## Step 3: Call BAPIs and commit in the caller

1. Find the BAPI in the BAPI Explorer (transaction `BAPI`) and read its documentation:
   parameters, the change-flag (`X`) structures it needs, and whether it commits itself.
   Since release 4.0 BAPIs do not commit. Release 3.1 BAPIs and a few documented exceptions
   do; such a BAPI must say so in its documentation, and SAP Note 131838 lists them.
2. Evaluate `RETURN` after every call. Check its type in the interface first: BAPIRET2 in new
   BAPIs, BAPIRET1 or BAPIRETURN (fewer fields) in older ones, sometimes one structure instead
   of a table. `TYPE` `E` (error) and `A` (abort) mean failure; `S`, `W`, and `I` do not. An
   initial `RETURN` means no error. BAPIs raise no exceptions, so `sy-subrc` tells you nothing.
3. On success, call `BAPI_TRANSACTION_COMMIT`. Pass `wait = 'X'` when the next step reads what
   the BAPI posted. The commit then waits for the high-priority (V1) update modules only, not
   for V2 updates or for tRFC and bgRFC units started by the same commit. Check the commit's
   own `RETURN` for `E` or `A` too, and report it as a failed posting.
4. On failure, call `BAPI_TRANSACTION_ROLLBACK`. Check before you commit: a rollback cannot
   undo changes that the commit has already passed to the update task.
5. Commit or roll back once per business document. A failed document then undoes only
   itself, and you avoid two write accesses to the same instance in one LUW (for example
   create, then change), which the BAPI transaction model does not allow.
6. Make reruns safe: register the "processed" mark of your source record in the update task
   before the commit, so it joins the document's LUW, and lock the record with `ENQUEUE`.
7. Use the `TESTRUN` parameter where the BAPI has one to simulate: all checks run, nothing is
   written, and no internal numbers are assigned.
8. Report every `RETURN` line, not only the first: `MESSAGE`, the message key (`ID`, `NUMBER`,
   `MESSAGE_V1` to `MESSAGE_V4`), the location (`PARAMETER`, `ROW`, `FIELD`), and the
   application log (`LOG_NO`, `LOG_MSG_NO`).

The decision in short (`lv_failed` is `c LENGTH 1`, so it also compiles on 7.00 and 7.01; the
complete EHP6 program is in [references/bapi-and-rfc.md](references/bapi-and-rfc.md)):

```abap
LOOP AT lt_return INTO ls_return WHERE type = 'E' OR type = 'A'.
  lv_failed = 'X'.
  EXIT.
ENDLOOP.
IF lv_failed = 'X'.
  CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
ELSE.
  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait   = 'X'
    IMPORTING
      return = ls_commit_return.
ENDIF.
```

## Step 4: Write BAPI-style RFC function modules

- Set the attribute "Remote-Enabled Module" in SE37. Without it the caller gets
  `SYSTEM_FAILURE`, and the called system logs the runtime error `CALL_FUNCTION_NOT_REMOTE`.
- Pass parameters by value. `TABLES` parameters must have flat line types; references cannot
  be passed. Over RFC the typing is not checked and every parameter behaves as optional, so
  validate the input yourself.
- Report errors in a `RETURN` table of type BAPIRET2. Do not send `MESSAGE` of type `E` or `A`
  (use `MESSAGE ... INTO` to fill the text), and do not declare class-based exceptions: in
  customer releases they cannot cross RFC and arrive as `SYSTEM_FAILURE`.
- Never `COMMIT WORK`, `CALL TRANSACTION`, `SUBMIT`, or show screens. Save through update
  function modules (`CALL FUNCTION ... IN UPDATE TASK`), so the caller's commit saves
  everything at once or nothing.
- Lock an existing object with its `ENQUEUE` function module before you check and change it.
  When you return an error and register no update, release the lock: no commit follows.
- Check business authorizations inside the function module. S_RFC only controls who may call
  the function group or module, not what the caller may do with the data.
- Offer a `TESTRUN` parameter for functions that write.

The complete function module, with the program that calls it, is in
[references/bapi-and-rfc.md](references/bapi-and-rfc.md).

## Step 5: Call other systems with RFC

### Synchronous RFC

- Call with `DESTINATION` and always handle the predefined exceptions with `MESSAGE`:
  `system_failure = n MESSAGE lv_msg` (runtime error, message of type A, E, or X, or a
  class-based exception on the server) and `communication_failure = m MESSAGE lv_msg`
  (connection, logon, or network). The message field must be flat and character-like, for
  example `c LENGTH 255`. Add the function module's own classic exceptions and `OTHERS`.
- An empty destination makes the call local. Check the configured destination before the call.
- Every sRFC, aRFC, and `WAIT` triggers an implicit database commit in the caller, except
  during update processing. Never call RFC inside `SELECT ... ENDSELECT`, with an open
  cursor, or between database changes that must be committed together.
- Each destination gets its own RFC session in the partner. A remote BAPI and a remote
  `BAPI_TRANSACTION_COMMIT` on the same destination run in the same session and LUW. The
  connection stays open until `RFC_CONNECTION_CLOSE` or the end of the program.
- When the remote commit call fails, for example with `COMMUNICATION_FAILURE`, the outcome is
  unknown: the partner may have committed. Look the document up there, for example by an
  external reference you sent, before you retry. Use bgRFC or IDocs for exactly once.
- Give structures in RFC interfaces identical types and lengths in both systems (compare them
  in SE11): the material number has 18 characters in ECC and up to 40 in S/4HANA.

### Asynchronous RFC and parallel processing

- `CALL FUNCTION ... STARTING NEW TASK task DESTINATION ... CALLING meth ON END OF TASK`,
  available from Release 6.20. `IMPORTING` is not allowed in the call: the callback method
  (public, one importing parameter `p_task TYPE clike`) collects the results with
  `RECEIVE RESULTS FROM FUNCTION`, which it must always execute. `PERFORMING subr ON END OF
  TASK` is the variant with a form routine.
- Use a destination of type 3 or I, or `NONE`; never a blank one. For parallel processing in
  the same system use `DESTINATION IN GROUP DEFAULT` or an RFC server group from RZ12, and
  handle `resource_failure` (only possible with `IN GROUP`, and without `MESSAGE`). Start a
  task only while fewer than your limit are running, and after `RESOURCE_FAILURE` wait for
  one of your tasks to end and try again.
- On 7.31 and older, keep task names to 8 characters and unique, as that release's keyword
  documentation requires. The 7.40 and later documentation allows 32 characters.
- Wait for callbacks with `WAIT FOR ASYNCHRONOUS TASKS UNTIL ... UP TO n SECONDS` from 7.40
  SP02. Below that (7.31 and older, and 7.40 SP00 and SP01) the statement does not exist; use
  `WAIT UNTIL ... UP TO n SECONDS`. `sy-subrc` is 0 when the condition is true, 4 when no
  callback is outstanding, and 8 on timeout.

### Background RFC instead of tRFC and qRFC

- tRFC (`CALL FUNCTION ... IN BACKGROUND TASK`) and qRFC (`TRFC_SET_QUEUE_NAME` before a tRFC
  call) are obsolete in SAP's current documentation, and SAP strongly recommends bgRFC. Read
  and maintain old code, but write new asynchronous calls with bgRFC: available from 7.0 SP14,
  complete from 7.02. On 7.00 SP14 to 7.01, check in SE24 and SBGRFCCONF that what you need
  exists, or keep tRFC and qRFC there. SAP's RFC documentation says tRFC and bgRFC cannot be
  used in parallel, so move a whole scenario at once.
- Pattern: `cl_bgrfc_destination_outbound=>create( )`, then `create_trfc_unit( )` (exactly
  once) or `create_qrfc_unit( )` with `add_queue_name_outbound( )` (exactly once in order),
  then `CALL FUNCTION ... IN BACKGROUND UNIT`, then `COMMIT WORK`. The commit starts the unit.
- The function modules in a unit must not commit, roll back, or trigger an implicit database
  commit. Units registered in the same LUW as update modules run after the update.
- bgRFC needs configuration in SBGRFCCONF, including a supervisor destination, and
  authorization object S_BGRFC. Outbound bgRFC destinations are normal SM59 destinations.

The sRFC samples are in [references/bapi-and-rfc.md](references/bapi-and-rfc.md); aRFC, tRFC,
qRFC, and bgRFC are in [references/async-rfc-and-bgrfc.md](references/async-rfc-and-bgrfc.md).

## Step 6: Secure RFC connections

- Keep logon data and trust settings in the SM59 destination. Never put a user, password, or
  client into code, constants, tables, or variants. Refer to the destination by a name that
  exists in every system of the landscape, each pointing to its own partner.
- Enter a value in "Authorization for Destination" (SM59, Logon & Security) for destinations
  with stored logon data. Callers then need S_ICF with `ICF_FIELD` `DEST` and that value;
  without it, every program that may call RFC can use the destination.
- Create technical RFC users with user type System or Communication, which cannot log on in
  dialog, and give them only the S_RFC and business authorizations they need.
- The RFC user in the called system needs S_RFC with `RFC_TYPE` (`FUGR` or `FUNC`), `RFC_NAME`,
  and `ACTVT` 16. The check runs on the first call in an RFC session; a failure ends the call
  with `RFC_NO_AUTHORITY` or `CALL_FUNCTION_NO_AUTH`. Grant function groups by name, not `*`.
- ALE users that receive IDocs also need S_IDOC, S_IDOCDEFT, B_ALE_RECV, and S_BTCH_JOB.
- Use trusted RFC (SMT1, S_RFCACL in the trusting system) only as a deliberate decision with
  the security team: users of the trusted system log on to the trusting one without password.
- From 7.50, class CL_DYNAMIC_DESTINATION creates dynamic destinations at runtime. Their logon
  data still belongs in configuration, never in code.

## Step 7: Send and receive IDocs

- **Development objects**: segments (WE31), IDoc type (WE30), message type (WE81), and their
  assignment (WE82), all in the customer namespace.
- **Configuration**: logical systems (BD54, assigned to the client in SCC4), RFC destination
  (SM59), port (WE21), distribution model (BD64), partner profile (WE20). BD82 generates
  partner profiles from the distribution model. On S/4HANA, check whether the document's
  output uses message control (NAST) or S/4HANA output management with output channel IDOC.
- **Outbound**: fill the control record (`MESTYP`, `IDOCTP`, and `CIMTYP` for an extension)
  and data records (`SEGNAM`, `SDATA`), call `MASTER_IDOC_DISTRIBUTE`, then `COMMIT WORK`.
  Without the commit the IDoc is created but never sent; the database commit at the end of
  the program is not enough. Leave `RCVPRT` and `RCVPRN` both empty so ALE reads receivers
  from the distribution model, or fill both. An empty `COMMUNICATION_IDOC_CONTROL` table
  means no receiver was found, and no exception is raised.
- **Inbound**: write a function module with SAP's standard inbound interface and register it
  (WE57, BD51, WE42, WE20). It must never commit: the ALE layer commits after it has written
  the status records, so document and IDoc status are saved together. Return status 53 and
  `WORKFLOW_RESULT` `0` on success, status 51 with the message and `WORKFLOW_RESULT` `99999`
  on error, and fill `RETURN_VARIABLES` with `Processed_IDOCs`, `Appl_Objects`, or
  `Error_IDOCs` (case-sensitive). Raise `WRONG_FUNCTION_CALLED` for any other message type.
  Catch conversion errors when you move character segment fields into typed fields, and
  convert ISO unit and currency codes from EDI partners.
- **Change pointers** for master data: activate them in general (BD61) and per message type
  (BD50), choose the fields (BD52), and schedule BD21 (report RBDMIDOC) per message type and
  BD22 (RBDCPCLR) to delete processed pointers.

The outbound program, the inbound function module, the registration steps, and the status
values are in [references/idoc-ale-edi.md](references/idoc-ale-edi.md).

## Step 8: Build OData V2 services with SEGW

- SEGW generates a model provider class (MPC) and a data provider class (DPC), each with an
  `_EXT` subclass. Regeneration overwrites the base classes. Put data access code in
  `ZCL_<project>_DPC_EXT` by redefining methods such as `<ENTITYSET>_GET_ENTITYSET` (names cut
  to 30 characters), and model changes in a redefinition of `DEFINE` in
  `ZCL_<project>_MPC_EXT`. Never output, change, or transport the generated base classes.
- Read the request through `io_tech_request_context`. SAP marks every other importing
  parameter of the method as obsolete (`IS_PAGING`, `IT_ORDER`, `IT_FILTER_SELECT_OPTIONS`,
  `IT_KEY_TAB`, and more); those with property names use external names, not ABAP fields.
- The framework handles `$select`, `$expand`, and `$format`. Your code handles `$filter`,
  `$orderby`, `$top`, `$skip`, `$inlinecount`, and `$skiptoken`. For `$count` the framework
  counts the rows you return unless you set the count yourself.
- Let the database do the work: the `WHERE` clause from `get_osql_where_clause( )`, and
  `COUNT(*)` for `$count` and `$inlinecount` (the total after `$filter`, before paging). If
  the request has a `$filter` but the clause is empty, raise an error instead of reading
  without a condition. Never concatenate filter values into a dynamic `WHERE`. Allow only
  known properties in `$orderby` before you build a dynamic `ORDER BY`.
- Limit every response: cap the page size, read at most offset plus page size rows with
  `UP TO n ROWS`, and set `es_response_context-skiptoken` when the client gave no `$top` or
  asked for more than a page; the framework turns it into a next link. `get_top( )` is empty
  without `$top`, so `$top=0` (no rows) stays distinct. Check `$skip`, `$top`, and the token
  against limits before any arithmetic. From 7.51 `OFFSET` replaces deleting the skipped
  rows; it makes the statement strict, so the dynamic `ORDER BY` list then needs commas.
- Raise `/IWBEP/CX_MGW_BUSI_EXCEPTION` for business errors (with a text or a message
  container; with `HTTP_STATUS_CODE` 403 for a missing authorization) and
  `/IWBEP/CX_MGW_TECH_EXCEPTION` for technical ones.
- A `$batch` changeset is one LUW. In a changeset with more than one operation the entity
  methods must not `COMMIT WORK` or `ROLLBACK WORK`; the framework ends with a short dump if
  they do, and commits after `CHANGESET_END` itself. Outside `$batch`, your code commits.
- Register the service in `/IWFND/MAINT_SERVICE`, test in `/IWFND/GW_CLIENT`, and read errors
  in `/IWFND/ERROR_LOG` (hub) and `/IWBEP/ERROR_LOG` (backend); embedded, check both.
- On S/4HANA, SEGW is still shipped and documented in 2025, but SAP recommends RAP for new
  custom services: queries and unmanaged business objects from 1909, managed with draft from
  2020, and more features in every release since. sap-rap-business-object covers RAP on S/4HANA
  2022 or later. On S/4HANA 1909 to 2021, tell the user that SAP recommends RAP and that this
  plugin does not cover RAP on those releases, and build a SEGW OData V2 service only if the
  user chooses it. ECC has no RAP; use SEGW OData V2 there. Code-based OData V4 is not covered.

The complete `GET_ENTITYSET` redefinition and the `$batch` rules are in
[references/gateway-odata-v2.md](references/gateway-odata-v2.md).

## Step 9: Monitor and reprocess

| Area | Transaction | What to look at |
|------|-------------|-----------------|
| Destinations | SM59 | Connection test, logon data, trust settings |
| tRFC | SM58 | Failed calls per transaction ID; restart after fixing the cause |
| qRFC | SMQ1, SMQ2 | Outbound and inbound queues; schedulers in SMQS and SMQR |
| bgRFC | SBGRFCMON, SBGRFCCONF | Unit status and errors; destinations, supervisor, schedulers |
| Updates after a commit | SM13 | Terminated update requests |
| IDocs | WE02, WE05, WE09 | IDoc list and display by status; search by content |
| IDoc processing | BD87, WE19 | Reprocess by status; test an IDoc against the inbound function module |
| Gateway | /IWFND/ERROR_LOG, /IWBEP/ERROR_LOG, /IWFND/GW_CLIENT | Hub and backend errors; send test requests |
| Runtime errors in the called system | ST22 there | `CALL_FUNCTION_NOT_REMOTE`, `RFC_NO_AUTHORITY`; the caller sees `SYSTEM_FAILURE` |
| Runtime errors in the calling system | ST22 | `CALL_FUNCTION_DESTINATION_NO_T`, and RFC exceptions the program does not handle |

## Release facts

| Pattern | Available from | Source |
|---------|----------------|--------|
| `BAPI_TRANSACTION_COMMIT` and `BAPI_TRANSACTION_ROLLBACK` | R/3 4.0 (all releases in scope) | SAP Library 4.6C, BAPI transaction model |
| sRFC, aRFC (`STARTING NEW TASK`, `RECEIVE RESULTS`, `WAIT UNTIL`), tRFC | All releases in scope; `CALLING meth ON END OF TASK` from 6.20 | ABAP Keyword Documentation 7.31; SAP NetWeaver 7.3 Library |
| bgRFC (`IN BACKGROUND UNIT`, CL_BGRFC_* classes) | 7.0 SP14; complete from 7.02 | Release news 7.0 EhP2 |
| `WAIT FOR ASYNCHRONOUS TASKS` | 7.40 SP02 | Release news 7.40 SP02 (ABAP Channels) |
| Predefined destination `SELF` | 7.56 | Release news 7.56 (RFC) |
| `PARAMETER-TABLE` and `EXCEPTION-TABLE` in sRFC | 7.57 | Release news 7.57 (RFC) |
| `CALL FUNCTION ... IN REMOTE SESSION` | 8.16 (S/4HANA 2025) | Release news 8.16 (RFC) |
| SAP Gateway add-on, SAP_GWFND | Add-on on NetWeaver 7.0 SP18; SAP_GWFND from 7.40 | SAP Gateway Foundation documentation |
| Commit in `CHANGESET_END`; defer mode | Gateway 2.0 SP07 (SP06 with Note 1824626); SP09 | SAP Gateway Foundation documentation |
| OData V4 in SAP Gateway | 7.50 SP04 | SAP Gateway Foundation documentation |
| `SELECT ... OFFSET` | 7.51 | Release news 7.51 (ABAP SQL) |

The references list the URLs, checked on 2026-10-15.

## Output format

1. State the target you assumed: product, release, SAP_BASIS and support package, database,
   Gateway components where relevant, and that the hosting does not change the code.
2. Return each object in its own code block starting with an abapGit file marker, for example
   `* file: src/zfa_order_upload.prog.abap`, `* file: src/zfa_order_api.fugr.z_fa_order_create.abap`,
   or `* file: src/zcl_zfa_product_dpc_ext.clas.abap`. For a function module, show the
   interface as the comment block SE37 generates. For SEGW, return only the `_EXT` classes.
3. List the configuration and authorizations the user must set up: SM59 destinations, S_RFC
   roles, partner profiles, ports, distribution model, process codes, bgRFC settings, or
   service registration.
4. Name what could not be verified offline: syntax check and activation in the system, the
   exact signatures of SAP objects on the user's release, and an end-to-end test with the
   partner system.
