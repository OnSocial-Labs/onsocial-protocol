//! node_indexer — OnSocial indexer driven by a self-hosted NEAR node.
//!
//! Scaffold state: CLI + wiring only. The runner lands in PR 2:
//!
//! 1. Embed the node via the near-indexer framework (`Indexer`), pointed at
//!    `--home`, following the chain from the cursor or `--start-block`.
//! 2. For each `StreamerMessage`: `streamer_message_to_block` →
//!    `map_combined_output_impl` → `combined_db_out_impl`.
//! 3. Apply through the same Postgres writer `neardata_reader` uses —
//!    refactored into a shared native module first, so there is ONE writer
//!    and two sources, never two writers to keep in sync.
//!
//! Cursor: will advance its own `cursors` row (`id = "node_indexer"`) inside
//! the same transaction as each block's rows — identical crash semantics to
//! the reader, so either source can resume after the other stopped.

use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "node_indexer", about = "OnSocial indexer on a self-hosted NEAR node")]
struct Args {
    /// NEAR node home directory (holds config.json, data/).
    #[arg(long, default_value = "/var/lib/near")]
    home: String,

    /// `testnet` or `mainnet`.
    #[arg(long, default_value = "testnet")]
    network: String,

    /// Postgres connection string for the indexer database.
    #[arg(long)]
    db_url: Option<String>,

    /// Explicit start height. Overrides the cursor lookup.
    #[arg(long)]
    start_block: Option<u64>,
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    let args = Args::parse();
    tracing::info!(
        home = %args.home,
        network = %args.network,
        start_block = ?args.start_block,
        db_url = ?args.db_url.as_deref().map(|_| "<set>"),
        "node_indexer scaffold — near-indexer runner wiring lands in PR 2"
    );
}
