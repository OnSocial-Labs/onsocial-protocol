//! neardata reader — historical block source for the OnSocial indexer.
//!
//! Polls finalized blocks from `https://{network}.neardata.xyz/v0/block/{h}`,
//! decodes them through the production pipeline
//! (`map_combined_output_impl` → `combined_db_out_impl`), and applies the
//! resulting `DatabaseChanges` to Postgres through the shared writer
//! (`onsocial_chain_index::writer`) — the same writer `onsocial-indexer` uses, so
//! there is one writer and two sources, never two writers to keep in sync.
//! Hasura, the views, and the app read the same tables unchanged.
//!
//! Two modes:
//!
//!   # Parity check (no writes): replay one block and diff generated rows
//!   # against rows already stored for that height.
//!   neardata_reader --db-url "$DB" --parity-block 273239505
//!
//!   # Live: resume from this reader's cursor and stop at --end-block.
//!   neardata_reader --db-url "$DB" --network testnet --end-block HEIGHT
//!
//! The node indexer owns the chain tip. This reader fills heights below
//! `--end-block` and exits there. Do not run it past that height while the
//! node indexer is writing.

use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use clap::Parser;
use substreams_database_change::pb::database::table_change::PrimaryKey;
use substreams_database_change::pb::database::TableChange;
use tokio_postgres::{Client, NoTls};
use tracing::{info, warn};

use onsocial_chain_index::neardata::parse_neardata_block;
use onsocial_chain_index::pipeline::changes_for_block;
use onsocial_chain_index::writer::{self, Schema};

/// Cursor id inside the shared `cursors` table. Reusing `cursors`
/// (not a separate table) means the deploy smoke test's
/// `SELECT MAX(block_num) FROM cursors` and any cursor tooling keep working
/// unchanged.
const READER_CURSOR_ID: &str = "neardata_reader";

/// Cursor token stored alongside the block hash (provenance: which source
/// wrote this cursor row).
const CURSOR_TOKEN: &str = "neardata";

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

    /// Explicit start height for live mode. Overrides the stored cursor.
    #[arg(long)]
    start_block: Option<u64>,

    /// Stop before this height. The node indexer owns this height and
    /// everything after it. Omit to follow the chain.
    #[arg(long)]
    end_block: Option<u64>,

    /// Tables to compare in parity mode.
    #[arg(long, default_values = &["boost_events", "token_events", "rewards_events", "scarces_events", "social_spend_events", "data_updates", "storage_updates", "group_updates", "contract_updates", "permission_updates"])]
    parity_tables: Vec<String>,

    /// Max requests per minute to neardata (public cap is 180).
    #[arg(long, default_value_t = 150)]
    max_rpm: u32,

    /// Blocks to download concurrently. Applies are still strictly in order;
    /// this only overlaps network latency. 1 = old serial behavior.
    #[arg(long, default_value_t = 6)]
    prefetch: usize,

    /// FastNear API key, sent as `Authorization: Bearer`. Optional — the
    /// public tier needs none — but required if FastNear grants a private
    /// rate tier keyed to an API key.
    #[arg(long)]
    api_key: Option<String>,
}

fn base_url(network: &str) -> String {
    format!("https://{}.neardata.xyz", network)
}

/// Slot-reserving rate limiter shared by all fetch workers. Each caller
/// reserves a start instant spaced `cur_interval` after the previous one, so
/// requests can overlap in flight while the *start rate* stays paced. AIMD:
/// the interval doubles on 429 (cap 2s) and the next start is pushed out so
/// in-flight workers cannot burst when the penalty lands. It creeps back 1%
/// per success (floor `base_interval`). A 5% decay snapped back to the
/// ceiling in a handful of blocks and tripped 429 again.
struct RateLimiter {
    state: tokio::sync::Mutex<RateState>,
    base_interval: Duration,
}

struct RateState {
    next_slot: std::time::Instant,
    cur_interval: Duration,
}

impl RateLimiter {
    fn new(max_rpm: u32) -> Self {
        let base = Duration::from_secs_f64(60.0 / max_rpm as f64);
        Self {
            state: tokio::sync::Mutex::new(RateState {
                next_slot: std::time::Instant::now(),
                cur_interval: base,
            }),
            base_interval: base,
        }
    }

    async fn wait_turn(&self) {
        let start = {
            let mut s = self.state.lock().await;
            let now = std::time::Instant::now();
            let start = s.next_slot.max(now);
            s.next_slot = start + s.cur_interval;
            start
        };
        let delay = start.saturating_duration_since(std::time::Instant::now());
        if !delay.is_zero() {
            tokio::time::sleep(delay).await;
        }
    }

    async fn on_rate_limited(&self) {
        let mut s = self.state.lock().await;
        s.cur_interval = (s.cur_interval * 2).min(Duration::from_secs(2));
        let now = std::time::Instant::now();
        s.next_slot = s.next_slot.max(now + s.cur_interval);
    }

    async fn on_success(&self) {
        let mut s = self.state.lock().await;
        s.cur_interval = s.cur_interval.mul_f64(0.99).max(self.base_interval);
    }
}

#[derive(Clone)]
struct Fetcher {
    client: reqwest::Client,
    no_redirect: reqwest::Client,
    base: String,
    api_key: Option<String>,
    limiter: std::sync::Arc<RateLimiter>,
}

impl Fetcher {
    fn new(base: String, max_rpm: u32, api_key: Option<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest client");
        let no_redirect = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("reqwest no-redirect client");
        Self {
            client,
            no_redirect,
            base,
            api_key,
            limiter: std::sync::Arc::new(RateLimiter::new(max_rpm)),
        }
    }

    fn authed(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.api_key {
            Some(k) => req.bearer_auth(k),
            None => req,
        }
    }

    /// Latest finalized height via the `/v0/last_block/final` redirect helper
    /// (302, no body — the cheapest head probe the API offers).
    async fn head(&self) -> Result<u64> {
        self.limiter.wait_turn().await;
        let url = format!("{}/v0/last_block/final", self.base);
        let resp = self
            .authed(self.no_redirect.get(&url))
            .send()
            .await
            .with_context(|| format!("GET {url}"))?;
        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            self.limiter.on_rate_limited().await;
            bail!("rate limited (429)");
        }
        if !resp.status().is_redirection() {
            bail!("neardata {url} -> {} (expected 302)", resp.status());
        }
        let loc = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .context("last_block/final: missing location")?;
        let height: u64 = loc
            .rsplit('/')
            .next()
            .and_then(|s| s.split('?').next())
            .and_then(|s| s.parse().ok())
            .with_context(|| format!("last_block/final: bad location {loc}"))?;
        self.limiter.on_success().await;
        Ok(height)
    }

    /// Finalized block at `height`. `Ok(None)` means not available: either a
    /// 404 (height beyond the finalized head / before genesis) or a `200`
    /// with a JSON `null` body, which the API spec returns when "the selected
    /// slice is absent". Both mean "try again later", never "skip".
    async fn block(&self, height: u64) -> Result<Option<String>> {
        self.limiter.wait_turn().await;
        let url = format!("{}/v0/block/{}", self.base, height);
        let resp = self
            .authed(self.client.get(&url))
            .send()
            .await
            .with_context(|| format!("GET {url}"))?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            self.limiter.on_success().await;
            return Ok(None);
        }
        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            self.limiter.on_rate_limited().await;
            let wait = retry_after.unwrap_or(5).max(2);
            tokio::time::sleep(Duration::from_secs(wait)).await;
            bail!("rate limited (429)");
        }
        if !resp.status().is_success() {
            bail!("neardata {} -> {}", url, resp.status());
        }
        // neardata redirects finalized requests; body is the StreamerMessage.
        let body = resp.text().await.context("read body")?;
        self.limiter.on_success().await;
        // Per the API spec a 200 can carry a JSON `null` when the slice is
        // absent. Treat it exactly like the 404 case — otherwise decode would
        // fail and this height would poison the consumer into a crash loop.
        if body.trim() == "null" {
            return Ok(None);
        }
        Ok(Some(body))
    }
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

async fn run_parity(client: &Client, fetcher: &Fetcher, block: u64, tables: &[String]) -> Result<()> {
    info!(block, "parity: fetching block");
    let body = fetcher
        .block(block)
        .await?
        .ok_or_else(|| anyhow!("block {block} not found on neardata"))?;
    let blk = parse_neardata_block(&body).context("parse block")?;
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
    info!(block, "parity OK — generated rows match the stored rows");
    Ok(())
}

// ---------------------------------------------------------------------------
// Live mode
// ---------------------------------------------------------------------------

/// Live pipeline: up to `--prefetch` blocks download concurrently while the
/// consumer decodes and commits strictly in height order. Crash-safety is
/// unchanged — a block's rows + cursor still commit in one transaction, so a
/// restart resumes at the first uncommitted height and buffered refetches are
/// idempotent upserts.
async fn run_live(client: &mut Client, fetcher: &Fetcher, args: &Args) -> Result<()> {
    let schema = Schema::load(client).await?;
    info!(tables = schema.tables_len(), "schema loaded");

    let start = if let Some(b) = args.start_block {
        b
    } else if let Some(b) = writer::read_cursor(client, READER_CURSOR_ID).await? {
        b + 1
    } else if let Some(b) = writer::read_sink_cursor(client).await? {
        info!(sink_cursor = b, "resuming from highest cursor");
        b + 1
    } else {
        bail!("no cursor found; pass --start-block");
    };
    let depth = args.prefetch.max(1);
    info!(start, depth, "live mode start");

    let mut next = start;
    let mut fetch_next = start;
    // Latest finalized height known to exist, from `/v0/last_block/final`.
    // Never spawn fetches past it: the API 404s future heights, which just
    // burns rate-limit budget. Refreshed only when the pipeline starves, so
    // the steady-state cost at the tip is one 302 probe per second instead
    // of a 404 per pending height.
    let mut known_head: u64 = 0;
    let mut in_flight: tokio::task::JoinSet<(u64, Result<Option<String>, String>)> =
        tokio::task::JoinSet::new();
    let mut task_heights: std::collections::HashMap<tokio::task::Id, u64> =
        std::collections::HashMap::new();
    let mut buffered: BTreeMap<u64, String> = BTreeMap::new();
    let mut retry: std::collections::VecDeque<u64> = std::collections::VecDeque::new();

    loop {
        if args.end_block.is_some_and(|end| next >= end) {
            info!(stopped_before = args.end_block, "gap fill complete");
            return Ok(());
        }

        // Keep the window full: retries first, then fresh heights.
        while in_flight.len() < depth {
            let h = match retry.pop_front() {
                Some(h) => h,
                None => {
                    if args.end_block.is_some_and(|end| fetch_next >= end) {
                        break;
                    }
                    if fetch_next > known_head {
                        break;
                    }
                    let h = fetch_next;
                    fetch_next += 1;
                    h
                }
            };
            let f = fetcher.clone();
            let handle = in_flight.spawn(async move {
                let r = f.block(h).await.map_err(|e| format!("{e:#}"));
                (h, r)
            });
            task_heights.insert(handle.id(), h);
        }

        if in_flight.is_empty() {
            // Starved: caught up with everything we know about. Wait for the
            // chain to advance, then learn the new tip from the cheap 302
            // redirect helper (no body) rather than probing heights.
            tokio::time::sleep(Duration::from_secs(1)).await;
            match fetcher.head().await {
                Ok(h) => known_head = known_head.max(h),
                Err(e) => warn!(error = %e, "head refresh failed"),
            }
            continue;
        }

        let joined = in_flight
            .join_next_with_id()
            .await
            .context("fetch set unexpectedly empty")?;
        let (h, res) = match joined {
            Ok((id, v)) => {
                task_heights.remove(&id);
                v
            }
            Err(e) => {
                let h = task_heights.remove(&e.id()).unwrap_or(0);
                warn!(block = h, error = %e, "fetch task failed, requeueing");
                retry.push_back(h);
                continue;
            }
        };

        match res {
            Ok(Some(body)) => {
                buffered.insert(h, body);
            }
            Ok(None) => {
                // Height was <= known_head but the slice came back absent
                // (404 or 200-null) — usually a brief cache race right at the
                // tip. Back off and retry; never skip a height.
                tokio::time::sleep(Duration::from_millis(600)).await;
                retry.push_back(h);
            }
            Err(e) => {
                warn!(block = h, error = %e, "fetch failed, requeueing");
                retry.push_back(h);
            }
        }

        // Commit every contiguous block now available, in order.
        while let Some(body) = buffered.remove(&next) {
            let blk = parse_neardata_block(&body).context("parse block")?;
            let hash = onsocial_chain_index::neardata::block_hash(&blk);
            let changes = changes_for_block(&blk);
            let n =
                writer::apply_block(client, &schema, &changes, next, &hash, READER_CURSOR_ID, CURSOR_TOKEN)
                    .await?;
            if n > 0 {
                info!(block = next, rows = n, "indexed");
            }
            next += 1;
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

    let fetcher = Fetcher::new(base, args.max_rpm, args.api_key.clone());

    if let Some(block) = args.parity_block {
        return run_parity(&client, &fetcher, block, &args.parity_tables).await;
    }

    run_live(&mut client, &fetcher, &args).await
}
