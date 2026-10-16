# Quality and operations

ABAP Unit, static checks, transports, and the transactions used to find out why something
failed. Release notes refer to SAP_BASIS.

## ABAP Unit

Put tests in local test classes: in the test class include of a global class
(`zcl_name.clas.testclasses.abap` in abapGit), or at the end of a report.

On 7.02 and later:

<!-- abap-env: product=ecc release=ehp5 database=anydb -->
```abap
* file: src/zfa_pricing_702.prog.abap
REPORT zfa_pricing_702.

CLASS lcl_pricing DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS discount IMPORTING iv_amount TYPE i RETURNING VALUE(rv_discount) TYPE i.
ENDCLASS.

CLASS lcl_pricing IMPLEMENTATION.
  METHOD discount.
    IF iv_amount >= 1000.
      rv_discount = iv_amount / 20.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS ltc_pricing DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    DATA mo_cut TYPE REF TO lcl_pricing.
    METHODS setup.
    METHODS discount_for_large_order FOR TESTING.
ENDCLASS.

CLASS ltc_pricing IMPLEMENTATION.
  METHOD setup.
    CREATE OBJECT mo_cut.
  ENDMETHOD.

  METHOD discount_for_large_order.
    cl_abap_unit_assert=>assert_equals( act = mo_cut->discount( 1000 ) exp = 50 ).
  ENDMETHOD.
ENDCLASS.
```

On 7.00 and 7.01 (ECC 6.0 up to EHP4) the same test needs three changes: pseudo comments
instead of `RISK LEVEL` and `DURATION`, `CL_AUNIT_ASSERT` instead of `CL_ABAP_UNIT_ASSERT`,
and a helper variable instead of a method call as an actual parameter (actual parameters
became general expression positions only in 7.02):

<!-- abap-env: product=ecc release=ehp4 database=anydb -->
```abap
* file: src/zfa_pricing_700.prog.abap
REPORT zfa_pricing_700.

CLASS lcl_pricing DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS discount IMPORTING iv_amount TYPE i RETURNING VALUE(rv_discount) TYPE i.
ENDCLASS.

CLASS lcl_pricing IMPLEMENTATION.
  METHOD discount.
    IF iv_amount >= 1000.
      rv_discount = iv_amount / 20.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS ltc_pricing DEFINITION FINAL FOR TESTING. "#AU Risk_Level Harmless
  "#AU Duration Short
  PRIVATE SECTION.
    DATA mo_cut TYPE REF TO lcl_pricing.
    METHODS setup.
    METHODS discount_for_large_order FOR TESTING.
ENDCLASS.

CLASS ltc_pricing IMPLEMENTATION.
  METHOD setup.
    CREATE OBJECT mo_cut.
  ENDMETHOD.

  METHOD discount_for_large_order.
    DATA lv_discount TYPE i.
    lv_discount = mo_cut->discount( 1000 ).
    cl_aunit_assert=>assert_equals( act = lv_discount exp = 50 ).
  ENDMETHOD.
ENDCLASS.
```

Guidelines:

- One behavior per test method; name it after the behavior. Use `setup` to create the object
  under test, and `teardown` only when the test changes shared state.
- `RISK LEVEL HARMLESS` means the test changes nothing persistent. Tests that write to the
  database are not unit tests; isolate the database instead.
- Run tests in SAP GUI (Program > Execute > Unit Tests in the ABAP Editor) or in ADT (Run As >
  ABAP Unit Test), and with ATC so they run before every transport.
- From 7.02, ABAP Unit can measure statement coverage through the Coverage Analyzer.

### Isolating dependencies

| Technique | Release | Use when |
|-----------|---------|----------|
| Interface plus constructor or setter injection | All | Default. Production code depends on `lif_order_reader`; the test passes a local test double |
| `INTERFACES lif_x PARTIALLY IMPLEMENTED` in a test double | 7.40 SP02 | The interface is large and the test needs only a few methods |
| Test seams (`TEST-SEAM` and `TEST-INJECTION`) | 7.50 | Legacy code in classes or function groups that cannot be restructured yet; prefer injection for new code. Not usable in reports, because injections need a test include |
| SAP test double frameworks (`CL_ABAP_TESTDOUBLE`, `CL_OSQL_TEST_ENVIRONMENT`, `CL_CDS_TEST_ENVIRONMENT`) | Newer releases | Check in SE24 that the class exists on the target before using it |

## Static checks

| Check | Where | Notes |
|-------|-------|-------|
| Syntax check | Ctrl+F2 in SAP GUI and ADT | Run before every activation |
| Extended program check | SLIN | All releases; finds unused variables, missing `sy-subrc` checks, and similar |
| Code Inspector | SCI and SCII | All releases; check variants configured by the customer |
| ABAP Test Cockpit (ATC) | SE80, ADT, ATC | From 7.02 SP12; runs Code Inspector checks, unit tests, and the customer's check variant, often with a release check before transport |

Fix priority 1 and 2 findings before release. When a finding is intentionally accepted, use
an ATC exemption with a reason, or a pragma or pseudo comment for the specific statement,
never a blanket suppression. Custom code checks for an S/4HANA conversion run in ATC with
SAP's S/4HANA readiness check variants, usually from a central check system.

## Transports

- Create objects in a transportable package, not in `$TMP`, and record them on a workbench
  request (SE09 or SE10). Customizing goes on a customizing request.
- One logical change per request. Release the tasks, then the request.
- Import into the quality system first, test there, then import into production (STMS).
- Objects stay locked to the request until it is released; coordinate with other developers
  before changing an object locked by someone else.
- Many teams use abapGit for version control alongside transports, or gCTS on S/4HANA. Neither
  replaces the transport into production unless the landscape is set up for it.

## Troubleshooting

| Symptom | Transaction | What to look at |
|---------|-------------|-----------------|
| Short dump | ST22 | Error analysis, source code extract, and the active call stack |
| System-wide errors | SM21 | System log for the time of the problem |
| Messages written by the application | SLG1 | Application log; log objects are defined in SLG0 |
| Background job failed | SM37 | Job log and spool |
| Update terminated (express mail "update was terminated") | SM13 | Failed update requests and their dumps |
| Lock problems | SM12 | Lock entries, owner, and age |
| Long-running process | SM50, SM66 | Work processes, current program and statement |
| Slow SQL | ST05 | SQL trace: statements, duplicates, missing index use |
| Slow ABAP | SAT (SE30 before 7.02) | Runtime analysis: hit list and call hierarchy |
| Authorization denied | SU53, ST01 | Last failed check; authorization trace |
| Logic error | `/h`, breakpoints | Debugger; external (user) breakpoints for RFC and HTTP calls; debugger scripting from 7.02 |
| Assertions and log points | SAAB | Activate checkpoint groups for `ASSERT ID` and `LOG-POINT ID` |

RFC, IDoc, and OData monitoring (SM58, WE02, BD87, /IWFND/ERROR_LOG) is covered in
sap-abap-integration.
