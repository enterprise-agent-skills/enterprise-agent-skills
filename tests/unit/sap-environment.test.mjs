import { test } from "node:test";
import assert from "node:assert/strict";
import { basisValue, parseEnvString, resolveEnvironment, checkEnvironmentRules } from "../harness/sap-env.mjs";
import { runValidators } from "../harness/validators.mjs";

// Positive and negative fixtures for release-aware ABAP validation. Every "rejects" test is a
// negative control: if the grammar or rule silently accepted the code, the test would fail.

const env = (text) => resolveEnvironment(parseEnvString(text));
const report = (name, body) => [{ path: `src/${name}.prog.abap`, content: `REPORT ${name}.\n${body}\n` }];

async function abap(files, environment) {
  const { results } = await runValidators(files, { abapEnv: environment });
  return results;
}

test("environment strings parse into fields", () => {
  assert.deepEqual(parseEnvString("product=ecc release=ehp7 support_package=8 database=anydb"), { product: "ecc", release: "ehp7", support_package: 8, database: "anydb" });
  assert.throws(() => parseEnvString("product"), /key=value/);
  assert.equal(basisValue("7.40"), 740);
  assert.equal(basisValue("8.16"), 816);
  assert.ok(Number.isNaN(basisValue("740")));
});

test("ECC releases resolve to SAP_BASIS and a conservative abaplint grammar", () => {
  const ehp6 = env("product=ecc release=ehp6 database=anydb");
  assert.equal(ehp6.ok, true, ehp6.errors.join("; "));
  assert.equal(ehp6.sapBasis, "7.31");
  assert.equal(ehp6.grammar, "v702", "7.31 has no own grammar and maps down to 7.02");
  const ehp8 = env("product=ecc release=ehp8 database=hana");
  assert.equal(ehp8.grammar, "v750");
  assert.equal(ehp8.languageVersion, "standard");
});

test("SAP_BASIS 7.40 needs a support package because syntax differs by SP", () => {
  assert.equal(env("product=ecc release=ehp7 database=anydb").ok, false);
  assert.equal(env("product=ecc release=ehp7 support_package=2 database=anydb").grammar, "v740sp02");
  assert.equal(env("product=ecc release=ehp7 support_package=5 database=anydb").grammar, "v740sp05");
  assert.equal(env("product=ecc release=ehp7 support_package=12 database=anydb").grammar, "v740sp08");
});

test("deployment is recorded but does not change the grammar", () => {
  const onPrem = env("product=ecc release=ehp8 database=anydb deployment=on-premise");
  const azure = env("product=ecc release=ehp8 database=anydb deployment=azure-iaas");
  const aws = env("product=ecc release=ehp8 database=anydb deployment=aws-iaas");
  assert.equal(onPrem.grammar, azure.grammar);
  assert.equal(azure.grammar, aws.grammar);
  assert.equal(azure.languageVersion, "standard", "ECC on Azure VMs is still Standard ABAP");
});

test("invalid combinations are rejected with a reason", () => {
  assert.match(env("product=ecc release=ehp8 database=anydb language_version=cloud").errors.join(" "), /does not support language version/);
  assert.match(env("product=s4hana release=2023 database=anydb").errors.join(" "), /does not run on database/);
  assert.match(env("product=ecc release=ehp9 database=anydb").errors.join(" "), /Unknown release/);
  assert.match(env("product=ecc release=ehp8").errors.join(" "), /set database/);
  assert.match(env("product=s4hana release=1909 language_version=cloud").errors.join(" "), /ABAP for Cloud Development needs SAP_BASIS/);
  assert.match(env("product=mainframe").errors.join(" "), /Unknown or missing SAP product/);
});

test("Standard ABAP: classic statements are accepted, not treated as ABAP Cloud violations", async () => {
  const files = report("zfa_classic", "PARAMETERS p_bukrs TYPE bukrs.\nSTART-OF-SELECTION.\n  WRITE: / 'Company code', p_bukrs.\n  CALL FUNCTION 'POPUP_TO_INFORM' EXPORTING titel = 'Info' txt1 = 'Done' txt2 = space.");
  const results = await abap(files, env("product=ecc release=ehp8 database=anydb"));
  assert.deepEqual(results.map((r) => r.status), ["passed"], JSON.stringify(results));
});

test("ABAP Cloud: the same classic report is rejected", async () => {
  const files = report("zfa_classic", "START-OF-SELECTION.\n  WRITE / 'x'.");
  const results = await abap(files, env("product=s4hana release=2023 language_version=cloud"));
  assert.equal(results[0].status, "failed");
});

test("release-specific syntax: inline declarations rejected on 7.31, accepted on 7.40 SP02", async () => {
  const files = report("zfa_inline", "START-OF-SELECTION.\n  DATA(lv_count) = 1.\n  WRITE lv_count.");
  const old = await abap(files, env("product=ecc release=ehp6 database=anydb"));
  assert.equal(old[0].status, "failed");
  const newer = await abap(files, env("product=ecc release=ehp7 support_package=2 database=anydb"));
  assert.equal(newer[0].status, "passed", newer[0].messages.join("; "));
});

test("release-specific syntax: new Open SQL syntax rejected on 7.40 SP02, accepted on SP05", async () => {
  const files = report("zfa_sql", "DATA lt_t000 TYPE STANDARD TABLE OF t000.\nSTART-OF-SELECTION.\n  SELECT mandt, mtext FROM t000 INTO CORRESPONDING FIELDS OF TABLE @lt_t000.");
  assert.equal((await abap(files, env("product=ecc release=ehp7 support_package=2 database=anydb")))[0].status, "failed");
  assert.equal((await abap(files, env("product=ecc release=ehp7 support_package=5 database=anydb")))[0].status, "passed");
});

test("release-specific syntax: REDUCE rejected on 7.40 SP05, accepted on SP08", async () => {
  const files = report("zfa_reduce", "TYPES tt_int TYPE STANDARD TABLE OF i WITH EMPTY KEY.\nDATA lt_int TYPE tt_int.\nDATA lv_sum TYPE i.\nSTART-OF-SELECTION.\n  lv_sum = REDUCE i( INIT s = 0 FOR x IN lt_int NEXT s = s + x ).\n  WRITE lv_sum.");
  assert.equal((await abap(files, env("product=ecc release=ehp7 support_package=5 database=anydb")))[0].status, "failed");
  assert.equal((await abap(files, env("product=ecc release=ehp7 support_package=8 database=anydb")))[0].status, "passed");
});

test("syntax check catches undefined variables in the sample but not missing SAP standard objects", async () => {
  const undefinedVar = report("zfa_undef", "START-OF-SELECTION.\n  WRITE lv_not_declared.");
  assert.equal((await abap(undefinedVar, env("product=ecc release=ehp8 database=anydb")))[0].status, "failed");
  const standardObjects = report("zfa_std", "DATA ls_vbak TYPE vbak.\nSTART-OF-SELECTION.\n  SELECT SINGLE * FROM vbak INTO ls_vbak WHERE vbeln = '0000000001'.\n  WRITE ls_vbak-vbeln.");
  assert.equal((await abap(standardObjects, env("product=ecc release=ehp8 database=anydb")))[0].status, "passed");
});

test("environment rules: CDS view entities need 7.55, DDIC-based CDS views need 7.40 SP05", () => {
  const entity = [{ path: "src/zfa_i_order.ddls.asddls", content: "define view entity ZFA_I_Order as select from vbak { key vbeln as SalesOrder }" }];
  assert.equal(checkEnvironmentRules(entity, env("product=ecc release=ehp8 database=hana")).length, 1);
  assert.equal(checkEnvironmentRules(entity, env("product=s4hana release=2020")).length, 0);
  const ddic = [{ path: "src/zfa_v_order.ddls.asddls", content: "@AbapCatalog.sqlViewName: 'ZFAVORD'\ndefine view ZFA_V_Order as select from vbak { key vbeln }" }];
  assert.equal(checkEnvironmentRules(ddic, env("product=ecc release=ehp6 database=anydb")).length, 1);
  assert.equal(checkEnvironmentRules(ddic, env("product=ecc release=ehp7 support_package=5 database=anydb")).length, 0);
});

test("environment rules: AMDP needs SAP HANA", () => {
  const amdp = [{ path: "src/zcl_fa_amdp.clas.abap", content: "METHOD get BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT OPTIONS READ-ONLY USING vbak.\nENDMETHOD." }];
  const anydb = checkEnvironmentRules(amdp, env("product=ecc release=ehp8 database=anydb"));
  assert.equal(anydb.length, 1);
  assert.match(anydb[0].messages.join(" "), /SAP HANA/);
  assert.equal(checkEnvironmentRules(amdp, env("product=ecc release=ehp8 database=hana")).length, 0);
});

test("ABAP files without an environment fail with guidance instead of guessing", async () => {
  const results = await abap(report("zfa_noenv", "WRITE 'x'."), null);
  assert.equal(results[0].status, "failed");
  assert.match(results[0].messages[0], /No SAP environment/);
});

test("release mapping follows SAP: EHP6 and NetWeaver 7.0 EHP3 are SAP_BASIS 7.31, S/4HANA 2025 is 8.16", () => {
  assert.equal(env("product=netweaver release=703 database=anydb").sapBasis, "7.31");
  assert.equal(env("product=ecc release=ehp6 database=anydb").grammar, "v702");
  const s4 = env("product=s4hana release=2025");
  assert.equal(s4.ok, true, s4.errors.join("; "));
  assert.equal(s4.sapBasis, "8.16");
  assert.equal(s4.grammar, "v816");
  assert.equal(env("product=s4hana-private-cloud release=2025").grammar, "v816");
  assert.equal(env("product=netweaver release=752 database=anydb").grammar, "v752");
});

test("ECC runs on SAP HANA only from SAP_BASIS 7.40", () => {
  const old = env("product=ecc release=ehp6 database=hana");
  assert.equal(old.ok, false);
  assert.match(old.errors.join(" "), /SAP HANA only from SAP_BASIS 7.40/);
  assert.equal(env("product=ecc release=ehp6-hana support_package=2 database=hana").ok, true);
  assert.equal(env("product=ecc release=ehp8 database=hana").ok, true);
});

test("environment rules: RAP behavior definitions need the release that introduced each feature", () => {
  const bdef = (content) => [{ path: "src/zr_fa_order.bdef.asbdef", content }];
  const managedDraft = bdef("managed implementation in class zbp_r_fa_order unique;\nstrict ( 2 );\nwith draft;\ndefine behavior for ZR_FA_Order alias Order\n{\n  create;\n}");
  const on1909 = checkEnvironmentRules(managedDraft, env("product=s4hana release=1909"));
  assert.equal(on1909.length, 1);
  const ids = on1909[0].messages.map((m) => m.match(/^\[([a-z0-9-]+)\]/)[1]);
  assert.deepEqual(ids.sort(), ["bdef-strict-2", "rap-draft", "rap-managed"]);
  assert.match(checkEnvironmentRules(managedDraft, env("product=s4hana release=2021"))[0].messages.join(" "), /bdef-strict-2/);
  assert.equal(checkEnvironmentRules(managedDraft, env("product=s4hana release=2022")).length, 0);
  const unmanaged = bdef("unmanaged implementation in class zbp_r_fa_order unique;\ndefine behavior for ZR_FA_Order\n{\n  update;\n}");
  assert.equal(checkEnvironmentRules(unmanaged, env("product=s4hana release=1809")).length, 1);
  assert.equal(checkEnvironmentRules(unmanaged, env("product=s4hana release=1909")).length, 0);
  // Comments do not trigger rules.
  assert.equal(checkEnvironmentRules(bdef("// with draft; strict ( 2 );\nunmanaged implementation in class zbp_x unique;"), env("product=s4hana release=1909")).length, 0);
});

test("environment rules: CDS table functions need SAP HANA and 7.50", () => {
  const tf = [{ path: "src/zfa_tf_sales.ddls.asddls", content: "define table function ZFA_TF_Sales returns { client : abap.clnt; vbeln : vbeln_va; } implemented by method zcl_fa_tf=>read;" }];
  assert.equal(checkEnvironmentRules(tf, env("product=ecc release=ehp8 database=anydb")).length, 1);
  assert.equal(checkEnvironmentRules(tf, env("product=ecc release=ehp7 support_package=8 database=hana")).length, 1);
  assert.equal(checkEnvironmentRules(tf, env("product=ecc release=ehp8 database=hana")).length, 0);
});

test("context files: an interface quoted in the prompt resolves references but is not graded", async () => {
  const impl = [{ path: "src/zcl_fa_discount_1000.clas.abap", content: "CLASS zcl_fa_discount_1000 DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES zif_badi_discount.\nENDCLASS.\n\nCLASS zcl_fa_discount_1000 IMPLEMENTATION.\n  METHOD zif_badi_discount~get_discount.\n    IF iv_netwr > 10000.\n      ev_discount = iv_netwr * 5 / 100.\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n" }];
  const intf = [{ path: "src/zif_badi_discount.intf.abap", content: "INTERFACE zif_badi_discount PUBLIC.\n  INTERFACES if_badi_interface.\n  METHODS get_discount\n    IMPORTING iv_kunnr    TYPE kunnr\n              iv_netwr    TYPE netwr\n    EXPORTING ev_discount TYPE netwr.\nENDINTERFACE.\n" }];
  const environment = env("product=ecc release=ehp8 database=anydb");
  const without = await runValidators(impl, { abapEnv: environment });
  assert.equal(without.results[0].status, "failed", "without the interface, abaplint cannot see the method");
  const withContext = await runValidators(impl, { abapEnv: environment, contextFiles: intf });
  assert.equal(withContext.results.length, 1, "context files are not reported");
  assert.equal(withContext.results[0].status, "passed", withContext.results[0].messages.join("; "));
  const typo = [{ path: impl[0].path, content: impl[0].content.replace("ev_discount = iv_netwr", "ev_discount = iv_netwrx") }];
  assert.equal((await runValidators(typo, { abapEnv: environment, contextFiles: intf })).results[0].status, "failed");
});

test("function modules: abaplint cannot syntax-check them, so release rules still gate inline declarations", async () => {
  const fm = (body) => [{ path: "src/zfa_fg.fugr.z_fa_check.abap", content: `FUNCTION z_fa_check.\n${body}\nENDFUNCTION.\n` }];
  const inline = fm("  DATA(lv_count) = 1.\n  WRITE lv_count.");
  const on731 = await abap(inline, env("product=ecc release=ehp6 database=anydb"));
  assert.ok(on731.some((r) => r.validator === "sap-environment" && r.messages.some((m) => m.startsWith("[inline-declarations]"))), JSON.stringify(on731));
  assert.ok((await abap(inline, env("product=ecc release=ehp7 support_package=2 database=anydb"))).every((r) => r.status === "passed"));
  const final = fm("  FINAL(lv_limit) = 100.\n  WRITE lv_limit.");
  assert.ok((await abap(final, env("product=s4hana release=2021"))).some((r) => r.messages.some((m) => m.startsWith("[final-inline-declarations]"))));
  assert.ok((await abap(final, env("product=s4hana release=2022"))).every((r) => r.status === "passed"));
  // Method calls named data( ) and SQL @DATA( ) are not inline declarations of the DATA( ) kind.
  const lookalike = fm("  DATA lo_x TYPE REF TO zcl_fa_x.\n  lo_x->data( ).");
  assert.ok((await abap(lookalike, env("product=ecc release=ehp6 database=anydb"))).every((r) => r.status === "passed"));
});
