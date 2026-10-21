# sap-rap-business-object Acceptance Criteria

**Skill**: `plugins/sap-abap/skills/sap-rap-business-object`
**Product**: SAP ABAP Cloud (RESTful ABAP Programming model)
**Purpose**: Criteria for judging generated RAP objects. Each "Incorrect" example is rejected by a forbidden pattern in `scenarios.yaml` or by a release rule for its target system; each complete "Correct" example is parsed with abaplint.

---

## 1. Data model

### 1.1 Correct: root view entity with admin field semantics

```cds
// file: src/zr_travel.ddls.asddls
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Travel'
define root view entity ZR_Travel
  as select from zfa_travel
{
  key travel_uuid           as TravelUUID,
      travel_id             as TravelID,
      begin_date            as BeginDate,
      end_date              as EndDate,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed_at as LocalLastChangedAt,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at       as LastChangedAt
}
```

### 1.2 Incorrect: classic DDIC-based CDS view

Obsolete for new development and not usable as a RAP business object root.

```cds
@AbapCatalog.sqlViewName: 'ZVTRAVEL'
define view ZI_Travel as select from zfa_travel
{
  key travel_uuid as TravelUUID
}
```

---

## 2. Behavior definition

### 2.1 Correct: managed, strict mode 2, draft, total ETag

For SAP_BASIS 7.58 and later (S/4HANA 2023 and later, SAP BTP ABAP environment, S/4HANA Cloud
Public Edition). On S/4HANA 2022, write `draft action Activate;` (see 2.3).

```text
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
  validation validateDates on save { create; field BeginDate, EndDate; }
  draft action Edit;
  draft action Activate optimized;
  draft action Discard;
  draft action Resume;
  draft determine action Prepare { validation validateDates; }
}
```

### 2.2 Incorrect: transaction control inside a behavior handler

The RAP framework owns the logical unit of work. This causes a runtime error.

```abap
METHOD set_travel_id.
  MODIFY ENTITIES OF zr_travel IN LOCAL MODE
    ENTITY Travel UPDATE FIELDS ( TravelID ) WITH update_rows.
  COMMIT WORK.
ENDMETHOD.
```

### 2.3 Incorrect: draft action Activate optimized on S/4HANA 2022

The `optimized` addition needs SAP_BASIS 7.58 (S/4HANA 2023). On S/4HANA 2022 (7.57) this
behavior definition does not activate. The release rule `rap-draft-activate-optimized` rejects
it for this target.

<!-- abap-env: product=s4hana release=2022 language_version=cloud -->
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
  validation validateDates on save { create; field BeginDate, EndDate; }
  draft action Edit;
  draft action Activate optimized;
  draft action Discard;
  draft action Resume;
  draft determine action Prepare { validation validateDates; }
}
```

---

## 3. Reading data in validations

### 3.1 Correct: EML read in local mode (sees draft data)

```abap
READ ENTITIES OF zr_travel IN LOCAL MODE
  ENTITY Travel
    FIELDS ( BeginDate EndDate ) WITH CORRESPONDING #( keys )
  RESULT DATA(travels).
```

### 3.2 Incorrect: SELECT on the active table (ignores draft data)

```abap
SELECT travel_uuid, begin_date, end_date FROM zfa_travel
  FOR ALL ENTRIES IN @keys WHERE travel_uuid = @keys-TravelUUID
  INTO TABLE @DATA(travels).
```

---

## 4. Messages

### 4.1 Correct: messages through REPORTED with a state area

```abap
APPEND VALUE #( %tky        = travel-%tky
                %state_area = 'VALIDATE_DATES' ) TO reported-travel.
APPEND VALUE #( %tky               = travel-%tky
                %state_area        = 'VALIDATE_DATES'
                %msg               = new_message_with_text(
                                       severity = if_abap_behv_message=>severity-error
                                       text     = 'End date must not be before begin date' )
                %element-EndDate   = if_abap_behv=>mk-on ) TO reported-travel.
```

### 4.2 Incorrect: classic MESSAGE statement

```abap
IF travel-EndDate < travel-BeginDate.
  MESSAGE e001(zfa_travel).
ENDIF.
```

---

## 5. Keys in draft-enabled objects

### 5.1 Correct: transactional key %tky

```abap
APPEND VALUE #( %tky = travel-%tky ) TO failed-travel.
```

### 5.2 Incorrect: %key loses the draft indicator

```abap
APPEND VALUE #( %key = travel-%key ) TO failed-travel.
```

---

## 6. Service exposure

### 6.1 Correct: projection view with transactional query contract

```cds
// file: src/zc_travel.ddls.asddls
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Travel - projection'
@Metadata.allowExtensions: true
define root view entity ZC_Travel
  provider contract transactional_query
  as projection on ZR_Travel
{
  key TravelUUID,
      TravelID,
      BeginDate,
      EndDate,
      LocalLastChangedAt
}
```

### 6.2 Incorrect: publishing a CDS view with @OData.publish

Pre-RAP technique. RAP services use a service definition and service binding.

```cds
@AbapCatalog.sqlViewName: 'ZVTRAVELP'
@OData.publish: true
define view ZC_TravelPublished as select from zfa_travel
{
  key travel_uuid as TravelUUID
}
```

### 6.3 Incorrect: projection behavior definition without use etag

SAP requires `use etag` for each entity of a projection behavior definition; without it the
OData service loses optimistic concurrency control. Write `use etag` on the line after
`define behavior for ZC_Travel alias Travel`, before the opening brace.

```text
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

---

## 7. Test scenarios checklist

- [ ] Draft-enabled managed business object (data model, behavior definition, behavior pool)
- [ ] Validation with state messages and field highlighting
- [ ] UI service: projection, projection behavior with `use etag`, metadata extension, service definition
- [ ] Behavior definition for S/4HANA 2022 without `Activate optimized`
