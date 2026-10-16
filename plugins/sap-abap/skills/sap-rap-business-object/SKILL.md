---
name: sap-rap-business-object
description: >-
  Build a managed RAP business object with draft for SAP Fiori elements on ABAP Cloud: database
  table, CDS view entities, behavior definition, behavior pool, projection layer, service
  definition, and service binding. USE FOR: creating or extending a transactional RAP business
  object, adding validations, determinations, actions, or feature control, enabling draft,
  fixing ETag and lock settings, exposing a business object as an OData V4 UI service.
  DO NOT USE FOR: ECC or Standard ABAP reports, Dynpro, or ALV (use sap-abap-standard), SEGW
  OData services (use sap-abap-integration), BOPF-based objects, read-only analytical queries,
  CAP services, freestyle SAPUI5 code, or released-API reviews (use sap-clean-core-check).
license: MIT
compatibility: >-
  SAP BTP ABAP environment, SAP S/4HANA Cloud Public Edition, or SAP S/4HANA 2022 or later using
  the ABAP Cloud development model. ABAP Development Tools (ADT) in Eclipse. A package and
  transport request in the customer namespace (Z or Y, or a registered namespace).
metadata:
  vendor: sap
  product: abap
  category: development
  maturity: beta
  version: "0.1.0"
  sap-products: "s4hana, s4hana-private-cloud, s4hana-public-cloud, btp-abap"
  sap-deployments: "on-premise, azure-iaas, aws-iaas, gcp-iaas, sap-private-cloud, sap-saas"
  abap-language-version: "cloud"
  sap-basis-min: "7.57"
  abap-env-default: "product=s4hana release=2023 language_version=cloud"
  derived-from: incubator/legacy-cowork-skills/sap-abap-fiori-dev
---

# SAP RAP managed business object with draft

Use this skill to produce a working, activatable RAP stack in the order ADT expects, and to
review an existing stack against the same rules. The complete reference implementation is in
[references/travel-example.md](references/travel-example.md). Activation errors and their usual
causes are in [references/troubleshooting.md](references/troubleshooting.md).

## Confirm before writing code

Ask for anything that is not already clear. Wrong answers here cause rework later.

1. Target system and release (BTP ABAP environment, S/4HANA Cloud Public Edition, or S/4HANA
   on-premise or Private Edition with the release number).
2. Package, transport request, and naming prefix (for example `ZFA_` for tables, `ZR_` and
   `ZC_` for views).
3. Business key and whether keys are UUIDs assigned by the framework (recommended) or
   semantic keys entered by users.
4. Whether draft is required. Fiori elements object pages with Edit and Save need draft.
5. Which SAP data the object reads. Only released APIs may be used in ABAP Cloud; check each
   one with the sap-clean-core-check skill before you depend on it.

## Object stack and naming

Create the objects in this order. Activate each layer before starting the next.

| Order | Object | Example name | Notes |
|-------|--------|--------------|-------|
| 1 | Database table | `ZFA_TRAVEL` | Client field, UUID key, admin fields listed below |
| 2 | Root view entity (interface layer) | `ZR_Travel` | `define root view entity`, admin field semantics |
| 3 | Behavior definition | `ZR_Travel` | `managed`, `strict ( 2 )`, `with draft` |
| 4 | Draft table | `ZFA_TRAVEL_D` | Generate from the behavior definition quick fix |
| 5 | Behavior pool | `ZBP_R_Travel` | Global class plus local handler classes |
| 6 | Projection view | `ZC_Travel` | `provider contract transactional_query` |
| 7 | Projection behavior definition | `ZC_Travel` | `projection`, `use draft` |
| 8 | Metadata extension | `ZC_Travel` | UI annotations, `@Metadata.layer: #CORE` |
| 9 | Service definition | `ZUI_Travel` | `expose ZC_Travel as Travel` |
| 10 | Service binding | `ZUI_Travel_O4` | Binding type OData V4 - UI, then Publish |

ADT can generate this whole stack from a table: right-click the table, then
Generate ABAP Repository Objects, then OData UI Service. Use the generator for a first
version and apply the rules below to what it produces.

## Admin fields

Draft handling, ETags, and locking depend on these fields. Use the standard data elements in
the table and the matching annotations in the root view entity.

| Table field | Data element | View annotation |
|-------------|--------------|-----------------|
| `local_created_by` | `abp_creation_user` | `@Semantics.user.createdBy: true` |
| `local_created_at` | `abp_creation_tstmpl` | `@Semantics.systemDateTime.createdAt: true` |
| `local_last_changed_by` | `abp_locinst_lastchange_user` | `@Semantics.user.localInstanceLastChangedBy: true` |
| `local_last_changed_at` | `abp_locinst_lastchange_tstmpl` | `@Semantics.systemDateTime.localInstanceLastChangedAt: true` |
| `last_changed_at` | `abp_lastchange_tstmpl` | `@Semantics.systemDateTime.lastChangedAt: true` |

## Behavior definition rules

- Start with `managed implementation in class zbp_r_<name> unique;`, then `strict ( 2 );`
  and `with draft;`.
- Use `etag master LocalLastChangedAt` and `lock master total etag LastChangedAt`. The total
  ETag protects the active instance while a user edits a draft.
- Declare `field ( numbering : managed, readonly )` for a UUID key so the framework assigns it.
- Mark admin fields and status fields `readonly`; mark user-entered required fields
  `mandatory`.
- Declare every draft action: `Edit`, `Activate optimized`, `Discard`, `Resume`, and
  `draft determine action Prepare` listing each validation, so validations run before
  activation.
- Map CDS element names to table fields in a `mapping for <table>` block.
- Start with `authorization master ( global )`. Add `instance` only when access depends on
  field values, and implement the matching handler method.

## Behavior implementation rules

- Read data with `READ ENTITIES OF <root> IN LOCAL MODE`, not with `SELECT` on the active
  table. EML reads return draft data while the user edits; `SELECT` does not.
- Use `%tky` (transactional key, includes the draft indicator) for every key you pass between
  READ, MODIFY, FAILED, and REPORTED in a draft-enabled object.
- Validations add entries to `failed-<entity>` and `reported-<entity>`. Clear old messages
  first by appending an entry with only `%tky` and `%state_area`, then add the new message
  with the same `%state_area` and `%element` flags so the UI highlights the field.
- Never use `COMMIT WORK`, `ROLLBACK WORK`, or classic `MESSAGE` statements in behavior
  handlers. The RAP framework owns the logical unit of work, and messages go through
  `reported`.
- Use message classes (`new_message( id = ... number = ... severity = ... )`) for translatable
  production messages. `new_message_with_text` is acceptable in prototypes.
- For semantic numbers such as `TravelID`, prefer a number range object
  (`cl_numberrange_runtime=>number_get`) over `SELECT MAX( ... )`, which is not safe when two
  users save at the same time.
- Actions return `result` with `%tky` and `%param`. Use instance feature control
  (`features : instance`) to disable actions that do not apply to the current status.

## Service exposure rules

- The projection view uses `define root view entity ZC_<name> provider contract
  transactional_query as projection on ZR_<name>` and `@Metadata.allowExtensions: true`.
- The projection behavior definition starts with `projection;`, `strict ( 2 );`, and
  `use draft;`, then re-exposes operations and actions with `use create;`, `use action Edit;`,
  and so on.
- Put UI annotations in a metadata extension, not in the projection view.
- Expose the projection in a service definition and bind it as OData V4 - UI. Do not use
  `@OData.publish: true`; that is the pre-RAP approach for CDS views.

## Verify the result

1. Activate all objects; fix activation errors with [references/troubleshooting.md](references/troubleshooting.md).
2. Run ATC with the ABAP Cloud check variant your system provides (for example
   `ABAP_CLOUD_DEVELOPMENT_DEFAULT`) and fix every priority 1 and 2 finding.
3. Publish the service binding and open the Fiori elements preview. Create, edit, and
   activate a draft; confirm that validation messages appear and clear.
4. Add ABAP Unit tests for validations and determinations before handing the object over.

## Output format

When you generate the stack, return each object as a separate code block that starts with a
file marker line using abapGit file names, so reviewers and tools can split it:
`* file: src/zbp_r_travel.clas.abap` for ABAP and `// file: src/zr_travel.ddls.asddls` for CDS.
List any assumption you made (names, release, authorization approach) after the code.
