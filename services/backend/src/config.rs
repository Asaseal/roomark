use std::{collections::HashMap, net::SocketAddr};

use anyhow::{bail, Context, Result};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Config {
    pub http_addr: SocketAddr,
    pub grpc_addr: Option<SocketAddr>,
    pub database_url: String,
    pub cors_origins: Vec<String>,
    pub api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Self::from_pairs(std::env::vars())
    }

    pub fn from_pairs<I>(values: I) -> Result<Self>
    where
        I: IntoIterator<Item = (String, String)>,
    {
        let values = values.into_iter().collect::<HashMap<_, _>>();
        let http_addr = values
            .get("ROOMARK_HTTP_ADDR")
            .map(String::as_str)
            .unwrap_or("127.0.0.1:8080")
            .parse()
            .context("ROOMARK_HTTP_ADDR must be a valid socket address")?;

        let grpc_addr = match values
            .get("ROOMARK_GRPC_ADDR")
            .map(String::as_str)
            .unwrap_or("127.0.0.1:50051")
        {
            "disabled" | "off" | "none" => None,
            value => Some(
                value
                    .parse()
                    .context("ROOMARK_GRPC_ADDR must be a socket address or disabled")?,
            ),
        };

        let database_url = values
            .get("ROOMARK_DATABASE_URL")
            .cloned()
            .unwrap_or_else(|| "sqlite://data/roomark.db?mode=rwc".to_string());
        if !database_url.starts_with("sqlite:") {
            bail!("ROOMARK_DATABASE_URL must use SQLite");
        }

        let cors_origins = values
            .get("ROOMARK_CORS_ORIGINS")
            .map(|origins| {
                origins
                    .split(',')
                    .map(str::trim)
                    .filter(|origin| !origin.is_empty())
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if cors_origins
            .iter()
            .any(|origin| !origin.starts_with("http://") && !origin.starts_with("https://"))
        {
            bail!("ROOMARK_CORS_ORIGINS entries must use http or https");
        }

        let api_key = values
            .get("ROOMARK_API_KEY")
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if api_key.as_ref().is_some_and(|value| value.len() < 16) {
            bail!("ROOMARK_API_KEY must contain at least 16 characters");
        }

        Ok(Self {
            http_addr,
            grpc_addr,
            database_url,
            cors_origins,
            api_key,
        })
    }
}
