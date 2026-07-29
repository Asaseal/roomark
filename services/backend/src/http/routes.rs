use std::time::Duration;

use anyhow::{Context, Result};
use axum::{
    extract::{Path, State},
    http::{
        header::{AUTHORIZATION, CONTENT_TYPE},
        HeaderMap, HeaderName, HeaderValue, Method, Request, StatusCode,
    },
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tower::limit::ConcurrencyLimitLayer;
use tower_http::{
    cors::{Any, CorsLayer},
    limit::RequestBodyLimitLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::{DefaultOnResponse, TraceLayer},
    LatencyUnit,
};
use tracing::Level;

use crate::{
    application::{
        Application, ApplicationError, CompleteScanInput, CreateFurnishingInput, CreateScanInput,
    },
    domain::{FurniturePlacement, IndoorViewpoint},
};

const REQUEST_ID_HEADER: &str = "x-request-id";
const MAX_BODY_BYTES: usize = 1024 * 1024;

pub fn build_router(
    application: Application,
    api_key: Option<String>,
    cors_origins: &[String],
) -> Result<Router> {
    let data_routes = Router::new()
        .route("/scans", post(create_scan))
        .route("/scans/{id}", get(get_scan))
        .route("/scans/{id}/complete", post(complete_scan))
        .route("/properties/{property_id}/meshes", get(list_meshes))
        .route("/meshes/{id}", get(get_mesh))
        .route("/meshes/{id}/tour", get(get_tour).put(replace_tour))
        .route(
            "/meshes/{id}/furnishing-projects",
            post(create_furnishing_project),
        )
        .route("/furnishing-projects/{id}", get(get_furnishing_project))
        .route(
            "/furnishing-projects/{id}/placements",
            put(replace_placements),
        )
        .route_layer(middleware::from_fn_with_state(api_key, authorize));

    let mut cors = CorsLayer::new()
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            HeaderName::from_static("idempotency-key"),
        ])
        .allow_methods([Method::GET, Method::POST, Method::PUT]);
    if cors_origins.is_empty() {
        cors = cors.allow_origin(Any);
    } else {
        let origins = cors_origins
            .iter()
            .map(|origin| {
                HeaderValue::from_str(origin)
                    .with_context(|| format!("invalid CORS origin: {origin}"))
            })
            .collect::<Result<Vec<_>>>()?;
        cors = cors.allow_origin(origins);
    }

    let request_id_header = HeaderName::from_static(REQUEST_ID_HEADER);
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(|request: &Request<axum::body::Body>| {
            tracing::info_span!(
                "http.request",
                request_id = %request_id(request.headers()),
                method = %request.method(),
                route = %request.uri().path()
            )
        })
        .on_response(
            DefaultOnResponse::new()
                .level(Level::INFO)
                .latency_unit(LatencyUnit::Millis),
        );
    Ok(Router::new()
        .route("/health", get(readiness))
        .route("/health/live", get(liveness))
        .route("/health/ready", get(readiness))
        .route("/api/v1/version", get(version))
        .route("/api/openapi.json", get(openapi))
        .route("/docs", get(api_docs))
        .nest("/api/v1", data_routes)
        .fallback(not_found)
        .method_not_allowed_fallback(method_not_allowed)
        .with_state(application)
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .layer(ConcurrencyLimitLayer::new(128))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(trace_layer)
        .layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        .layer(SetRequestIdLayer::new(request_id_header, MakeRequestUuid)))
}

async fn authorize(
    State(expected): State<Option<String>>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let Some(expected) = expected else {
        return next.run(request).await;
    };
    let authorized = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|provided| constant_time_eq(provided.as_bytes(), expected.as_bytes()));
    if authorized {
        next.run(request).await
    } else {
        ApiError::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "a valid bearer API key is required",
            request_id(request.headers()),
        )
        .into_response()
    }
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

async fn liveness(headers: HeaderMap) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "service": "roomark-backend",
            "requestId": request_id(&headers)
        })),
    )
}

async fn readiness(
    State(application): State<Application>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    application
        .ready()
        .await
        .map_err(|error| ApiError::from_application(error, &headers))?;
    Ok((
        StatusCode::OK,
        Json(json!({
            "status": "ready",
            "requestId": request_id(&headers)
        })),
    ))
}

async fn version(headers: HeaderMap) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "service": "roomark-backend",
            "version": env!("CARGO_PKG_VERSION"),
            "apiVersion": "v1",
            "requestId": request_id(&headers)
        })),
    )
}

async fn openapi() -> Json<Value> {
    Json(json!({
        "openapi": "3.1.0",
        "info": {
            "title": "Roomark API",
            "version": env!("CARGO_PKG_VERSION"),
            "license": { "name": "MIT" }
        },
        "servers": [{ "url": "/" }],
        "paths": {
            "/health/live": { "get": { "summary": "Liveness probe" } },
            "/health/ready": { "get": { "summary": "Readiness probe" } },
            "/api/v1/scans": { "post": { "summary": "Create a scan session" } },
            "/api/v1/scans/{id}": { "get": { "summary": "Get a scan session" } },
            "/api/v1/scans/{id}/complete": { "post": { "summary": "Complete a scan session" } },
            "/api/v1/properties/{propertyId}/meshes": { "get": { "summary": "List property meshes" } },
            "/api/v1/meshes/{id}": { "get": { "summary": "Get a room mesh" } },
            "/api/v1/meshes/{id}/tour": {
                "get": { "summary": "Get an indoor tour" },
                "put": { "summary": "Replace an indoor tour" }
            },
            "/api/v1/meshes/{id}/furnishing-projects": {
                "post": { "summary": "Create a furnishing project" }
            },
            "/api/v1/furnishing-projects/{id}": {
                "get": { "summary": "Get a furnishing project" }
            },
            "/api/v1/furnishing-projects/{id}/placements": {
                "put": { "summary": "Replace furniture placements" }
            }
        }
    }))
}

async fn api_docs() -> Html<&'static str> {
    Html(
        r#"<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Roomark API</title></head>
<body><main><h1>Roomark API v1</h1><p>The machine-readable OpenAPI document is available at <a href="/api/openapi.json">/api/openapi.json</a>.</p></main></body>
</html>"#,
    )
}

async fn create_scan(
    State(application): State<Application>,
    headers: HeaderMap,
    Json(input): Json<CreateScanInput>,
) -> Result<impl IntoResponse, ApiError> {
    let session = application
        .create_scan(input)
        .await
        .map_err(|error| ApiError::from_application(error, &headers))?;
    Ok((StatusCode::CREATED, Json(session)))
}

async fn get_scan(
    State(application): State<Application>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    application
        .get_scan(&id)
        .await
        .map(Json)
        .map_err(|error| ApiError::from_application(error, &headers))
}

async fn complete_scan(
    State(application): State<Application>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<CompleteScanInput>,
) -> Result<impl IntoResponse, ApiError> {
    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalid_input",
                "Idempotency-Key header is required",
                request_id(&headers),
            )
        })?;
    let mesh = application
        .complete_scan(&id, idempotency_key, input)
        .await
        .map_err(|error| ApiError::from_application(error, &headers))?;
    Ok((StatusCode::CREATED, Json(mesh)))
}

async fn list_meshes(
    State(application): State<Application>,
    Path(property_id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    application
        .list_room_meshes(&property_id)
        .await
        .map(Json)
        .map_err(|error| ApiError::from_application(error, &headers))
}

async fn get_mesh(
    State(application): State<Application>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    application
        .get_room_mesh(&id)
        .await
        .map(Json)
        .map_err(|error| ApiError::from_application(error, &headers))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewpointInput {
    id: String,
    label: String,
    yaw_degrees: f32,
    x_meters: f32,
    y_meters: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TourInput {
    viewpoints: Vec<ViewpointInput>,
}

async fn replace_tour(
    State(application): State<Application>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<TourInput>,
) -> Result<impl IntoResponse, ApiError> {
    let viewpoints = input
        .viewpoints
        .into_iter()
        .enumerate()
        .map(|(position, input)| {
            IndoorViewpoint::new(
                &input.id,
                &input.label,
                input.yaw_degrees,
                input.x_meters,
                input.y_meters,
                position as i32,
            )
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalid_input",
                error.to_string(),
                request_id(&headers),
            )
        })?;
    application
        .replace_tour(&id, viewpoints)
        .await
        .map(Json)
        .map_err(|error| ApiError::from_application(error, &headers))
}

async fn get_tour(
    State(application): State<Application>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    application
        .get_tour(&id)
        .await
        .map(Json)
        .map_err(|error| ApiError::from_application(error, &headers))
}

async fn create_furnishing_project(
    State(application): State<Application>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<CreateFurnishingInput>,
) -> Result<impl IntoResponse, ApiError> {
    let project = application
        .create_furnishing_project(&id, input)
        .await
        .map_err(|error| ApiError::from_application(error, &headers))?;
    Ok((StatusCode::CREATED, Json(project)))
}

async fn get_furnishing_project(
    State(application): State<Application>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    application
        .get_furnishing_project(&id)
        .await
        .map(Json)
        .map_err(|error| ApiError::from_application(error, &headers))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlacementInput {
    furniture_type: String,
    x_meters: f32,
    y_meters: f32,
    rotation_degrees: f32,
}

#[derive(Debug, Deserialize)]
struct PlacementsInput {
    placements: Vec<PlacementInput>,
}

async fn replace_placements(
    State(application): State<Application>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<PlacementsInput>,
) -> Result<impl IntoResponse, ApiError> {
    let placements = input
        .placements
        .into_iter()
        .enumerate()
        .map(|(position, input)| {
            FurniturePlacement::new(
                &input.furniture_type,
                input.x_meters,
                input.y_meters,
                input.rotation_degrees,
                position as i32,
            )
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalid_input",
                error.to_string(),
                request_id(&headers),
            )
        })?;
    application
        .replace_placements(&id, placements)
        .await
        .map(Json)
        .map_err(|error| ApiError::from_application(error, &headers))
}

async fn not_found(headers: HeaderMap) -> ApiError {
    ApiError::new(
        StatusCode::NOT_FOUND,
        "not_found",
        "route not found",
        request_id(&headers),
    )
}

async fn method_not_allowed(headers: HeaderMap) -> ApiError {
    ApiError::new(
        StatusCode::METHOD_NOT_ALLOWED,
        "method_not_allowed",
        "method not allowed for this route",
        request_id(&headers),
    )
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    body: ErrorBody,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: &'static str,
    message: String,
    request_id: String,
}

impl ApiError {
    fn new(
        status: StatusCode,
        code: &'static str,
        message: impl Into<String>,
        request_id: String,
    ) -> Self {
        Self {
            status,
            body: ErrorBody {
                code,
                message: message.into(),
                request_id,
            },
        }
    }

    fn from_application(error: ApplicationError, headers: &HeaderMap) -> Self {
        let request_id = request_id(headers);
        match error {
            ApplicationError::InvalidInput(message) => Self::new(
                StatusCode::BAD_REQUEST,
                "invalid_input",
                message,
                request_id,
            ),
            ApplicationError::NotFound(entity) => Self::new(
                StatusCode::NOT_FOUND,
                "not_found",
                format!("{entity} was not found"),
                request_id,
            ),
            ApplicationError::Conflict(message) => {
                Self::new(StatusCode::CONFLICT, "conflict", message, request_id)
            }
            ApplicationError::Unavailable => Self::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "unavailable",
                "service is temporarily unavailable",
                request_id,
            ),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

fn request_id(headers: &HeaderMap) -> String {
    headers
        .get(REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unavailable")
        .to_string()
}
