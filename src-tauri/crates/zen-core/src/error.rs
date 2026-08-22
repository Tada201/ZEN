use serde::Serialize;

pub type ZenResult<T> = Result<T, ZenError>;

/// HTTP failure signals carried across the core boundary without a
/// `reqwest` dependency. The app's `http_err` helper extracts these from
/// `reqwest::Error`; consumers (e.g. the subagent retry classifier) read the
/// signals instead of downcasting the transport error.
#[derive(Debug, Clone)]
pub struct HttpError {
    pub message: String,
    pub status: Option<u16>,
    pub timeout: bool,
    pub connect: bool,
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

/// Backend-wide error contract. DB- and HTTP-agnostic by design
/// (BIG_MIGRATION.md Phase 2 pre-task, review finding #2): the `Database`
/// and `Http` variants carry rendered messages, not `sqlx::Error` /
/// `reqwest::Error` sources, so this crate stays free of those dependencies.
/// Adapters convert at the boundary (app `src/error.rs` `db_err`/`http_err`)
/// until zen-db (Phase 3) owns its own `#[from] sqlx` error type.
#[derive(Debug, thiserror::Error)]
pub enum ZenError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Database initialization error: {0}")]
    DatabaseError(String),

    #[error("HTTP error: {0}")]
    Http(HttpError),

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

    #[error("{0}")]
    Other(String),

    #[error("{0}")]
    Custom(String),

    #[error("Deadline exceeded: {0}")]
    Timeout(String),

    #[error("Cache miss: {0}")]
    CacheMiss(String),
}

impl From<String> for ZenError {
    fn from(s: String) -> Self {
        ZenError::Custom(s)
    }
}

// Tauri requires command errors to be serializable; the IPC payload is the
// rendered message only, so `String` carrying keeps the wire format identical
// to the pre-split `#[from] sqlx::Error` / `#[from] reqwest::Error` shapes.
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
