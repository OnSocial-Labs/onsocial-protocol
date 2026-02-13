//! OnSocial Relayer binary.

use onsocial_relayer::{create_router, AppState, Config};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
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
        .build()
        .and_then(|c| c.try_deserialize())
        .unwrap_or_else(|e| {
            // Fall back only when no config exists; parsing errors fail hard.
            let err_str = format!("{e}");
            if err_str.contains("not found") || err_str.contains("missing field") {
                warn!(error = %e, "No config file found, using defaults");
                Config::default()
            } else {
                error!(error = %e, "FATAL: Config error — fix env vars or relayer.toml");
                std::process::exit(1);
            }
        });

    if std::env::var("RELAYER_API_KEY")
        .map(|k| !k.is_empty())
        .unwrap_or(false)
    {
        info!("API key auth enabled");
    } else {
        warn!("RELAYER_API_KEY not set — /execute is unprotected (dev mode)");
    }

    info!(contract = %config.contract_id, rpc = %config.rpc_url, mode = ?config.signer_mode, "Configuration loaded");

    let bind_address = config.bind_address.clone();
    let state = Arc::new(AppState::new(config).await?);

    info!(active_keys = state.key_pool.active_count(), "Relayer ready");

    let cancel = CancellationToken::new();

    let pool = Arc::clone(&state.key_pool);
    let state_bg = Arc::clone(&state);
    let cancel_bg = cancel.clone();
    tokio::spawn(async move {
        pool.run_autoscaler(&state_bg.rpc, cancel_bg).await;
    });

    let app = create_router(state.clone());

    info!(address = %bind_address, "Listening");

    let listener = tokio::net::TcpListener::bind(&bind_address).await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    // --- Graceful shutdown: cancel autoscaler, drain TXs, persist keys ---
    info!("HTTP server stopped, draining in-flight transactions...");
    cancel.cancel();

    let drain_deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
    loop {
        let in_flight = state.key_pool.total_in_flight();
        if in_flight == 0 {
            info!("All in-flight transactions drained");
            break;
        }
        if tokio::time::Instant::now() >= drain_deadline {
            warn!(
                remaining = in_flight,
                "Drain timeout — some TXs may be lost"
            );
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    if let Err(e) = state.key_pool.persist_keys_public() {
        error!(error = %e, "Failed to persist key store on shutdown");
    } else {
        info!("Key store persisted to disk");
    }

    info!("Relayer shut down gracefully");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("Received SIGINT, shutting down..."),
        _ = terminate => info!("Received SIGTERM, shutting down..."),
    }
}
