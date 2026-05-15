use serde::Serialize;

pub type ZenResult<T> = Result<T, ZenError>;

#[derive(Debug, thiserror::Error)]
pub enum ZenError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Database initialization error: {0}")]
    DatabaseError(String),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Ollama not connected")]
    OllamaNotConnected,

    #[error("No model selected")]
    NoModelSelected,

    #[error("Context too large: {0} tokens exceeds limit of {1}")]
    ContextTooLarge(usize, usize),

    #[error("Generation aborted by user")]
    Aborted,

    #[error("System is initializing, please wait...")]
    Initializing,

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Swarm error: {0}")]
    Swarm(String),

    #[error(transparent)]
    Other(#[from] anyhow::Error),

    #[error("{0}")]
    Custom(String),
}

impl From<crate::agent::swarm::SwarmError> for ZenError {
    fn from(e: crate::agent::swarm::SwarmError) -> Self {
        ZenError::Swarm(e.to_string())
    }
}

impl From<String> for ZenError {
    fn from(s: String) -> Self {
        ZenError::Custom(s)
    }
}

// Tauri requires command errors to be serializable
impl Serialize for ZenError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// Also keep AppError for backward compatibility if needed, or just alias it
pub type AppError = ZenError;
pub type AppResult<T> = ZenResult<T>;
