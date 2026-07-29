pub mod service;

pub mod proto {
    tonic::include_proto!("roomark.v1");
}

pub use service::RoomarkGrpcService;
