//! Shared Postgres writer for every native block source.
//!
//! Extracted from `neardata_reader` so the reader and the node indexer apply
//! blocks through ONE writer — never two writers to keep in sync. The writer
//! is schema-aware (DatabaseChanges carries every value as a string; Postgres
//! will not implicitly cast text into BIGINT/BOOLEAN), upserts always (replay
//! from an old cursor must not crash), and advances the caller's cursor row
//! inside the same transaction as the block's rows, which is what makes every
//! source crash-safe.
//!
//! Cursor convention: each source owns one row in the shared `cursors` table
//! (`id` = source name, e.g. "neardata_reader" / "indexer"), so either
//! source can resume where the other stopped.

use std::collections::BTreeMap;

use anyhow::{bail, Context, Result};
use substreams_database_change::pb::database::table_change::{Operation, PrimaryKey};
use substreams_database_change::pb::database::{DatabaseChanges, TableChange};
use tokio_postgres::Client;
use tracing::warn;

/// Highest block any source recorded in the shared `cursors` table. Used as
/// the fallback resume point when neither source has its own cursor row.
pub async fn read_sink_cursor(client: &Client) -> Result<Option<u64>> {
    let row = client
        .query_opt("SELECT MAX(block_num) AS h FROM cursors", &[])
        .await
        .context("read cursors")?;
    Ok(row.and_then(|r| r.get::<_, Option<i64>>("h")).map(|h| h as u64))
}

/// One source's own cursor row, if it has run before.
pub async fn read_cursor(client: &Client, cursor_id: &str) -> Result<Option<u64>> {
    let row = client
        .query_opt("SELECT block_num FROM cursors WHERE id = $1", &[&cursor_id])
        .await
        .context("read source cursor")?;
    Ok(row.map(|r| r.get::<_, i64>(0) as u64))
}

/// Live picture of the public schema, loaded once at startup from
/// information_schema. Needed because `DatabaseChanges` carries every value
/// as a string — Postgres will not implicitly cast a text parameter into a
/// BIGINT/BOOLEAN column, so the writer must cast explicitly per column type.
pub struct Schema {
    /// table -> column -> information_schema data_type (e.g. "bigint", "ARRAY")
    tables: BTreeMap<String, BTreeMap<String, String>>,
    /// udt name per array column, e.g. "_text" -> cast target "text[]"
    array_udts: BTreeMap<(String, String), String>,
}

impl Schema {
    pub async fn load(client: &Client) -> Result<Self> {
        let rows = client
            .query(
                "SELECT table_name, column_name, data_type, udt_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public'",
                &[],
            )
            .await
            .context("load information_schema")?;
        let mut tables: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
        let mut array_udts = BTreeMap::new();
        for r in rows {
            let table: String = r.get(0);
            let column: String = r.get(1);
            let data_type: String = r.get(2);
            let udt: String = r.get(3);
            if data_type == "ARRAY" {
                // "_text" -> "text[]"
                let target = format!("{}[]", udt.trim_start_matches('_'));
                array_udts.insert((table.clone(), column.clone()), target);
            }
            tables.entry(table).or_default().insert(column, data_type);
        }
        Ok(Self { tables, array_udts })
    }

    /// Number of tables discovered in the live schema (startup log line).
    pub fn tables_len(&self) -> usize {
        self.tables.len()
    }

    fn column_type(&self, table: &str, column: &str) -> Option<&str> {
        self.tables
            .get(table)
            .and_then(|t| t.get(column))
            .map(String::as_str)
    }
}

/// SQL placeholder expression for one field, with the cast Postgres needs.
/// `NULLIF($n,'')` turns empty strings into NULL for non-text columns — the
/// decoders only set present fields, so '' on a numeric/bool column means
/// "no value", while '' on a text column is a real empty string.
fn value_expr(schema: &Schema, table: &str, column: &str, idx: usize) -> String {
    match schema.column_type(table, column) {
        Some("bigint") => format!("NULLIF(${idx}, '')::bigint"),
        Some("integer") | Some("smallint") => format!("NULLIF(${idx}, '')::integer"),
        Some("boolean") => format!("NULLIF(${idx}, '')::boolean"),
        Some("numeric") | Some("double precision") | Some("real") => {
            format!("NULLIF(${idx}, '')::numeric")
        }
        Some("ARRAY") => {
            let target = schema
                .array_udts
                .get(&(table.to_string(), column.to_string()))
                .cloned()
                .unwrap_or_else(|| "text[]".to_string());
            format!("NULLIF(${idx}, '')::{target}")
        }
        _ => format!("${idx}"),
    }
}

/// Field values arrive as strings; array columns arrive as a psql literal
/// wrapped in single quotes by `set_psql_array` (`'{a,b}'`). Strip those
/// outer quotes so the `::text[]` cast sees a bare literal.
fn normalize_value(schema: &Schema, table: &str, column: &str, value: &str) -> String {
    if matches!(schema.column_type(table, column), Some("ARRAY")) {
        value
            .strip_prefix('\'')
            .and_then(|v| v.strip_suffix('\''))
            .unwrap_or(value)
            .to_string()
    } else {
        value.to_string()
    }
}

/// PK column for the tables that use a *single-column* primary key.
/// (Composite-PK tables — posts_current, reactions_current, saves_current —
/// carry their key columns inside the TableChange itself.)
fn single_pk_column(table: &str) -> Result<&'static str> {
    Ok(match table {
        "booster_state" | "user_reward_state" | "token_balances" => "account_id",
        "scarces_active_listings" => "listing_key",
        "scarces_active_offers" => "offer_key",
        "scarces_apps" => "app_id",
        "scarces_collections_current" => "collection_id",
        "data_updates" | "storage_updates" | "group_updates" | "contract_updates"
        | "permission_updates" | "boost_events" | "boost_credit_purchases" | "rewards_events"
        | "token_events" | "scarces_events" | "scarces_app_creators" | "social_spend_events" => {
            "id"
        }
        other => bail!("no single-pk mapping for table {other}"),
    })
}

/// Resolve a TableChange's primary key to concrete (column, value) pairs.
fn pk_pairs(change: &TableChange) -> Result<Vec<(String, String)>> {
    match &change.primary_key {
        Some(PrimaryKey::Pk(s)) => Ok(vec![(single_pk_column(&change.table)?.to_string(), s.clone())]),
        Some(PrimaryKey::CompositePk(c)) => {
            let mut pairs: Vec<(String, String)> =
                c.keys.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            pairs.sort();
            Ok(pairs)
        }
        None => bail!("missing primary key on {}", change.table),
    }
}

/// Quote a bare identifier that is known to be a simple [a-z_][a-z0-9_]* name.
fn ident(name: &str) -> Result<String> {
    if name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
        && !name.is_empty()
    {
        Ok(format!("\"{name}\""))
    } else {
        bail!("unsafe identifier {name:?}")
    }
}

async fn apply_change(
    client: &impl tokio_postgres::GenericClient,
    schema: &Schema,
    change: &TableChange,
) -> Result<()> {
    let table = ident(&change.table)?;
    let pk = pk_pairs(change)?;

    let op = Operation::try_from(change.operation).unwrap_or(Operation::Unspecified);
    if op == Operation::Delete {
        let mut where_clause: Vec<String> = Vec::new();
        for (i, (col, _)) in pk.iter().enumerate() {
            where_clause.push(format!("{} = ${}", ident(col)?, i + 1));
        }
        let sql = format!("DELETE FROM {table} WHERE {}", where_clause.join(" AND "));
        let params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = pk
            .iter()
            .map(|(_, v)| v as &(dyn tokio_postgres::types::ToSql + Sync))
            .collect();
        client.execute(sql.as_str(), &params).await?;
        return Ok(());
    }

    // Keep only fields that exist in the live schema. A field for an unknown
    // column means the deployed schema lags the decoders — warn loudly and
    // skip that field rather than crash-loop the block (the deploy workflow
    // applies schema first, so this should never fire).
    //
    // `Tables` does not emit the primary key as a field (the sink inserts the
    // pk itself), so merge any missing pk pair into the column list —
    // otherwise NOT NULL pk columns (id, listing_key, ...) insert as NULL.
    let mut cols: Vec<String> = Vec::new();
    let mut col_names: Vec<String> = Vec::new();
    let mut values: Vec<String> = Vec::new();
    for f in &change.fields {
        if schema.column_type(&change.table, &f.name).is_none() {
            warn!(table = %change.table, column = %f.name, "field not in live schema, skipped");
            continue;
        }
        cols.push(ident(&f.name)?);
        col_names.push(f.name.clone());
        values.push(normalize_value(schema, &change.table, &f.name, &f.new_value));
    }
    for (pk_col, pk_val) in &pk {
        if !col_names.contains(pk_col) {
            if schema.column_type(&change.table, pk_col).is_none() {
                bail!("pk column {pk_col} not in live schema for {}", change.table);
            }
            cols.push(ident(pk_col)?);
            col_names.push(pk_col.clone());
            values.push(normalize_value(schema, &change.table, pk_col, pk_val));
        }
    }
    if cols.is_empty() {
        return Ok(());
    }

    let col_list = cols.join(", ");
    let placeholders: Vec<String> = col_names
        .iter()
        .enumerate()
        .map(|(i, name)| value_expr(schema, &change.table, name, i + 1))
        .collect();
    // ON CONFLICT updates never touch pk columns.
    let pk_cols: Vec<&str> = pk.iter().map(|(c, _)| c.as_str()).collect();
    let updates: Vec<String> = col_names
        .iter()
        .enumerate()
        .filter(|(_, name)| !pk_cols.contains(&name.as_str()))
        .map(|(i, name)| {
            Ok(format!(
                "{} = {}",
                ident(name)?,
                value_expr(schema, &change.table, name, i + 1)
            ))
        })
        .collect::<Result<_>>()?;
    let conflict: Vec<String> = pk
        .iter()
        .map(|(col, _)| ident(col))
        .collect::<Result<_>>()?;

    // Always upsert: a Create that hits an existing row (replay from an old
    // cursor) must not crash the writer.
    let sql = format!(
        "INSERT INTO {table} ({col_list}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {}",
        placeholders.join(", "),
        conflict.join(", "),
        updates.join(", ")
    );
    let params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = values
        .iter()
        .map(|v| v as &(dyn tokio_postgres::types::ToSql + Sync))
        .collect();
    client.execute(sql.as_str(), &params).await?;
    Ok(())
}

/// Apply all rows for one block and advance the source's cursor in a single
/// transaction. If any row fails, nothing from this block is committed and
/// the cursor does not move, so a restart replays the block cleanly. This is
/// what makes every source crash-safe.
///
/// The cursor upsert adapts to the shared `cursors` table shape: when the
/// table has a `block_id` column, the block hash is stored too.
/// `cursor_id` / `cursor_token` identify the writing source
/// (e.g. "neardata_reader"/"neardata", "indexer"/"node").
pub async fn apply_block(
    client: &mut Client,
    schema: &Schema,
    changes: &DatabaseChanges,
    height: u64,
    block_hash: &str,
    cursor_id: &str,
    cursor_token: &str,
) -> Result<usize> {
    let tx = client.transaction().await.context("begin tx")?;
    let mut applied = 0;
    for change in &changes.table_changes {
        apply_change(&tx, schema, change)
            .await
            .with_context(|| format!("table {}", change.table))?;
        applied += 1;
    }

    let has_block_id = schema.column_type("cursors", "block_id").is_some();
    let cursor_sql = if has_block_id {
        "INSERT INTO cursors (id, block_num, cursor, block_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET block_num = EXCLUDED.block_num, block_id = EXCLUDED.block_id, cursor = EXCLUDED.cursor"
    } else {
        "INSERT INTO cursors (id, block_num, cursor) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET block_num = EXCLUDED.block_num, cursor = EXCLUDED.cursor"
    };
    tx.execute(
        cursor_sql,
        &[
            &cursor_id as &(dyn tokio_postgres::types::ToSql + Sync),
            &(height as i64),
            &cursor_token,
            &block_hash,
        ],
    )
    .await
    .context("write cursor")?;
    tx.commit().await.context("commit block")?;
    Ok(applied)
}
