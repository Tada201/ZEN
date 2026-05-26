use serde_json::{json, Value};
/// MCP stdio Transport Layer
///
/// Implements JSON-RPC 2.0 over standard input/output streams.
/// This is the primary transport for MCP CLI integration (e.g., Claude Desktop).
///
/// ## Protocol
/// - Each message is a single line of JSON followed by a newline
/// - Requests are read from stdin
/// - Responses are written to stdout
/// - Logs/errors are written to stderr
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tracing::{debug, error, info, warn};

use crate::mcp::server::McpServer;
use crate::mcp::types::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};

/// Run the MCP stdio server loop
pub async fn run_stdio_server(
    server: std::sync::Arc<tokio::sync::RwLock<McpServer>>,
) -> Result<(), std::io::Error> {
    info!("Starting MCP stdio server...");

    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut reader = BufReader::new(stdin);

    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => {
                // EOF
                info!("MCP stdio server: EOF received");
                break;
            }
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                debug!("Received stdio message: {}", trimmed);

                // Parse JSON-RPC request
                match serde_json::from_str::<JsonRpcRequest>(trimmed) {
                    Ok(request) => {
                        // Handle the request (fully async)
                        let response = {
                            let server_guard = server.read().await;
                            server_guard.handle_request(request).await
                        };

                        // Write response
                        let response_json = serde_json::to_string(&response)
                            .unwrap_or_else(|e| {
                                error!("Failed to serialize response: {}", e);
                                r#"{"jsonrpc":"2.0","error":{"code":-32603,"message":"Internal error"},"id":null}"#.to_string()
                            });

                        if let Err(e) = stdout
                            .write_all(format!("{}\n", response_json).as_bytes())
                            .await
                        {
                            error!("Failed to write response: {}", e);
                            break;
                        }
                        if let Err(e) = stdout.flush().await {
                            error!("Failed to flush stdout: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse JSON-RPC request: {}", e);

                        let error_response = JsonRpcResponse::failure(
                            JsonRpcError::parse_error(format!("Invalid JSON: {}", e)),
                            None,
                        );

                        let error_json = serde_json::to_string(&error_response).unwrap_or_else(|_| {
                            r#"{"jsonrpc":"2.0","error":{"code":-32603,"message":"Internal error"},"id":null}"#.to_string()
                        });

                        if let Err(e) = stdout
                            .write_all(format!("{}\n", error_json).as_bytes())
                            .await
                        {
                            error!("Failed to write error response: {}", e);
                            break;
                        }
                        if let Err(e) = stdout.flush().await {
                            error!("Failed to flush stdout: {}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                error!("Error reading from stdin: {}", e);
                break;
            }
        }
    }

    info!("MCP stdio server stopped");
    Ok(())
}

/// Send a notification to the client (server-initiated message)
pub async fn send_notification(
    notification: &str,
    params: Option<Value>,
) -> Result<(), std::io::Error> {
    let mut stdout = tokio::io::stdout();

    let message = json!({
        "jsonrpc": "2.0",
        "method": notification,
        "params": params,
    });

    let json = serde_json::to_string(&message)?;
    stdout.write_all(format!("{}\n", json).as_bytes()).await?;
    stdout.flush().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_request() {
        let json = r#"{"jsonrpc":"2.0","method":"ping","id":1}"#;
        let request: Result<JsonRpcRequest, _> = serde_json::from_str(json);
        assert!(request.is_ok());
        let req = request.unwrap();
        assert_eq!(req.method, "ping");
        assert_eq!(req.id, Some(json!(1)));
    }

    #[test]
    fn test_parse_invalid_json() {
        let json = r#"{"jsonrpc":"2.0","method":"ping""#; // Missing closing brace
        let request: Result<JsonRpcRequest, _> = serde_json::from_str(json);
        assert!(request.is_err());
    }

    #[test]
    fn test_parse_notification() {
        let json = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
        let request: Result<JsonRpcRequest, _> = serde_json::from_str(json);
        assert!(request.is_ok());
        let req = request.unwrap();
        assert_eq!(req.method, "notifications/initialized");
        assert_eq!(req.id, None);
    }
}
