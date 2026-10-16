# Reference implementation: Opportunity trigger, handler, and tests

Business rule used for the example: an Opportunity cannot be set to Closed Won without an
Amount, and when it becomes Closed Won the owner gets a follow-up task named after the account.
Stage names depend on your org's picklist values; adjust `CLOSED_WON` if needed.

Each block starts with a file marker and is parsed by this repository's tests with the
apex-dev-tools Apex parser (syntax only; compile and run in a scratch org to test behavior).

## Trigger

```apex
// file: force-app/main/default/triggers/OpportunityTrigger.trigger
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    new OpportunityTriggerHandler().run();
}
```

## Handler

```apex
// file: force-app/main/default/classes/OpportunityTriggerHandler.cls
public with sharing class OpportunityTriggerHandler {
    private static final String CLOSED_WON = 'Closed Won';

    // Records already handled in this transaction. A Set, not a Boolean, so later
    // 200-record chunks of the same operation are still processed.
    @TestVisible
    private static Set<Id> processedIds = new Set<Id>();

    public void run() {
        switch on Trigger.operationType {
            when BEFORE_INSERT, BEFORE_UPDATE {
                requireAmountWhenWon((List<Opportunity>) Trigger.new);
            }
            when AFTER_INSERT, AFTER_UPDATE {
                createFollowUpTasks((List<Opportunity>) Trigger.new, (Map<Id, Opportunity>) Trigger.oldMap);
            }
        }
    }

    private void requireAmountWhenWon(List<Opportunity> records) {
        for (Opportunity opp : records) {
            if (opp.StageName == CLOSED_WON && opp.Amount == null) {
                opp.addError(Opportunity.Amount, 'Enter an Amount before setting the stage to Closed Won.');
            }
        }
    }

    private void createFollowUpTasks(List<Opportunity> records, Map<Id, Opportunity> oldMap) {
        List<Opportunity> becameWon = new List<Opportunity>();
        Set<Id> accountIds = new Set<Id>();
        for (Opportunity opp : records) {
            Boolean wasWon = oldMap != null && oldMap.get(opp.Id).StageName == CLOSED_WON;
            if (opp.StageName == CLOSED_WON && !wasWon && !processedIds.contains(opp.Id)) {
                becameWon.add(opp);
                processedIds.add(opp.Id);
                if (opp.AccountId != null) {
                    accountIds.add(opp.AccountId);
                }
            }
        }
        if (becameWon.isEmpty()) {
            return;
        }

        // One query for the whole batch, respecting the user's permissions.
        Map<Id, Account> accounts = new Map<Id, Account>(
            [SELECT Id, Name FROM Account WHERE Id IN :accountIds WITH USER_MODE]
        );

        List<Task> tasks = new List<Task>();
        for (Opportunity opp : becameWon) {
            Account acc = accounts.get(opp.AccountId);
            tasks.add(new Task(
                WhatId = opp.Id,
                OwnerId = opp.OwnerId,
                Subject = 'Kick-off call' + (acc == null ? '' : ' with ' + acc.Name),
                ActivityDate = Date.today().addDays(3)
            ));
        }
        // One DML statement for the whole batch.
        Database.insert(tasks, AccessLevel.USER_MODE);
    }
}
```

## Tests

```apex
// file: force-app/main/default/classes/OpportunityTriggerHandlerTest.cls
@IsTest
private class OpportunityTriggerHandlerTest {
    @TestSetup
    static void createData() {
        Account acc = new Account(Name = 'Contoso');
        insert acc;
        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < 200; i++) {
            opps.add(new Opportunity(
                Name = 'Deal ' + i,
                AccountId = acc.Id,
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30),
                Amount = 1000
            ));
        }
        insert opps;
    }

    @IsTest
    static void createsOneTaskPerOpportunityInABulkUpdate() {
        List<Opportunity> opps = [SELECT Id FROM Opportunity];
        for (Opportunity opp : opps) {
            opp.StageName = 'Closed Won';
        }

        Test.startTest();
        update opps;
        Test.stopTest();

        Integer taskCount = [SELECT COUNT() FROM Task WHERE WhatId IN :opps];
        Assert.areEqual(200, taskCount, 'Expected one follow-up task per won opportunity.');
    }

    @IsTest
    static void doesNotCreateDuplicateTasksWhenUpdatedAgain() {
        List<Opportunity> opps = [SELECT Id FROM Opportunity LIMIT 10];
        for (Opportunity opp : opps) {
            opp.StageName = 'Closed Won';
        }
        update opps;

        Test.startTest();
        update opps;
        Test.stopTest();

        Integer taskCount = [SELECT COUNT() FROM Task WHERE WhatId IN :opps];
        Assert.areEqual(10, taskCount, 'A second update must not create more tasks.');
    }

    @IsTest
    static void blocksClosedWonWithoutAmount() {
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];
        opp.StageName = 'Closed Won';
        opp.Amount = null;

        Test.startTest();
        Database.SaveResult result = Database.update(opp, false);
        Test.stopTest();

        Assert.isFalse(result.isSuccess(), 'The update should fail without an Amount.');
        Assert.areEqual(1, result.getErrors().size(), 'Expected exactly one error.');
    }
}
```
