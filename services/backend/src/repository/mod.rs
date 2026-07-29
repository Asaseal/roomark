use crate::domain::{CaptureSource, RoomDimensions};

pub use sqlite::SqliteRepository;

pub mod sqlite;

#[derive(Clone, Debug)]
pub struct NewScanSession {
    pub property_id: String,
    pub source: CaptureSource,
    pub ceiling_height_meters: f32,
}

#[derive(Clone, Debug)]
pub struct CompleteScan {
    pub session_id: String,
    pub idempotency_key: String,
    pub title: String,
    pub dimensions: RoomDimensions,
    pub source_asset_name: String,
    pub preview_model_url: Option<String>,
}

#[derive(Clone, Debug)]
pub struct NewFurnishingProject {
    pub mesh_id: String,
    pub style: String,
}

#[derive(Debug, thiserror::Error)]
pub enum RepositoryError {
    #[error("entity not found: {0}")]
    NotFound(&'static str),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("invalid stored data: {0}")]
    InvalidData(String),
    #[error("database unavailable")]
    Unavailable(#[source] sqlx::Error),
}

impl From<sqlx::Error> for RepositoryError {
    fn from(error: sqlx::Error) -> Self {
        Self::Unavailable(error)
    }
}
