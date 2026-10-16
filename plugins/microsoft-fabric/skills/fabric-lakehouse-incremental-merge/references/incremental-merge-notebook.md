# Reference notebook: incremental merge into a Lakehouse table

This notebook loads changed customer rows from Parquet files in the Lakehouse `Files` area
into a Delta table, using a watermark table so each run reads only new data. `spark` and
`notebookutils` are provided by the Fabric notebook session. The code block is syntax-checked
by this repository's tests.

Sources used: Microsoft Learn pages on Delta MERGE semantics, NotebookUtils credentials, and
Lakehouse Delta tables (checked 2026-10-14).

```python
# file: notebooks/load_customers_incremental.py

# --- Cell 1: parameters (mark as a parameter cell in Fabric) ---
source_path = "Files/landing/customers/"
source_name = "crm_customers"
target_table = "silver.customers"
watermark_table = "control.watermarks"
key_columns = ["customer_id"]
change_column = "modified_at"

# --- Cell 2: imports and helpers ---
from datetime import datetime, timezone

from delta.tables import DeltaTable
from pyspark.sql import functions as F
from pyspark.sql.window import Window


def read_watermark(source):
    """Return the stored high watermark for a source, or None on the first run."""
    if not spark.catalog.tableExists(watermark_table):
        return None
    row = (
        spark.read.table(watermark_table)
        .where(F.col("source") == source)
        .agg(F.max("high_watermark").alias("wm"))
        .first()
    )
    return row["wm"] if row else None


def write_watermark(source, value):
    """Upsert the watermark for a source. Call only after the data merge succeeded."""
    updates = spark.createDataFrame(
        [(source, value, datetime.now(timezone.utc))],
        "source string, high_watermark timestamp, updated_at timestamp",
    )
    if not spark.catalog.tableExists(watermark_table):
        updates.write.format("delta").saveAsTable(watermark_table)
        return
    (
        DeltaTable.forName(spark, watermark_table)
        .alias("t")
        .merge(updates.alias("s"), "t.source = s.source")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute()
    )


# --- Cell 3: read only rows newer than the watermark ---
incoming = spark.read.format("parquet").load(source_path)
last_watermark = read_watermark(source_name)
if last_watermark is not None:
    incoming = incoming.where(F.col(change_column) > F.lit(last_watermark))

# --- Cell 4: keep the newest row per business key ---
latest_first = Window.partitionBy(*key_columns).orderBy(F.col(change_column).desc())
batch = (
    incoming.withColumn("_row_number", F.row_number().over(latest_first))
    .where(F.col("_row_number") == 1)
    .drop("_row_number")
)

# --- Cell 5: merge into the target, idempotently ---
new_watermark = batch.agg(F.max(change_column).alias("wm")).first()["wm"]

if new_watermark is None:
    print("No new rows since the last run.")
elif not spark.catalog.tableExists(target_table):
    batch.write.format("delta").saveAsTable(target_table)
    write_watermark(source_name, new_watermark)
else:
    merge_condition = " AND ".join(f"t.{c} = s.{c}" for c in key_columns)
    (
        DeltaTable.forName(spark, target_table)
        .alias("t")
        .merge(batch.alias("s"), merge_condition)
        .whenMatchedUpdateAll(condition=f"s.{change_column} > t.{change_column}")
        .whenNotMatchedInsertAll()
        .execute()
    )
    write_watermark(source_name, new_watermark)
```

## Reading from a database instead of files

Read the password from Azure Key Vault at run time. The notebook user (or the identity that
runs the pipeline) needs permission to get the secret.

```python
# file: notebooks/read_sql_source.py
vault_url = "https://contoso-data-kv.vault.azure.net/"
jdbc_url = "jdbc:sqlserver://contoso-sql.database.windows.net:1433;database=crm;encrypt=true"

db_user = notebookutils.credentials.getSecret(vault_url, "crm-sql-user")
db_password = notebookutils.credentials.getSecret(vault_url, "crm-sql-password")

incoming = (
    spark.read.format("jdbc")
    .option("url", jdbc_url)
    .option("dbtable", "dbo.customers")
    .option("user", db_user)
    .option("password", db_password)
    .load()
)
```

Do not print, log, or pass the secret values as notebook parameters. Fabric redacts secrets in
cell output on a best-effort basis only.
