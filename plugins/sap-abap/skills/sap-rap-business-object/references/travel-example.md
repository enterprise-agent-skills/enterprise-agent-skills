# Reference implementation: Travel business object

A complete managed RAP business object with draft. Names use the prefix `ZFA_`/`Z*_Travel`;
replace them with your own. Every ABAP and CDS view entity block below starts with an abapGit
file marker and is parsed by this repository's tests with abaplint (ABAP Cloud language
version). Behavior definitions, metadata extensions, and service definitions have no offline
parser; their rules are covered by pattern checks in the skill's test scenarios.

All SAP objects used here (`cl_abap_behavior_handler`, `if_abap_behv`,
`if_abap_behv_message`, `sysuuid_x16`, the `abp_*` data elements, and
`sych_bdl_draft_admin_inc`) are released for ABAP Cloud according to SAP's Cloudification
Repository (checked 2026-10-14).

## 1. Database table ZFA_TRAVEL

Create it in ADT (New > Other ABAP Repository Object > Database Table).

```abap
@EndUserText.label : 'Travel'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zfa_travel {
  key client            : abap.clnt not null;
  key travel_uuid       : sysuuid_x16 not null;
  travel_id             : abap.numc(8);
  customer_id           : abap.char(10);
  begin_date            : abap.dats;
  end_date              : abap.dats;
  @Semantics.amount.currencyCode : 'zfa_travel.currency_code'
  total_price           : abap.curr(16,2);
  currency_code         : abap.cuky;
  description           : abap.char(256);
  overall_status        : abap.char(1);
  local_created_by      : abp_creation_user;
  local_created_at      : abp_creation_tstmpl;
  local_last_changed_by : abp_locinst_lastchange_user;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
  last_changed_at       : abp_lastchange_tstmpl;
}
```

The draft table `ZFA_TRAVEL_D` is generated later from the behavior definition (quick fix on
the `draft table` statement). It contains the same fields with CDS element names plus
`"%admin" : include sych_bdl_draft_admin_inc;`.

## 2. Root view entity ZR_Travel

```cds
// file: src/zr_travel.ddls.asddls
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Travel'
define root view entity ZR_Travel
  as select from zfa_travel
{
  key travel_uuid           as TravelUUID,
      travel_id             as TravelID,
      customer_id           as CustomerID,
      begin_date            as BeginDate,
      end_date              as EndDate,
      @Semantics.amount.currencyCode: 'CurrencyCode'
      total_price           as TotalPrice,
      currency_code         as CurrencyCode,
      description           as Description,
      overall_status        as OverallStatus,
      @Semantics.user.createdBy: true
      local_created_by      as LocalCreatedBy,
      @Semantics.systemDateTime.createdAt: true
      local_created_at      as LocalCreatedAt,
      @Semantics.user.localInstanceLastChangedBy: true
      local_last_changed_by as LocalLastChangedBy,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed_at as LocalLastChangedAt,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at       as LastChangedAt
}
```

Use `#CHECK` with an access control (DCL) once you know the authorization model.

## 3. Behavior definition ZR_Travel

```text
// file: src/zr_travel.bdef.asbdef
managed implementation in class zbp_r_travel unique;
strict ( 2 );
with draft;

define behavior for ZR_Travel alias Travel
persistent table zfa_travel
draft table zfa_travel_d
etag master LocalLastChangedAt
lock master total etag LastChangedAt
authorization master ( global )
{
  create;
  update;
  delete;

  field ( numbering : managed, readonly ) TravelUUID;
  field ( readonly ) TravelID, OverallStatus, LocalCreatedBy, LocalCreatedAt,
                     LocalLastChangedBy, LocalLastChangedAt, LastChangedAt;
  field ( mandatory ) CustomerID, BeginDate, EndDate;

  action ( features : instance ) acceptTravel result [1] $self;

  determination setInitialValues on modify { create; }
  determination setTravelID on save { create; }
  validation validateDates on save { create; field BeginDate, EndDate; }

  draft action Edit;
  draft action Activate optimized;
  draft action Discard;
  draft action Resume;
  draft determine action Prepare
  {
    validation validateDates;
  }

  mapping for zfa_travel
  {
    TravelUUID         = travel_uuid;
    TravelID           = travel_id;
    CustomerID         = customer_id;
    BeginDate          = begin_date;
    EndDate            = end_date;
    TotalPrice         = total_price;
    CurrencyCode       = currency_code;
    Description        = description;
    OverallStatus      = overall_status;
    LocalCreatedBy     = local_created_by;
    LocalCreatedAt     = local_created_at;
    LocalLastChangedBy = local_last_changed_by;
    LocalLastChangedAt = local_last_changed_at;
    LastChangedAt      = last_changed_at;
  }
}
```

## 4. Behavior pool ZBP_R_Travel

The global class is empty. Logic lives in local handler classes (the Local Types tab in ADT,
stored as `locals_imp`).

```abap
* file: src/zbp_r_travel.clas.abap
CLASS zbp_r_travel DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zr_travel.
ENDCLASS.

CLASS zbp_r_travel IMPLEMENTATION.
ENDCLASS.

* file: src/zbp_r_travel.clas.locals_imp.abap
CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    CONSTANTS:
      BEGIN OF travel_status,
        open     TYPE c LENGTH 1 VALUE 'O',
        accepted TYPE c LENGTH 1 VALUE 'A',
      END OF travel_status.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR Travel RESULT result.

    METHODS get_instance_features FOR INSTANCE FEATURES
      IMPORTING keys REQUEST requested_features FOR Travel RESULT result.

    METHODS accept_travel FOR MODIFY
      IMPORTING keys FOR ACTION Travel~acceptTravel RESULT result.

    METHODS set_initial_values FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Travel~setInitialValues.

    METHODS set_travel_id FOR DETERMINE ON SAVE
      IMPORTING keys FOR Travel~setTravelID.

    METHODS validate_dates FOR VALIDATE ON SAVE
      IMPORTING keys FOR Travel~validateDates.
ENDCLASS.

CLASS lhc_travel IMPLEMENTATION.
  METHOD get_global_authorizations.
    " Replace with AUTHORITY-CHECK on your own authorization object.
    result = VALUE #( %create = if_abap_behv=>auth-allowed
                      %update = if_abap_behv=>auth-allowed
                      %delete = if_abap_behv=>auth-allowed ).
  ENDMETHOD.

  METHOD get_instance_features.
    READ ENTITIES OF zr_travel IN LOCAL MODE
      ENTITY Travel
        FIELDS ( OverallStatus ) WITH CORRESPONDING #( keys )
      RESULT DATA(travels)
      FAILED failed.

    result = VALUE #( FOR travel IN travels
                      ( %tky                 = travel-%tky
                        %action-acceptTravel = COND #( WHEN travel-OverallStatus = travel_status-accepted
                                                       THEN if_abap_behv=>fc-o-disabled
                                                       ELSE if_abap_behv=>fc-o-enabled ) ) ).
  ENDMETHOD.

  METHOD accept_travel.
    MODIFY ENTITIES OF zr_travel IN LOCAL MODE
      ENTITY Travel
        UPDATE FIELDS ( OverallStatus )
        WITH VALUE #( FOR key IN keys
                      ( %tky          = key-%tky
                        OverallStatus = travel_status-accepted ) ).

    READ ENTITIES OF zr_travel IN LOCAL MODE
      ENTITY Travel
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(travels).

    result = VALUE #( FOR travel IN travels
                      ( %tky   = travel-%tky
                        %param = travel ) ).
  ENDMETHOD.

  METHOD set_initial_values.
    READ ENTITIES OF zr_travel IN LOCAL MODE
      ENTITY Travel
        FIELDS ( OverallStatus ) WITH CORRESPONDING #( keys )
      RESULT DATA(travels).

    DELETE travels WHERE OverallStatus IS NOT INITIAL.
    CHECK travels IS NOT INITIAL.

    MODIFY ENTITIES OF zr_travel IN LOCAL MODE
      ENTITY Travel
        UPDATE FIELDS ( OverallStatus )
        WITH VALUE #( FOR travel IN travels
                      ( %tky          = travel-%tky
                        OverallStatus = travel_status-open ) ).
  ENDMETHOD.

  METHOD set_travel_id.
    READ ENTITIES OF zr_travel IN LOCAL MODE
      ENTITY Travel
        FIELDS ( TravelID ) WITH CORRESPONDING #( keys )
      RESULT DATA(travels).

    DELETE travels WHERE TravelID IS NOT INITIAL.
    CHECK travels IS NOT INITIAL.

    " Prototype only. Use a number range object (cl_numberrange_runtime) in production.
    SELECT SINGLE FROM zfa_travel FIELDS MAX( travel_id ) INTO @DATA(max_travel_id).

    MODIFY ENTITIES OF zr_travel IN LOCAL MODE
      ENTITY Travel
        UPDATE FIELDS ( TravelID )
        WITH VALUE #( FOR travel IN travels INDEX INTO i
                      ( %tky     = travel-%tky
                        TravelID = max_travel_id + i ) ).
  ENDMETHOD.

  METHOD validate_dates.
    READ ENTITIES OF zr_travel IN LOCAL MODE
      ENTITY Travel
        FIELDS ( BeginDate EndDate ) WITH CORRESPONDING #( keys )
      RESULT DATA(travels).

    LOOP AT travels INTO DATA(travel).
      " Clear messages from earlier runs of this validation.
      APPEND VALUE #( %tky        = travel-%tky
                      %state_area = 'VALIDATE_DATES' ) TO reported-travel.

      IF travel-EndDate < travel-BeginDate.
        APPEND VALUE #( %tky = travel-%tky ) TO failed-travel.
        APPEND VALUE #( %tky               = travel-%tky
                        %state_area        = 'VALIDATE_DATES'
                        %msg               = new_message_with_text(
                                               severity = if_abap_behv_message=>severity-error
                                               text     = 'End date must not be before begin date' )
                        %element-BeginDate = if_abap_behv=>mk-on
                        %element-EndDate   = if_abap_behv=>mk-on ) TO reported-travel.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
```

## 5. Projection view ZC_Travel

```cds
// file: src/zc_travel.ddls.asddls
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Travel - projection'
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity ZC_Travel
  provider contract transactional_query
  as projection on ZR_Travel
{
  key TravelUUID,
      @Search.defaultSearchElement: true
      TravelID,
      @Search.defaultSearchElement: true
      CustomerID,
      BeginDate,
      EndDate,
      TotalPrice,
      CurrencyCode,
      Description,
      OverallStatus,
      LocalLastChangedAt
}
```

## 6. Projection behavior definition ZC_Travel

```text
// file: src/zc_travel.bdef.asbdef
projection;
strict ( 2 );
use draft;

define behavior for ZC_Travel alias Travel
{
  use create;
  use update;
  use delete;

  use action acceptTravel;
  use action Edit;
  use action Activate;
  use action Discard;
  use action Resume;
  use action Prepare;
}
```

## 7. Metadata extension ZC_Travel

```text
// file: src/zc_travel.ddlx.asddlxs
@Metadata.layer: #CORE
@UI.headerInfo: { typeName: 'Travel', typeNamePlural: 'Travels',
                  title: { type: #STANDARD, value: 'TravelID' } }
annotate entity ZC_Travel with
{
  @UI.facet: [ { id: 'Travel', purpose: #STANDARD, type: #IDENTIFICATION_REFERENCE,
                 label: 'Travel', position: 10 } ]
  @UI.hidden: true
  TravelUUID;

  @UI: { lineItem: [ { position: 10, importance: #HIGH } ],
         identification: [ { position: 10 } ],
         selectionField: [ { position: 10 } ] }
  TravelID;

  @UI: { lineItem: [ { position: 20 } ], identification: [ { position: 20 } ] }
  CustomerID;

  @UI: { lineItem: [ { position: 30 } ], identification: [ { position: 30 } ] }
  BeginDate;

  @UI: { lineItem: [ { position: 40 } ], identification: [ { position: 40 } ] }
  EndDate;

  @UI: { lineItem: [ { position: 50 },
                     { type: #FOR_ACTION, dataAction: 'acceptTravel', label: 'Accept' } ],
         identification: [ { position: 50 },
                           { type: #FOR_ACTION, dataAction: 'acceptTravel', label: 'Accept' } ] }
  OverallStatus;
}
```

## 8. Service definition and binding

```text
// file: src/zui_travel.srvd.srvdsrv
@EndUserText.label: 'Travel UI service'
define service ZUI_Travel {
  expose ZC_Travel as Travel;
}
```

Create the service binding `ZUI_Travel_O4` in ADT with binding type OData V4 - UI, select
Publish, then select the entity set and Preview to open the Fiori elements app.
