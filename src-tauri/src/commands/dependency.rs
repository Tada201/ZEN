use serde::Serialize;
use std::path::PathBuf;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub id: String,
    pub name: String,
    pub feature: String,
    pub required: bool,
    pub installed: bool,
    pub status: String,
    pub detected_path: Option<String>,
    pub version: Option<String>,
    pub install_command: Option<String>,
    pub download_url: Option<String>,
    pub notes: String,
}

#[tauri::command]
pub async fn list_dependency_status() -> Vec<DependencyStatus> {
    let mut items = Vec::new();

    let mut python = check_command("python", &["--version"]).await;
    if python.is_none() {
        python = check_command("py", &["--version"]).await;
    }

    items.push(DependencyStatus {
        id: "python".into(),
        name: "Python".into(),
        feature: "MarkItDown document conversion".into(),
        required: false,
        installed: python.is_some(),
        status: status_label(python.is_some()),
        detected_path: None,
        version: python,
        install_command: None,
        download_url: Some("https://www.python.org/downloads/".into()),
        notes: "Required only if you want Office/PPT/XLS fallback extraction through MarkItDown."
            .into(),
    });

    let markitdown_bin =
        std::env::var("ZEN_MARKITDOWN_BIN").unwrap_or_else(|_| "markitdown".into());
    let mut markitdown = check_command(&markitdown_bin, &["--version"]).await;
    if markitdown.is_none() {
        markitdown = check_command(&markitdown_bin, &["--help"]).await;
    }

    items.push(DependencyStatus {
        id: "markitdown".into(),
        name: "MarkItDown".into(),
        feature: "DOCX, PPTX, XLSX, EPUB and fallback PDF extraction".into(),
        required: false,
        installed: markitdown.is_some(),
        status: status_label(markitdown.is_some()),
        detected_path: Some(markitdown_bin),
        version: markitdown,
        install_command: Some("pip install 'markitdown[all]'".into()),
        download_url: Some("https://github.com/microsoft/markitdown".into()),
        notes: "Used by RAG ingestion when native text/PDF extraction is not enough.".into(),
    });

    let tesseract_bin = std::env::var("ZEN_TESSERACT_BIN").unwrap_or_else(|_| "tesseract".into());
    let tesseract = check_command(&tesseract_bin, &["--version"]).await;
    items.push(DependencyStatus {
        id: "tesseract".into(),
        name: "Tesseract OCR".into(),
        feature: "Image OCR and scanned-document text extraction".into(),
        required: false,
        installed: tesseract.is_some(),
        status: status_label(tesseract.is_some()),
        detected_path: Some(tesseract_bin),
        version: tesseract,
        install_command: None,
        download_url: Some("https://github.com/tesseract-ocr/tesseract".into()),
        notes: "Used by RAG ingestion for PNG/JPG/WEBP/TIFF/BMP files.".into(),
    });

    let whisper_path = first_existing_path(&[
        "src-tauri/resources/binaries/whisper/whisper-server.exe",
        "src-tauri/resources/binaries/whisper/whisper-cublas/whisper-server.exe",
        "src-tauri/resources/binaries/whisper/whisper-vulkan/whisper-server.exe",
        "resources/binaries/whisper/whisper-server.exe",
    ]);
    let whisper_installed =
        whisper_path.is_some() || check_command("whisper-server", &["--help"]).await.is_some();
    items.push(DependencyStatus {
        id: "whisper".into(),
        name: "Whisper Runtime".into(),
        feature: "Local voice speech-to-text".into(),
        required: false,
        installed: whisper_installed,
        status: status_label(whisper_installed),
        detected_path: whisper_path.map(path_to_string),
        version: None,
        install_command: None,
        download_url: Some("https://github.com/ggerganov/whisper.cpp".into()),
        notes:
            "Only needed when Voice STT is set to Whisper. Web Speech and Moonshine do not need it."
                .into(),
    });

    let piper_path = first_existing_path(&[
        "src-tauri/resources/binaries/piper/piper.exe",
        "resources/binaries/piper/piper.exe",
    ]);
    let piper_model = first_existing_path(&[
        "src-tauri/resources/models/glados_piper_medium.onnx",
        "resources/models/glados_piper_medium.onnx",
    ]);
    items.push(DependencyStatus {
        id: "piper".into(),
        name: "Piper TTS".into(),
        feature: "Local text-to-speech".into(),
        required: false,
        installed: piper_path.is_some() && piper_model.is_some(),
        status: status_label(piper_path.is_some() && piper_model.is_some()),
        detected_path: piper_path.map(path_to_string),
        version: None,
        install_command: None,
        download_url: Some("https://github.com/rhasspy/piper".into()),
        notes: "Only needed when Voice TTS is set to Piper. Web Speech does not need it.".into(),
    });

    items.push(
        local_service_status(
            "ollama",
            "Ollama",
            "Local models and default embeddings",
            "http://localhost:11434/api/tags",
            "https://ollama.com/download",
        )
        .await,
    );

    items.push(
        local_service_status(
            "lmstudio",
            "LM Studio",
            "Local OpenAI-compatible model server",
            "http://127.0.0.1:1234/v1/models",
            "https://lmstudio.ai/",
        )
        .await,
    );

    items
}

async fn check_command(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let value = if stdout.is_empty() { stderr } else { stdout };
    Some(value.lines().next().unwrap_or_default().to_string())
}

async fn local_service_status(
    id: &str,
    name: &str,
    feature: &str,
    url: &str,
    download_url: &str,
) -> DependencyStatus {
    let installed = reqwest::Client::new()
        .get(url)
        .timeout(std::time::Duration::from_millis(700))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false);

    DependencyStatus {
        id: id.into(),
        name: name.into(),
        feature: feature.into(),
        required: false,
        installed,
        status: if installed { "running" } else { "not running" }.into(),
        detected_path: Some(url.into()),
        version: None,
        install_command: None,
        download_url: Some(download_url.into()),
        notes:
            "Optional local service. The app can work without it if another provider is selected."
                .into(),
    }
}

fn status_label(installed: bool) -> String {
    if installed {
        "installed".into()
    } else {
        "missing".into()
    }
}

fn first_existing_path(paths: &[&str]) -> Option<PathBuf> {
    paths.iter().map(PathBuf::from).find(|path| path.exists())
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}
