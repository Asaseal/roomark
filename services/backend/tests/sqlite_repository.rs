use roomark_backend::{
    domain::{CaptureSource, FurniturePlacement, IndoorViewpoint, RoomDimensions},
    repository::{
        CompleteScan, NewFurnishingProject, NewScanSession, RepositoryError, SqliteRepository,
    },
};
use tempfile::TempDir;

fn database_url(directory: &TempDir) -> String {
    format!(
        "sqlite://{}?mode=rwc",
        directory.path().join("roomark.db").display()
    )
    .replace('\\', "/")
}

#[tokio::test]
async fn completed_scan_survives_repository_reopen() {
    let directory = TempDir::new().expect("temporary directory");
    let url = database_url(&directory);
    let repository = SqliteRepository::connect(&url).await.expect("repository");
    let session = repository
        .create_scan_session(NewScanSession {
            property_id: "property_123".to_string(),
            source: CaptureSource::Manual,
            ceiling_height_meters: 2.8,
        })
        .await
        .expect("session");
    let mesh = repository
        .complete_scan(CompleteScan {
            session_id: session.id,
            idempotency_key: "complete-1".to_string(),
            title: "Main bedroom".to_string(),
            dimensions: RoomDimensions::new(4.2, 3.1, 2.8).expect("dimensions"),
            source_asset_name: "main-bedroom.glb".to_string(),
            preview_model_url: None,
        })
        .await
        .expect("mesh");
    repository.close().await;

    let reopened = SqliteRepository::connect(&url)
        .await
        .expect("reopened repository");
    let loaded = reopened
        .get_room_mesh(&mesh.id)
        .await
        .expect("query")
        .expect("stored mesh");
    assert_eq!(loaded.property_id, "property_123");
}

#[tokio::test]
async fn completion_is_idempotent_and_conflicts_on_a_different_key() {
    let repository = SqliteRepository::connect("sqlite::memory:")
        .await
        .expect("repository");
    let session = repository
        .create_scan_session(NewScanSession {
            property_id: "property_1".to_string(),
            source: CaptureSource::Manual,
            ceiling_height_meters: 2.8,
        })
        .await
        .expect("session");
    let command = CompleteScan {
        session_id: session.id,
        idempotency_key: "key-1".to_string(),
        title: "Room".to_string(),
        dimensions: RoomDimensions::new(3.0, 3.0, 2.8).expect("dimensions"),
        source_asset_name: "room.glb".to_string(),
        preview_model_url: None,
    };

    let first = repository
        .complete_scan(command.clone())
        .await
        .expect("first completion");
    let second = repository
        .complete_scan(command.clone())
        .await
        .expect("idempotent completion");
    assert_eq!(first.id, second.id);

    let conflict = repository
        .complete_scan(CompleteScan {
            idempotency_key: "key-2".to_string(),
            ..command
        })
        .await
        .expect_err("conflict");
    assert!(matches!(conflict, RepositoryError::Conflict(_)));
}

#[tokio::test]
async fn tours_and_placements_are_replaced_in_order() {
    let repository = SqliteRepository::connect("sqlite::memory:")
        .await
        .expect("repository");
    let session = repository
        .create_scan_session(NewScanSession {
            property_id: "property_2".to_string(),
            source: CaptureSource::FloorPlan,
            ceiling_height_meters: 2.7,
        })
        .await
        .expect("session");
    let mesh = repository
        .complete_scan(CompleteScan {
            session_id: session.id,
            idempotency_key: "complete-2".to_string(),
            title: "Study".to_string(),
            dimensions: RoomDimensions::new(3.4, 2.9, 2.7).expect("dimensions"),
            source_asset_name: "study.glb".to_string(),
            preview_model_url: None,
        })
        .await
        .expect("mesh");

    repository
        .replace_tour(
            &mesh.id,
            vec![
                IndoorViewpoint::new("second", "Desk", 25.0, 2.0, 1.0, 1).expect("viewpoint"),
                IndoorViewpoint::new("first", "Door", 0.0, 0.5, 1.0, 0).expect("viewpoint"),
            ],
        )
        .await
        .expect("tour");
    let tour = repository.get_tour(&mesh.id).await.expect("tour query");
    assert_eq!(tour[0].id, "first");

    let project = repository
        .create_furnishing_project(NewFurnishingProject {
            mesh_id: mesh.id,
            style: "neutral".to_string(),
        })
        .await
        .expect("project");
    repository
        .replace_placements(
            &project.id,
            vec![
                FurniturePlacement::new("desk", 1.0, 1.0, 0.0, 0).expect("placement"),
                FurniturePlacement::new("chair", 1.0, 2.0, 180.0, 1).expect("placement"),
            ],
        )
        .await
        .expect("placements");
    let loaded = repository
        .get_furnishing_project(&project.id)
        .await
        .expect("query")
        .expect("stored project");
    assert_eq!(loaded.placements.len(), 2);
    assert_eq!(loaded.placements[0].furniture_type, "desk");
    repository.ready().await.expect("ready");
}
