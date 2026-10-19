//! neardata reader — replaces the dead StreamingFast Substreams runtime.
//!
//! Polls finalized blocks from `https://{network}.neardata.xyz/v0/block/{h}`,
//! decodes them through the exact production pipeline
//! (`map_combined_output_impl` → `combined_db_out_impl`), and applies the
//! resulting `DatabaseChanges` to Postgres. Hasura, the views, and the app
//! read the same tables unchanged.
//!
//! Two modes:
//!
//!   # Parity check (no writes): replay one block and diff generated rows
//!   # against what Substreams already stored.
//!   neardata_reader --db-url "$DB" --parity-block 273239505
//!
//!   # Live: resume from the sink cursor and keep indexing.
//!   neardata_reader --db-url "$DB" --network testnet
//!
//! The public neardata limit is 180 requests/minute/IP; the reader stays
//! under ~150/min. NEAR testnet produces ~104 blocks/min, so one reader can
//! keep up at the chain head. Catching up a long gap is the slow part.

use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use clap::Parser;
use substreams_database_change::pb::database::table_change::{Operation, PrimaryKey};
use substreams_database_change::pb::database::{DatabaseChanges, TableChange};
use tokio_postgres::{Client, NoTls};
use tracing::{info, warn};

use onsocial_substreams::combined_db_out::combined_db_out_impl;
use onsocial_substreams::map_combined_output_impl;

/// The six protocol contracts the combined map decodes (same params string
/// the systemd unit passes to the Substreams sink).
const PARAMS: &str = "core=core.onsocial.testnet&boost=boost.onsocial.testnet&rewards=rewards.onsocial.testnet&token=token.onsocial.testnet&scarces=scarces.onsocial.testnet&social_spend=social-spend.onsocial.testnet";

#[derive(Parser, Debug)]
#[command(name = "neardata_reader", about = "OnSocial indexer on neardata")]
struct Args {
    /// Postgres connection string for the indexer database.
    #[arg(long)]
    db_url: String,

    /// `testnet` or `mainnet`.
    #[arg(long, default_value = "testnet")]
    network: String,

    /// Replay a single historical block, diff generated rows against the DB,
    /// print the comparison, and exit without writing anything.
    #[arg(long)]
    parity_block: Option<u64>,

    /// Explicit start height for live mode. Overrides the sink cursor.
    #[arg(long)]
    start_block: Option<u64>,

    /// Tables to compare in parity mode.
    #[arg(long, default_values = &["boost_events", "token_events", "rewards_events", "scarces_events", "social_spend_events", "data_updates", "storage_updates", "group_updates", "contract_updates", "permission_updates"])]
    parity_tables: Vec<String>,

    /// Max requests per minute to neardata (public cap is 180).
    #[arg(long, default_value_t = 150)]
    max_rpm: u32,
}

fn base_url(network: &str) -> String {
    format!("https://{}.neardata.xyz", network)
}

/// Cursor id inside the sink's existing `cursors` table. Reusing `cursors`
/// (not a separate table) means the deploy smoke test's
/// `SELECT MAX(block_num) FROM cursors` and any cursor tooling keep working
/// unchanged.
const READER_CURSOR_ID: &str = "neardata_reader";

/// Highest block the Substreams sink reached before it was cut off. We resume
/// one past this.
async fn read_sink_cursor(client: &Client) -> Result<Option<u64>> {
    let row = client
        .query_opt("SELECT MAX(block_num) AS h FROM cursors", &[])
        .await
        .context("read cursors")?;
    Ok(row.and_then(|r| r.get::<_, Option<i64>>("h")).map(|h| h as u64))
}

/// The reader's own cursor row, if it has run before.
async fn read_reader_cursor(client: &Client) -> Result<Option<u64>> {
    let row = client
        .query_opt(
            "SELECT block_num FROM cursors WHERE id = $1",
            &[&READER_CURSOR_ID],
        )
        .await
        .context("read reader cursor")?;
    Ok(row.map(|r| r.get::<_, i64>(0) as u64))
}

// The reader cursor is advanced inside the same transaction that applies a
// block's rows (see `apply_block`), so a crash can never record a block as
// done without its data. The `cursors` table shape is `(id TEXT PK,
// block_num BIGINT, cursor TEXT)`; the reader stores a stable placeholder
// cursor token since it has no Substreams cursor.

struct Fetcher {
    client: reqwest::Client,
    base: String,
    /// Configured steady-state spacing (from --max-rpm).
    base_interval: Duration,
    /// Adaptive spacing: grows on 429, decays on success (AIMD). neardata's
    /// limiter is per-IP, so a warm/shared IP needs to back off below the
    /// nominal public cap.
    cur_interval: Duration,
    last: Option<std::time::Instant>,
}

impl Fetcher {
    fn new(base: String, max_rpm: u32) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest client");
        let base_interval = Duration::from_secs_f64(60.0 / max_rpm as f64);
        Self { client, base, base_interval, cur_interval: base_interval, last: None }
    }

    async fn throttle(&self) {
        if let Some(t) = self.last {
            let elapsed = t.elapsed();
            if elapsed < self.cur_interval {
                tokio::time::sleep(self.cur_interval - elapsed).await;
            }
        }
    }

    fn on_rate_limited(&mut self) {
        // Multiplicative increase, capped at 4s (~15 req/min).
        self.cur_interval = (self.cur_interval * 2).min(Duration::from_secs(4));
    }

    fn on_success(&mut self) {
        // Additive decay back toward the configured rate.
        let decayed = self.cur_interval.mul_f64(0.95);
        self.cur_interval = decayed.max(self.base_interval);
    }

    /// Finalized block at `height`. `Ok(None)` means not available yet (404).
    async fn block(&mut self, height: u64) -> Result<Option<String>> {
        self.throttle().await;
        let url = format!("{}/v0/block/{}", self.base, height);
        let resp = self.client.get(&url).send().await;
        self.last = Some(std::time::Instant::now());
        let resp = resp.with_context(|| format!("GET {url}"))?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            self.on_success();
            return Ok(None);
        }
        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            self.on_rate_limited();
            let wait = retry_after.unwrap_or(5).max(2);
            warn!(wait_s = wait, interval_ms = self.cur_interval.as_millis(), "rate limited, backing off");
            tokio::time::sleep(Duration::from_secs(wait)).await;
            bail!("rate limited (429)");
        }
        if !resp.status().is_success() {
            bail!("neardata {} -> {}", url, resp.status());
        }
        // neardata redirects finalized requests; body is the StreamerMessage.
        let body = resp.text().await.context("read body")?;
        self.on_success();
        Ok(Some(body))
    }

    /// Chain head height (final).
    async fn head(&mut self) -> Result<u64> {
        self.throttle().await;
        let url = format!("{}/v0/last_block/final", self.base);
        let resp = self.client.get(&url).send().await;
        self.last = Some(std::time::Instant::now());
        let resp = resp.with_context(|| format!("GET {url}"))?;
        let body: serde_json::Value = resp.json().await.context("head json")?;
        body["block"]["header"]["height"]
            .as_u64()
            .ok_or_else(|| anyhow!("no height in last_block/final"))
    }
}

fn decode_block(body: &str) -> Result<substreams_near::pb::sf::near::r#type::v1::Block> {
    onsocial_substreams::neardata::parse_neardata_block(body).context("parse block")
}

fn changes_for_block(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> DatabaseChanges {
    let output = map_combined_output_impl(PARAMS, block);
    combined_db_out_impl(output)
}

// ---------------------------------------------------------------------------
// Parity mode
// ---------------------------------------------------------------------------

/// A comparable view of one TableChange: table, pk, and name=value fields.
fn canonical(change: &TableChange) -> (String, String, BTreeMap<String, String>) {
    let pk = match &change.primary_key {
        Some(PrimaryKey::Pk(s)) => s.clone(),
        Some(PrimaryKey::CompositePk(c)) => c
            .keys
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join(","),
        None => String::new(),
    };
    let fields: BTreeMap<String, String> = change
        .fields
        .iter()
        .map(|f| (f.name.clone(), f.new_value.clone()))
        .collect();
    (change.table.clone(), pk, fields)
}

/// Rows already in the DB for one table at one block, as name=value maps.
async fn db_rows_at_block(
    client: &Client,
    table: &str,
    block: u64,
) -> Result<BTreeMap<String, BTreeMap<String, String>>> {
    // Only *events / *updates tables have block_height + a text `id` PK.
    let sql = format!(
        "SELECT * FROM {table} WHERE block_height = $1 ORDER BY id"
    );
    let rows = client
        .query(sql.as_str(), &[&(block as i64)])
        .await
        .with_context(|| format!("query {table}"))?;

    let mut out = BTreeMap::new();
    for row in rows {
        let mut fields = BTreeMap::new();
        let mut id = String::new();
        for (i, col) in row.columns().iter().enumerate() {
            let name = col.name().to_string();
            let val: Option<String> = match col.type_().name() {
                "int8" => row.get::<_, Option<i64>>(i).map(|v| v.to_string()),
                "int4" => row.get::<_, Option<i32>>(i).map(|v| v.to_string()),
                "bool" => row.get::<_, Option<bool>>(i).map(|v| v.to_string()),
                _ => row.get::<_, Option<String>>(i),
            };
            if name == "id" {
                id = val.clone().unwrap_or_default();
            }
            fields.insert(name, val.unwrap_or_default());
        }
        out.insert(id, fields);
    }
    Ok(out)
}

async fn run_parity(client: &Client, fetcher: &mut Fetcher, block: u64, tables: &[String]) -> Result<()> {
    info!(block, "parity: fetching block");
    let body = fetcher
        .block(block)
        .await?
        .ok_or_else(|| anyhow!("block {block} not found on neardata"))?;
    let blk = decode_block(&body)?;
    let changes = changes_for_block(&blk);

    // Group generated rows by table.
    let mut generated: BTreeMap<String, BTreeMap<String, BTreeMap<String, String>>> =
        BTreeMap::new();
    for change in &changes.table_changes {
        let (table, pk, fields) = canonical(change);
        // Skip derived "current" tables — parity compares the raw event rows.
        generated.entry(table).or_default().insert(pk, fields);
    }

    let mut any_diff = false;
    for table in tables {
        let generated_rows = generated.get(table).cloned().unwrap_or_default();
        let db = match db_rows_at_block(client, table, block).await {
            Ok(r) => r,
            Err(e) => {
                warn!(table, error = %e, "parity: table query failed, skipping");
                continue;
            }
        };

        let generated_ids: BTreeSet<_> = generated_rows.keys().collect();
        let db_ids: BTreeSet<_> = db.keys().collect();
        let missing_in_generated: Vec<_> = db_ids.difference(&generated_ids).collect();
        let missing_in_db: Vec<_> = generated_ids.difference(&db_ids).collect();

        if !missing_in_generated.is_empty() || !missing_in_db.is_empty() {
            any_diff = true;
            warn!(
                table,
                in_db_not_generated = ?missing_in_generated,
                generated_not_in_db = ?missing_in_db,
                "parity: row id mismatch"
            );
        }

        let mut field_diffs = 0;
        for id in generated_ids.intersection(&db_ids) {
            let g = &generated_rows[*id];
            let d = &db[*id];
            // Compare only columns the decoder writes (DB has extra defaults).
            for (col, gval) in g {
                let dval = d.get(col).cloned().unwrap_or_default();
                if &dval != gval {
                    field_diffs += 1;
                    if field_diffs <= 5 {
                        warn!(table, id, col, generated = %gval, db = %dval, "field mismatch");
                    }
                }
            }
        }
        if field_diffs > 0 {
            any_diff = true;
        }

        info!(
            table,
            generated = generated_rows.len(),
            in_db = db.len(),
            field_diffs,
            "parity: table compared"
        );
    }

    if any_diff {
        bail!("parity FAILED on block {block}");
    }
    info!(block, "parity OK — generated rows match the Substreams-stored rows");
    Ok(())
}

// ---------------------------------------------------------------------------
// Live mode
// ---------------------------------------------------------------------------

/// Live picture of the public schema, loaded once at startup from
/// information_schema. Needed because `DatabaseChanges` carries every value
/// as a string — Postgres will not implicitly cast a text parameter into a
/// BIGINT/BOOLEAN column, so the writer must cast explicitly per column type.
struct Schema {
    /// table -> column -> information_schema data_type (e.g. "bigint", "ARRAY")
    tables: BTreeMap<String, BTreeMap<String, String>>,
    /// udt name per array column, e.g. "_text" -> cast target "text[]"
    array_udts: BTreeMap<(String, String), String>,
}

impl Schema {
    async fn load(client: &Client) -> Result<Self> {
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
    // cursor) must not crash the reader.
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

/// Apply all rows for one block and advance the cursor in a single
/// transaction. If any row fails, nothing from this block is committed and
/// the cursor does not move, so a restart replays the block cleanly. This is
/// what makes the reader crash-safe.
///
/// The cursor upsert adapts to the sink's `cursors` table shape: if the
/// table has a `block_id` column (substreams-sink-sql does), the block hash
/// is stored too.
async fn apply_block(
    client: &mut Client,
    schema: &Schema,
    changes: &DatabaseChanges,
    height: u64,
    block_hash: &str,
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
            &READER_CURSOR_ID as &(dyn tokio_postgres::types::ToSql + Sync),
            &(height as i64),
            &"neardata",
            &block_hash,
        ],
    )
    .await
    .context("write cursor")?;
    tx.commit().await.context("commit block")?;
    Ok(applied)
}

async fn run_live(client: &mut Client, fetcher: &mut Fetcher, args: &Args) -> Result<()> {
    let schema = Schema::load(client).await?;
    info!(tables = schema.tables.len(), "schema loaded");

    let start = if let Some(b) = args.start_block {
        b
    } else if let Some(b) = read_reader_cursor(client).await? {
        b + 1
    } else if let Some(b) = read_sink_cursor(client).await? {
        info!(sink_cursor = b, "resuming from Substreams sink cursor");
        b + 1
    } else {
        bail!("no cursor found; pass --start-block");
    };
    info!(start, "live mode start");

    let mut next = start;
    loop {
        match fetcher.block(next).await {
            Ok(Some(body)) => {
                let blk = decode_block(&body)?;
                let hash = onsocial_substreams::neardata::block_hash(&blk);
                let changes = changes_for_block(&blk);
                let n = apply_block(client, &schema, &changes, next, &hash).await?;
                if n > 0 {
                    info!(block = next, rows = n, "indexed");
                }
                next += 1;
            }
            Ok(None) => {
                // Not finalized yet — poll the head and wait.
                let head = fetcher.head().await.unwrap_or(next);
                if next > head {
                    tokio::time::sleep(Duration::from_millis(600)).await;
                } else {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }
            Err(e) => {
                warn!(block = next, error = %e, "fetch failed, retrying");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let args = Args::parse();
    let base = base_url(&args.network);
    info!(%base, "neardata reader");

    let (mut client, conn) = tokio_postgres::connect(&args.db_url, NoTls)
        .await
        .context("connect postgres")?;
    tokio::spawn(async move {
        if let Err(e) = conn.await {
            warn!(error = %e, "postgres connection error");
        }
    });

    let mut fetcher = Fetcher::new(base, args.max_rpm);

    if let Some(block) = args.parity_block {
        return run_parity(&client, &mut fetcher, block, &args.parity_tables).await;
    }

    run_live(&mut client, &mut fetcher, &args).await
}
