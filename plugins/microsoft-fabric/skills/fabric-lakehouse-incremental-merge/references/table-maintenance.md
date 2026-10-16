# Delta table maintenance in Fabric

Based on Microsoft Learn: "Optimize Delta Lake tables with V-order", "Compacting Delta tables",
and "VACUUM Delta tables" (checked 2026-10-14). Run maintenance from a notebook, a Spark job
definition, or the Lakehouse table maintenance option. These commands are not supported in the
SQL analytics endpoint or the Warehouse editor.

## Compaction with OPTIMIZE

Frequent incremental merges create many small files. Compact them on a schedule, for example
nightly for tables loaded every hour.

```sql
OPTIMIZE silver.customers
```

Add `ZORDER BY (column)` for columns that queries filter on selectively. Add `VORDER` to apply
V-Order to the rewritten files:

```sql
OPTIMIZE silver.customers ZORDER BY (country) VORDER
```

## V-Order

V-Order is disabled by default in workspaces created after April 2025
(`spark.sql.parquet.vorder.default` is `false`). It speeds up reads by Power BI Direct Lake and
the SQL analytics endpoint and slows writes. Enable it per table for read-heavy tables:

```sql
ALTER TABLE silver.customers SET TBLPROPERTIES ("delta.parquet.vorder.enabled" = "true")
```

The table property affects future writes only. Run `OPTIMIZE ... VORDER` to rewrite existing
files. On Fabric runtime 1.3 and later, remove the old `spark.sql.parquet.vorder.enable`
setting from existing code; it no longer exists.

## VACUUM

`VACUUM` removes files no longer referenced by the table. The default retention is 7 days
(168 hours). Files younger than the retention period stay, which keeps time travel and
concurrent readers working.

```python
from delta.tables import DeltaTable

DeltaTable.forName(spark, "silver.customers").vacuum(168)
```

Preview what would be deleted with `VACUUM silver.customers RETAIN 168 HOURS DRY RUN`.
Do not lower the retention below the default, and do not disable the retention duration check
to do so: readers and time-travel queries on older versions would fail.

## History and checks

```sql
DESCRIBE HISTORY silver.customers LIMIT 10
```

Use the history to confirm that a re-run of an idempotent load produced no new `MERGE`
changes, and that `OPTIMIZE` and `VACUUM` ran as scheduled.
