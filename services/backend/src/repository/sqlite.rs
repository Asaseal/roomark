use std::{path::Path, str::FromStr, time::Duration};

use chrono::{DateTime, Utc};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    Row, SqlitePool,
};
use uuid::Uuid;

use crate::{
    domain::{
        CaptureSource, FurnishingProject, FurniturePlacement, IndoorViewpoint, RoomDimensions,
        RoomMesh, ScanSession, ScanStatus,
    },
    repository::{CompleteScan, NewFurnishingProject, NewScanSession, RepositoryError},
};

#[derive(Clone, Debug)]
pub struct SqliteRepository {
    pool: SqlitePool,
}

impl SqliteRepository {
    pub async fn connect(database_url: &str) -> Result<Self, RepositoryError> {
        let memory_database = database_url == "sqlite::memory:";
        ensure_database_directory(database_url)?;
        let options = SqliteConnectOptions::from_str(database_url)
            .map_err(RepositoryError::Unavailable)?
            .create_if_missing(true)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5))
            .journal_mode(if memory_database {
                SqliteJournalMode::Memory
            } else {
                SqliteJournalMode::Wal
            });
        let pool = SqlitePoolOptions::new()
            .max_connections(if memory_database { 1 } else { 5 })
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|error| RepositoryError::InvalidData(error.to_string()))?;
        Ok(Self { pool })
    }

    pub async fn create_scan_session(
        &self,
        input: NewScanSession,
    ) -> Result<ScanSession, RepositoryError> {
        let session = ScanSession {
            id: format!("scan_{}", Uuid::new_v4()),
            property_id: input.property_id,
            source: input.source,
            ceiling_height_meters: input.ceiling_height_meters,
            status: ScanStatus::Created,
            created_at: Utc::now(),
            completed_at: None,
        };
        sqlx::query(
            "INSERT INTO scan_sessions
             (id, property_id, source, ceiling_height_meters, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&session.id)
        .bind(&session.property_id)
        .bind(session.source.as_str())
        .bind(session.ceiling_height_meters)
        .bind(session.status.as_str())
        .bind(session.created_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(session)
    }

    pub async fn get_scan_session(&self, id: &str) -> Result<Option<ScanSession>, RepositoryError> {
        let row = sqlx::query(
            "SELECT id, property_id, source, ceiling_height_meters, status, created_at, completed_at
             FROM scan_sessions WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(map_scan_session).transpose()
    }

    pub async fn complete_scan(&self, input: CompleteScan) -> Result<RoomMesh, RepositoryError> {
        let mut transaction = self.pool.begin().await?;
        let session = sqlx::query(
            "SELECT property_id, source, status, completion_key
             FROM scan_sessions WHERE id = ?",
        )
        .bind(&input.session_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(RepositoryError::NotFound("scan session"))?;

        let status = session.get::<String, _>("status");
        if status == "completed" {
            let existing_key = session.get::<Option<String>, _>("completion_key");
            if existing_key.as_deref() != Some(input.idempotency_key.as_str()) {
                return Err(RepositoryError::Conflict(
                    "scan session was completed by another request".to_string(),
                ));
            }
            let row = sqlx::query(
                "SELECT id, scan_session_id, property_id, title, width_meters, depth_meters,
                        height_meters, source_asset_name, preview_model_url, capture_engine, created_at
                 FROM room_meshes WHERE scan_session_id = ?",
            )
            .bind(&input.session_id)
            .fetch_one(&mut *transaction)
            .await?;
            return map_room_mesh(row);
        }

        let property_id = session.get::<String, _>("property_id");
        let source = CaptureSource::parse(&session.get::<String, _>("source"))
            .map_err(|error| RepositoryError::InvalidData(error.to_string()))?;
        let now = Utc::now();
        let mesh = RoomMesh {
            id: format!("mesh_{}", Uuid::new_v4()),
            scan_session_id: input.session_id,
            property_id,
            title: input.title,
            dimensions: input.dimensions,
            source_asset_name: input.source_asset_name,
            preview_model_url: input.preview_model_url,
            capture_engine: match source {
                CaptureSource::RoomPlan => "RoomPlan".to_string(),
                CaptureSource::Manual => "manual dimensions".to_string(),
                CaptureSource::FloorPlan => "floor plan".to_string(),
            },
            created_at: now,
        };

        sqlx::query(
            "INSERT INTO room_meshes
             (id, scan_session_id, property_id, title, width_meters, depth_meters, height_meters,
              source_asset_name, preview_model_url, capture_engine, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&mesh.id)
        .bind(&mesh.scan_session_id)
        .bind(&mesh.property_id)
        .bind(&mesh.title)
        .bind(mesh.dimensions.width_meters())
        .bind(mesh.dimensions.depth_meters())
        .bind(mesh.dimensions.height_meters())
        .bind(&mesh.source_asset_name)
        .bind(&mesh.preview_model_url)
        .bind(&mesh.capture_engine)
        .bind(mesh.created_at.to_rfc3339())
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE scan_sessions
             SET status = 'completed', completion_key = ?, completed_at = ?
             WHERE id = ?",
        )
        .bind(&input.idempotency_key)
        .bind(now.to_rfc3339())
        .bind(&mesh.scan_session_id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(mesh)
    }

    pub async fn list_room_meshes(
        &self,
        property_id: &str,
    ) -> Result<Vec<RoomMesh>, RepositoryError> {
        let rows = sqlx::query(
            "SELECT id, scan_session_id, property_id, title, width_meters, depth_meters,
                    height_meters, source_asset_name, preview_model_url, capture_engine, created_at
             FROM room_meshes WHERE property_id = ? ORDER BY created_at, id",
        )
        .bind(property_id)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(map_room_mesh).collect()
    }

    pub async fn get_room_mesh(&self, id: &str) -> Result<Option<RoomMesh>, RepositoryError> {
        let row = sqlx::query(
            "SELECT id, scan_session_id, property_id, title, width_meters, depth_meters,
                    height_meters, source_asset_name, preview_model_url, capture_engine, created_at
             FROM room_meshes WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(map_room_mesh).transpose()
    }

    pub async fn replace_tour(
        &self,
        mesh_id: &str,
        mut viewpoints: Vec<IndoorViewpoint>,
    ) -> Result<Vec<IndoorViewpoint>, RepositoryError> {
        if self.get_room_mesh(mesh_id).await?.is_none() {
            return Err(RepositoryError::NotFound("room mesh"));
        }
        viewpoints.sort_by_key(|viewpoint| viewpoint.position);
        let mut transaction = self.pool.begin().await?;
        sqlx::query("DELETE FROM indoor_viewpoints WHERE mesh_id = ?")
            .bind(mesh_id)
            .execute(&mut *transaction)
            .await?;
        for viewpoint in &viewpoints {
            sqlx::query(
                "INSERT INTO indoor_viewpoints
                 (id, mesh_id, label, yaw_degrees, x_meters, y_meters, position)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&viewpoint.id)
            .bind(mesh_id)
            .bind(&viewpoint.label)
            .bind(viewpoint.yaw_degrees)
            .bind(viewpoint.x_meters)
            .bind(viewpoint.y_meters)
            .bind(viewpoint.position)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(viewpoints)
    }

    pub async fn get_tour(&self, mesh_id: &str) -> Result<Vec<IndoorViewpoint>, RepositoryError> {
        let rows = sqlx::query(
            "SELECT id, label, yaw_degrees, x_meters, y_meters, position
             FROM indoor_viewpoints WHERE mesh_id = ? ORDER BY position, id",
        )
        .bind(mesh_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| IndoorViewpoint {
                id: row.get("id"),
                label: row.get("label"),
                yaw_degrees: row.get("yaw_degrees"),
                x_meters: row.get("x_meters"),
                y_meters: row.get("y_meters"),
                position: row.get("position"),
            })
            .collect())
    }

    pub async fn create_furnishing_project(
        &self,
        input: NewFurnishingProject,
    ) -> Result<FurnishingProject, RepositoryError> {
        if self.get_room_mesh(&input.mesh_id).await?.is_none() {
            return Err(RepositoryError::NotFound("room mesh"));
        }
        let now = Utc::now();
        let project = FurnishingProject {
            id: format!("furnish_{}", Uuid::new_v4()),
            mesh_id: input.mesh_id,
            style: input.style,
            status: "active".to_string(),
            placements: Vec::new(),
            created_at: now,
            updated_at: now,
        };
        sqlx::query(
            "INSERT INTO furnishing_projects
             (id, mesh_id, style, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&project.id)
        .bind(&project.mesh_id)
        .bind(&project.style)
        .bind(&project.status)
        .bind(project.created_at.to_rfc3339())
        .bind(project.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(project)
    }

    pub async fn get_furnishing_project(
        &self,
        id: &str,
    ) -> Result<Option<FurnishingProject>, RepositoryError> {
        let row = sqlx::query(
            "SELECT id, mesh_id, style, status, created_at, updated_at
             FROM furnishing_projects WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let placements = sqlx::query(
            "SELECT id, furniture_type, x_meters, y_meters, rotation_degrees, position
             FROM furniture_placements WHERE project_id = ? ORDER BY position, id",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?
        .into_iter()
        .map(|row| FurniturePlacement {
            id: row.get("id"),
            furniture_type: row.get("furniture_type"),
            x_meters: row.get("x_meters"),
            y_meters: row.get("y_meters"),
            rotation_degrees: row.get("rotation_degrees"),
            position: row.get("position"),
        })
        .collect();
        Ok(Some(FurnishingProject {
            id: row.get("id"),
            mesh_id: row.get("mesh_id"),
            style: row.get("style"),
            status: row.get("status"),
            placements,
            created_at: parse_time(row.get("created_at"))?,
            updated_at: parse_time(row.get("updated_at"))?,
        }))
    }

    pub async fn replace_placements(
        &self,
        project_id: &str,
        mut placements: Vec<FurniturePlacement>,
    ) -> Result<Vec<FurniturePlacement>, RepositoryError> {
        if self.get_furnishing_project(project_id).await?.is_none() {
            return Err(RepositoryError::NotFound("furnishing project"));
        }
        placements.sort_by_key(|placement| placement.position);
        let mut transaction = self.pool.begin().await?;
        sqlx::query("DELETE FROM furniture_placements WHERE project_id = ?")
            .bind(project_id)
            .execute(&mut *transaction)
            .await?;
        for placement in &mut placements {
            placement.id = format!("placement_{}", Uuid::new_v4());
            sqlx::query(
                "INSERT INTO furniture_placements
                 (id, project_id, furniture_type, x_meters, y_meters, rotation_degrees, position)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&placement.id)
            .bind(project_id)
            .bind(&placement.furniture_type)
            .bind(placement.x_meters)
            .bind(placement.y_meters)
            .bind(placement.rotation_degrees)
            .bind(placement.position)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query("UPDATE furnishing_projects SET updated_at = ? WHERE id = ?")
            .bind(Utc::now().to_rfc3339())
            .bind(project_id)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
        Ok(placements)
    }

    pub async fn ready(&self) -> Result<(), RepositoryError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn close(self) {
        self.pool.close().await;
    }
}

fn ensure_database_directory(database_url: &str) -> Result<(), RepositoryError> {
    let Some(path) = database_url.strip_prefix("sqlite://") else {
        return Ok(());
    };
    let path = path.split('?').next().unwrap_or(path);
    let parent = Path::new(path).parent();
    if let Some(parent) = parent.filter(|parent| !parent.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)
            .map_err(|error| RepositoryError::InvalidData(error.to_string()))?;
    }
    Ok(())
}

fn map_scan_session(row: sqlx::sqlite::SqliteRow) -> Result<ScanSession, RepositoryError> {
    let status = match row.get::<String, _>("status").as_str() {
        "created" => ScanStatus::Created,
        "completed" => ScanStatus::Completed,
        value => {
            return Err(RepositoryError::InvalidData(format!(
                "unknown status: {value}"
            )))
        }
    };
    Ok(ScanSession {
        id: row.get("id"),
        property_id: row.get("property_id"),
        source: CaptureSource::parse(&row.get::<String, _>("source"))
            .map_err(|error| RepositoryError::InvalidData(error.to_string()))?,
        ceiling_height_meters: row.get("ceiling_height_meters"),
        status,
        created_at: parse_time(row.get("created_at"))?,
        completed_at: row
            .get::<Option<String>, _>("completed_at")
            .map(parse_time)
            .transpose()?,
    })
}

fn map_room_mesh(row: sqlx::sqlite::SqliteRow) -> Result<RoomMesh, RepositoryError> {
    let dimensions = RoomDimensions::new(
        row.get("width_meters"),
        row.get("depth_meters"),
        row.get("height_meters"),
    )
    .map_err(|error| RepositoryError::InvalidData(error.to_string()))?;
    Ok(RoomMesh {
        id: row.get("id"),
        scan_session_id: row.get("scan_session_id"),
        property_id: row.get("property_id"),
        title: row.get("title"),
        dimensions,
        source_asset_name: row.get("source_asset_name"),
        preview_model_url: row.get("preview_model_url"),
        capture_engine: row.get("capture_engine"),
        created_at: parse_time(row.get("created_at"))?,
    })
}

fn parse_time(value: String) -> Result<DateTime<Utc>, RepositoryError> {
    DateTime::parse_from_rfc3339(&value)
        .map(|time| time.with_timezone(&Utc))
        .map_err(|error| RepositoryError::InvalidData(error.to_string()))
}
