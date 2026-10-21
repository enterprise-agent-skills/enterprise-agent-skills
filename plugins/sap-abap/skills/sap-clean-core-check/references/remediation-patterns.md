# Remediation patterns

Release states quoted here were checked in `objectReleaseInfoLatest.json` from
https://github.com/SAP/abap-atc-cr-cv-s4hc on 2026-10-14. Re-check with
`scripts/lookup_api_state.py` before relying on them. The clean core levels in pattern 4 follow
SAP Learning, clean core extensibility (checked 2026-10-18).

## 1. Table read replaced by a released CDS view

`VBAK` is `notToBeReleased` with successor `I_SALESDOCUMENT`. The class below reads the
released view instead and runs in ABAP Cloud. It is parsed by this repository's tests with
abaplint (ABAP Cloud language version). Field names come from `I_SalesDocument`; confirm them
in ADT for your release.

```abap
* file: src/zcl_fa_recent_sales_docs.clas.abap
CLASS zcl_fa_recent_sales_docs DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

    TYPES:
      BEGIN OF ty_document,
        sales_document      TYPE c LENGTH 10,
        sales_document_type TYPE c LENGTH 4,
        sold_to_party       TYPE c LENGTH 10,
      END OF ty_document,
      tt_documents TYPE STANDARD TABLE OF ty_document WITH EMPTY KEY.

    METHODS get_documents
      IMPORTING from_date        TYPE d
      RETURNING VALUE(documents) TYPE tt_documents.
ENDCLASS.

CLASS zcl_fa_recent_sales_docs IMPLEMENTATION.
  METHOD get_documents.
    SELECT SalesDocument     AS sales_document,
           SalesDocumentType AS sales_document_type,
           SoldToParty       AS sold_to_party
      FROM I_SalesDocument
      WHERE CreationDate >= @from_date
      ORDER BY SalesDocument
      INTO CORRESPONDING FIELDS OF TABLE @documents
      UP TO 100 ROWS.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA(documents) = get_documents( cl_abap_context_info=>get_system_date( ) - 30 ).
    out->write( documents ).
  ENDMETHOD.
ENDCLASS.
```

Other verified table successors: `KNA1` to `I_CUSTOMER`, `BKPF` to `I_JOURNALENTRY`,
`BUT000` to `I_BUSINESSPARTNER`, `EKKO` to `I_PURCHASEORDERAPI01`, and `MARA` to
`I_PRODUCT` plus more specific product views.

## 2. Function module replaced by a released view

Function modules are listed by name in the `objectKey` field. For example,
`BAPI_PROCORD_GET_DETAIL` is `notToBeReleased` with successor `I_MANUFACTURINGORDER`.
Replace the call with a `SELECT` on the successor view and map only the fields the caller
uses. Keep the old and new results side by side in a unit test until they match.

## 3. Writes through released business object interfaces

Do not update SAP tables or call unreleased update BAPIs. Released RAP business object
interfaces accept changes through EML, for example `I_SALESORDERTP` and
`I_PURCHASEORDERTP_2` (both released). Open the interface's behavior definition in ADT to
get the exact entity aliases, fields, and actions, then use this structure:

```text
MODIFY ENTITIES OF <released_bo_interface>
  ENTITY <entity_alias>
    CREATE FIELDS ( <field_1> <field_2> ) WITH VALUE #( ( %cid = 'C1' <field_1> = ... ) )
  MAPPED DATA(mapped)
  FAILED DATA(failed)
  REPORTED DATA(reported).

COMMIT ENTITIES.   " Only outside RAP handlers, for example in a report-style class.
```

## 4. No released successor

If the data shows no successor and api.sap.com offers no released API:

- In SAP S/4HANA Cloud Private Edition or on premises (2022 or later), write a wrapper in
  Standard ABAP in a separate software component or package, test it, and release it for use
  in ABAP Cloud development (API state with the use in cloud development contract). ABAP Cloud
  code then calls the wrapper. Since August 2025, SAP rates an extension by the lowest-ranked
  technology it uses, so the wrapper gets the level of what it wraps: level B around a classic
  API (`classicAPI` in `objectClassifications_SAP.json`), level C around an SAP internal
  object, and level D around a `noAPI` object. Put that level in the report. Existing tier 2
  wrappers do not have to be migrated. Record the wrapper so it can be replaced when SAP
  releases an API.
- In SAP S/4HANA Cloud Public Edition and SAP BTP ABAP environment, wrappers over unreleased
  objects are not possible. Raise an influence request with SAP or redesign the extension
  (for example side-by-side on SAP BTP using a released OData API).

Mark every such case as an open question in the report; it needs an architect's decision.
