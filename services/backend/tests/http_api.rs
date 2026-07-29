use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use http_body_util::BodyExt;
use roomark_backend::{application::Application, http::build_router, repository::SqliteRepository};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn router(api_key: Option<String>) -> axum::Router {
    let repository = SqliteRepository::connect("sqlite::memory:")
        .await
        .expect("repository");
    build_router(Application::new(repository), api_key, &[]).expect("router")
}

async fn request(
    router: &axum::Router,
    method: Method,
    uri: &str,
    body: Option<Value>,
    headers: &[(&str, &str)],
) -> axum::response::Response {
    let mut request = Request::builder().method(method).uri(uri);
    if body.is_some() {
        request = request.header("content-type", "application/json");
    }
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    router
        .clone()
        .oneshot(
            request
                .body(Body::from(
                    body.map(|value| value.to_string()).unwrap_or_default(),
                ))
                .expect("request"),
        )
        .await
        .expect("response")
}

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();
    serde_json::from_slice(&bytes).expect("json response")
}

#[tokio::test]
async fn health_version_and_api_description_are_available() {
    let router = router(None).await;
    for uri in [
        "/health",
        "/health/live",
        "/health/ready",
        "/api/v1/version",
        "/api/openapi.json",
        "/docs",
    ] {
        let response = request(&router, Method::GET, uri, None, &[]).await;
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert!(response.headers().contains_key("x-request-id"), "{uri}");
    }
}

#[tokio::test]
async fn api_key_protects_data_routes_when_configured() {
    let router = router(Some("configured-api-key".to_string())).await;
    let unauthorized = request(
        &router,
        Method::POST,
        "/api/v1/scans",
        Some(json!({
            "propertyId": "property_1",
            "source": "manual",
            "ceilingHeightMeters": 2.8
        })),
        &[],
    )
    .await;
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let authorized = request(
        &router,
        Method::POST,
        "/api/v1/scans",
        Some(json!({
            "propertyId": "property_1",
            "source": "manual",
            "ceilingHeightMeters": 2.8
        })),
        &[("authorization", "Bearer configured-api-key")],
    )
    .await;
    assert_eq!(authorized.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn rest_flow_is_persistent_and_reports_conflicts() {
    let router = router(None).await;
    let create = request(
        &router,
        Method::POST,
        "/api/v1/scans",
        Some(json!({
            "propertyId": "property_123",
            "source": "manual",
            "ceilingHeightMeters": 2.8
        })),
        &[],
    )
    .await;
    assert_eq!(create.status(), StatusCode::CREATED);
    let session = json_body(create).await;
    let session_id = session["id"].as_str().expect("session id");

    let completion_body = json!({
        "title": "Main room",
        "widthMeters": 4.2,
        "depthMeters": 3.1,
        "heightMeters": 2.8,
        "sourceAssetName": "main-room.glb"
    });
    let complete = request(
        &router,
        Method::POST,
        &format!("/api/v1/scans/{session_id}/complete"),
        Some(completion_body.clone()),
        &[("idempotency-key", "complete-1")],
    )
    .await;
    assert_eq!(complete.status(), StatusCode::CREATED);
    let mesh = json_body(complete).await;
    let mesh_id = mesh["id"].as_str().expect("mesh id");

    let repeat = request(
        &router,
        Method::POST,
        &format!("/api/v1/scans/{session_id}/complete"),
        Some(completion_body.clone()),
        &[("idempotency-key", "complete-1")],
    )
    .await;
    assert_eq!(repeat.status(), StatusCode::CREATED);
    assert_eq!(json_body(repeat).await["id"], mesh_id);

    let conflict = request(
        &router,
        Method::POST,
        &format!("/api/v1/scans/{session_id}/complete"),
        Some(completion_body),
        &[("idempotency-key", "complete-2")],
    )
    .await;
    assert_eq!(conflict.status(), StatusCode::CONFLICT);
    let error = json_body(conflict).await;
    assert_eq!(error["code"], "conflict");
    assert!(error["requestId"].as_str().is_some());

    let meshes = request(
        &router,
        Method::GET,
        "/api/v1/properties/property_123/meshes",
        None,
        &[],
    )
    .await;
    assert_eq!(meshes.status(), StatusCode::OK);
    assert_eq!(json_body(meshes).await.as_array().expect("meshes").len(), 1);

    let replace_tour = request(
        &router,
        Method::PUT,
        &format!("/api/v1/meshes/{mesh_id}/tour"),
        Some(json!({
            "viewpoints": [{
                "id": "entry",
                "label": "Entry",
                "yawDegrees": 0.0,
                "xMeters": 0.5,
                "yMeters": 0.5
            }]
        })),
        &[],
    )
    .await;
    assert_eq!(replace_tour.status(), StatusCode::OK);
    assert_eq!(
        json_body(replace_tour)
            .await
            .as_array()
            .expect("viewpoints")
            .len(),
        1
    );

    let create_project = request(
        &router,
        Method::POST,
        &format!("/api/v1/meshes/{mesh_id}/furnishing-projects"),
        Some(json!({ "style": "neutral" })),
        &[],
    )
    .await;
    assert_eq!(create_project.status(), StatusCode::CREATED);
    let project = json_body(create_project).await;
    let project_id = project["id"].as_str().expect("project id");
    let replace_placements = request(
        &router,
        Method::PUT,
        &format!("/api/v1/furnishing-projects/{project_id}/placements"),
        Some(json!({
            "placements": [{
                "furnitureType": "chair",
                "xMeters": 1.0,
                "yMeters": 1.0,
                "rotationDegrees": 0.0
            }]
        })),
        &[],
    )
    .await;
    assert_eq!(replace_placements.status(), StatusCode::OK);
    let stored_project = request(
        &router,
        Method::GET,
        &format!("/api/v1/furnishing-projects/{project_id}"),
        None,
        &[],
    )
    .await;
    assert_eq!(stored_project.status(), StatusCode::OK);
    assert_eq!(
        json_body(stored_project).await["placements"]
            .as_array()
            .expect("placements")
            .len(),
        1
    );

    let missing = request(
        &router,
        Method::GET,
        "/api/v1/meshes/mesh_missing",
        None,
        &[],
    )
    .await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn invalid_and_oversized_requests_are_rejected() {
    let router = router(None).await;
    let invalid = request(
        &router,
        Method::POST,
        "/api/v1/scans",
        Some(json!({
            "propertyId": "",
            "source": "manual",
            "ceilingHeightMeters": 2.8
        })),
        &[],
    )
    .await;
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

    let oversized = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/scans")
        .header("content-type", "application/json")
        .body(Body::from("x".repeat(1024 * 1024 + 1)))
        .expect("request");
    let response = router.oneshot(oversized).await.expect("oversized response");
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}
