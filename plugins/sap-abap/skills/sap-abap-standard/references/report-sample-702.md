# Report sample for SAP_BASIS 7.02 and 7.31

The same report as [report-sample-750.md](report-sample-750.md), written for ECC 6.0 EHP5 and
EHP6 (SAP_BASIS 7.02 and 7.31). It avoids every 7.40 feature: no inline declarations, no
constructor operators, the classic ABAP SQL syntax without commas or `@`, `COLLECT` instead of
grouping, and `CREATE OBJECT` instead of `NEW`.

Code written this way also compiles on every newer release. For 7.00 and 7.01 (ECC 6.0 up to
EHP4), change the test class as shown in
[quality-and-operations.md](quality-and-operations.md): pseudo comments instead of
`RISK LEVEL` and `DURATION`, and `CL_AUNIT_ASSERT` instead of `CL_ABAP_UNIT_ASSERT`.

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_sales_orders_702.prog.abap
REPORT zfa_sales_orders_702.

DATA gv_erdat TYPE erdat.

PARAMETERS p_vkorg TYPE vkorg OBLIGATORY.
SELECT-OPTIONS s_erdat FOR gv_erdat OBLIGATORY.

CLASS lcl_report DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES:
      BEGIN OF ty_order,
        vbeln TYPE vbak-vbeln,
        erdat TYPE vbak-erdat,
        auart TYPE vbak-auart,
        kunnr TYPE vbak-kunnr,
        netwr TYPE vbak-netwr,
        waerk TYPE vbak-waerk,
      END OF ty_order,
      tt_orders TYPE STANDARD TABLE OF ty_order WITH DEFAULT KEY,
      BEGIN OF ty_total,
        waerk TYPE vbak-waerk,
        netwr TYPE vbak-netwr,
      END OF ty_total,
      tt_totals TYPE SORTED TABLE OF ty_total WITH UNIQUE KEY waerk,
      tt_erdat_range TYPE RANGE OF erdat.

    METHODS select_orders
      IMPORTING iv_vkorg         TYPE vkorg
                it_erdat         TYPE tt_erdat_range
      RETURNING value(rt_orders) TYPE tt_orders.

    METHODS total_by_currency
      IMPORTING it_orders        TYPE tt_orders
      RETURNING value(rt_totals) TYPE tt_totals.

    METHODS display
      CHANGING ct_orders TYPE tt_orders.
ENDCLASS.

CLASS lcl_report IMPLEMENTATION.
  METHOD select_orders.
    SELECT vbeln erdat auart kunnr netwr waerk
      FROM vbak
      INTO TABLE rt_orders
      UP TO 5000 ROWS
      WHERE vkorg = iv_vkorg
        AND erdat IN it_erdat
      ORDER BY vbeln.
  ENDMETHOD.

  METHOD total_by_currency.
    DATA ls_order TYPE ty_order.
    DATA ls_total TYPE ty_total.
    LOOP AT it_orders INTO ls_order.
      ls_total-waerk = ls_order-waerk.
      ls_total-netwr = ls_order-netwr.
      COLLECT ls_total INTO rt_totals.
    ENDLOOP.
  ENDMETHOD.

  METHOD display.
    DATA lo_alv TYPE REF TO cl_salv_table.
    DATA lo_functions TYPE REF TO cl_salv_functions_list.
    DATA lo_columns TYPE REF TO cl_salv_columns_table.
    DATA lx_salv TYPE REF TO cx_salv_msg.
    TRY.
        cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                                CHANGING  t_table      = ct_orders ).
        lo_functions = lo_alv->get_functions( ).
        lo_functions->set_all( abap_true ).
        lo_columns = lo_alv->get_columns( ).
        lo_columns->set_optimize( abap_true ).
        lo_alv->display( ).
      CATCH cx_salv_msg INTO lx_salv.
        MESSAGE lx_salv TYPE 'E'.
    ENDTRY.
  ENDMETHOD.
ENDCLASS.

CLASS ltc_report DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS sums_amounts_per_currency FOR TESTING.
ENDCLASS.

CLASS ltc_report IMPLEMENTATION.
  METHOD sums_amounts_per_currency.
    DATA lo_report TYPE REF TO lcl_report.
    DATA lt_orders TYPE lcl_report=>tt_orders.
    DATA ls_order TYPE lcl_report=>ty_order.
    DATA lt_totals TYPE lcl_report=>tt_totals.
    DATA ls_total TYPE lcl_report=>ty_total.

    ls_order-netwr = '100.00'.
    ls_order-waerk = 'EUR'.
    APPEND ls_order TO lt_orders.
    ls_order-netwr = '50.00'.
    APPEND ls_order TO lt_orders.
    ls_order-netwr = '70.00'.
    ls_order-waerk = 'USD'.
    APPEND ls_order TO lt_orders.

    CREATE OBJECT lo_report.
    lt_totals = lo_report->total_by_currency( lt_orders ).

    cl_abap_unit_assert=>assert_equals( act = lines( lt_totals ) exp = 2 ).
    READ TABLE lt_totals INTO ls_total WITH TABLE KEY waerk = 'EUR'.
    cl_abap_unit_assert=>assert_subrc( exp = 0 ).
    cl_abap_unit_assert=>assert_equals( act = ls_total-netwr exp = '150.00' ).
  ENDMETHOD.
ENDCLASS.

DATA go_report TYPE REF TO lcl_report.
DATA gt_orders TYPE lcl_report=>tt_orders.

AT SELECTION-SCREEN.
  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
    ID 'VKORG' FIELD p_vkorg
    ID 'VTWEG' DUMMY
    ID 'SPART' DUMMY
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'No display authorization for sales organization' p_vkorg.
  ENDIF.

START-OF-SELECTION.
  CREATE OBJECT go_report.
  gt_orders = go_report->select_orders( iv_vkorg = p_vkorg
                                        it_erdat = s_erdat[] ).
  IF gt_orders IS INITIAL.
    MESSAGE 'No sales orders found for the selection' TYPE 'S' DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.
  go_report->display( CHANGING ct_orders = gt_orders ).
```

Differences from the 7.50 version:

| 7.50 version | 7.02 version |
|--------------|--------------|
| `DATA(lo_report) = NEW lcl_report( ).` | `DATA lo_report TYPE REF TO lcl_report.` then `CREATE OBJECT lo_report.` |
| `SELECT vbeln, erdat ... WHERE vkorg = @iv_vkorg ... INTO TABLE @rt_orders` | `SELECT vbeln erdat ... INTO TABLE rt_orders ... WHERE vkorg = iv_vkorg` |
| `LOOP AT ... GROUP BY` with `REDUCE` | `COLLECT` into a sorted table |
| `WITH EMPTY KEY` | `WITH DEFAULT KEY` |
| `MESSAGE |text { p_vkorg }| TYPE E` | `MESSAGE e398(00) WITH ... p_vkorg` (message class 00, number 398 shows four placeholders) |
