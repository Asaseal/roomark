use roomark_backend::{
    application::Application,
    grpc::{
        proto::{
            roomark_service_server::RoomarkService, CompleteRoomPlanScanRequest,
            CreateScanSessionRequest, GetIndoorTourRequest, ListRoomMeshesRequest,
            StartFurnishingSimulationRequest,
        },
        RoomarkGrpcService,
    },
    repository::SqliteRepository,
};
use tonic::{Code, Request};

async fn service() -> RoomarkGrpcService {
    let repository = SqliteRepository::connect("sqlite::memory:")
        .await
        .expect("repository");
    RoomarkGrpcService::new(Application::new(repository))
}

#[tokio::test]
async fn grpc_uses_persisted_application_entities() {
    let service = service().await;
    let created = service
        .create_scan_session(Request::new(CreateScanSessionRequest {
            property_id: "property_123".to_string(),
            source: "manual".to_string(),
            ceiling_height_meters: 2.8,
        }))
        .await
        .expect("created")
        .into_inner();

    let completed = service
        .complete_room_plan_scan(Request::new(CompleteRoomPlanScanRequest {
            scan_session_id: created.scan_session_id,
            width_meters: 4.2,
            depth_meters: 3.1,
            height_meters: 2.8,
            source_asset_name: "main-room.glb".to_string(),
            idempotency_key: "grpc-complete-1".to_string(),
            title: "Main room".to_string(),
            preview_model_url: String::new(),
        }))
        .await
        .expect("completed")
        .into_inner()
        .mesh
        .expect("mesh");

    let listed = service
        .list_room_meshes(Request::new(ListRoomMeshesRequest {
            property_id: "property_123".to_string(),
        }))
        .await
        .expect("listed")
        .into_inner();
    assert_eq!(listed.meshes.len(), 1);
    assert_eq!(listed.meshes[0].id, completed.id);

    let tour = service
        .get_indoor_tour(Request::new(GetIndoorTourRequest {
            mesh_id: completed.id.clone(),
        }))
        .await
        .expect("tour")
        .into_inner();
    assert!(tour.viewpoints.is_empty());

    let project = service
        .start_furnishing_simulation(Request::new(StartFurnishingSimulationRequest {
            mesh_id: completed.id,
            style: "neutral".to_string(),
            placements: Vec::new(),
        }))
        .await
        .expect("project")
        .into_inner();
    assert!(project.simulation_id.starts_with("furnish_"));
    assert!(project.suggestions.is_empty());
}

#[tokio::test]
async fn grpc_maps_application_errors_to_stable_codes() {
    let service = service().await;
    let invalid = service
        .create_scan_session(Request::new(CreateScanSessionRequest {
            property_id: String::new(),
            source: "manual".to_string(),
            ceiling_height_meters: 2.8,
        }))
        .await
        .expect_err("invalid input");
    assert_eq!(invalid.code(), Code::InvalidArgument);

    let missing = service
        .get_indoor_tour(Request::new(GetIndoorTourRequest {
            mesh_id: "mesh_missing".to_string(),
        }))
        .await
        .expect_err("missing mesh");
    assert_eq!(missing.code(), Code::NotFound);
}
