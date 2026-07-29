use anyhow::Result;
use roomark_backend::{config::Config, run, telemetry};

#[tokio::main]
async fn main() -> Result<()> {
    telemetry::init();
    run(Config::from_env()?).await
}
