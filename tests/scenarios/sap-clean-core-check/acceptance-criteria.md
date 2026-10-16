# sap-clean-core-check Acceptance Criteria

**Skill**: `plugins/sap-abap/skills/sap-clean-core-check`
**Data source**: SAP Cloudification Repository, `src/objectReleaseInfoLatest.json`, https://github.com/SAP/abap-atc-cr-cv-s4hc (checked 2026-10-14)
**Purpose**: Criteria for clean core assessments and ABAP Cloud rewrites. Each "Incorrect" example is rejected by a forbidden pattern in `scenarios.yaml`.

---

## 1. Reading SAP data

### 1.1 Correct: released CDS view in ABAP Cloud

```abap
* file: src/zcl_fa_sales_docs.clas.abap
CLASS zcl_fa_sales_docs DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_documents TYPE STANDARD TABLE OF I_SalesDocument WITH EMPTY KEY.
    METHODS read_since
      IMPORTING from_date        TYPE d
      RETURNING VALUE(documents) TYPE tt_documents.
ENDCLASS.

CLASS zcl_fa_sales_docs IMPLEMENTATION.
  METHOD read_since.
    SELECT * FROM I_SalesDocument
      WHERE CreationDate >= @from_date
      INTO TABLE @documents
      UP TO 500 ROWS.
  ENDMETHOD.
ENDCLASS.
```

### 1.2 Incorrect: direct read of a table that will not be released

```abap
SELECT vbeln, auart, kunnr FROM vbak
  WHERE erdat >= @lv_from
  INTO TABLE @DATA(orders).
```

---

## 2. Assessment report

### 2.1 Correct: state and successor taken from the repository data

```text
| Object | Type | State           | Successor       |
|--------|------|-----------------|-----------------|
| VBAK   | TABL | notToBeReleased | I_SALESDOCUMENT |
| KNA1   | TABL | notToBeReleased | I_CUSTOMER      |
```

### 2.2 Incorrect: claiming an unreleased table is released

```text
| Object | Type | State    | Successor |
|--------|------|----------|-----------|
| VBAK   | TABL | released | -         |
```

### 2.3 Incorrect: suppressing the finding instead of fixing it

Pseudo-comments do not make an unreleased object usable in ABAP Cloud.

```abap
SELECT * FROM vbak INTO TABLE @DATA(orders) ##NEEDED.
```

---

## 3. Classic statements in ABAP Cloud

### 3.1 Incorrect: classic list output

```abap
WRITE: / 'Order', ls_order-vbeln.
```

---

## 4. Test scenarios checklist

- [ ] Rewrite of a direct VBAK read to I_SalesDocument
- [ ] Assessment report for a list of objects with states and successors
