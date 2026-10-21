# Troubleshooting RAP business objects

Message texts vary by release, so match on the meaning rather than the exact wording. Fix
problems in stack order: table, root view, behavior definition, behavior pool, projection,
service.

## Activation problems

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Behavior definition reports that the draft table does not match the entity | Fields were added to the root view after the draft table was generated | Run the quick fix on the `draft table` statement again, or add the new fields to the draft table with the CDS element names |
| Error about the total ETag or lock master | `LastChangedAt` lacks `@Semantics.systemDateTime.lastChangedAt: true`, or the field is missing from the view | Add the field and annotation in the root view entity, activate it, then the behavior definition |
| Error that a determination, validation, or action has no implementation | Behavior pool is missing the handler method, or the method name does not match the `FOR ... Travel~name` clause | Use the ADT quick fix on the behavior definition to generate missing methods |
| Strict mode errors after adding `strict ( 2 )` | Older syntax that strict mode rejects, for example missing authorization declarations | Fix each reported statement; strict mode surfaces problems that would otherwise fail at runtime |
| Projection behavior definition cannot find an action | The action is missing in the base behavior definition, or was not activated | Activate the base behavior definition first, then add `use action <name>;` |
| Syntax error at `optimized` in `draft action Activate optimized` | The addition needs SAP_BASIS 7.58 (S/4HANA 2023); the system runs S/4HANA 2022 (7.57) | Write `draft action Activate;` |

## Runtime problems

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Short dump `BEHAVIOR_ILLEGAL_STATEMENT` | `COMMIT WORK`, `ROLLBACK WORK`, or another statement the RAP framework forbids inside a handler | Remove the statement. The framework controls the logical unit of work |
| Values entered in the UI are not saved | The `mapping for` block misses a field, or the field is `readonly` | Add the mapping line; check field control |
| Validation messages stay after the user fixes the data | Old messages were not cleared | Append an entry with only `%tky` and `%state_area` before adding new messages |
| Validation does not run before Activate | Validation is not listed in `draft determine action Prepare` | Add it to the Prepare block |
| Draft instance not found in READ or MODIFY | `%key` was used instead of `%tky` | Use `%tky` everywhere in draft-enabled objects |
| Duplicate semantic numbers under load | Numbers come from `SELECT MAX( ... )` | Use a number range object with `cl_numberrange_runtime=>number_get` |
| Two users save over each other's changes through the OData service | The projection behavior definition has no `use etag`, so the service has no optimistic concurrency control | Add `use etag` on the line after each `define behavior for` in the projection, before the opening brace |
| Preview shows no data | Service binding not published, or the user lacks authorization | Publish the binding (on S/4HANA on premises or Private Edition, in transaction `/IWFND/V4_ADMIN`); check access control and authorization implementation |

## Checks before handover

1. ATC with the ABAP Cloud check variant shows no priority 1 or 2 findings.
2. Fiori elements preview: create, edit, activate, discard, and the custom action work.
3. ABAP Unit tests cover each validation and determination.
4. Transport contains every object in the stack, including the draft table and service binding.
