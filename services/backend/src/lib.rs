pub mod application;
pub mod config;
pub mod domain;
pub mod error;
pub mod grpc;
pub mod http;
pub mod repository;
pub mod telemetry;

use anyhow::{Context, Result};
use grpc::{proto::roomark_service_server::RoomarkServiceServer, RoomarkGrpcService};
use repository::SqliteRepository;
use tokio::{net::TcpListener, sync::watch};
use tonic::transport::Server;
use tracing::info;

use crate::{application::Application, config::Config, http::build_router};

pub async fn run(config: Config) -> Result<()> {
    let repository = SqliteRepository::connect(&config.database_url)
        .await
        .context("connect Roomark database")?;
    let application = Application::new(repository);
    let router = build_router(
        application.clone(),
        config.api_key.clone(),
        &config.cors_origins,
    )?;
    let http_listener = TcpListener::bind(config.http_addr)
        .await
        .context("bind HTTP listener")?;
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let http_shutdown = wait_for_shutdown(shutdown_rx.clone());

    info!(
        service.name = "roomark-backend",
        service.version = env!("CARGO_PKG_VERSION"),
        address = %config.http_addr,
        "HTTP API listening"
    );
    let http_server = async move {
        axum::serve(http_listener, router)
            .with_graceful_shutdown(http_shutdown)
            .await
            .context("serve HTTP API")
    };

    let grpc_server = async move {
        if let Some(grpc_addr) = config.grpc_addr {
            info!(
                service.name = "roomark-backend",
                service.version = env!("CARGO_PKG_VERSION"),
                address = %grpc_addr,
                "gRPC API listening"
            );
            Server::builder()
                .add_service(RoomarkServiceServer::new(RoomarkGrpcService::new(
                    application,
                )))
                .serve_with_shutdown(grpc_addr, wait_for_shutdown(shutdown_rx))
                .await
                .context("serve gRPC API")?;
        } else {
            wait_for_shutdown(shutdown_rx).await;
        }
        Ok::<(), anyhow::Error>(())
    };

    let signal = async move {
        shutdown_signal().await;
        let _ = shutdown_tx.send(true);
        Ok::<(), anyhow::Error>(())
    };

    tokio::try_join!(http_server, grpc_server, signal)?;
    Ok(())
}

async fn wait_for_shutdown(mut receiver: watch::Receiver<bool>) {
    if *receiver.borrow() {
        return;
    }
    while receiver.changed().await.is_ok() {
        if *receiver.borrow() {
            return;
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(%error, "failed to install Ctrl+C handler");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => tracing::error!(%error, "failed to install terminate handler"),
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
    info!("shutdown signal received");
}
