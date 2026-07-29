use tonic::{Request, Response, Status};

use crate::{
    application::{
        Application, ApplicationError, CompleteScanInput, CreateFurnishingInput, CreateScanInput,
    },
    domain::{FurniturePlacement, IndoorViewpoint},
    grpc::proto::{
        self, roomark_service_server::RoomarkService, CompleteRoomPlanScanRequest,
        CompleteRoomPlanScanResponse, CreateScanSessionRequest, CreateScanSessionResponse,
        GetFurnishingProjectRequest, GetFurnishingProjectResponse, GetIndoorTourRequest,
        GetIndoorTourResponse, ListRoomMeshesRequest, ListRoomMeshesResponse,
        ReplaceFurniturePlacementsRequest, ReplaceIndoorTourRequest,
        StartFurnishingSimulationRequest, StartFurnishingSimulationResponse,
    },
};

#[derive(Clone, Debug)]
pub struct RoomarkGrpcService {
    application: Application,
}

impl RoomarkGrpcService {
    pub fn new(application: Application) -> Self {
        Self { application }
    }
}

#[tonic::async_trait]
impl RoomarkService for RoomarkGrpcService {
    async fn create_scan_session(
        &self,
        request: Request<CreateScanSessionRequest>,
    ) -> Result<Response<CreateScanSessionResponse>, Status> {
        let input = request.into_inner();
        let source = if input.source.trim().is_empty() {
            "manual".to_string()
        } else {
            input.source
        };
        let session = self
            .application
            .create_scan(CreateScanInput {
                property_id: input.property_id,
                source,
                ceiling_height_meters: input.ceiling_height_meters,
            })
            .await
            .map_err(map_error)?;
        Ok(Response::new(CreateScanSessionResponse {
            scan_session_id: session.id,
            capture_engine: session.source.as_str().to_string(),
            upload_hint: "submit dimensions and asset metadata when capture is complete"
                .to_string(),
            status: session.status.as_str().to_string(),
            created_at: session.created_at.to_rfc3339(),
        }))
    }

    async fn complete_room_plan_scan(
        &self,
        request: Request<CompleteRoomPlanScanRequest>,
    ) -> Result<Response<CompleteRoomPlanScanResponse>, Status> {
        let input = request.into_inner();
        if input.idempotency_key.trim().is_empty() {
            return Err(Status::invalid_argument("idempotency_key is required"));
        }
        let title = if input.title.trim().is_empty() {
            input.source_asset_name.clone()
        } else {
            input.title
        };
        let mesh = self
            .application
            .complete_scan(
                &input.scan_session_id,
                &input.idempotency_key,
                CompleteScanInput {
                    title,
                    width_meters: input.width_meters,
                    depth_meters: input.depth_meters,
                    height_meters: input.height_meters,
                    source_asset_name: input.source_asset_name,
                    preview_model_url: non_empty(input.preview_model_url),
                },
            )
            .await
            .map_err(map_error)?;
        Ok(Response::new(CompleteRoomPlanScanResponse {
            mesh: Some(mesh_to_proto(mesh)),
        }))
    }

    async fn list_room_meshes(
        &self,
        request: Request<ListRoomMeshesRequest>,
    ) -> Result<Response<ListRoomMeshesResponse>, Status> {
        let meshes = self
            .application
            .list_room_meshes(&request.into_inner().property_id)
            .await
            .map_err(map_error)?
            .into_iter()
            .map(mesh_to_proto)
            .collect();
        Ok(Response::new(ListRoomMeshesResponse { meshes }))
    }

    async fn get_indoor_tour(
        &self,
        request: Request<GetIndoorTourRequest>,
    ) -> Result<Response<GetIndoorTourResponse>, Status> {
        let mesh_id = request.into_inner().mesh_id;
        let viewpoints = self
            .application
            .get_tour(&mesh_id)
            .await
            .map_err(map_error)?
            .into_iter()
            .map(viewpoint_to_proto)
            .collect();
        Ok(Response::new(GetIndoorTourResponse {
            tour_id: format!("tour_{mesh_id}"),
            mesh_id,
            viewpoints,
        }))
    }

    async fn replace_indoor_tour(
        &self,
        request: Request<ReplaceIndoorTourRequest>,
    ) -> Result<Response<GetIndoorTourResponse>, Status> {
        let input = request.into_inner();
        let viewpoints = input
            .viewpoints
            .into_iter()
            .enumerate()
            .map(|(position, viewpoint)| {
                IndoorViewpoint::new(
                    &viewpoint.id,
                    &viewpoint.label,
                    viewpoint.yaw_degrees,
                    viewpoint.x_meters,
                    viewpoint.y_meters,
                    position as i32,
                )
            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| Status::invalid_argument(error.to_string()))?;
        let viewpoints = self
            .application
            .replace_tour(&input.mesh_id, viewpoints)
            .await
            .map_err(map_error)?
            .into_iter()
            .map(viewpoint_to_proto)
            .collect();
        Ok(Response::new(GetIndoorTourResponse {
            tour_id: format!("tour_{}", input.mesh_id),
            mesh_id: input.mesh_id,
            viewpoints,
        }))
    }

    async fn start_furnishing_simulation(
        &self,
        request: Request<StartFurnishingSimulationRequest>,
    ) -> Result<Response<StartFurnishingSimulationResponse>, Status> {
        let input = request.into_inner();
        let style = if input.style.trim().is_empty() {
            "neutral".to_string()
        } else {
            input.style
        };
        let mut project = self
            .application
            .create_furnishing_project(&input.mesh_id, CreateFurnishingInput { style })
            .await
            .map_err(map_error)?;
        if !input.placements.is_empty() {
            let placements = input
                .placements
                .into_iter()
                .enumerate()
                .map(|(position, placement)| {
                    FurniturePlacement::new(
                        &placement.furniture_type,
                        placement.x_meters,
                        placement.y_meters,
                        placement.rotation_degrees,
                        position as i32,
                    )
                })
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| Status::invalid_argument(error.to_string()))?;
            project.placements = self
                .application
                .replace_placements(&project.id, placements)
                .await
                .map_err(map_error)?;
        }
        Ok(Response::new(StartFurnishingSimulationResponse {
            simulation_id: project.id.clone(),
            status: project.status.clone(),
            suggestions: Vec::new(),
            project: Some(project_to_proto(project)),
        }))
    }

    async fn get_furnishing_project(
        &self,
        request: Request<GetFurnishingProjectRequest>,
    ) -> Result<Response<GetFurnishingProjectResponse>, Status> {
        let project = self
            .application
            .get_furnishing_project(&request.into_inner().project_id)
            .await
            .map_err(map_error)?;
        Ok(Response::new(GetFurnishingProjectResponse {
            project: Some(project_to_proto(project)),
        }))
    }

    async fn replace_furniture_placements(
        &self,
        request: Request<ReplaceFurniturePlacementsRequest>,
    ) -> Result<Response<GetFurnishingProjectResponse>, Status> {
        let input = request.into_inner();
        let placements = input
            .placements
            .into_iter()
            .enumerate()
            .map(|(position, placement)| {
                FurniturePlacement::new(
                    &placement.furniture_type,
                    placement.x_meters,
                    placement.y_meters,
                    placement.rotation_degrees,
                    position as i32,
                )
            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| Status::invalid_argument(error.to_string()))?;
        self.application
            .replace_placements(&input.project_id, placements)
            .await
            .map_err(map_error)?;
        let project = self
            .application
            .get_furnishing_project(&input.project_id)
            .await
            .map_err(map_error)?;
        Ok(Response::new(GetFurnishingProjectResponse {
            project: Some(project_to_proto(project)),
        }))
    }
}

fn map_error(error: ApplicationError) -> Status {
    match error {
        ApplicationError::InvalidInput(message) => Status::invalid_argument(message),
        ApplicationError::NotFound(entity) => Status::not_found(entity),
        ApplicationError::Conflict(message) => Status::already_exists(message),
        ApplicationError::Unavailable => Status::unavailable("service unavailable"),
    }
}

fn mesh_to_proto(mesh: crate::domain::RoomMesh) -> proto::RoomMesh {
    proto::RoomMesh {
        id: mesh.id,
        property_id: mesh.property_id,
        title: mesh.title,
        width_meters: mesh.dimensions.width_meters(),
        depth_meters: mesh.dimensions.depth_meters(),
        height_meters: mesh.dimensions.height_meters(),
        source_asset_name: mesh.source_asset_name,
        preview_model_url: mesh.preview_model_url.unwrap_or_default(),
        capture_engine: mesh.capture_engine,
        scan_session_id: mesh.scan_session_id,
        created_at: mesh.created_at.to_rfc3339(),
    }
}

fn viewpoint_to_proto(viewpoint: IndoorViewpoint) -> proto::IndoorViewpoint {
    proto::IndoorViewpoint {
        id: viewpoint.id,
        label: viewpoint.label,
        yaw_degrees: viewpoint.yaw_degrees,
        x_meters: viewpoint.x_meters,
        y_meters: viewpoint.y_meters,
    }
}

fn placement_to_proto(placement: FurniturePlacement) -> proto::FurniturePlacement {
    proto::FurniturePlacement {
        furniture_type: placement.furniture_type,
        placement: String::new(),
        x_meters: placement.x_meters,
        y_meters: placement.y_meters,
        id: placement.id,
        rotation_degrees: placement.rotation_degrees,
        position: placement.position,
    }
}

fn project_to_proto(project: crate::domain::FurnishingProject) -> proto::FurnishingProject {
    proto::FurnishingProject {
        id: project.id,
        mesh_id: project.mesh_id,
        style: project.style,
        status: project.status,
        placements: project
            .placements
            .into_iter()
            .map(placement_to_proto)
            .collect(),
        created_at: project.created_at.to_rfc3339(),
        updated_at: project.updated_at.to_rfc3339(),
    }
}

fn non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}
