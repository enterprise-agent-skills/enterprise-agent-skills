# sap-abap-standard Acceptance Criteria

**Skill**: `plugins/sap-abap/skills/sap-abap-standard`
**Product**: Standard ABAP on SAP ECC 6.0, SAP NetWeaver AS ABAP, and SAP S/4HANA (on premises or IaaS)
**Purpose**: Criteria for classic ABAP development that respects the target release. Each "Incorrect" example is rejected by a forbidden pattern in `scenarios.yaml` or by a validator under the environment named in its `abap-env` line. Each complete "Correct" example is parsed with abaplint for its environment.

---

## 1. Syntax matches the target release

### 1.1 Correct: classic syntax for ECC 6.0 EHP6 (SAP_BASIS 7.31)

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_customers_731.prog.abap
REPORT zfa_customers_731.
DATA lt_kna1 TYPE STANDARD TABLE OF kna1 WITH DEFAULT KEY.
DATA ls_kna1 TYPE kna1.
PARAMETERS p_land1 TYPE land1_gp.
START-OF-SELECTION.
  SELECT kunnr name1 land1 FROM kna1
    INTO CORRESPONDING FIELDS OF TABLE lt_kna1
    WHERE land1 = p_land1.
  LOOP AT lt_kna1 INTO ls_kna1.
    WRITE: / ls_kna1-kunnr, ls_kna1-name1.
  ENDLOOP.
```

### 1.2 Incorrect: 7.40 syntax on an ECC 6.0 EHP6 system

Inline declarations and `@` host variables do not exist on SAP_BASIS 7.31; the program does not
compile.

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_customers_bad.prog.abap
REPORT zfa_customers_bad.
PARAMETERS p_land1 TYPE land1_gp.
START-OF-SELECTION.
  SELECT kunnr, name1 FROM kna1 WHERE land1 = @p_land1 INTO TABLE @DATA(lt_kna1).
```

### 1.3 Correct: modern syntax where the release supports it (S/4HANA 2023)

<!-- abap-env: product=s4hana release=2023 -->
```abap
* file: src/zfa_customers_758.prog.abap
REPORT zfa_customers_758.
PARAMETERS p_land1 TYPE land1_gp.
START-OF-SELECTION.
  SELECT kunnr, name1 FROM kna1
    WHERE land1 = @p_land1
    INTO TABLE @DATA(lt_kna1).
  LOOP AT lt_kna1 INTO DATA(ls_kna1).
    WRITE: / ls_kna1-kunnr, ls_kna1-name1.
  ENDLOOP.
```

---

## 2. Data access

### 2.1 Correct: one statement for all rows, driver table checked before FOR ALL ENTRIES

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_items_fae.prog.abap
REPORT zfa_items_fae.
DATA lt_vbak TYPE STANDARD TABLE OF vbak WITH DEFAULT KEY.
DATA lt_vbap TYPE STANDARD TABLE OF vbap WITH DEFAULT KEY.
PARAMETERS p_vkorg TYPE vkorg.
START-OF-SELECTION.
  SELECT vbeln FROM vbak INTO CORRESPONDING FIELDS OF TABLE lt_vbak WHERE vkorg = p_vkorg.
  IF lt_vbak IS NOT INITIAL.
    SELECT vbeln posnr matnr kwmeng FROM vbap
      INTO CORRESPONDING FIELDS OF TABLE lt_vbap
      FOR ALL ENTRIES IN lt_vbak
      WHERE vbeln = lt_vbak-vbeln.
  ENDIF.
```

### 2.2 Incorrect: SELECT inside a loop

```abap
LOOP AT lt_vbak INTO ls_vbak.
  SELECT * FROM vbap INTO TABLE lt_vbap WHERE vbeln = ls_vbak-vbeln.
ENDLOOP.
```

### 2.3 Incorrect: FOR ALL ENTRIES without checking the driver table

<!-- not-detectable: a static pattern cannot prove the missing emptiness check; scenario fix_for_all_entries requires the check through expected_patterns and a negative response -->
```abap
SELECT vbeln posnr FROM vbap INTO TABLE lt_vbap
  FOR ALL ENTRIES IN lt_vbak WHERE vbeln = lt_vbak-vbeln.
```

---

## 3. S/4HANA data model

### 3.1 Incorrect: reading the sales status table VBUK on S/4HANA

VBUK and VBUP were removed in S/4HANA; status fields are in VBAK and VBAP.

```abap
SELECT SINGLE gbstk FROM vbuk INTO lv_status WHERE vbeln = lv_vbeln.
```

---

## 4. Database-specific features

### 4.1 Incorrect: AMDP on ECC running on a database other than SAP HANA

<!-- abap-env: product=ecc release=ehp8 database=anydb -->
```abap
* file: src/zcl_fa_sales_amdp.clas.abap
CLASS zcl_fa_sales_amdp DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.
    TYPES tt_totals TYPE STANDARD TABLE OF vbak WITH EMPTY KEY.
    CLASS-METHODS totals EXPORTING VALUE(et_totals) TYPE tt_totals.
ENDCLASS.

CLASS zcl_fa_sales_amdp IMPLEMENTATION.
  METHOD totals BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT OPTIONS READ-ONLY USING vbak.
    et_totals = SELECT * FROM vbak;
  ENDMETHOD.
ENDCLASS.
```

---

## 5. Security

### 5.1 Correct: authorization check before data is shown

<!-- abap-env: product=ecc release=ehp8 database=anydb -->
```abap
* file: src/zfa_auth_check.prog.abap
REPORT zfa_auth_check.
PARAMETERS p_vkorg TYPE vkorg OBLIGATORY.
AT SELECTION-SCREEN.
  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
    ID 'VKORG' FIELD p_vkorg
    ID 'VTWEG' DUMMY
    ID 'SPART' DUMMY
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'No display authorization for sales organization' p_vkorg.
  ENDIF.
```

### 5.2 Incorrect: dynamic WHERE clause built from user input

```abap
CONCATENATE 'KUNNR = ''' p_kunnr '''' INTO lv_where.
SELECT * FROM kna1 INTO TABLE lt_kna1 WHERE (lv_where).
```

---

## 6. Test scenarios checklist

- [ ] ECC 6.0 EHP6 report with classic syntax, ALV, and authorization check
- [ ] S/4HANA 2023 report with modern syntax and no removed tables
- [ ] FOR ALL ENTRIES fix with the empty-driver check
- [ ] Aggregation on ECC with a database other than SAP HANA
