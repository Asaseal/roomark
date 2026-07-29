use roomark_backend::config::Config;

#[test]
fn defaults_bind_locally_and_use_persistent_storage() {
    let config =
        Config::from_pairs(std::iter::empty::<(String, String)>()).expect("default configuration");

    assert_eq!(config.http_addr.to_string(), "127.0.0.1:8080");
    assert_eq!(
        config.grpc_addr.expect("gRPC enabled").to_string(),
        "127.0.0.1:50051"
    );
    assert!(config.database_url.contains("roomark.db"));
    assert!(config.api_key.is_none());
}

#[test]
fn environment_values_are_validated() {
    let config = Config::from_pairs([
        ("ROOMARK_HTTP_ADDR".to_string(), "0.0.0.0:9000".to_string()),
        ("ROOMARK_GRPC_ADDR".to_string(), "disabled".to_string()),
        (
            "ROOMARK_DATABASE_URL".to_string(),
            "sqlite://data/test.db".to_string(),
        ),
        (
            "ROOMARK_CORS_ORIGINS".to_string(),
            "https://roomark.example,https://app.roomark.example".to_string(),
        ),
        (
            "ROOMARK_API_KEY".to_string(),
            "long-enough-api-key".to_string(),
        ),
    ])
    .expect("custom configuration");

    assert_eq!(config.http_addr.to_string(), "0.0.0.0:9000");
    assert!(config.grpc_addr.is_none());
    assert_eq!(config.cors_origins.len(), 2);
    assert_eq!(config.api_key.as_deref(), Some("long-enough-api-key"));

    assert!(Config::from_pairs([("ROOMARK_API_KEY".to_string(), "short".to_string(),)]).is_err());
}
