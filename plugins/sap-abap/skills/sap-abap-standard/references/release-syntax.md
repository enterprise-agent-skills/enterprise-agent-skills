# ABAP syntax by release

The release that decides which ABAP compiles is the SAP_BASIS component, not the product
name. Find it in SAP GUI under System > Status > Component information (component SAP_BASIS,
release and support package). For SAP_BASIS 7.40 the support package matters as well, because
SAP added syntax in SP02, SP05, and SP08.

## Product releases and SAP_BASIS

<!-- BEGIN GENERATED: sap-release-map (edit with npm run build) -->
| SAP_BASIS | SAP ECC 6.0 | SAP NetWeaver AS ABAP | SAP S/4HANA (on-premise) | SAP S/4HANA Cloud Private Edition |
| --- | --- | --- | --- | --- |
| 7.00 | 6.0 without EHP, EHP1, EHP2, EHP3 | 7.0 |  |  |
| 7.01 | EHP4 | 7.0 EHP1 |  |  |
| 7.02 | EHP5 | 7.0 EHP2 |  |  |
| 7.30 |  | 7.3 |  |  |
| 7.31 | EHP6 | 7.0 EHP3, 7.3 EHP1 |  |  |
| 7.40 | EHP6 for SAP HANA, EHP7 | 7.4 |  |  |
| 7.50 | EHP8 | 7.5 | 1511 |  |
| 7.51 |  | AS ABAP 7.51 innovation package | 1610 |  |
| 7.52 |  | AS ABAP 7.52 | 1709 |  |
| 7.53 |  |  | 1809 |  |
| 7.54 |  |  | 1909 |  |
| 7.55 |  |  | 2020 | 2020 |
| 7.56 |  |  | 2021 | 2021 |
| 7.57 |  |  | 2022 | 2022 |
| 7.58 |  |  | 2023 | 2023 |
| 8.16 |  |  | 2025 | 2025 |
<!-- END GENERATED: sap-release-map -->

Notes from SAP's release news and platform documentation:

- 7.01 has no ABAP language changes compared with 7.00. Treat ECC 6.0 EHP4 like 7.00.
- 7.02 brought most of the modern basics (string templates, string functions, secondary
  keys, pragmas, method chaining) as a port of the 7.1/7.2 codeline.
- SAP NetWeaver 7.0 EHP3 (7.03) was renamed 7.3 EHP1 (7.31). Both are SAP_BASIS 731, which
  has hardly any language changes compared with 7.02 (chained method calls became usable as
  statements). ECC 6.0 EHP6 runs on it.
- NetWeaver 7.3 (7.30) belongs to a separate release track; 7.31 is not its successor.
- The enhancement package fixes the platform release: the platform cannot be upgraded on its
  own. SAP_APPL in System > Status shows the EHP (604 = EHP4 up to 618 = EHP8).
  ECC 6.0 EHP6 for SAP HANA (SAP_APPL 616) is the exception and runs on 7.40.
- ECC on SAP HANA needs SAP_BASIS 7.40 or later. S/4HANA always runs on SAP HANA.
- S/4HANA 2025 runs ABAP release 8.16, the successor of 7.58. There is no ABAP 7.59 and no
  S/4HANA 2024.

## Features by release

Each row gives the first SAP_BASIS release that supports the feature, according to SAP's
release news, an example, and what to write on older releases.

<!-- BEGIN GENERATED: abap-language-features (edit with npm run build) -->
| Since | Feature | Example | On older releases | Offline check |
| --- | --- | --- | --- | --- |
| 7.02 | String templates | `\|Order { lv_vbeln } saved\|` | CONCATENATE ... INTO, or WRITE ... TO | abaplint |
| 7.02 | Concatenation operator && | `lv_text = lv_a && lv_b.` | CONCATENATE lv_a lv_b INTO lv_text. | rule `string-concat-operator` |
| 7.02 | Built-in string functions (condense( ), to_upper( ), substring( ), and others) | `lv_text = to_upper( lv_text ).` | TRANSLATE ... TO UPPER CASE, CONDENSE, offset and length access | rule `string-functions` |
| 7.02 | Pragmas such as ##NEEDED | `DATA lv_unused TYPE i ##NEEDED.` | Pseudo comments, for example "#EC NEEDED | abaplint |
| 7.02 | Chained method calls in operand positions | `lo_column = lo_alv->get_columns( )->get_column( 'VBELN' ).` | Store each intermediate reference in a variable | rule `method-chaining` |
| 7.02 | Secondary table keys | `WITH NON-UNIQUE SORTED KEY by_name COMPONENTS name1` | A second, sorted copy of the table, or SORT plus READ TABLE ... BINARY SEARCH | rule `secondary-table-keys` |
| 7.02 | Dynamic BAdI access, GET BADI ... TYPE (name) and CALL BADI badi->(method) | `GET BADI lo_badi TYPE (lv_badi_name).` | Static GET BADI with a reference typed with the BAdI | rule `dynamic-badi-access` |
| 7.02 | RISK LEVEL and DURATION additions for test classes | `CLASS ltc_report DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.` | Pseudo comments "#AU Risk_Level Harmless and "#AU Duration Short after FOR TESTING | rule `abap-unit-test-properties` |
| 7.02 | Assertion class CL_ABAP_UNIT_ASSERT | `cl_abap_unit_assert=>assert_equals( act = lv_total exp = 300 ).` | cl_aunit_assert=>assert_equals( act = lv_total exp = 300 ). | rule `abap-unit-assert-class` |
| 7.31 | Chained method call as a standalone statement | `lo_alv->get_functions( )->set_all( abap_true ).` | Store the intermediate reference in a variable, then call the method on it | rule `chained-call-statement` |
| 7.40 SP02 | Inline declarations DATA( ) and FIELD-SYMBOL( ) | `DATA(lv_count) = lines( lt_orders ).  LOOP AT lt_orders INTO DATA(ls_order).` | Declare every variable and field symbol with DATA or FIELD-SYMBOLS first | abaplint |
| 7.40 SP02 | VALUE constructor operator | `lt_numbers = VALUE #( ( 1 ) ( 2 ) ).` | APPEND or INSERT each line | abaplint |
| 7.40 SP02 | NEW constructor operator | `lo_reader = NEW #( ).` | CREATE OBJECT lo_reader. or CREATE DATA lr_data. | abaplint |
| 7.40 SP02 | CONV, CAST, REF, and EXACT constructor operators | `lo_type = CAST cl_abap_typedescr( lo_object ).` | Helper variables for conversions; ?= for down casts; GET REFERENCE OF | abaplint |
| 7.40 SP02 | COND and SWITCH conditional operators | `` lv_text = COND #( WHEN lv_amount > 0 THEN `credit` ELSE `debit` ). `` | IF or CASE blocks that assign the variable | abaplint |
| 7.40 SP02 | Table expressions itab[ ... ] | `ls_order = lt_orders[ vbeln = lv_vbeln ].` | READ TABLE ... INTO ... WITH KEY, then check sy-subrc | abaplint |
| 7.40 SP02 | Predicate function line_exists( ) | `IF line_exists( lt_orders[ vbeln = lv_vbeln ] ).` | READ TABLE ... TRANSPORTING NO FIELDS, then check sy-subrc | abaplint; accepted from 7.40 SP08 only |
| 7.40 SP02 | Empty primary table key WITH EMPTY KEY | `TYPES ty_numbers TYPE STANDARD TABLE OF i WITH EMPTY KEY.` | WITH DEFAULT KEY, or an explicit key | abaplint |
| 7.40 SP02 | WAIT FOR ASYNCHRONOUS TASKS for asynchronous RFC callbacks | `WAIT FOR ASYNCHRONOUS TASKS UNTIL gv_done = abap_true UP TO 30 SECONDS.` | WAIT UNTIL gv_done = abap_true UP TO 30 SECONDS. | rule `wait-for-asynchronous-tasks` |
| 7.40 SP02 | Integer power function ipow( ) | `lv_result = ipow( base = lv_base exp = 3 ).` | The ** operator, for example lv_result = lv_base ** 3. | rule `ipow-function` |
| 7.40 SP05 | ABAP SQL with comma-separated lists and @ host variables | `SELECT vbeln, erdat FROM vbak INTO TABLE @lt_orders WHERE vkorg = @p_vkorg.` | SELECT vbeln erdat FROM vbak INTO TABLE lt_orders WHERE vkorg = p_vkorg. | abaplint |
| 7.40 SP05 | CORRESPONDING constructor operator | `ls_target = CORRESPONDING #( ls_source ).` | MOVE-CORRESPONDING ls_source TO ls_target. | abaplint |
| 7.40 SP05 | LET expressions in constructor expressions | `lv_text = COND #( LET n = lines( lt_items ) IN WHEN n > 0 THEN ... ).` | A helper variable assigned before the expression | rule `let-expressions` |
| 7.40 SP05 | Table comprehensions, FOR ... IN in VALUE and NEW | `lt_doubled = VALUE #( FOR n IN lt_numbers ( n * 2 ) ).` | LOOP AT ... with APPEND | abaplint |
| 7.40 SP05 | DDIC-based CDS view (DEFINE VIEW with @AbapCatalog.sqlViewName) | `@AbapCatalog.sqlViewName: 'ZFAVORDER' define view ZFA_I_Order as select from vbak { ... }` | Dictionary database view (SE11) or a join in ABAP SQL | rule `cds-ddic-based-view` |
| 7.40 SP08 | Inline declarations in ABAP SQL, INTO TABLE @DATA( ) | `SELECT vbeln, erdat FROM vbak WHERE vkorg = @p_vkorg INTO TABLE @DATA(lt_orders).` | Declare the target table first and use INTO TABLE @lt_orders | rule `sql-inline-declarations` |
| 7.40 SP08 | INTO as the last clause of SELECT | `SELECT vbeln, erdat FROM vbak WHERE vkorg = @p_vkorg INTO TABLE @lt_orders.` | Put INTO directly after FROM, before WHERE | rule `sql-into-last` |
| 7.40 SP08 | Searched CASE in ABAP SQL, CASE WHEN condition | `CASE WHEN netwr > 1000 THEN 'L' ELSE 'S' END AS size_class` | Simple CASE (CASE column WHEN value ...) in SQL, or classify the rows in ABAP | rule `sql-searched-case` |
| 7.40 SP08 | Conditional iterations FOR ... UNTIL and FOR ... WHILE | `lt_numbers = VALUE #( FOR i = 1 UNTIL i > 10 ( i ) ).` | DO or WHILE loop with APPEND | rule `conditional-iterations` |
| 7.40 SP08 | REDUCE operator | `lv_sum = REDUCE i( INIT s = 0 FOR n IN lt_numbers NEXT s = s + n ).` | LOOP AT ... with a running total | abaplint |
| 7.40 SP08 | FILTER operator | `lt_open = FILTER #( lt_orders WHERE status = 'A' ).` | LOOP AT ... WHERE with INSERT or APPEND | abaplint |
| 7.40 SP08 | LOOP AT ... GROUP BY | `LOOP AT lt_orders INTO DATA(ls_order) GROUP BY ls_order-kunnr.` | SORT, then LOOP with AT NEW or a comparison with the previous line | abaplint |
| 7.40 SP08 | BASE addition in VALUE, NEW, and CORRESPONDING | `lt_numbers = VALUE #( BASE lt_numbers ( 4 ) ).` | APPEND or INSERT into the existing table | rule `base-addition` |
| 7.40 SP08 | LINES OF inside VALUE and NEW | `lt_all = VALUE #( ( LINES OF lt_open ) ( LINES OF lt_closed ) ).` | APPEND LINES OF ... TO ... | rule `value-lines-of` |
| 7.40 SP08 | Optional interface methods, METHODS ... DEFAULT IGNORE or FAIL | `METHODS check_order DEFAULT IGNORE IMPORTING is_order TYPE vbak.` | Every implementing class implements every interface method, at least as an empty method | abaplint |
| 7.40 SP08 | OPTIONAL and DEFAULT for table expressions | `ls_order = VALUE #( lt_orders[ vbeln = lv_vbeln ] OPTIONAL ).` | READ TABLE ... with a sy-subrc check, or TRY ... CATCH cx_sy_itab_line_not_found | abaplint |
| 7.40 SP08 | Boolean function xsdbool( ) | `lv_is_open = xsdbool( lv_status = 'A' ).` | IF ... with abap_true and abap_false | abaplint |
| 7.50 | Test seams TEST-SEAM and TEST-INJECTION (class pools and function pools) | `TEST-SEAM read_orders. ... END-TEST-SEAM.` | Put database access behind an interface and inject a test double | abaplint |
| 7.50 | Host expressions @( ... ) in ABAP SQL | `WHERE erdat >= @( sy-datum - 30 )` | Compute the value into a variable and use @lv_value | rule `sql-host-expressions` |
| 7.50 | UNION in ABAP SQL | `SELECT ... UNION SELECT ... INTO TABLE @lt_result.` | Two SELECT statements, the second with APPENDING | abaplint |
| 7.50 | Predicate IS INSTANCE OF and CASE TYPE OF | `IF lo_object IS INSTANCE OF zcl_fa_order.` | Down cast with ?= inside TRY ... CATCH cx_sy_move_cast_error | abaplint |
| 7.51 | Common table expressions WITH in ABAP SQL | `WITH +open AS ( SELECT ... ) SELECT ... FROM +open INTO TABLE @lt_result.` | Subqueries, joins, or two statements | abaplint |
| 7.51 | Enumerated types BEGIN OF ENUM | `TYPES: BEGIN OF ENUM ty_status, open, closed, END OF ENUM ty_status.` | A structure of constants | abaplint |
| 7.51 | OFFSET in ABAP SQL | `ORDER BY vbeln INTO TABLE @lt_page UP TO 50 ROWS OFFSET 100` | Read UP TO offset plus page size rows and delete the leading rows, or use a cursor | abaplint |
| 7.52 | Internal table as data source, SELECT ... FROM @itab | `SELECT kunnr, SUM( netwr ) AS netwr FROM @lt_orders AS o GROUP BY kunnr INTO TABLE @lt_totals.` | Process the internal table with LOOP, SORT, or COLLECT | abaplint |
| 7.54 | Calculation assignments +=, -=, *=, /= | `lv_total += ls_item-netwr.` | lv_total = lv_total + ls_item-netwr. | abaplint |
| 7.54 | Built-in time stamp type utclong and utclong_current( ) | `DATA lv_created TYPE utclong.  lv_created = utclong_current( ).` | Packed time stamps of type TIMESTAMPL with GET TIME STAMP FIELD | rule `utclong-type` |
| 7.55 | CDS view entity (DEFINE VIEW ENTITY) | `define view entity ZFA_I_Order as select from vbak { ... }` | DDIC-based CDS view with @AbapCatalog.sqlViewName | rule `cds-view-entity` |
| 7.57 | Immutable inline declarations FINAL( ) | `FINAL(lv_limit) = 100.` | DATA( ) inline declaration, or CONSTANTS | abaplint |
| 7.57 | STEP addition for LOOP AT | `LOOP AT lt_items INTO ls_item STEP -1.` | WHILE loop with READ TABLE ... INDEX | abaplint |
<!-- END GENERATED: abap-language-features -->

## Writing code that compiles on the target

1. Write for the lowest release that has to run the code. Code shared between systems through
   transports or abapGit must compile on the oldest one.
2. One statement the release does not know is a syntax error that blocks activation of the
   whole program, class, or function group, not just that line.
3. On SAP_BASIS 7.40 with an unknown support package, use only SP02 features, or ask.
4. Do not mix classic and new ABAP SQL in one statement. A comma-separated list or an `@`
   host variable switches the statement to strict mode, where every host variable needs `@`.
5. On 7.00 and 7.01 (ECC 6.0 up to EHP4), test classes use the pseudo comments
   `"#AU Risk_Level Harmless` and `"#AU Duration Short` instead of the `RISK LEVEL` and
   `DURATION` additions, and assertions use `CL_AUNIT_ASSERT` instead of
   `CL_ABAP_UNIT_ASSERT`.
6. A table expression `itab[ ... ]` raises `CX_SY_ITAB_LINE_NOT_FOUND` when no line matches.
   Use `line_exists( )`, `OPTIONAL` or `DEFAULT` (7.40 SP08), or `READ TABLE` with a
   `sy-subrc` check.
7. Before 7.02, only the right side of an assignment accepts calculations, built-in
   functions, and method calls freely. Operands of comparisons (`IF a + b < lo->max( )`) and
   actual parameters of methods (`m1( m2( ) )`) became general expression positions in 7.02.
   On 7.00 and 7.01 assign the value to a helper variable first.

## Release-dependent frameworks and tools

| Capability | Available from | Notes |
|------------|----------------|-------|
| ABAP Unit test classes | 7.00 | `RISK LEVEL` and `DURATION` additions and `CL_ABAP_UNIT_ASSERT` from 7.02 |
| Runtime analysis SAT | 7.02 | Replaces SE30 |
| ABAP Test Cockpit (ATC) | 7.02 SP12 | Code Inspector (SCI) and the extended program check (SLIN) exist on all releases |
| ABAP Development Tools for Eclipse (VS Code tools since Q2 2026, ABAP Cloud first: SAP BTP, S/4HANA Cloud, S/4HANA 2025 and later) | 7.31 SP04 | On 7.00 to 7.02 use SAP GUI (SE80, SE38, SE24, SE37, SE11). Some ADT editors need later releases, for example DDIC objects 7.40 SP02. The VS Code scope follows SAP's tutorial prerequisites, checked on 2026-10-18 |
| `INTERFACES ... PARTIALLY IMPLEMENTED` in test classes | 7.40 SP02 | Simplifies hand-written test doubles |
| ABAP CDS views (DDIC-based) | 7.40 SP05 | Any database; `@AbapCatalog.sqlViewName` required; edited only in ADT |
| AMDP | 7.40 SP05 | SAP HANA only; edited only in ADT |
| CDS access control (DCL) | 7.40 SP10 | Evaluated implicitly by ABAP SQL from 7.50 |
| CDS view parameters on every database | 7.50 | Before 7.50 only where `CL_ABAP_DBFEATURES` reports support |
| Test seams | 7.50 | Class pools and function pools only; prefer dependency injection through interfaces |
| CDS table functions | 7.50 | SAP HANA only (implemented with AMDP) |
| CDS view entities | 7.55 | Recommended over DDIC-based views, which the 7.57 documentation marks obsolete but still supports |
