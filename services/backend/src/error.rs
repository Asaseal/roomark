use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DomainError {
    #[error("{field} must contain between {min} and {max} characters")]
    InvalidText {
        field: &'static str,
        min: usize,
        max: usize,
    },
    #[error("{field} must be finite and between {min} and {max}")]
    InvalidNumber {
        field: &'static str,
        min: i32,
        max: i32,
    },
    #[error("unsupported capture source")]
    UnsupportedCaptureSource,
}
