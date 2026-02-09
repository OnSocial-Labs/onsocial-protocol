//! OnSocial Relayer binary.

use relayer::{create_router, AppState, Config};
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting OnSocial Relayer");

    let config: Config = config::Config::builder()
        .add_source(config::File::with_name("relayer").required(false))
        .add_source(config::Environment::with_prefix("RELAYER"))
        .build()?
        .try_deserialize()
        .unwrap_or_default();

    info!(contract = %config.contract_id, rpc = %config.rpc_url, "Configuration loaded");

    let bind_address = config.bind_address.clone();
    let state = Arc::new(AppState::new(config).await?);

    info!(
        active_keys = state.key_pool.active_count(),
        "Relayer ready"
    );

    // Spawn autoscaler background task
    let pool = Arc::clone(&state.key_pool);
    let state_bg = Arc::clone(&state);
    tokio::spawn(async move {
        pool.run_autoscaler(&state_bg.rpc).await;
    });

    let app = create_router(state);

    info!(address = %bind_address, "Listening");

    let listener = tokio::net::TcpListener::bind(&bind_address).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
