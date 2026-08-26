use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use tokio::process::Command;

const RUNTIME_MANIFEST: &str = include_str!("../../../scripts/runtime-binaries.json");
const MAX_RUNTIME_ARCHIVE_BYTES: u64 = 1_500_000_000;

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
    pub managed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyInstallResult {
    pub id: String,
    pub installed: bool,
    pub message: String,
    pub installed_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RuntimeManifest {
    platforms: std::collections::HashMap<String, RuntimePlatform>,
}

#[derive(Debug, Deserialize)]
struct RuntimePlatform {
    archives: Vec<RuntimeArchive>,
}

#[derive(Debug, Clone, Deserialize)]
struct RuntimeArchive {
    id: String,
    url: String,
    sha256: String,
    files: Vec<RuntimeFile>,
}

#[derive(Debug, Clone, Deserialize)]
struct RuntimeFile {
    from: String,
}

#[tauri::command]
pub async fn list_dependency_status(app: AppHandle) -> Vec<DependencyStatus> {
    let mut items = Vec::new();
    let app_data_dir = app.path().app_data_dir().ok();

    let mut python = check_command("python", &["--version"]).await;
    if python.is_none() {
        python = check_command("py", &["--version"]).await;
    }
    items.push(external_dependency(
        "python",
        "Python",
        "MarkItDown document conversion",
        python,
        None,
        Some("https://www.python.org/downloads/"),
        "Required only for Office/PPT/XLS fallback extraction through MarkItDown.",
    ));

    let markitdown_bin =
        std::env::var("ZEN_MARKITDOWN_BIN").unwrap_or_else(|_| "markitdown".into());
    let mut markitdown = check_command(&markitdown_bin, &["--version"]).await;
    if markitdown.is_none() {
        markitdown = check_command(&markitdown_bin, &["--help"]).await;
    }
    items.push(external_dependency(
        "markitdown",
        "MarkItDown",
        "DOCX, PPTX, XLSX, EPUB and fallback PDF extraction",
        markitdown,
        Some("pip install 'markitdown[all]'"),
        Some("https://github.com/microsoft/markitdown"),
        "Used by RAG ingestion when native text/PDF extraction is not enough.",
    ));

    let tesseract_bin = std::env::var("ZEN_TESSERACT_BIN").unwrap_or_else(|_| "tesseract".into());
    items.push(external_dependency(
        "tesseract",
        "Tesseract OCR",
        "Image OCR and scanned-document text extraction",
        check_command(&tesseract_bin, &["--version"]).await,
        None,
        Some("https://github.com/tesseract-ocr/tesseract"),
        "Used by RAG ingestion for PNG/JPG/WEBP/TIFF/BMP files.",
    ));

    let whisper_binary = app_data_dir
        .as_ref()
        .map(|root| root.join("runtimes/whisper/whisper-server.exe"));
    let whisper_model = app_data_dir
        .as_ref()
        .map(|root| root.join("models/ggml-base.en.bin"));
    let whisper_installed = whisper_binary.as_ref().is_some_and(|path| path.is_file())
        && whisper_model.as_ref().is_some_and(|path| path.is_file());
    items.push(managed_dependency(
        "whisper",
        "Whisper Runtime",
        "Local voice speech-to-text",
        whisper_installed,
        whisper_binary,
        "Downloads the CPU runtime and English base model only when Whisper STT is selected.",
    ));

    let piper_binary = app_data_dir
        .as_ref()
        .map(|root| root.join("runtimes/piper/piper.exe"));
    let piper_model = app_data_dir
        .as_ref()
        .map(|root| root.join("voices/glados_piper_medium.onnx"));
    let piper_installed = piper_binary.as_ref().is_some_and(|path| path.is_file())
        && piper_model.as_ref().is_some_and(|path| path.is_file());
    items.push(managed_dependency(
        "piper",
        "Piper TTS",
        "Local text-to-speech",
        piper_installed,
        piper_binary,
        "Downloads the Piper runtime and default GLaDOS voice only when Piper TTS is selected.",
    ));

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

    items.push(
        external_dependency(
            "ffmpeg",
            "FFmpeg",
            "Background video re-encoding",
            check_command("ffmpeg", &["-version"]).await,
            None,
            Some("https://ffmpeg.org/download.html"),
            "Required to optimize background videos for GPU efficiency.",
        ),
    );

    items
}

#[tauri::command]
pub async fn install_managed_dependency(
    app: AppHandle,
    id: String,
) -> Result<DependencyInstallResult, String> {
    let archive_ids =
        managed_archive_ids(&id).ok_or_else(|| format!("'{id}' is not a Zen-managed runtime"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve application data directory: {error}"))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Could not create application data directory: {error}"))?;

    let manifest: RuntimeManifest = serde_json::from_str(RUNTIME_MANIFEST)
        .map_err(|error| format!("Runtime manifest is invalid: {error}"))?;
    let platform = manifest
        .platforms
        .get("windows-x64")
        .ok_or_else(|| "Runtime manifest has no Windows x64 packages".to_string())?;

    let mut installed_paths = Vec::new();
    for archive_id in archive_ids {
        let archive = platform
            .archives
            .iter()
            .find(|candidate| candidate.id.as_str() == *archive_id)
            .cloned()
            .ok_or_else(|| format!("Runtime manifest is missing package '{archive_id}'"))?;
        let bytes = download_verified_archive(&archive).await?;
        let root = app_data_dir.clone();
        let paths = tokio::task::spawn_blocking(move || install_archive(&root, &archive, &bytes))
            .await
            .map_err(|error| format!("Runtime installation task failed: {error}"))??;
        installed_paths.extend(paths);
    }

    Ok(DependencyInstallResult {
        id,
        installed: true,
        message: "Runtime installed and verified in application data.".to_string(),
        installed_paths,
    })
}

fn managed_archive_ids(id: &str) -> Option<&'static [&'static str]> {
    match id {
        "whisper" => Some(&["whisper", "whisper-model-base-en"]),
        "piper" => Some(&[
            "piper",
            "piper-model-glados-medium",
            "piper-model-glados-medium-config",
        ]),
        _ => None,
    }
}

async fn download_verified_archive(archive: &RuntimeArchive) -> Result<Vec<u8>, String> {
    let response = zen_media::http::model_download_http_client()
        .get(&archive.url)
        .send()
        .await
        .map_err(|error| format!("Failed to download {}: {error}", archive.id))?;
    if !response.status().is_success() {
        return Err(format!(
            "{} download returned HTTP {}",
            archive.id,
            response.status()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RUNTIME_ARCHIVE_BYTES)
    {
        return Err(format!(
            "{} exceeds the maximum permitted download size",
            archive.id
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read {} download: {error}", archive.id))?
        .to_vec();
    if bytes.len() as u64 > MAX_RUNTIME_ARCHIVE_BYTES {
        return Err(format!(
            "{} exceeds the maximum permitted download size",
            archive.id
        ));
    }

    let actual_hash = format!("{:X}", Sha256::digest(&bytes));
    if actual_hash != archive.sha256.to_ascii_uppercase() {
        return Err(format!("{} failed SHA-256 verification", archive.id));
    }
    Ok(bytes)
}

fn install_archive(
    root: &Path,
    archive: &RuntimeArchive,
    bytes: &[u8],
) -> Result<Vec<String>, String> {
    let mut paths = Vec::new();
    if archive.url.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|error| format!("{} is not a valid ZIP archive: {error}", archive.id))?;
        for spec in &archive.files {
            let prefix = format!("{}/", spec.from.trim_end_matches('/'));
            let mut matched = false;
            for index in 0..zip.len() {
                let mut entry = zip.by_index(index).map_err(|error| {
                    format!("Could not read {} archive entry: {error}", archive.id)
                })?;
                let name = entry.name().replace('\\', "/");
                if name != spec.from && !name.starts_with(&prefix) {
                    continue;
                }
                matched = true;
                if entry.is_dir() {
                    continue;
                }
                let relative = name.strip_prefix(&prefix).unwrap_or("");
                let destination = destination_for(root, &archive.id, &spec.from, relative)?;
                if let Some(parent) = destination.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|error| format!("Could not create runtime directory: {error}"))?;
                }
                let mut content = Vec::new();
                entry
                    .read_to_end(&mut content)
                    .map_err(|error| format!("Could not extract {name}: {error}"))?;
                atomic_write(&destination, &content)?;
                paths.push(destination.to_string_lossy().to_string());
            }
            if !matched {
                return Err(format!(
                    "{} is missing expected file '{}'",
                    archive.id, spec.from
                ));
            }
        }
    } else {
        let spec = archive
            .files
            .first()
            .ok_or_else(|| format!("{} has no files in its manifest", archive.id))?;
        let destination = destination_for(root, &archive.id, &spec.from, "")?;
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create runtime directory: {error}"))?;
        }
        atomic_write(&destination, bytes)?;
        paths.push(destination.to_string_lossy().to_string());
    }
    Ok(paths)
}

fn destination_for(
    root: &Path,
    archive_id: &str,
    source: &str,
    nested: &str,
) -> Result<PathBuf, String> {
    let base = match archive_id {
        "piper" => root.join("runtimes").join("piper"),
        "whisper" => root.join("runtimes").join("whisper"),
        "whisper-model-base-en" => root.join("models"),
        "piper-model-glados-medium" | "piper-model-glados-medium-config" => root.join("voices"),
        _ => return Err(format!("Unsupported managed runtime '{archive_id}'")),
    };
    let relative = if nested.is_empty() {
        PathBuf::from(source.rsplit('/').next().unwrap_or(source))
    } else {
        // Directory specs such as `piper/espeak-ng-data` must retain their
        // top-level directory. Piper resolves this directory at runtime.
        PathBuf::from(source.rsplit('/').next().unwrap_or(source)).join(nested)
    };
    let safe_relative = relative.as_path();
    if safe_relative
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(format!("Unsafe runtime archive path '{}'", relative.display()));
    }
    Ok(base.join(safe_relative))
}

fn atomic_write(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = destination.with_extension("part");
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write runtime file: {error}"))?;
    if destination.exists() {
        std::fs::remove_file(destination)
            .map_err(|error| format!("Could not replace existing runtime file: {error}"))?;
    }
    std::fs::rename(&temporary, destination).map_err(|error| {
        let _ = std::fs::remove_file(&temporary);
        format!("Could not finalize runtime file: {error}")
    })
}

fn external_dependency(
    id: &str,
    name: &str,
    feature: &str,
    version: Option<String>,
    install_command: Option<&str>,
    download_url: Option<&str>,
    notes: &str,
) -> DependencyStatus {
    let installed = version.is_some();
    DependencyStatus {
        id: id.into(),
        name: name.into(),
        feature: feature.into(),
        required: false,
        installed,
        status: status_label(installed),
        detected_path: None,
        version,
        install_command: install_command.map(str::to_owned),
        download_url: download_url.map(str::to_owned),
        notes: notes.into(),
        managed: false,
    }
}

fn managed_dependency(
    id: &str,
    name: &str,
    feature: &str,
    installed: bool,
    path: Option<PathBuf>,
    notes: &str,
) -> DependencyStatus {
    DependencyStatus {
        id: id.into(),
        name: name.into(),
        feature: feature.into(),
        required: false,
        installed,
        status: status_label(installed),
        detected_path: path
            .filter(|candidate| candidate.exists())
            .map(path_to_string),
        version: None,
        install_command: None,
        download_url: None,
        notes: notes.into(),
        managed: true,
    }
}

async fn check_command(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Some(
        if stdout.is_empty() { stderr } else { stdout }
            .lines()
            .next()
            .unwrap_or_default()
            .to_string(),
    )
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
        managed: false,
    }
}

fn status_label(installed: bool) -> String {
    if installed {
        "installed".into()
    } else {
        "missing".into()
    }
}
fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}
