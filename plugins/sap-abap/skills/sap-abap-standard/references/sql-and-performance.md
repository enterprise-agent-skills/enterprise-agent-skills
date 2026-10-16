# ABAP SQL and performance

Rules that hold on every release, then SAP HANA specifics, then S/4HANA data model changes that
break classic code. Measure before and after with ST05 (SQL trace) and SAT (runtime analysis).

## Rules for every release

| Rule | Why |
|------|-----|
| No `SELECT` inside `LOOP` or `DO` | One database round trip per row is the most common cause of slow ABAP |
| List the columns you need; avoid `SELECT *` | Less data transferred; on SAP HANA (a column store) every extra column costs |
| Use the full primary key or an index in `WHERE` | Otherwise the database scans the table; check indexes in SE11 and the plan in ST05 |
| `SELECT SINGLE` only with the full primary key | Without it the row you get is arbitrary; use `UP TO 1 ROWS` with `ORDER BY` instead |
| Check `IS NOT INITIAL` on the driver table before `FOR ALL ENTRIES` | An empty driver table removes the condition and selects every row |
| Remove duplicates from the driver table (`SORT`, `DELETE ADJACENT DUPLICATES`) | Fewer statements sent to the database |
| Aggregate in the database (`SUM`, `COUNT`, `MAX`, `GROUP BY`) | Avoids transferring rows only to add them up in ABAP |
| Use `PACKAGE SIZE` for very large result sets | Keeps memory bounded |
| Prefer joins over nested selects; on 7.40 SP05 and later consider CDS views | One statement instead of many |
| Read buffered tables without bypassing the buffer when possible | Some clauses (for example aggregates or `DISTINCT`) bypass the table buffer; check in ST05 |
| Internal tables: `SORTED` or `HASHED` keys, or secondary keys, for repeated reads | Linear `READ TABLE` on large standard tables is slow; `BINARY SEARCH` needs sorted data |
| `LOOP AT ... ASSIGNING <fs>` for large rows you change | Avoids copying each row |

Classic syntax (all releases) and new syntax (7.40 SP05 and later) express the same statement
differently; do not mix both styles in one statement. On SP05 to SP07, `INTO` must still come
before `WHERE`; `INTO` as the last clause and inline declarations such as `@DATA( )` need
SP08:

<!-- abap-env: product=ecc release=ehp6 database=anydb -->
```abap
* file: src/zfa_sql_classic.prog.abap
REPORT zfa_sql_classic.
DATA lt_vbak TYPE STANDARD TABLE OF vbak WITH DEFAULT KEY.
PARAMETERS p_vkorg TYPE vkorg.
START-OF-SELECTION.
  SELECT vbeln erdat netwr FROM vbak
    INTO CORRESPONDING FIELDS OF TABLE lt_vbak
    WHERE vkorg = p_vkorg.
```

<!-- abap-env: product=ecc release=ehp7 support_package=5 database=anydb -->
```abap
* file: src/zfa_sql_new.prog.abap
REPORT zfa_sql_new.
DATA lt_vbak TYPE STANDARD TABLE OF vbak WITH EMPTY KEY.
PARAMETERS p_vkorg TYPE vkorg.
START-OF-SELECTION.
  SELECT vbeln, erdat, netwr FROM vbak
    INTO CORRESPONDING FIELDS OF TABLE @lt_vbak
    WHERE vkorg = @p_vkorg.
```

<!-- abap-env: product=ecc release=ehp7 support_package=8 database=anydb -->
```abap
* file: src/zfa_sql_sp08.prog.abap
REPORT zfa_sql_sp08.
PARAMETERS p_vkorg TYPE vkorg.
START-OF-SELECTION.
  SELECT vbeln, erdat, netwr FROM vbak
    WHERE vkorg = @p_vkorg
    INTO TABLE @DATA(lt_vbak).
```

## SAP HANA

- Push data-intensive logic to the database: aggregates (all releases), SQL expressions
  (7.40 SP05 and later), CDS views, and, where needed, AMDP (`BY DATABASE PROCEDURE FOR HDB`).
- AMDP and CDS table functions run only on SAP HANA. ECC on another database cannot use them.
- Avoid row-by-row processing of large data in ABAP; it wastes the column store.
- Native SQL and database hints tie code to one database; use them only with a documented
  reason.
- ABAP code that ran on another database can have different sort behavior on SAP HANA: a
  `SELECT` without `ORDER BY` returns rows in no guaranteed order. Add `ORDER BY` or sort in
  ABAP where order matters, a common finding when moving ECC to SAP HANA.

## S/4HANA data model changes that affect classic code

Custom code from ECC often compiles on S/4HANA but behaves wrongly because tables changed. Check
SAP's simplification items for your release (Simplification Item Catalog, and the ATC check
variant for S/4HANA readiness) before reusing ECC code. Common examples:

| ECC | S/4HANA | Impact |
|-----|---------|--------|
| Sales status tables VBUK, VBUP | Status fields moved into VBAK, VBAP, and other document tables | Selects on VBUK/VBUP must be rewritten |
| Pricing conditions in KONV | PRCD_ELEMENTS | Direct reads of KONV must be rewritten |
| Material documents MKPF, MSEG | MATDOC (compatibility views exist for reads) | Do not write to the old tables; reads should move to MATDOC or released views |
| FI index tables BSIS, BSAS, BSID, BSAD, BSIK, BSAK | Universal journal ACDOCA; the old names are compatibility views | Reads keep working; writes are not possible |
| Material number up to 18 characters | Up to 40 characters | Use data element `MATNR`, never hardcoded lengths or offsets |
| Customer and vendor masters maintained directly | Business partner with customer/vendor integration | Create and change via business partner APIs |

Verify each item against SAP's documentation for the exact release; details vary between
S/4HANA releases.
