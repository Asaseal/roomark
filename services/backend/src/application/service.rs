use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::{
    domain::{
        CaptureSource, FurnishingProject, FurniturePlacement, IndoorViewpoint, RoomDimensions,
        RoomMesh, ScanSession, ValidatedText,
    },
    error::DomainError,
    repository::{
        CompleteScan, NewFurnishingProject, NewScanSession, RepositoryError, SqliteRepository,
    },
};

#[derive(Clone, Debug)]
pub struct Application {
    repository: Arc<SqliteRepository>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateScanInput {
    pub property_id: String,
    pub source: String,
    pub ceiling_height_meters: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteScanInput {
    pub title: String,
    pub width_meters: f32,
    pub depth_meters: f32,
    pub height_meters: f32,
    pub source_asset_name: String,
    pub preview_model_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFurnishingInput {
    pub style: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ApplicationError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("not found: {0}")]
    NotFound(&'static str),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("service unavailable")]
    Unavailable,
}

impl Application {
    pub fn new(repository: SqliteRepository) -> Self {
        Self {
            repository: Arc::new(repository),
        }
    }

    pub async fn create_scan(
        &self,
        input: CreateScanInput,
    ) -> Result<ScanSession, ApplicationError> {
        let property_id = ValidatedText::identifier(&input.property_id)?.into_inner();
        let source = CaptureSource::parse(&input.source)?;
        RoomDimensions::new(1.0, 1.0, input.ceiling_height_meters)?;
        self.repository
            .create_scan_session(NewScanSession {
                property_id,
                source,
                ceiling_height_meters: input.ceiling_height_meters,
            })
            .await
            .map_err(Into::into)
    }

    pub async fn get_scan(&self, id: &str) -> Result<ScanSession, ApplicationError> {
        ValidatedText::identifier(id)?;
        self.repository
            .get_scan_session(id)
            .await?
            .ok_or(ApplicationError::NotFound("scan session"))
    }

    pub async fn complete_scan(
        &self,
        session_id: &str,
        idempotency_key: &str,
        input: CompleteScanInput,
    ) -> Result<RoomMesh, ApplicationError> {
        let session_id = ValidatedText::identifier(session_id)?.into_inner();
        let idempotency_key = ValidatedText::identifier(idempotency_key)?.into_inner();
        let title = ValidatedText::title(&input.title)?.into_inner();
        let source_asset_name = ValidatedText::asset_name(&input.source_asset_name)?.into_inner();
        let dimensions =
            RoomDimensions::new(input.width_meters, input.depth_meters, input.height_meters)?;
        self.repository
            .complete_scan(CompleteScan {
                session_id,
                idempotency_key,
                title,
                dimensions,
                source_asset_name,
                preview_model_url: input.preview_model_url,
            })
            .await
            .map_err(Into::into)
    }

    pub async fn list_room_meshes(
        &self,
        property_id: &str,
    ) -> Result<Vec<RoomMesh>, ApplicationError> {
        let property_id = ValidatedText::identifier(property_id)?;
        self.repository
            .list_room_meshes(property_id.as_str())
            .await
            .map_err(Into::into)
    }

    pub async fn get_room_mesh(&self, id: &str) -> Result<RoomMesh, ApplicationError> {
        ValidatedText::identifier(id)?;
        self.repository
            .get_room_mesh(id)
            .await?
            .ok_or(ApplicationError::NotFound("room mesh"))
    }

    pub async fn replace_tour(
        &self,
        mesh_id: &str,
        viewpoints: Vec<IndoorViewpoint>,
    ) -> Result<Vec<IndoorViewpoint>, ApplicationError> {
        ValidatedText::identifier(mesh_id)?;
        self.repository
            .replace_tour(mesh_id, viewpoints)
            .await
            .map_err(Into::into)
    }

    pub async fn get_tour(&self, mesh_id: &str) -> Result<Vec<IndoorViewpoint>, ApplicationError> {
        self.get_room_mesh(mesh_id).await?;
        self.repository.get_tour(mesh_id).await.map_err(Into::into)
    }

    pub async fn create_furnishing_project(
        &self,
        mesh_id: &str,
        input: CreateFurnishingInput,
    ) -> Result<FurnishingProject, ApplicationError> {
        let mesh_id = ValidatedText::identifier(mesh_id)?.into_inner();
        let style = ValidatedText::title(&input.style)?.into_inner();
        self.repository
            .create_furnishing_project(NewFurnishingProject { mesh_id, style })
            .await
            .map_err(Into::into)
    }

    pub async fn get_furnishing_project(
        &self,
        id: &str,
    ) -> Result<FurnishingProject, ApplicationError> {
        ValidatedText::identifier(id)?;
        self.repository
            .get_furnishing_project(id)
            .await?
            .ok_or(ApplicationError::NotFound("furnishing project"))
    }

    pub async fn replace_placements(
        &self,
        project_id: &str,
        placements: Vec<FurniturePlacement>,
    ) -> Result<Vec<FurniturePlacement>, ApplicationError> {
        ValidatedText::identifier(project_id)?;
        self.repository
            .replace_placements(project_id, placements)
            .await
            .map_err(Into::into)
    }

    pub async fn ready(&self) -> Result<(), ApplicationError> {
        self.repository.ready().await.map_err(Into::into)
    }
}

impl From<DomainError> for ApplicationError {
    fn from(error: DomainError) -> Self {
        Self::InvalidInput(error.to_string())
    }
}

impl From<RepositoryError> for ApplicationError {
    fn from(error: RepositoryError) -> Self {
        match error {
            RepositoryError::NotFound(entity) => Self::NotFound(entity),
            RepositoryError::Conflict(message) => Self::Conflict(message),
            RepositoryError::InvalidData(_) | RepositoryError::Unavailable(_) => Self::Unavailable,
        }
    }
}
