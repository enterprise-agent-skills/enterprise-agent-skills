import { test } from "node:test";
import assert from "node:assert/strict";
import { runValidators } from "../harness/validators.mjs";
import { loadLanguageFeatures, loadSapEnvironments, parseEnvString, parseRelease, resolveEnvironment } from "../harness/sap-env.mjs";

/**
 * Release-specific positive and negative fixtures from config/abap-language-features.yaml.
 * Each feature program must fail on the release before the one that introduced it and pass
 * from that release on; each older equivalent must pass on the older release. Offline only:
 * abaplint plus the feature rules in config/sap-environments.yaml, no SAP system.
 */

/** One target per grammar step, oldest first. Deployment is irrelevant and left at its default. */
const POINTS = [
  ["7.00", "product=ecc release=ehp0 database=anydb"],
  ["7.02", "product=ecc release=ehp5 database=anydb"],
  ["7.31", "product=ecc release=ehp6 database=anydb"],
  ["7.40 SP02", "product=ecc release=ehp7 support_package=2 database=anydb"],
  ["7.40 SP05", "product=ecc release=ehp7 support_package=5 database=anydb"],
  ["7.40 SP08", "product=ecc release=ehp7 support_package=8 database=anydb"],
  ["7.50", "product=ecc release=ehp8 database=anydb"],
  ["7.51", "product=s4hana release=1610"],
  ["7.52", "product=s4hana release=1709"],
  ["7.53", "product=s4hana release=1809"],
  ["7.54", "product=s4hana release=1909"],
  ["7.55", "product=s4hana release=2020"],
  ["7.56", "product=s4hana release=2021"],
  ["7.57", "product=s4hana release=2022"],
  ["7.58", "product=s4hana release=2023"],
  ["8.16", "product=s4hana release=2025"],
].map(([release, env]) => ({ release, rank: parseRelease(release).rank, env: resolveEnvironment(parseEnvString(env)) }));

const LATEST = POINTS.at(-1);
const before = (rank) => [...POINTS].reverse().find((p) => p.rank < rank);
const atOrAfter = (rank) => POINTS.find((p) => p.rank >= rank);

async function check(feature, source, point) {
  const file = feature.file ?? "zfa_feature.prog.abap";
  const content = feature.file ? source : `REPORT zfa_feature.\n${source}`;
  const { results } = await runValidators([{ path: `src/${file}`, content }], { abapEnv: point.env });
  const failed = results.filter((r) => r.status !== "passed");
  return { ok: failed.length === 0, failed, text: failed.flatMap((r) => r.messages).join(" | ") };
}

function rejectedBy(result, checkedBy) {
  if (checkedBy === "abaplint") return result.failed.some((r) => r.validator === "abaplint");
  const id = checkedBy.slice("rule:".length);
  return result.failed.some((r) => r.validator === "sap-environment" && r.messages.some((m) => m.startsWith(`[${id}]`)));
}

const { features } = loadLanguageFeatures();

test("release points resolve to the expected grammar steps", () => {
  for (const p of POINTS) assert.ok(p.env.ok, `${p.release}: ${p.env.errors?.join("; ")}`);
  assert.equal(POINTS.find((p) => p.release === "7.31").env.grammar, "v702");
  assert.equal(POINTS.find((p) => p.release === "7.40 SP05").env.grammar, "v740sp05");
});

test("manifest: unique ids, known releases, and rules that exist", () => {
  const rules = new Set(loadSapEnvironments().feature_rules.map((r) => r.id));
  const ids = new Set();
  for (const f of features) {
    assert.ok(!ids.has(f.id), `duplicate feature id ${f.id}`);
    ids.add(f.id);
    for (const key of ["since", "validator_from"]) {
      if (f[key] === undefined) continue;
      const rank = parseRelease(f[key])?.rank;
      assert.ok(rank && POINTS.some((p) => p.rank === rank), `${f.id}: ${key} ${f[key]} is not a release point of this test`);
    }
    if (f.checked_by.startsWith("rule:")) assert.ok(rules.has(f.checked_by.slice(5)), `${f.id}: unknown ${f.checked_by}`);
  }
});

for (const f of features) {
  const since = parseRelease(f.since).rank;
  const from = parseRelease(f.validator_from ?? f.since).rank;

  test(`${f.id}: rejected before ${f.since}, accepted from ${f.validator_from ?? f.since}`, async () => {
    const prev = before(since);
    if (prev) {
      const r = await check(f, f.test, prev);
      assert.equal(r.ok, false, `${f.id} must fail on ${prev.release}`);
      assert.ok(rejectedBy(r, f.checked_by), `${f.id} on ${prev.release} must be rejected by ${f.checked_by}; got: ${r.text}`);
    }
    if (from > since) {
      // Documented conservative gap: SAP supports the feature, the offline check does not yet.
      const gap = before(from);
      assert.equal((await check(f, f.test, gap)).ok, false, `${f.id}: validator_from says ${gap.release} is rejected; remove validator_from if this now passes`);
    }
    for (const p of [atOrAfter(from), LATEST]) {
      const r = await check(f, f.test, p);
      assert.ok(r.ok, `${f.id} must pass on ${p.release}: ${r.text}`);
    }
  });

  if (f.test_older) {
    test(`${f.id}: the equivalent without the feature compiles before ${f.since} and on the newest release`, async () => {
      for (const p of [before(since), LATEST].filter(Boolean)) {
        const r = await check(f, f.test_older, p);
        assert.ok(r.ok, `${f.id} test_older must pass on ${p.release}: ${r.text}`);
      }
    });
  }
}

test("feature rules ignore classic statements, comments, and literals that resemble newer syntax", async () => {
  const classic = [
    "TABLES t000.",
    "DATA lt_t000 TYPE STANDARD TABLE OF t000.",
    "DATA lv_file TYPE string.",
    "DATA lv_base TYPE i.",
    "DATA lv_total TYPE i.",
    "DATA lv_m TYPE t000-mandt.",
    "SELECT-OPTIONS s_mandt FOR lv_m.",
    "PARAMETERS p_file TYPE rlgrap-filename LOWER CASE.",
    "CLASS lcl_handler DEFINITION.",
    "  PUBLIC SECTION.",
    "    METHODS on_change FOR EVENT data_changed OF cl_gui_alv_grid.",
    "ENDCLASS.",
    "CLASS lcl_handler IMPLEMENTATION.",
    "  METHOD on_change.",
    "  ENDMETHOD.",
    "ENDCLASS.",
    "CLASS ltc_test DEFINITION FOR TESTING.",
    "  PRIVATE SECTION.",
    "    METHODS run FOR TESTING.",
    "ENDCLASS.",
    "CLASS ltc_test IMPLEMENTATION.",
    "  METHOD run.",
    "  ENDMETHOD.",
    "ENDCLASS.",
    "AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.",
    "  WRITE 'F4 help'.",
    "START-OF-SELECTION.",
    "* Comment lines may mention lt_a && lt_b, FOR ls_x IN lt_x, @( x ), and lo->a( )->b( ).",
    "  WRITE 'Literal with && and FOR x IN y and @( z )'. \" FOR wa IN itab",
    "  lv_total = ( lv_base * 2 ).",
    "  OPEN DATASET lv_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.",
    "  CLOSE DATASET lv_file.",
    "  OPEN DATASET lv_file FOR OUTPUT IN BINARY MODE.",
    "  CLOSE DATASET lv_file.",
    "  SELECT * FROM t000 INTO TABLE lt_t000 WHERE mandt IN s_mandt.",
    "  IF lt_t000 IS NOT INITIAL.",
    "    SELECT * FROM t000 INTO TABLE lt_t000 FOR ALL ENTRIES IN lt_t000 WHERE mandt = lt_t000-mandt.",
    "  ENDIF.",
    "  SELECT SINGLE FOR UPDATE * FROM t000 WHERE mandt = '000'.",
  ].join("\n");
  const feature = { checked_by: "abaplint" };
  for (const p of [POINTS[0], LATEST]) {
    const r = await check(feature, classic, p);
    assert.ok(r.ok, `classic program must pass on ${p.release}: ${r.text}`);
  }
});
