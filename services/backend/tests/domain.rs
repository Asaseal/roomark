use roomark_backend::domain::{
    CaptureSource, FurniturePlacement, IndoorViewpoint, RoomDimensions, ValidatedText,
};

#[test]
fn dimensions_reject_invalid_values() {
    assert!(RoomDimensions::new(0.0, 3.0, 2.8).is_err());
    assert!(RoomDimensions::new(f32::NAN, 3.0, 2.8).is_err());
    assert!(RoomDimensions::new(101.0, 3.0, 2.8).is_err());
}

#[test]
fn dimensions_accept_a_realistic_room() {
    let dimensions = RoomDimensions::new(4.2, 3.1, 2.8).expect("valid dimensions");
    assert_eq!(dimensions.width_meters(), 4.2);
}

#[test]
fn identifiers_and_capture_sources_are_bounded() {
    assert!(ValidatedText::identifier("").is_err());
    assert!(ValidatedText::identifier(&"a".repeat(129)).is_err());
    assert_eq!(
        CaptureSource::parse("manual").expect("known source"),
        CaptureSource::Manual
    );
    assert!(CaptureSource::parse("unknown").is_err());
}

#[test]
fn viewpoint_and_placement_coordinates_are_validated() {
    assert!(IndoorViewpoint::new("view_1", "Window", 181.0, 1.0, 1.0, 0).is_err());
    assert!(FurniturePlacement::new("chair", f32::INFINITY, 1.0, 0.0, 0).is_err());
    assert!(FurniturePlacement::new("chair", 1.0, 1.0, 45.0, 0).is_ok());
}
