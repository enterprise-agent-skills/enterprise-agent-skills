# Report sample for SAP_BASIS 7.50 and later

A complete executable program for ECC 6.0 EHP8 and S/4HANA: selection screen, authorization
check, ABAP SQL with the 7.40 SP05 syntax, grouping with `LOOP AT ... GROUP BY` and `REDUCE`,
ALV output with `CL_SALV_TABLE`, and an ABAP Unit test. It reads table VBAK, which exists in
both ECC and S/4HANA.

The program needs SAP_BASIS 7.40 SP08 or later: `LOOP AT ... GROUP BY` and `REDUCE` arrived
in SP08. It does not compile on 7.40 SP05 or on 7.31; use
[report-sample-702.md](report-sample-702.md) on older releases.

Before using it, create the program in SE38 or ADT, maintain selection texts for `P_VKORG`
and `S_ERDAT`, and replace the authorization object if your organization uses a different
one for sales documents.

<!-- abap-env: product=ecc release=ehp8 database=anydb -->
```abap
* file: src/zfa_sales_orders_750.prog.abap
REPORT zfa_sales_orders_750.

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
      tt_orders TYPE STANDARD TABLE OF ty_order WITH EMPTY KEY,
      BEGIN OF ty_total,
        waerk TYPE vbak-waerk,
        netwr TYPE vbak-netwr,
      END OF ty_total,
      tt_totals TYPE SORTED TABLE OF ty_total WITH UNIQUE KEY waerk,
      tt_erdat_range TYPE RANGE OF erdat.

    METHODS select_orders
      IMPORTING iv_vkorg         TYPE vkorg
                it_erdat         TYPE tt_erdat_range
      RETURNING VALUE(rt_orders) TYPE tt_orders.

    METHODS total_by_currency
      IMPORTING it_orders        TYPE tt_orders
      RETURNING VALUE(rt_totals) TYPE tt_totals.

    METHODS display
      CHANGING ct_orders TYPE tt_orders.
ENDCLASS.

CLASS lcl_report IMPLEMENTATION.
  METHOD select_orders.
    SELECT vbeln, erdat, auart, kunnr, netwr, waerk
      FROM vbak
      WHERE vkorg = @iv_vkorg
        AND erdat IN @it_erdat
      ORDER BY vbeln
      INTO TABLE @rt_orders
      UP TO 5000 ROWS.
  ENDMETHOD.

  METHOD total_by_currency.
    LOOP AT it_orders INTO DATA(ls_order)
         GROUP BY ls_order-waerk INTO DATA(lv_currency).
      rt_totals = VALUE #( BASE rt_totals
                           ( waerk = lv_currency
                             netwr = REDUCE #( INIT sum = CONV vbak-netwr( 0 )
                                               FOR member IN GROUP lv_currency
                                               NEXT sum = sum + member-netwr ) ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD display.
    TRY.
        cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_alv)
                                CHANGING  t_table      = ct_orders ).
        lo_alv->get_functions( )->set_all( abap_true ).
        lo_alv->get_columns( )->set_optimize( abap_true ).
        lo_alv->display( ).
      CATCH cx_salv_msg INTO DATA(lx_salv).
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
    DATA(lo_report) = NEW lcl_report( ).
    DATA(lt_totals) = lo_report->total_by_currency(
      VALUE #( ( netwr = '100.00' waerk = 'EUR' )
               ( netwr = '50.00'  waerk = 'EUR' )
               ( netwr = '70.00'  waerk = 'USD' ) ) ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt_totals ) exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = lt_totals[ waerk = 'EUR' ]-netwr exp = '150.00' ).
  ENDMETHOD.
ENDCLASS.

AT SELECTION-SCREEN.
  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
    ID 'VKORG' FIELD p_vkorg
    ID 'VTWEG' DUMMY
    ID 'SPART' DUMMY
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE |No display authorization for sales organization { p_vkorg }| TYPE 'E'.
  ENDIF.

START-OF-SELECTION.
  DATA(go_report) = NEW lcl_report( ).
  DATA(gt_orders) = go_report->select_orders( iv_vkorg = p_vkorg
                                              it_erdat = s_erdat[] ).
  IF gt_orders IS INITIAL.
    MESSAGE 'No sales orders found for the selection' TYPE 'S' DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.
  go_report->display( CHANGING ct_orders = gt_orders ).
```

Release notes for this sample:

- `DATA( )`, `NEW`, `VALUE`, table expressions, and `WITH EMPTY KEY` need 7.40 SP02.
- Comma-separated select lists and `@` host variables need 7.40 SP05.
- `LOOP AT ... GROUP BY` and `REDUCE` need 7.40 SP08.
