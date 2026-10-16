# BAdI patterns

Kernel BAdIs (Enhancement Framework) and classic BAdIs: the objects involved, how to define,
implement, and call them, which exceptions occur when, and which release each pattern needs.
Facts were checked against SAP documentation on 2026-10-15; the sources are listed at the end.

## Kernel BAdI or classic BAdI

| | Kernel BAdI (Enhancement Framework) | Classic BAdI |
|---|---|---|
| Available from | SAP_BASIS 7.00, so every ECC 6.0 system has it | Release 4.6A |
| Defined in | An enhancement spot (SE18 or SE80; ADT editor from 7.57) | SE18 |
| Implemented in | A simple enhancement implementation (SE19 "New BAdI", SE80; ADT editor from 7.57) | SE19 or the IMG activity |
| Reference variable | Typed with the BAdI name: `TYPE REF TO zbadi_fa_order_check` | Typed with the interface: `TYPE REF TO zif_ex_fa_order_exit` |
| Instance | `GET BADI` | `CL_EXITHANDLER=>GET_INSTANCE` |
| Method call | `CALL BADI` | Normal method call |
| Filter values | Passed once at `GET BADI ... FILTERS` | Passed with every method call in `FLT_VAL` |
| Status | Recommended for every new BAdI | Replaced by kernel BAdIs; create new BAdIs only in the Enhancement Framework |

Use the technology SAP provides at the call point you need. For call points you own, always
define a kernel BAdI. SAP describes the kernel BAdIs as significantly faster than classic ones.

## Objects of a kernel BAdI

| Object | Purpose |
|--------|---------|
| Enhancement spot (object type ENHS) | Container and transport object for one or more BAdI definitions. Can be grouped in a composite spot. |
| BAdI definition | Name, interface, filters, and properties: single or multiple use, instance creation mode, optional fallback class. The name shares the namespace of DDIC types, classes, and interfaces; SAP recommends the prefix `BADI_`, so use `ZBADI_` in the customer namespace. |
| BAdI interface | Must include the tag interface `IF_BADI_INTERFACE` (added automatically when you create the interface from the spot editor). |
| Simple enhancement implementation (object type ENHO) | Container for BAdI implementations, assigned to exactly one enhancement spot. |
| BAdI implementation | Implementing class, filter values, and the runtime flag "Implementation is active". |
| Implementing class | Global class that implements the BAdI interface. |

Instance creation modes: newly created (new instance at every `GET BADI`), reused (one instance
per implementing class and internal session), and context-dependent (see the note below).

## Defining a BAdI for your own call point

1. Create the enhancement spot in a customer package (SE80 or SE18).
2. Create the BAdI definition in the spot. Choose:
   - **Single use** when the caller expects exactly one answer, for example a check result.
     Methods may have exporting and returning parameters.
   - **Multiple use** when any number of implementations may react, for example to an event.
     Methods may have only importing and changing parameters, because the result of several
     implementations would be undefined otherwise. Changing parameters are passed through
     the implementations one after the other.
3. Create the interface with `IF_BADI_INTERFACE` and the methods.
4. Add filters when implementations depend on a value such as the sales organization. Each
   filter has a name and a type, optional value checks, and the option "Constant Filter Value
   During Call", which allows only literals and constants in `FILTERS`.
5. Give a single-use BAdI a fallback class. `GET BADI` returns the fallback class when no
   implementation is active and also when implementations exist but none matches the filter
   values. Without a fallback class, a single-use BAdI with no matching implementation raises
   `CX_BADI_NOT_IMPLEMENTED`, which dumps unless the caller catches it. Use default
   implementations instead when you need several defaults with different filter conditions;
   both can be combined.

This interface, fallback class, and caller compile on SAP_BASIS 7.00 (ECC 6.0 without
enhancement package). They use no 7.02 syntax. The report checks the display authorization
for the document's sales area before it shows anything:

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
*   Used when no implementation matches the filter values: block nothing.
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
*     Only possible if the fallback class is removed from the BAdI definition.
      CLEAR gv_blocked.
  ENDTRY.

  IF gv_blocked = 'X'.
    WRITE: / 'Blocked:', gv_reason.
  ELSE.
    WRITE: / 'Not blocked'.
  ENDIF.
```

## Implementing a kernel BAdI

1. SE19, choose "New BAdI", enter the enhancement spot, and create an implementation. On
   S/4HANA 2022 (SAP_BASIS 7.57) and later you can do the same in the ADT editor for BAdI
   implementations. On ECC (SAP_BASIS 7.50 at most) and on S/4HANA up to 2021, use SAP GUI.
   The 7.54 release that ADT documentation names for creating enhancement implementations
   refers to source code plug-ins.
2. Create or choose the simple enhancement implementation, then the BAdI implementation and
   its implementing class. The class must implement the BAdI interface.
3. Maintain the filter values, for example `VKORG = 1000`.
4. Keep "Implementation is active" set and activate. Without an active implementation, the
   fallback class or `CX_BADI_NOT_IMPLEMENTED` applies.
5. For a single-use BAdI, make sure no second active implementation matches the same filter
   values. If conflict resolution cannot pick one, `GET BADI` raises
   `CX_BADI_MULTIPLY_IMPLEMENTED`.
6. Record the enhancement implementation and the class on a workbench request.

The implementing class holds only the business rule, so it can be unit tested without the
BAdI runtime. Test classes with `RISK LEVEL` and `DURATION` and `CL_ABAP_UNIT_ASSERT` need
SAP_BASIS 7.02 (ECC 6.0 EHP5) or later, as in this sample:

<!-- abap-env: product=ecc release=ehp5 database=anydb -->
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
    DATA mo_cut TYPE REF TO zif_fa_order_check.
    METHODS setup.
    METHODS blocks_large_standard_order FOR TESTING.
    METHODS ignores_other_order_types FOR TESTING.
ENDCLASS.

CLASS ltc_order_check IMPLEMENTATION.
  METHOD setup.
    CREATE OBJECT mo_cut TYPE zcl_fa_order_check_1000.
  ENDMETHOD.

  METHOD blocks_large_standard_order.
    DATA ls_order TYPE zif_fa_order_check=>ty_order.
    DATA lv_blocked TYPE zif_fa_order_check=>ty_flag.
    DATA lv_reason TYPE string.
    ls_order-auart = 'ZOR'.
    ls_order-waerk = 'EUR'.
    ls_order-netwr = '60000.00'.
    mo_cut->check_order( EXPORTING is_order   = ls_order
                         IMPORTING ev_blocked = lv_blocked
                                   ev_reason  = lv_reason ).
    cl_abap_unit_assert=>assert_equals( act = lv_blocked exp = 'X' ).
  ENDMETHOD.

  METHOD ignores_other_order_types.
    DATA ls_order TYPE zif_fa_order_check=>ty_order.
    DATA lv_blocked TYPE zif_fa_order_check=>ty_flag.
    DATA lv_reason TYPE string.
    ls_order-auart = 'ZRE'.
    ls_order-waerk = 'EUR'.
    ls_order-netwr = '60000.00'.
    mo_cut->check_order( EXPORTING is_order   = ls_order
                         IMPORTING ev_blocked = lv_blocked
                                   ev_reason  = lv_reason ).
    cl_abap_unit_assert=>assert_initial( lv_blocked ).
  ENDMETHOD.
ENDCLASS.
```

On 7.00 and 7.01, write the test properties as pseudo comments after `FOR TESTING`
(`"#AU Risk_Level Harmless` and `"#AU Duration Short`), assert with `CL_AUNIT_ASSERT`, and
assign method results to a variable before you pass them on, because a method call as an
actual parameter needs 7.02.

Rules for implementing classes:

- Do not commit, roll back, call transactions, or submit programs inside a BAdI method. The
  BAdI runs inside SAP's logical unit of work; see the LUW rules in
  [exits-plugins-and-upgrades.md](exits-plugins-and-upgrades.md).
- Do not rely on attributes surviving between calls unless the instance creation mode is
  "reused", and even then only within one internal session.
- Keep limits and switches in a customizing table maintained with SM30 rather than in
  constants once more than one value is involved. The constants above keep the sample short.

## Calling a kernel BAdI

Get the BAdI object once, then call it as often as needed. When the filter value is the same
for the whole run, put `GET BADI` before the loop.

`GET BADI` selects implementations in this order: active implementations whose switch is on
(an implementation without a switch counts as on) and whose filter values match; if none,
implementations marked as default implementations; if none, the fallback class.

### Exceptions

| Exception | When it occurs | Handling |
|-----------|----------------|----------|
| `CX_BADI_NOT_IMPLEMENTED` | `GET BADI` on a single-use BAdI finds no active, default, or fallback implementation | Catch it where "no implementation" is a valid state, or define a fallback class |
| `CX_BADI_MULTIPLY_IMPLEMENTED` | `GET BADI` on a single-use BAdI finds several implementations that conflict resolution cannot reduce to one | Treat it as a configuration error: report it and stop |
| `CX_BADI_NOT_SINGLE_USE` | Superclass of the two exceptions above | Catch it when both cases are handled the same way |
| `CX_BADI_INITIAL_REFERENCE` | `CALL BADI` with an initial reference to a single-use BAdI | Do not call after a failed `GET BADI` |
| `CX_BADI_INITIAL_CONTEXT` | `GET BADI ... CONTEXT` with an initial context reference | Context-dependent BAdIs only |
| `CX_BADI_CONTEXT_ERROR`, `CX_BADI_FILTER_ERROR`, `CX_BADI_UNKNOWN_ERROR` | Dynamic `GET BADI` only: wrong context, wrong filters, or a BAdI that does not exist | Dynamic variant, 7.02 and later |

Multiple-use BAdIs never raise `CX_BADI_NOT_IMPLEMENTED` or `CX_BADI_MULTIPLY_IMPLEMENTED`.
`CALL BADI` on a multiple-use BAdI without implementations does nothing. The order in which
several implementations run is the same for every call; implement `BADI_SORTER` to define it.
If `GET BADI` raises an exception, a previously valid reference in the target variable is kept;
otherwise the variable is initial.

### Multiple-use BAdI

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
* Multiple use: no exception when nothing is implemented, and CALL BADI then does nothing.
  GET BADI go_badi.
  CALL BADI go_badi->on_saved
    EXPORTING
      iv_vbeln    = p_vbeln
    CHANGING
      ct_messages = gt_messages.
```

### Dynamic variant (SAP_BASIS 7.02 and later)

`GET BADI badi TYPE (name)` with `FILTERS` or `FILTER-TABLE`, and `CALL BADI badi->(meth)`,
arrived with 7.0 EhP2 (7.02). The reference must have the static type `CL_BADI_BASE`, the
method name must be in upper case, and `FILTER-TABLE` has the type `BADI_FILTER_BINDINGS` (one
line per filter: `NAME` in upper case and `VALUE` as a data reference). Do not use it on
7.00 or 7.01 (ECC 6.0 up to EHP4).

Take the BAdI and method names from a fixed list in your code, never from user input, and
catch the exceptions of both statements. A wrong filter name is not catchable: it ends in a
runtime error. Fragment:

```abap
DATA lo_badi TYPE REF TO cl_badi_base.
DATA lt_filters TYPE badi_filter_bindings.
DATA ls_filter LIKE LINE OF lt_filters.

ls_filter-name = 'VKORG'.
GET REFERENCE OF lv_vkorg INTO ls_filter-value.
INSERT ls_filter INTO TABLE lt_filters.
TRY.
    GET BADI lo_badi TYPE (lv_badi_name) FILTER-TABLE lt_filters.
    CALL BADI lo_badi->(lv_method) PARAMETER-TABLE lt_parameters.
  CATCH cx_badi_not_single_use cx_badi_unknown_error cx_badi_filter_error
        cx_badi_context_error cx_badi_initial_reference cx_sy_dyn_call_illegal_method.
*   Report the configuration error and leave the call point without a result.
    CLEAR lo_badi.
ENDTRY.
```

Offline parsers such as abaplint accept the dynamic `GET BADI` on 7.00 and 7.01, so check the
target release yourself before you use it. At the time of writing, abaplint also reports a
parser error for `FILTER-TABLE`, which SAP supports from 7.02; that error does not mean the
statement is wrong.

### Optional methods (SAP_BASIS 7.40 SP08 and later)

`METHODS meth DEFAULT IGNORE` makes an interface method optional: implementing classes may
leave it out, and a call then behaves like an empty method, which is also what `CALL BADI`
does for a method an implementation lacks. `DEFAULT FAIL` raises
`CX_SY_DYN_CALL_ILLEGAL_METHOD` when the method is called but not implemented. The addition
follows the method name directly, is allowed only in interfaces, and needs SAP_BASIS 7.40 SP08
or later (ECC 6.0 EHP7 on a stack with SAP_BASIS 7.40 SP08 or later, or EHP8). Read the
SAP_BASIS support package in System > Status; ERP 6.0 support package stacks are numbered
separately. On older releases, give every method an implementation instead:

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

### AMDP BAdIs (SAP_BASIS 7.40 SP08 and later, SAP HANA only)

BAdI methods can be AMDP methods implemented in SQLScript. SAP uses them where processing runs
in the database, for example in MRP Live on S/4HANA. They need SAP HANA (on ECC, a system on
SAP_BASIS 7.40 SP08 or later on SAP HANA), and AMDP source can only be edited in ADT. Copy the
method signature from the BAdI interface in the system; do not write it from memory.

AMDP does no implicit client handling. When the method reads a client-dependent table, for
example your own Z table, list the table after `USING` and filter its client column
explicitly: with the client parameter of the method if the interface has one, otherwise with
`SESSION_CONTEXT('CLIENT')`. Without the filter, the method reads the data of every client.

### Context-dependent BAdIs (note)

A BAdI with the instance creation mode "context-dependent" needs
`GET BADI badi CONTEXT con`, where `con` refers to an object whose class implements
`IF_BADI_CONTEXT`. One instance exists per context and implementing class. Migrated classic
BAdIs are created in this mode. You rarely need it for new BAdIs.

## Classic BAdIs

### Implementing an SAP classic BAdI

1. SE19 (or the IMG activity next to the Customizing): create an implementation of the
   classic BAdI. SE19 generates the implementing class.
2. Write the code between `METHOD if_ex_<badi>~<method>` and `ENDMETHOD`. SE19 generates one
   method per interface method; keep all of them.
3. Keep the class instantiable from outside (`CREATE PUBLIC`, not abstract). A private,
   protected, or abstract class causes short dumps at runtime.
4. Activate the implementation. A classic BAdI that is not multiple use can have several
   implementations, but only one can be active per filter value, or only one in total if the
   BAdI has no filter. A filter-dependent BAdI can therefore have one active implementation
   per country or sales organization, and the call runs the one that matches `FLT_VAL`.
5. Filter-dependent classic BAdIs pass the filter value in the importing parameter `FLT_VAL`
   of every method, and each implementation carries its filter values.

Classic BAdIs need no SSCR registration, and SAP guarantees that classic BAdI interfaces stay
upward compatible. If an import leaves several active implementations of a single-use classic
BAdI, resolve it in SE18 under Utilities > Adjustment > Multiple active implementations.

### Calling a classic BAdI from code you own

Only for existing call points; define new ones as kernel BAdIs. SE18 generates the interface
name (SAP's own BAdIs use `IF_EX_<badi>`); this example assumes the customer classic BAdI
`ZFA_ORDER_EXIT` with the generated interface `ZIF_EX_FA_ORDER_EXIT`. The block also shows an
implementing class:

<!-- abap-env: product=ecc release=ehp0 database=anydb -->
```abap
* file: src/zif_ex_fa_order_exit.intf.abap
INTERFACE zif_ex_fa_order_exit PUBLIC.
  METHODS change_net_value
    IMPORTING flt_val  TYPE vbak-vkorg
    CHANGING  cv_netwr TYPE vbak-netwr.
ENDINTERFACE.
* file: src/zcl_im_fa_order_exit_1000.clas.abap
CLASS zcl_im_fa_order_exit_1000 DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_ex_fa_order_exit.
ENDCLASS.

CLASS zcl_im_fa_order_exit_1000 IMPLEMENTATION.
  METHOD zif_ex_fa_order_exit~change_net_value.
    IF flt_val = '1000' AND cv_netwr < 0.
      cv_netwr = 0.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
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
*   Get the instance once and keep it. GET_INSTANCE reads the BAdI
*   management data, so calling it per document costs time.
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
*   With null_instance_accepted = 'X' there is no instance when no
*   implementation is active, so check before every call.
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

`CLASS cl_exithandler DEFINITION LOAD`, which older SAP samples show before the call, has been
obsolete since 7.02 and is not needed. Multiple-use classic BAdIs have no defined sequence,
so a later implementation can overwrite changing parameters set by an earlier one.

### Migrating your own classic BAdI

SE18 > Utilities > Migrate Classic BAdI creates an enhancement spot and a kernel BAdI with the
same name in context-dependent mode, adds `IF_BADI_INTERFACE` to the interface, and turns the
filter into separate filters. Rules:

- Migrate only BAdIs you own, and only in their original system. Never migrate SAP's BAdIs.
- Implementations in follow-up systems are migrated through SPAU (Migrations tab).
- Existing `CL_EXITHANDLER=>GET_INSTANCE` calls are not changed; SAP regenerates the proxy
  class so that they use `GET BADI` and `CALL BADI` internally. Rewrite your call points to
  `GET BADI` when you touch them.

## Function code and screen enhancements

- Kernel BAdI for function codes: no filters, single use, no switch, and no `GET BADI` or
  `CALL BADI`; the function code is added when the program is generated.
- Kernel BAdI for screens: instance creation mode "reused" and single use. Use
  `CL_ENH_BADI_RUNTIME_FUNCTIONS=>GET_PROG_AND_DYNP_FOR_SUBSCR` instead of the
  `CL_EXITHANDLER` method of the same name.
- Classic BAdIs: menu enhancements (function codes starting with `+`) work only for single-use
  BAdIs without filters; screen enhancements do not work for multiple-use BAdIs.

## Sources

Checked on 2026-10-15.

- ABAP Keyword Documentation 7.58: [GET BADI](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abapget_badi.htm), [CALL BADI](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abapcall_badi.htm), [AMDP client handling](https://help.sap.com/doc/abapdocu_758_index_htm/7.58/en-US/abenamdp_client_handling.htm)
- ABAP Development Tools: [development objects with an Eclipse-based editor](https://help.sap.com/docs/ABAP_Cloud/bbcee501b99848bdadecd4e290db3ae4/ab03dcd9072f4a2d85c945d05929d3fb.html?version=s4_hana) (BAdI definitions and implementations from AS ABAP 7.57 FPS00)
- ABAP Keyword Documentation, release news: [Enhancement Framework in 7.0](https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abennews-70-enhancement.htm), [enhancements in 7.0 EhP2](https://help.sap.com/docs/ABAP_Cloud/abap-cloud-docs_abap-keyword-documentation_abap_keyword_documentation_classic/abennews-71-enhancements.html?version=classic_2025), [METHODS ... DEFAULT](https://help.sap.com/docs/ABAP_Cloud/abap-cloud-docs_abap-keyword-documentation_abap_keyword_documentation_classic/abapmethods_default.html?version=classic_2025)
- ABAP platform 2025 documentation: [BAdI definition](https://help.sap.com/docs/ABAP_PLATFORM_NEW/46a2cfc13d25463b8b9a3d2a3c3ba0d9/32a83942424dac04e10000000a1550b0.html?version=202510.002), [BAdI implementation](https://help.sap.com/docs/ABAP_PLATFORM_NEW/46a2cfc13d25463b8b9a3d2a3c3ba0d9/44f518d884056c30e10000000a114a6b.html?version=202510.002), [fallback class](https://help.sap.com/docs/ABAP_PLATFORM_NEW/46a2cfc13d25463b8b9a3d2a3c3ba0d9/44f6cd83912541aae10000000a114a6b.html?version=202510.002), [migrating classic BAdIs](https://help.sap.com/docs/ABAP_PLATFORM_NEW/46a2cfc13d25463b8b9a3d2a3c3ba0d9/27703b42ea85b26be10000000a155106.html?version=202510.002), [calling classic BAdIs](https://help.sap.com/docs/ABAP_PLATFORM_NEW/2b28ffa716c24348903f8ffbfeb81df8/eb3e7cf1940e11d295df0000e82de14a.html?version=202510.002)
- ABAP platform 2023 documentation: [multiple-use BAdIs](https://help.sap.com/docs/ABAP_PLATFORM_NEW/46a2cfc13d25463b8b9a3d2a3c3ba0d9/e45c3642eca5033be10000000a1550b0.html?version=202310.latest)
- SAP NetWeaver 7.0 EhP1 documentation: [classic BAdIs](https://help.sap.com/doc/saphelp_em700_ehp01/7.0.1/en-US/e6/d54d3c596f0b26e10000000a11402f/content.htm), [call sequence with filter values](https://help.sap.com/doc/saphelp_em700_ehp01/7.0.1/en-US/fc/dd82ee1ddea043aa9f3e7865310635/content.htm)
- SAP R/3 4.6C documentation: [filter-dependent Business Add-Ins](https://help.sap.com/saphelp_46c/helpdata/en/eb/3e7cf7940e11d295df0000e82de14a/content.htm)
