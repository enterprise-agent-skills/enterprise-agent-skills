---
name: fabric-lakehouse-incremental-merge
description: >-
  Load data incrementally into Microsoft Fabric Lakehouse Delta tables from a notebook with
  PySpark: watermark-based extraction, de-duplication, idempotent MERGE upserts, secrets from
  Azure Key Vault, and table maintenance. USE FOR: writing or reviewing Fabric notebook code that
  upserts into Delta tables, building bronze-to-silver incremental loads, fixing MERGE failures
  caused by duplicate source keys, adding watermark tracking, scheduling OPTIMIZE and VACUUM.
  DO NOT USE FOR: Fabric Data Warehouse T-SQL, Dataflows Gen2, Real-Time Intelligence and KQL,
  Power BI semantic model design, or Azure Databricks Unity Catalog administration.
license: MIT
compatibility: >-
  Microsoft Fabric workspace with a Lakehouse and a Fabric Spark runtime that includes Delta
  Lake (runtime 1.3 or later). A Fabric notebook attached to the target Lakehouse. Azure Key
  Vault access for any source credentials.
metadata:
  vendor: microsoft
  product: fabric
  category: data-engineering
  maturity: beta
  version: "0.1.0"
---

# Fabric Lakehouse incremental merge

Use this skill to write notebook code that can run on a schedule, fail halfway, and be re-run
without duplicating or losing rows. The full reference notebook is in
[references/incremental-merge-notebook.md](references/incremental-merge-notebook.md).
Maintenance commands and V-Order guidance are in
[references/table-maintenance.md](references/table-maintenance.md).

## Before you start

Search Microsoft Learn (the bundled `microsoft-learn` MCP server, or
https://learn.microsoft.com/fabric/data-engineering/) when an API detail matters. Fabric
changes often. Confirm:

1. Source location and format (for example files landed in `Files/landing/` or a JDBC source).
2. Business key columns and the column that tells which version of a row is newest
   (for example `modified_at`).
3. Target table name, including the schema if the Lakehouse has schemas enabled
   (for example `silver.customers`).
4. Whether deletes in the source must be applied to the target.

## Rules for an idempotent load

1. **Parameters cell.** Put source path, target table, key columns, and the change column in
   the first cell and mark it as a parameter cell so a pipeline can pass values.
2. **Read only new data.** Keep a high watermark per source in a small control Delta table.
   Read rows where the change column is greater than the stored watermark.
3. **One row per key.** De-duplicate the batch with `row_number()` over a window partitioned by
   the key and ordered by the change column descending. A Delta MERGE fails when more than one
   source row matches the same target row.
4. **Merge, never overwrite.** Use `DeltaTable.forName(spark, "<schema>.<table>")` and
   `merge()` on the business key. Update only when the incoming row is newer
   (`whenMatchedUpdateAll(condition="s.<col> > t.<col>")`) and insert unmatched rows
   (`whenNotMatchedInsertAll()`). Re-running the same batch then changes nothing.
5. **First run.** If the target table does not exist, create it from the de-duplicated batch
   with `saveAsTable`, then continue with the same watermark logic.
6. **Advance the watermark last.** Write the new watermark only after the merge succeeds, using
   the maximum change value of the batch you merged.
7. **Schema drift.** Cast the incoming data to the target schema explicitly. Enable automatic
   schema evolution only when the team has agreed to it.
8. **Secrets.** Read credentials with
   `notebookutils.credentials.getSecret("https://<vault>.vault.azure.net/", "<secret-name>")`.
   Never put credentials in notebook code, parameters, or output.
9. **Keep data on the cluster.** Avoid `collect()` and `toPandas()` on full tables; use them
   only on small aggregates such as the new watermark value.

## Deletes

If the source sends deletes, merge them explicitly: a delete flag column with
`whenMatchedDelete(condition="s.is_deleted = true")`, or `whenNotMatchedBySourceDelete()` only
when the batch is a complete snapshot of the source. Never use the snapshot form on an
incremental batch; it deletes every row that did not change.

## Verify the result

1. Run the notebook twice with the same input. Row counts and `DESCRIBE HISTORY` should show
   no changes from the second run.
2. Check for duplicate keys in the target with a `GROUP BY` on the key having `count(*) > 1`.
3. Confirm the watermark table holds the expected value.
4. Schedule maintenance from [references/table-maintenance.md](references/table-maintenance.md).

## Output format

Return the notebook as one Python code block per cell, or as a single file with a first line
`# file: notebooks/<name>.py`. Mark the parameters cell. After the code, list the assumptions
you made about keys, change column, and table names.
