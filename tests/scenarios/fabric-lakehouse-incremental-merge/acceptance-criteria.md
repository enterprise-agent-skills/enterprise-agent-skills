# fabric-lakehouse-incremental-merge Acceptance Criteria

**Skill**: `plugins/microsoft-fabric/skills/fabric-lakehouse-incremental-merge`
**Product**: Microsoft Fabric Data Engineering (Lakehouse, Spark notebooks, Delta Lake)
**Documentation**: https://learn.microsoft.com/fabric/data-engineering/ (checked 2026-10-14)
**Purpose**: Criteria for incremental, idempotent notebook loads. Each "Incorrect" example is rejected by a forbidden pattern or a missing required pattern in `scenarios.yaml`.

---

## 1. Writing to the target table

### 1.1 Correct: MERGE on the business key, update only newer rows

```python
# file: snippets/merge.py
from delta.tables import DeltaTable

(
    DeltaTable.forName(spark, "silver.customers")
    .alias("t")
    .merge(batch.alias("s"), "t.customer_id = s.customer_id")
    .whenMatchedUpdateAll(condition="s.modified_at > t.modified_at")
    .whenNotMatchedInsertAll()
    .execute()
)
```

### 1.2 Incorrect: overwriting the whole table on every run

```python
batch.write.format("delta").mode("overwrite").saveAsTable("silver.customers")
```

---

## 2. De-duplicating the batch

### 2.1 Correct: newest row per key with row_number

```python
# file: snippets/dedupe.py
from pyspark.sql import functions as F
from pyspark.sql.window import Window

latest_first = Window.partitionBy("customer_id").orderBy(F.col("modified_at").desc())
batch = (
    incoming.withColumn("_row_number", F.row_number().over(latest_first))
    .where(F.col("_row_number") == 1)
    .drop("_row_number")
)
```

### 2.2 Incorrect: dropDuplicates keeps an arbitrary row

`dropDuplicates` on the key does not guarantee the newest version survives.

```python
batch = incoming.dropDuplicates(["customer_id"])
```

---

## 3. Credentials

### 3.1 Correct: secret from Azure Key Vault at run time

```python
# file: snippets/secret.py
db_password = notebookutils.credentials.getSecret("https://contoso-data-kv.vault.azure.net/", "crm-sql-password")
```

### 3.2 Incorrect: password in notebook code

```python
db_password = "Winter2026!"  # security-scan: allow SECRET_HARDCODED_ASSIGNMENT intentional bad example
```

---

## 4. Moving data to the driver

### 4.1 Incorrect: converting a full table to pandas

```python
customers = spark.read.table("silver.customers").toPandas()
```

---

## 5. Table maintenance

### 5.1 Correct: default retention

```python
# file: snippets/vacuum.py
from delta.tables import DeltaTable

DeltaTable.forName(spark, "silver.customers").vacuum(168)
```

### 5.2 Incorrect: zero retention with the safety check disabled

```python
spark.conf.set("spark.databricks.delta.retentionDurationCheck.enabled", "false")
spark.sql("VACUUM silver.customers RETAIN 0 HOURS")
```

---

## 6. Test scenarios checklist

- [ ] Incremental upsert notebook with watermark and de-duplication
- [ ] Database source with credentials from Azure Key Vault
- [ ] Table maintenance with safe retention
