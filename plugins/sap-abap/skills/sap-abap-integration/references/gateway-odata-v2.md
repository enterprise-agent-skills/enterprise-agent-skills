# SAP Gateway OData V2 services with SEGW

SEGW (Service Builder) builds OData V2 services on SAP Gateway. You model entity types and
entity sets, generate the runtime classes, and implement the data access by redefining methods
in the generated data provider class. This file covers the provider code. RAP and OData V4
with ABAP Cloud on S/4HANA 2022 or later belong to sap-rap-business-object; RAP in Standard
ABAP (S/4HANA 1909 to 2021) and code-based OData V4 in SAP Gateway are not covered here.

## Availability by release

| System | Gateway software | Notes |
|--------|------------------|-------|
| NetWeaver 7.0 SP18 to 7.31 (ECC 6.0 up to EHP6) | SAP Gateway 2.0 add-ons, IW_BEP in the backend | SAP documents the `io_tech_request_context` methods below for SAP_GWFND 7.40 (documentation version SP15); on the add-on, check in SE24 that they exist |
| 7.40 and later (ECC 6.0 EHP7 and EHP8, S/4HANA) | SAP_GWFND, installed as standard; contains GW_CORE, IW_FND, IW_BEP, IW_HDB | Up to 7.51 delivered with the SAP Fiori front-end server; from 7.52 updated with the AS ABAP |
| 7.50 SP04 and later | SAP_GWFND with OData V4 | OData V4 is outside this skill |
| S/4HANA 1909 and later | SAP_GWFND, plus RAP | SEGW is still shipped and documented in 2025, but SAP recommends RAP for new custom services (limited feature set in 1909 and 2020, complete from 2021) |

Deployment: the service runs either embedded in the backend system or on a separate hub
(front-end server) that calls the backend. SAP recommends embedded deployment for S/4HANA. For
hub deployment with development in the backend, the SEGW case in this file, the backend needs
the IW_BEP add-on or SAP_GWFND on NetWeaver 7.50 or later. With development on the hub, the
backend needs no SAP Gateway component.

## Generated classes: where your code goes

"Generate Runtime Objects" in SEGW creates, for project `ZFA_PRODUCT`:

| Object | Purpose | Edit? |
|--------|---------|-------|
| `ZCL_ZFA_PRODUCT_MPC` | Model provider base class | No, regenerated |
| `ZCL_ZFA_PRODUCT_MPC_EXT` | Model provider subclass | Yes, created once |
| `ZCL_ZFA_PRODUCT_DPC` | Data provider base class | No, regenerated |
| `ZCL_ZFA_PRODUCT_DPC_EXT` | Data provider subclass | Yes, created once |
| `ZFA_PRODUCT_MDL`, `ZFA_PRODUCT_SRV` | Model and service names | Registered by the generator |

Regeneration overwrites the base classes; the `_EXT` classes survive. Put data access code
into `ZCL_ZFA_PRODUCT_DPC_EXT` with "Redefine": double-clicking a method opens the base class,
and changes there are lost on the next generation. Put model changes that SEGW cannot express,
such as annotations or property facets, into a redefinition of `DEFINE` in
`ZCL_ZFA_PRODUCT_MPC_EXT`. Never create, change, or transport the generated base classes
yourself, and deliver only the `_EXT` classes in an answer.

For each entity set the DPC has `<ENTITYSET>_CREATE_ENTITY`, `_GET_ENTITY`,
`_GET_ENTITYSET`, `_UPDATE_ENTITY`, and `_DELETE_ENTITY`, for example
`PRODUCTSET_GET_ENTITYSET`. Methods you do not redefine raise `/IWBEP/CX_MGW_NOT_IMPL_EXC`.
Names are cut to 30 characters: an entity set `SalesOrderCollection` gives
`SALESORDERCOLLEC_GET_ENTITYSET`.

## GET_ENTITYSET with $filter, $orderby, paging, and counts (ECC 6.0 EHP8, SAP_GWFND 7.50)

Who handles which query option, according to SAP's documentation:

| Query option | Handled by |
|--------------|------------|
| `$select`, `$expand`, `$format`, `$value`, reading `$links` | The framework |
| `$count` | The framework counts the rows you return, unless you set `es_response_context-count` |
| `$filter`, `$orderby`, `$top`, `$skip`, `$inlinecount`, `$skiptoken` | Your code |

Read the request through `io_tech_request_context` (interface `/IWBEP/IF_MGW_REQ_ENTITYSET`).
It uses ABAP field names. SAP's documentation of the entity set method marks every importing
parameter except `IO_TECH_REQUEST_CONTEXT` as obsolete, among them `IS_PAGING`,
`IT_FILTER_SELECT_OPTIONS`, `IT_ORDER`, and `IT_KEY_TAB`; those that carry property names use
the external names.

The block below contains two files. The first stands in for the class SEGW generates, with the
method signature as SEGW generates it, so that the redefinition can be checked offline. It is
not something to create or deliver: in your system the class already exists and inherits from
an SAP Gateway framework class, which the stand-in leaves out. Compare the signature with the
class in your system (SE24 or ADT). The second file is the code you write.

Design choices in the sample:

- `$filter` becomes a `WHERE` clause from `get_osql_where_clause( )`. The framework builds it
  from the parsed filter; no request text is concatenated into SQL by hand. Not every filter
  expression converts, and SAP does not document how the method reports one that does not.
  The sample therefore refuses to read when the request has a `$filter` but the clause is
  empty, instead of returning unfiltered rows.
- For filters that do not convert, read `get_filter( )->get_filter_select_options( )`, move
  the select options of each property into a range table of the column's type, and use it
  with `IN` in a static `WHERE`. Never concatenate filter values into a dynamic `WHERE`.
- `$count` and `$inlinecount` use `SELECT COUNT(*)`. `$inlinecount` is the number of rows after
  `$filter` and before `$top` and `$skip`, so it cannot come from the returned page.
- Server-side paging limits each response. SAP documents it for this case: the provider may
  send fewer rows than requested and set `es_response_context-skiptoken`; the framework then
  renders a next link that carries the token and every other query option except `$skip` and
  `$top`, and sets the next link's `$top` to the requested `$top` minus the rows sent.
- The sample returns at most `gc_page_size` (1000) rows. A request without `$top`, or with a
  larger `$top`, gets a full page and a next link. `get_top( )` returns a string that is empty
  when the request has no `$top`, so `$top=0` (no rows, only the count if requested) stays
  distinct from a request without `$top`. The skiptoken is the position of the next row and
  replaces `$skip` in the next request.
- Pages that start deeper than `gc_max_offset` (10000) rows are rejected: before 7.51 the
  database cannot skip rows, so every row before the page is read and discarded. All limits
  are checked before any arithmetic, so large values cannot overflow type `i`. The limits are
  examples; set them for your data and clients.
- The `SELECT` reads at most offset plus page size rows and deletes the skipped rows
  afterwards. `OFFSET` would skip them in the database, but it needs SAP_BASIS 7.51.
- `$orderby` properties are checked against a fixed list before they go into the dynamic
  `ORDER BY`, and the key is added last so that pages stay stable.
- A missing authorization is reported with HTTP status 403 (Forbidden), not as a request the
  client could fix. Errors in the dynamic SQL become a business exception instead of a short
  dump.

The part marked `context` shows the method as SEGW generates it in the base class, so the
example can be checked. It already exists in the system; deliver only the `_DPC_EXT` class.

<!-- abap-env: product=ecc release=ehp8 database=anydb -->
```abap
* context: src/zcl_zfa_product_dpc.clas.abap
" Generated by SEGW and shown for reference only; do not create, change, or
" transport it. Superclass and other methods omitted.
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
  PRIVATE SECTION.
    " Largest page the service returns; requests for more get a next link.
    CONSTANTS gc_page_size TYPE i VALUE 1000.
    " Deepest row a page may start at. Before 7.51 every skipped row is read.
    CONSTANTS gc_max_offset TYPE i VALUE 10000.
    METHODS order_by_columns
      IMPORTING io_request        TYPE REF TO /iwbep/if_mgw_req_entityset
      RETURNING VALUE(rt_columns) TYPE string_table
      RAISING   /iwbep/cx_mgw_busi_exception.
ENDCLASS.

CLASS zcl_zfa_product_dpc_ext IMPLEMENTATION.
  METHOD productset_get_entityset.
    DATA lv_where TYPE string.
    DATA lv_filter TYPE string.
    DATA lt_orderby TYPE string_table.
    DATA lv_orderby TYPE string.
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

    AUTHORITY-CHECK OBJECT 'ZFA_PROD'
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      " 403 Forbidden: the client cannot fix this by changing the request.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid           = /iwbep/cx_mgw_busi_exception=>business_error
          message          = 'No authorization to display products'
          http_status_code = '403'.
    ENDIF.

    " $filter as a condition on ABAP field names, built by the framework.
    lv_where = io_tech_request_context->get_osql_where_clause( ).
    lv_filter = io_tech_request_context->get_filter( )->get_filter_string( ).
    IF lv_where IS INITIAL AND lv_filter IS NOT INITIAL.
      " Never read without the condition the client asked for.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'This $filter is not supported'.
    ENDIF.

    TRY.
        " .../ProductSet/$count asks for the number only.
        IF io_tech_request_context->has_count( ) = abap_true.
          SELECT COUNT(*) FROM zfa_product INTO lv_count WHERE (lv_where).
          es_response_context-count = lv_count.
          RETURN.
        ENDIF.

        " $inlinecount=allpages: all rows that match $filter, before paging.
        IF io_tech_request_context->has_inlinecount( ) = abap_true.
          SELECT COUNT(*) FROM zfa_product INTO lv_count WHERE (lv_where).
          es_response_context-inlinecount = lv_count.
        ENDIF.
      CATCH cx_sy_dynamic_osql_error.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            textid  = /iwbep/cx_mgw_busi_exception=>business_error
            message = 'The filter cannot be processed'.
    ENDTRY.

    " get_top( ) is empty without $top. The next link of an earlier page brings
    " the position of its first row as $skiptoken, without $skip.
    lv_top_text = io_tech_request_context->get_top( ).
    lv_skiptoken = io_tech_request_context->get_skiptoken( ).
    TRY.
        IF lv_skiptoken IS INITIAL.
          lv_offset = io_tech_request_context->get_skip( ).
        ELSE.
          lv_offset = lv_skiptoken.
        ENDIF.
        lv_top = lv_top_text.
      CATCH cx_sy_conversion_error.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            textid  = /iwbep/cx_mgw_busi_exception=>business_error
            message = 'Invalid $top, $skip, or $skiptoken'.
    ENDTRY.
    IF lv_offset < 0 OR lv_top < 0 OR lv_offset > gc_max_offset.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'Page starts too deep; narrow the result with $filter'.
    ENDIF.

    " Page size: $top, but at most gc_page_size rows. $top=0 asks for no rows.
    IF lv_top_text IS INITIAL OR lv_top > gc_page_size.
      lv_page = gc_page_size.
    ELSE.
      lv_page = lv_top.
    ENDIF.
    IF lv_page = 0.
      RETURN.
    ENDIF.

    lt_orderby = order_by_columns( io_tech_request_context ).
    CONCATENATE LINES OF lt_orderby INTO lv_orderby SEPARATED BY space.

    " Read rows up to the end of the page only (OFFSET needs SAP_BASIS 7.51).
    lv_rows = lv_offset + lv_page.
    TRY.
        SELECT product_id name category price currency
          FROM zfa_product
          UP TO lv_rows ROWS
          INTO CORRESPONDING FIELDS OF TABLE et_entityset
          WHERE (lv_where)
          ORDER BY (lv_orderby).
      CATCH cx_sy_dynamic_osql_error.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            textid  = /iwbep/cx_mgw_busi_exception=>business_error
            message = 'The filter or sort order cannot be processed'.
    ENDTRY.
    IF lv_offset > 0.
      DELETE et_entityset TO lv_offset.
    ENDIF.

    " A full page while the client asked for more: the framework turns the
    " skiptoken, the position of the next row, into a next link.
    DESCRIBE TABLE et_entityset LINES lv_lines.
    IF lv_lines = lv_page AND ( lv_top_text IS INITIAL OR lv_top > lv_page ).
      lv_next_row = lv_offset + lv_page.
      lv_next = lv_next_row.
      CONDENSE lv_next.
      es_response_context-skiptoken = lv_next.
    ENDIF.
  ENDMETHOD.

  METHOD order_by_columns.
    DATA lv_property TYPE string.
    DATA lv_column TYPE string.
    DATA lv_key_sorted TYPE abap_bool.

    DATA(lt_order) = io_request->get_orderby( ).
    LOOP AT lt_order INTO DATA(ls_order).
      lv_property = ls_order-property.
      TRANSLATE lv_property TO UPPER CASE.
      " The property comes from the request: allow known columns only.
      CASE lv_property.
        WHEN 'PRODUCT_ID'.
          lv_key_sorted = abap_true.
        WHEN 'NAME' OR 'CATEGORY' OR 'PRICE'.
        WHEN OTHERS.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING
              textid  = /iwbep/cx_mgw_busi_exception=>business_error
              message = 'Sorting by this property is not supported'.
      ENDCASE.
      IF ls_order-order = 'desc'.
        CONCATENATE lv_property 'DESCENDING' INTO lv_column SEPARATED BY space.
      ELSE.
        CONCATENATE lv_property 'ASCENDING' INTO lv_column SEPARATED BY space.
      ENDIF.
      APPEND lv_column TO rt_columns.
    ENDLOOP.
    " The key last, so that pages stay stable when sort values repeat.
    IF lv_key_sorted = abap_false.
      APPEND 'PRODUCT_ID ASCENDING' TO rt_columns.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

Release notes for this sample:

- The inline declarations in `order_by_columns` need SAP_BASIS 7.40 SP02. On older releases
  declare the variables with `DATA`, typed as the return type of `get_orderby( )` in SE24.
- `get_filter( )->get_filter_string( )` chains two calls, which needs 7.02. On 7.00 and 7.01
  store `get_filter( )` in a reference variable first.
- From SAP_BASIS 7.51 the database can skip the rows. This variant replaces the
  `CONCATENATE LINES OF`, the `SELECT`, and the `DELETE`. `OFFSET` makes the statement use the
  strict syntax check, and in strict mode the dynamic `ORDER BY` list needs commas between the
  columns. With blanks only, a request with two sort columns ends in runtime error
  SAPSQL_PARSE_ERROR (exception CX_SY_DYNAMIC_OSQL_SEMANTICS, SAP KBA 2422976), which the
  sample would turn into an error response for every sorted request. Test
  `$orderby=NAME desc&$top=20&$skip=40` on your system. Because the database skips the rows,
  you can raise `gc_max_offset` there.

```abap
CONCATENATE LINES OF lt_orderby INTO lv_orderby SEPARATED BY `, `.
SELECT product_id, name, category, price, currency
  FROM zfa_product
  WHERE (lv_where)
  ORDER BY (lv_orderby)
  INTO CORRESPONDING FIELDS OF TABLE @et_entityset
  UP TO @lv_page ROWS
  OFFSET @lv_offset.
```

- SAP NetWeaver 7.50 documentation from SPS07 also lists `get_osql_where_clause_convert( )`,
  which applies conversion exits such as ALPHA to the filter values. It is not in the 7.40
  documentation. Check that your release has it before you use it.
- SAP's helper class `/IWBEP/CL_MGW_DATA_UTIL` filters, sorts, and pages data that is already
  in an internal table. Use it only for small results, for example from a BAPI without paging
  parameters; for database tables it means reading every row first.

## GET_ENTITY and CREATE_ENTITY

- `GET_ENTITY`: read the key values with `io_tech_request_context->get_converted_keys( )`,
  which returns a structure of the entity type with the keys filled and conversion exits
  applied. Check the name of its exporting parameter in SE24. When nothing is found, raise the
  error below. `ENTITY_TYPE` names the entity type in the error text; use the literal name of
  your entity type rather than the obsolete parameter `IV_ENTITY_NAME`:

```abap
RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
  EXPORTING
    textid      = /iwbep/cx_mgw_busi_exception=>resource_not_found
    entity_type = 'Product'.
```

- `CREATE_ENTITY` and `UPDATE_ENTITY`: read the payload with
  `io_data_provider->read_entry_data( IMPORTING es_data = ls_product )`, call a BAPI-style
  function, and turn its `RETURN` table into the error response:

```abap
lo_messages = me->/iwbep/if_mgw_core_srv_runtime~mo_context->get_message_container( ).
lo_messages->add_messages_from_bapi(
  it_bapi_messages         = lt_return
  iv_determine_leading_msg = /iwbep/if_message_container=>gcs_leading_msg_search_option-first ).
RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
  EXPORTING
    textid            = /iwbep/cx_mgw_busi_exception=>business_error
    message_container = lo_messages.
```

The leading message becomes the error code and text of the response. With
`add_message( )` and `iv_add_to_response_header = abap_true`, warnings and success messages
travel in a response header of a successful response. These names are documented for
SAP_GWFND; on the IW_BEP add-on check them in SE24.

## Errors

| Situation | Exception |
|-----------|-----------|
| Business error the client can fix: validation, missing or wrong data | `/IWBEP/CX_MGW_BUSI_EXCEPTION`, textid `BUSINESS_ERROR` with `message`, or `BUSINESS_ERROR_UNLIMITED` with `message_unlimited`, or a message container |
| Missing authorization | `/IWBEP/CX_MGW_BUSI_EXCEPTION` with `HTTP_STATUS_CODE` 403, so clients can tell a permission problem from bad input |
| Entity not found | `/IWBEP/CX_MGW_BUSI_EXCEPTION`, textid `RESOURCE_NOT_FOUND` with `entity_type` |
| Technical error: configuration, unexpected failure | `/IWBEP/CX_MGW_TECH_EXCEPTION` or a subclass |

`HTTP_STATUS_CODE` has type `/IWBEP/MGW_HTTP_STATUS_CODE`; SAP lists the supported values as
constants in `CS_HTTP_STATUS_CODES` of the exception class. Use the constant for 403 from SE24
instead of the literal in the sample once you have looked up its name. Never let a dynamic SQL
error or a classic `MESSAGE` of type E end the request with a short dump.

## $batch and changesets

A changeset in a `$batch` request is one LUW: all its operations succeed or none.

- In a changeset with more than one operation, the entity methods must not call `COMMIT WORK`,
  `ROLLBACK WORK`, or `BAPI_TRANSACTION_COMMIT`. The framework detects it and ends the request
  with a short dump. The check is off for changesets with a single operation.
- The default `CHANGESET_BEGIN` accepts only one operation per changeset. Redefine it in the
  DPC_EXT class to accept more, and reject combinations you do not support with the documented
  `CHANGESET_NOT_SUPPORTED` error.
- The framework commits after `CHANGESET_END`. A commit in your own `CHANGESET_END` is allowed
  from SAP Gateway 2.0 SP07 (SP06 with SAP Note 1824626). Defer mode (`CV_DEFER_MODE` and
  `CHANGESET_PROCESS`) exists from Gateway 2.0 SP09.
- Outside `$batch` the provider commits and rolls back itself. One way to support both: set
  an attribute in your `CHANGESET_BEGIN` redefinition, reset it in `CHANGESET_END`, and let
  the entity methods commit only when it is not set.

## Activation, testing, and logs

| Task | Transaction |
|------|-------------|
| Model and generate | SEGW |
| Register and activate the service (system alias `LOCAL` in an embedded deployment) | /IWFND/MAINT_SERVICE |
| Send test requests | /IWFND/GW_CLIENT |
| Errors on the hub (framework) | /IWFND/ERROR_LOG |
| Errors in the backend (your provider code) | /IWBEP/ERROR_LOG |
| Application logs | /IWFND/APPS_LOG, /IWBEP/VIEW_LOG |
| Performance trace | /IWFND/TRACES |
| Clear metadata caches after model changes | /IWBEP/CACHE_CLEANUP (backend), /IWFND/CACHE_CLEANUP (hub) |

In an embedded deployment all of these run in the same system; check both error logs.

## Sources (checked 2026-10-15)

- [Generate runtime objects](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/09742c510e87fa50e10000000a441470.html)
  and [redefining methods in the _EXT class](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/634e22518bc72214e10000000a44176d.html)
- [CRUD methods](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/09752c510e87fa50e10000000a441470.html)
- [GET_ENTITYSET parameters, response context, and server-side paging](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/05fb2651c294256ee10000000a445394.html)
- [/IWBEP/IF_MGW_REQ_ENTITYSET](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/0e9b2451f8c0266ee10000000a445394.html)
  (`GET_TOP` "only filled in case of $top is given"),
  [7.40 SP15 version](https://help.sap.com/docs/SAP_NETWEAVER_AS_ABAP_FOR_SOH_740/68bf513362174d54b58cddec28794093/0e9b2451f8c0266ee10000000a445394.html?version=7.40.15)
- [$filter handling](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/281073c88d184ec48bc5b69f8e390097.html)
  and [query options](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/30116c10d4ff42908d4a4ad023b77634.html)
- [Paging (SAP Learning)](https://learning.sap.com/courses/building-odata-services-with-sap-gateway/implementing-query-options)
- [Business exceptions and HTTP_STATUS_CODE](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/f2a126519eff236ee10000000a445394.html)
  and [message container](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/01a226519eff236ee10000000a445394.html)
- [Changesets and commit](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/94a126519eff236ee10000000a445394.html)
- [Deployment options](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/3eb1ea508f88bb7ee10000000a445394.html),
  [OData V4 availability and hub development](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/6652a8a206fd438db71d0e5e658c703a.html),
  and [SAP Gateway and OData, S/4HANA 2025](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/22bbe89ef68b4d0e98d05f0d56a7f6c8/24d9ac6065954bf7a61f2dc9040f7870.html)
- [Gateway transactions](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/052ffe50645c741ae10000000a423f68.html)
- [RAP on S/4HANA](https://pages.community.sap.com/topics/abap/rap)
- [SELECT ... OFFSET, release news 7.51](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENNEWS-751-ABAP_SQL.html)
  and [ORDER BY and strict mode, ABAP Keyword Documentation 7.51](https://help.sap.com/doc/abapdocu_751_index_htm/7.51/en-US/abaporderby_clause.htm);
  SAP KBA 2422976 (SAP for Me, login required) describes the SAPSQL_PARSE_ERROR runtime error
  for a dynamic column list without commas
