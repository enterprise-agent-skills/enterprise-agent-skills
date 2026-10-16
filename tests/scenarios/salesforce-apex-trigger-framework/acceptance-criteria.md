# salesforce-apex-trigger-framework Acceptance Criteria

**Skill**: `plugins/salesforce-platform/skills/salesforce-apex-trigger-framework`
**Product**: Salesforce Platform (Apex)
**Purpose**: Criteria for trigger handlers and their tests. Each "Incorrect" example is rejected by a forbidden pattern in `scenarios.yaml`; each complete "Correct" example is parsed with the apex-dev-tools Apex parser.

---

## 1. Trigger structure

### 1.1 Correct: one trigger delegating to a handler

```apex
// file: force-app/main/default/triggers/OpportunityTrigger.trigger
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    new OpportunityTriggerHandler().run();
}
```

### 1.2 Incorrect: SOQL inside a loop

Hits the 100-query limit as soon as a batch is large enough.

```apex
for (Opportunity opp : Trigger.new) {
    Account acc = [SELECT Name FROM Account WHERE Id = :opp.AccountId];
}
```

### 1.3 Incorrect: DML inside a loop

```apex
for (Opportunity opp : Trigger.new) {
    insert new Task(WhatId = opp.Id, Subject = 'Follow up');
}
```

---

## 2. Recursion control

### 2.1 Correct: static set of processed Ids

```apex
// file: force-app/main/default/classes/RecursionGuard.cls
public with sharing class RecursionGuard {
    private static Set<Id> processedIds = new Set<Id>();

    public static Boolean firstTime(Id recordId) {
        return processedIds.add(recordId);
    }
}
```

### 2.2 Incorrect: static Boolean flag

Skips every 200-record chunk after the first in the same operation.

```apex
public class OpportunityTriggerHandler {
    private static Boolean alreadyRan = false;
}
```

---

## 3. Sharing and data access

### 3.1 Correct: user-mode query and DML

```apex
// file: force-app/main/default/classes/TaskWriter.cls
public with sharing class TaskWriter {
    public static void write(Set<Id> accountIds, List<Task> tasks) {
        Map<Id, Account> accounts = new Map<Id, Account>(
            [SELECT Id, Name FROM Account WHERE Id IN :accountIds WITH USER_MODE]
        );
        Database.insert(tasks, AccessLevel.USER_MODE);
    }
}
```

### 3.2 Incorrect: handler declared without sharing

```apex
public without sharing class OpportunityTriggerHandler {
}
```

---

## 4. Tests

### 4.1 Correct: bulk test with setup data and assertions

```apex
// file: force-app/main/default/classes/BulkTestExample.cls
@IsTest
private class BulkTestExample {
    @TestSetup
    static void createData() {
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 200; i++) {
            accounts.add(new Account(Name = 'Account ' + i));
        }
        insert accounts;
    }

    @IsTest
    static void updatesAllRecords() {
        List<Account> accounts = [SELECT Id FROM Account];
        Test.startTest();
        update accounts;
        Test.stopTest();
        Assert.areEqual(200, [SELECT COUNT() FROM Account], 'Expected 200 accounts.');
    }
}
```

### 4.2 Incorrect: test that depends on org data

```apex
@IsTest(SeeAllData=true)
private class OpportunityTriggerHandlerTest {
}
```

### 4.3 Incorrect: assertion that always passes

```apex
System.assert(true);
```

---

## 5. Test scenarios checklist

- [ ] Bulk-safe trigger and handler with recursion control and user-mode access
- [ ] Unit tests with 200 records, setup data, and meaningful assertions
