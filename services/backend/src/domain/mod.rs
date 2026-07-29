use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::DomainError;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureSource {
    RoomPlan,
    Manual,
    FloorPlan,
}

impl CaptureSource {
    pub fn parse(value: &str) -> Result<Self, DomainError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "roomplan" => Ok(Self::RoomPlan),
            "manual" => Ok(Self::Manual),
            "floor_plan" | "floor-plan" => Ok(Self::FloorPlan),
            _ => Err(DomainError::UnsupportedCaptureSource),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RoomPlan => "roomplan",
            Self::Manual => "manual",
            Self::FloorPlan => "floor_plan",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidatedText(String);

impl ValidatedText {
    pub fn identifier(value: &str) -> Result<Self, DomainError> {
        Self::bounded("identifier", value, 1, 128)
    }

    pub fn title(value: &str) -> Result<Self, DomainError> {
        Self::bounded("title", value, 1, 256)
    }

    pub fn asset_name(value: &str) -> Result<Self, DomainError> {
        Self::bounded("asset name", value, 1, 256)
    }

    fn bounded(
        field: &'static str,
        value: &str,
        min: usize,
        max: usize,
    ) -> Result<Self, DomainError> {
        let value = value.trim();
        if !(min..=max).contains(&value.chars().count()) {
            return Err(DomainError::InvalidText { field, min, max });
        }
        Ok(Self(value.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomDimensions {
    width_meters: f32,
    depth_meters: f32,
    height_meters: f32,
}

impl RoomDimensions {
    pub fn new(
        width_meters: f32,
        depth_meters: f32,
        height_meters: f32,
    ) -> Result<Self, DomainError> {
        validate_number("width", width_meters, 0.0, 100.0)?;
        validate_number("depth", depth_meters, 0.0, 100.0)?;
        validate_number("height", height_meters, 0.0, 100.0)?;
        Ok(Self {
            width_meters,
            depth_meters,
            height_meters,
        })
    }

    pub fn width_meters(&self) -> f32 {
        self.width_meters
    }

    pub fn depth_meters(&self) -> f32 {
        self.depth_meters
    }

    pub fn height_meters(&self) -> f32 {
        self.height_meters
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndoorViewpoint {
    pub id: String,
    pub label: String,
    pub yaw_degrees: f32,
    pub x_meters: f32,
    pub y_meters: f32,
    pub position: i32,
}

impl IndoorViewpoint {
    pub fn new(
        id: &str,
        label: &str,
        yaw_degrees: f32,
        x_meters: f32,
        y_meters: f32,
        position: i32,
    ) -> Result<Self, DomainError> {
        let id = ValidatedText::identifier(id)?.into_inner();
        let label = ValidatedText::title(label)?.into_inner();
        validate_number_inclusive("yaw", yaw_degrees, -180.0, 180.0)?;
        validate_number_inclusive("x coordinate", x_meters, -100.0, 100.0)?;
        validate_number_inclusive("y coordinate", y_meters, -100.0, 100.0)?;
        Ok(Self {
            id,
            label,
            yaw_degrees,
            x_meters,
            y_meters,
            position,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FurniturePlacement {
    pub id: String,
    pub furniture_type: String,
    pub x_meters: f32,
    pub y_meters: f32,
    pub rotation_degrees: f32,
    pub position: i32,
}

impl FurniturePlacement {
    pub fn new(
        furniture_type: &str,
        x_meters: f32,
        y_meters: f32,
        rotation_degrees: f32,
        position: i32,
    ) -> Result<Self, DomainError> {
        let furniture_type = ValidatedText::title(furniture_type)?.into_inner();
        validate_number_inclusive("x coordinate", x_meters, -100.0, 100.0)?;
        validate_number_inclusive("y coordinate", y_meters, -100.0, 100.0)?;
        validate_number_inclusive("rotation", rotation_degrees, -360.0, 360.0)?;
        Ok(Self {
            id: String::new(),
            furniture_type,
            x_meters,
            y_meters,
            rotation_degrees,
            position,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanStatus {
    Created,
    Completed,
}

impl ScanStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Completed => "completed",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSession {
    pub id: String,
    pub property_id: String,
    pub source: CaptureSource,
    pub ceiling_height_meters: f32,
    pub status: ScanStatus,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomMesh {
    pub id: String,
    pub scan_session_id: String,
    pub property_id: String,
    pub title: String,
    pub dimensions: RoomDimensions,
    pub source_asset_name: String,
    pub preview_model_url: Option<String>,
    pub capture_engine: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FurnishingProject {
    pub id: String,
    pub mesh_id: String,
    pub style: String,
    pub status: String,
    pub placements: Vec<FurniturePlacement>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn validate_number(
    field: &'static str,
    value: f32,
    min_exclusive: f32,
    max_inclusive: f32,
) -> Result<(), DomainError> {
    if !value.is_finite() || value <= min_exclusive || value > max_inclusive {
        return Err(DomainError::InvalidNumber {
            field,
            min: min_exclusive as i32,
            max: max_inclusive as i32,
        });
    }
    Ok(())
}

fn validate_number_inclusive(
    field: &'static str,
    value: f32,
    min_inclusive: f32,
    max_inclusive: f32,
) -> Result<(), DomainError> {
    if !value.is_finite() || value < min_inclusive || value > max_inclusive {
        return Err(DomainError::InvalidNumber {
            field,
            min: min_inclusive as i32,
            max: max_inclusive as i32,
        });
    }
    Ok(())
}
