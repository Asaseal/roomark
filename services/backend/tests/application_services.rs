use roomark_backend::{
    application::{
        Application, ApplicationError, CompleteScanInput, CreateFurnishingInput, CreateScanInput,
    },
    domain::{FurniturePlacement, IndoorViewpoint},
    repository::SqliteRepository,
};

async fn application() -> Application {
    let repository = SqliteRepository::connect("sqlite::memory:")
        .await
        .expect("repository");
    Application::new(repository)
}

#[tokio::test]
async fn application_validates_and_persists_the_complete_flow() {
    let application = application().await;
    let session = application
        .create_scan(CreateScanInput {
            property_id: "property_123".to_string(),
            source: "manual".to_string(),
            ceiling_height_meters: 2.8,
        })
        .await
        .expect("session");
    let mesh = application
        .complete_scan(
            &session.id,
            "key-1",
            CompleteScanInput {
                title: "Main room".to_string(),
                width_meters: 4.2,
                depth_meters: 3.1,
                height_meters: 2.8,
                source_asset_name: "main-room.glb".to_string(),
                preview_model_url: None,
            },
        )
        .await
        .expect("mesh");
    let repeated = application
        .complete_scan(
            &session.id,
            "key-1",
            CompleteScanInput {
                title: "Main room".to_string(),
                width_meters: 4.2,
                depth_meters: 3.1,
                height_meters: 2.8,
                source_asset_name: "main-room.glb".to_string(),
                preview_model_url: None,
            },
        )
        .await
        .expect("idempotent mesh");
    assert_eq!(mesh.id, repeated.id);

    application
        .replace_tour(
            &mesh.id,
            vec![IndoorViewpoint::new("entry", "Entry", 0.0, 0.0, 0.0, 0).expect("viewpoint")],
        )
        .await
        .expect("tour");
    let project = application
        .create_furnishing_project(
            &mesh.id,
            CreateFurnishingInput {
                style: "neutral".to_string(),
            },
        )
        .await
        .expect("project");
    application
        .replace_placements(
            &project.id,
            vec![FurniturePlacement::new("chair", 1.0, 1.0, 0.0, 0).expect("placement")],
        )
        .await
        .expect("placements");

    assert_eq!(
        application
            .get_furnishing_project(&project.id)
            .await
            .expect("project")
            .placements
            .len(),
        1
    );
}

#[tokio::test]
async fn application_returns_stable_error_categories() {
    let application = application().await;
    let invalid = application
        .create_scan(CreateScanInput {
            property_id: String::new(),
            source: "manual".to_string(),
            ceiling_height_meters: 2.8,
        })
        .await
        .expect_err("invalid input");
    assert!(matches!(invalid, ApplicationError::InvalidInput(_)));

    let missing = application
        .get_scan("scan_missing")
        .await
        .expect_err("missing entity");
    assert!(matches!(missing, ApplicationError::NotFound(_)));
}
