---
name: salesforce-apex-trigger-framework
description: >-
  Implement Apex triggers with the one-trigger-per-object handler pattern: bulk-safe logic,
  recursion control that works across 200-record chunks, user-mode data access, field-level
  errors, and unit tests with full batches. USE FOR: writing or refactoring Apex triggers and
  handler classes, fixing governor limit errors caused by SOQL or DML inside loops, adding
  recursion guards, writing or repairing trigger tests. DO NOT USE FOR: Lightning Web
  Components, Flow-only automation, Agentforce agent configuration, Data Cloud, or managed
  package security review submissions.
license: MIT
compatibility: >-
  Salesforce org with Apex enabled (Developer Edition, sandbox, or scratch org) and API version
  60.0 or later for WITH USER_MODE, AccessLevel.USER_MODE, and the Assert class. Salesforce CLI
  (sf) to deploy and run tests.
metadata:
  vendor: salesforce
  product: apex
  category: development
  maturity: beta
  version: "0.1.0"
---

# Salesforce Apex trigger framework

Use this skill to write triggers that stay inside governor limits for any batch size and that
other developers can extend. The complete trigger, handler, and test class are in
[references/handler-and-tests.md](references/handler-and-tests.md).

## Structure

1. **One trigger per object.** The trigger declares every event it handles and contains a
   single line that delegates to a handler class. Multiple triggers on one object run in an
   undefined order.
2. **Handler class.** Name it `<Object>TriggerHandler`. Route by event with
   `switch on Trigger.operationType` and `when BEFORE_INSERT, BEFORE_UPDATE` style branches.
3. **Before vs after.** Validate and change fields of the triggering records in before
   events (no DML needed). Create or update related records in after events, when record Ids
   exist.

## Bulk safety

Salesforce delivers up to 200 records per trigger invocation, and larger operations call the
trigger several times in one transaction.

- Never run SOQL or DML inside a loop. Collect Ids into a `Set<Id>`, query once into a
  `Map<Id, SObject>`, build a `List<SObject>` of changes, and perform one DML statement.
- Compare against `Trigger.oldMap` to act only on records whose relevant fields changed.
- Keep the handler free of hardcoded record Ids.

## Recursion control

Guard with a static `Set<Id>` of records already processed in this transaction. Do not use a
static `Boolean` flag: it blocks the second and later 200-record chunks of the same DML
operation, which silently skips records.

## Security

- Declare the handler `with sharing` (or `inherited sharing` for utility classes) so record
  access follows the running user's sharing rules.
- Add `WITH USER_MODE` to SOQL and pass `AccessLevel.USER_MODE` to `Database` DML methods when
  the operation should respect the user's object and field permissions. Trigger code runs in
  system mode by default, so choose deliberately and say which you chose.
- Report validation problems with `record.addError(Schema.SObjectField, message)` so the
  error appears on the field. Do not swallow exceptions with an empty `catch`.

## Tests

- One test class per handler, annotated `@IsTest`, with data created in a `@TestSetup` method.
  Never use `SeeAllData=true`.
- Insert or update 200 records in at least one test to prove bulk safety.
- Wrap the operation under test in `Test.startTest()` and `Test.stopTest()` so it gets fresh
  governor limits.
- Assert outcomes with the `Assert` class (`Assert.areEqual`, `Assert.isFalse`) and a message.
  A test without assertions proves only that the code ran.
- Cover the failure path: use `Database.update(records, false)` and assert on the
  `SaveResult` errors.

## Deploy and run tests

```bash
sf project deploy start --source-dir force-app
sf apex run test --class-names OpportunityTriggerHandlerTest --code-coverage --result-format human --wait 10
```

Use a scratch org or sandbox. Production deployments need at least 75 percent Apex coverage
across the org, but aim for tests that assert behavior, not coverage.

## Output format

Return each file in its own code block starting with a file marker, for example
`// file: force-app/main/default/classes/OpportunityTriggerHandler.cls` and
`// file: force-app/main/default/triggers/OpportunityTrigger.trigger`. Include the test class.
State whether data access runs in user mode or system mode and why.
