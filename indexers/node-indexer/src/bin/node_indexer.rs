//! node_indexer — OnSocial indexer driven by a self-hosted NEAR node.
//!
//! The runner EMBEDS the node: near-indexer starts a full neard inside this
//! process against `--home` (it owns the RocksDB — never run this alongside a
//! separate `neard` on the same home; the systemd `near-node.service` must be
//! stopped first at cutover). The embedded node still serves RPC per
//! config.json (`127.0.0.1:3030`), so the relayer/backend keep their local
//! endpoint.
//!
//! Per StreamerMessage: `streamer_message_to_block` → `changes_for_block` →
//! the SHARED writer (`onsocial_substreams::writer`) — one writer, two
//! sources (reader + this), never two writers to keep in sync.
//!
//! Cursor: advances its own `cursors` row (`id = "node_indexer"`) inside the
//! same transaction as each block's rows — identical crash semantics to the
//! reader, so either source can resume after the other stopped.
//!
//! GC-window rule: the node can only stream blocks it still holds (default
//! ~5 epochs). A cursor older than that crashes the streamer loudly
//! (`skip_broken_blocks = false`) — that is intentional: the neardata reader
//! owns backfill, this binary must never silently skip heights. Cutover
//! runbook: reader catches up to near-tip first, then this starts.

use anyhow::{bail, Context, Result};
use clap::Parser;
use tokio_postgres::NoTls;
use tracing::{info, warn};

use near_indexer::near_primitives::types::Finality;
use near_indexer::{AwaitForNodeSyncedEnum, Indexer, IndexerConfig, SyncModeEnum};

use onsocial_node_indexer::streamer_message_to_block;
use onsocial_substreams::neardata::block_hash;
use onsocial_substreams::pipeline::changes_for_block;
use onsocial_substreams::writer::{self, Schema};

/// Cursor row this source owns in the shared `cursors` table.
const NODE_CURSOR_ID: &str = "node_indexer";
/// Cursor token (provenance) stored alongside the block hash.
const CURSOR_TOKEN: &str = "node";
/// The reader's cursor id — valid resume source (same writer, same tables).
const READER_CURSOR_ID: &str = "neardata_reader";

#[derive(Parser, Debug)]
#[command(name = "node_indexer", about = "OnSocial indexer on a self-hosted NEAR node")]
struct Args {
    /// NEAR node home directory (holds config.json, data/).
    #[arg(long, default_value = "/var/lib/near")]
    home: String,

    /// Postgres connection string for the indexer database.
    #[arg(long)]
    db_url: String,

    /// Explicit start height. Overrides the cursor lookup. Must be inside
    /// the node's GC window — older heights belong to the neardata reader.
    #[arg(long)]
    start_block: Option<u64>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    let args = Args::parse();

    let (mut client, conn) = tokio_postgres::connect(&args.db_url, NoTls)
        .await
        .context("connect postgres")?;
    tokio::spawn(async move {
        if let Err(e) = conn.await {
            warn!(error = %e, "postgres connection error");
        }
    });
    let schema = Schema::load(&client).await?;
    info!(tables = schema.tables_len(), "schema loaded");

    // Resume order: explicit flag > own cursor > reader's cursor (same
    // writer, so its rows are ours) > any sink cursor. The reader backfills
    // the deep gap; this binary only ever starts inside the GC window.
    let start = if let Some(b) = args.start_block {
        b
    } else if let Some(b) = writer::read_cursor(&client, NODE_CURSOR_ID).await? {
        b + 1
    } else if let Some(b) = writer::read_cursor(&client, READER_CURSOR_ID).await? {
        info!(reader_cursor = b, "resuming from neardata reader cursor");
        b + 1
    } else if let Some(b) = writer::read_sink_cursor(&client).await? {
        info!(sink_cursor = b, "resuming from shared sink cursor");
        b + 1
    } else {
        bail!("no cursor found; pass --start-block (inside the GC window)");
    };
    info!(start, home = %args.home, "node_indexer: embedding node, then streaming");

    let indexer = Indexer::new(IndexerConfig {
        home_dir: std::path::PathBuf::from(&args.home),
        sync_mode: SyncModeEnum::BlockHeight(start),
        // Index only once the node holds complete state — chunk-less partial
        // sync states must never reach the writer.
        await_for_node_synced: AwaitForNodeSyncedEnum::WaitForFullSync,
        finality: Finality::Final,
        validate_genesis: false,
        // Never silently drop a height: a broken block means the cursor is
        // outside the GC window — crash loudly, let the reader own backfill.
        skip_broken_blocks: false,
    })
    .await
    .context("start embedded node (is another neard holding this home?)")?;

    let mut stream = indexer.streamer();
    info!("node_indexer: streaming");
    while let Some(msg) = stream.recv().await {
        let height = msg.block.header.height;
        let block = streamer_message_to_block(&msg).context("convert StreamerMessage")?;
        let changes = changes_for_block(&block);
        let hash = block_hash(&block);
        let n = writer::apply_block(
            &mut client,
            &schema,
            &changes,
            height,
            &hash,
            NODE_CURSOR_ID,
            CURSOR_TOKEN,
        )
        .await
        .with_context(|| format!("apply block {height}"))?;
        if n > 0 {
            info!(block = height, rows = n, "indexed");
        }
    }

    bail!("streamer ended unexpectedly")
}
