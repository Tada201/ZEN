use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{AppHandle, Manager, State};
use tracing::info;

use crate::commands::AppState;
use zen_core::error::ZenError;
use crate::services::SpeechService;

const MAX_VOICE_MODEL_BYTES: u64 = 600 * 1024 * 1024;
const MAX_VOICE_CONFIG_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub async fn get_whisper_model_status(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<crate::services::speech_service::ModelFileStatus, ZenError> {
    let speech_lock = state.speech.read().await;
    let speech = speech_lock
        .as_ref()
        .ok_or(ZenError::Internal("Speech service not initialized".into()))?;
    Ok(speech.check_model_file(&model_name))
}

#[tauri::command]
pub async fn get_whisper_runtime_status(
    state: State<'_, AppState>,
) -> Result<crate::services::speech_service::WhisperRuntimeStatus, ZenError> {
    let speech_lock = state.speech.read().await;
    let speech = speech_lock
        .as_ref()
        .ok_or(ZenError::Internal("Speech service not initialized".into()))?;
    Ok(speech.runtime_status())
}

#[tauri::command]
pub async fn download_whisper_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<crate::services::speech_service::ModelFileStatus, ZenError> {
    let mut speech_lock = state.speech.write().await;
    let speech = speech_lock
        .as_mut()
        .ok_or(ZenError::Internal("Speech service not initialized".into()))?;
    speech
        .download_model(&model_name)
        .await
        .map_err(ZenError::Internal)
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", content = "text")]
pub enum TranscriptionResult {
    NoSpeech,
    Transcript(String),
}

fn pcm_audio_stats(pcm_i16: &[i16]) -> (f32, i16) {
    if pcm_i16.is_empty() {
        return (0.0, 0);
    }
    let mut sum_sq = 0.0_f64;
    let mut peak = 0_i16;
    for &sample in pcm_i16 {
        let abs = sample.saturating_abs();
        if abs > peak {
            peak = abs;
        }
        let normalized = sample as f64 / 32768.0;
        sum_sq += normalized * normalized;
    }
    ((sum_sq / pcm_i16.len() as f64).sqrt() as f32, peak)
}

/// Accepts raw 16-bit PCM audio bytes (little-endian, 16kHz, mono)
/// and returns the transcribed text via local Whisper inference.
#[tauri::command]
pub async fn transcribe_audio(
    state: State<'_, AppState>,
    audio: Vec<u8>,
    model_name: Option<String>,
    force_transcribe: Option<bool>,
    gpu_device: Option<u32>,
) -> Result<TranscriptionResult, ZenError> {
    let started_at = Instant::now();
    if audio.is_empty() {
        return Ok(TranscriptionResult::NoSpeech);
    }

    info!(bytes = audio.len(), "Received audio for transcription");

    // Convert bytes directly to i16 for VAD processing (16kHz mono)
    let pcm_i16: Vec<i16> = audio
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();
    let (rms, peak) = pcm_audio_stats(&pcm_i16);
    info!(
        samples = pcm_i16.len(),
        rms = %format!("{rms:.5}"),
        peak = peak,
        "Prepared PCM audio for VAD"
    );

    if rms < 0.00005 || peak < 10 {
        info!("PCM audio is effectively silent. Skipping Whisper.");
        return Ok(TranscriptionResult::NoSpeech);
    }

    let bypass_vad = force_transcribe.unwrap_or(false);
    let vad_check_passed = bypass_vad || {
        let frame_len = 480;
        let mut vad = webrtc_vad::Vad::new_with_rate_and_mode(
            webrtc_vad::SampleRate::Rate16kHz,
            webrtc_vad::VadMode::Quality,
        );

        let mut voiced_frames = 0;
        let mut consecutive_voiced = 0;
        let mut max_consecutive_voiced = 0;

        for chunk in pcm_i16.chunks(frame_len) {
            if chunk.len() == frame_len {
                if let Ok(is_voice) = vad.is_voice_segment(chunk) {
                    if is_voice {
                        voiced_frames += 1;
                        consecutive_voiced += 1;
                        if consecutive_voiced > max_consecutive_voiced {
                            max_consecutive_voiced = consecutive_voiced;
                        }
                    } else {
                        consecutive_voiced = 0;
                    }
                }
            }
        }
        voiced_frames >= 3 || max_consecutive_voiced >= 2
    };

    if !vad_check_passed {
        info!("VAD detected insufficient speech. Skipping Whisper.");
        return Ok(TranscriptionResult::NoSpeech);
    }

    // Convert 16-bit PCM to f32 samples for Whisper
    let samples = pcm_i16
        .iter()
        .map(|&x| x as f32 / 32768.0)
        .collect::<Vec<f32>>();

    let requested_model = match model_name.filter(|name| !name.trim().is_empty()) {
        Some(name) => name,
        None => zen_db::queries::get_setting(&state.db().await?, "stt_whisper_model")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "ggml-base.en.bin".to_string()),
    };

    let speech_lock = state.speech.read().await;
    let speech: &SpeechService = speech_lock
        .as_ref()
        .ok_or(ZenError::Internal("Speech service not initialized".into()))?;
    let model_status = speech.check_model_file(&requested_model);
    if !model_status.valid {
        return Err(ZenError::Internal(format!(
            "Whisper model '{}' is not ready: {}",
            requested_model,
            model_status
                .error
                .unwrap_or_else(|| "model file is missing or invalid".to_string())
        )));
    }

    let transcript = speech
        .transcribe(samples, &requested_model, gpu_device)
        .await
        .map_err(ZenError::Internal)?;
    info!(
        model = %requested_model,
        elapsed_ms = started_at.elapsed().as_millis(),
        chars = transcript.chars().count(),
        "Whisper transcription request finished"
    );

    let cleaned_transcript = transcript.trim().replace(&['.', ',', '!', '?'][..], "");
    let lower = cleaned_transcript.to_lowercase();
    let blacklist = [
        "thank you for watching",
        "subscribe to my channel",
        "please subscribe",
        "thanks for watching",
    ];
    if blacklist.iter().any(|&b| lower == b || lower.contains(b))
        && transcript.split_whitespace().count() <= 5
    {
        info!(transcript = %transcript, "Blocked suspected STT hallucination");
        return Ok(TranscriptionResult::NoSpeech);
    }

    Ok(TranscriptionResult::Transcript(transcript))
}

#[tauri::command]
pub async fn transcribe_stream(
    state: State<'_, AppState>,
    audio: Vec<u8>,
    model_name: Option<String>,
    gpu_device: Option<u32>,
) -> Result<TranscriptionResult, ZenError> {
    if audio.is_empty() {
        return Ok(TranscriptionResult::NoSpeech);
    }

    let pcm_i16: Vec<i16> = audio
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();

    let vad_check_passed = {
        let frame_len = 480;
        let mut vad = webrtc_vad::Vad::new_with_rate_and_mode(
            webrtc_vad::SampleRate::Rate16kHz,
            webrtc_vad::VadMode::Quality,
        );

        let mut voiced_frames = 0;
        for chunk in pcm_i16.chunks(frame_len) {
            if chunk.len() == frame_len {
                if let Ok(true) = vad.is_voice_segment(chunk) {
                    voiced_frames += 1;
                }
            }
        }
        voiced_frames >= 2
    };

    if !vad_check_passed {
        return Ok(TranscriptionResult::NoSpeech);
    }

    let samples = pcm_i16
        .iter()
        .map(|&x| x as f32 / 32768.0)
        .collect::<Vec<f32>>();

    let requested_model = match model_name.filter(|name| !name.trim().is_empty()) {
        Some(name) => name,
        None => zen_db::queries::get_setting(&state.db().await?, "stt_whisper_model")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "ggml-base.en.bin".to_string()),
    };

    let speech_lock = state.speech.read().await;
    let speech: &SpeechService = speech_lock
        .as_ref()
        .ok_or(ZenError::Internal("Speech service not initialized".into()))?;
    let model_status = speech.check_model_file(&requested_model);
    if !model_status.valid {
        return Err(ZenError::Internal(format!(
            "Whisper model '{}' is not ready: {}",
            requested_model,
            model_status
                .error
                .unwrap_or_else(|| "model file is missing or invalid".to_string())
        )));
    }
    let transcript_result = speech
        .transcribe(samples, &requested_model, gpu_device)
        .await;

    match transcript_result {
        Ok(t) if !t.is_empty() => {
            let lower = t.to_lowercase();
            // Only block known Whisper hallucination phrases (exact or near-exact matches)
            let blacklist = [
                "thank you for watching",
                "subscribe to my channel",
                "please subscribe",
                "thanks for watching",
                "locate france",
            ];
            let word_count = t.split_whitespace().count();
            let is_hallucination = word_count <= 5
                && blacklist
                    .iter()
                    .any(|&b| lower == b || (word_count <= 3 && lower.contains(b)));
            if is_hallucination {
                info!(transcript = %t, "Blocked suspected STT hallucination in stream");
                return Ok(TranscriptionResult::NoSpeech);
            }
            Ok(TranscriptionResult::Transcript(t))
        }
        _ => Ok(TranscriptionResult::NoSpeech),
    }
}

#[tauri::command]
pub async fn speak_text(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    text: String,
) -> Result<(), ZenError> {
    let tts_lock = state.tts.read().await;
    if let Some(tts) = tts_lock.as_ref() {
        let events: std::sync::Arc<dyn zen_core::ports::EventSink> =
            std::sync::Arc::new(crate::services::event_sink::TauriEventSink::new(app));
        tts.speak(&text, events).await.map_err(ZenError::Internal)?;
    } else {
        return Err(ZenError::Internal(
            "TTS service is not initialized. Check Settings → Audio to configure TTS.".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_speech(state: State<'_, AppState>) -> Result<(), ZenError> {
    let tts_lock = state.tts.read().await;
    if let Some(tts) = tts_lock.as_ref() {
        tts.stop().await;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceModel {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_default: bool,
}

#[tauri::command]
pub async fn list_voice_models(app: AppHandle) -> Result<Vec<VoiceModel>, ZenError> {
    let mut voices = Vec::new();

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| ZenError::Internal(e.to_string()))?;
    let voices_dir = app_data_dir.join("voices");

    if voices_dir.exists() {
        let entries = std::fs::read_dir(&voices_dir)
            .map_err(|e| ZenError::Internal(format!("Failed to read voices dir: {e}")))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "onnx").unwrap_or(false) {
                let name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Unknown".to_string());

                let is_default = name == "glados_piper_medium";
                voices.push(VoiceModel {
                    id: if is_default {
                        "default".to_string()
                    } else {
                        name.clone()
                    },
                    name: if is_default {
                        "GLaDOS (Default)".to_string()
                    } else {
                        name
                    },
                    path: path.to_string_lossy().to_string(),
                    is_default,
                });
            }
        }
    }

    Ok(voices)
}

#[tauri::command]
pub async fn add_voice_model(
    app: AppHandle,
    onnx_path: String,
    config_path: String,
) -> Result<VoiceModel, ZenError> {
    let onnx_src = std::path::PathBuf::from(&onnx_path)
        .canonicalize()
        .map_err(|_| ZenError::Custom("ONNX file not found".to_string()))?;
    let config_src = std::path::PathBuf::from(&config_path)
        .canonicalize()
        .map_err(|_| ZenError::Custom("Config (JSON) file not found".to_string()))?;

    if !onnx_src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("onnx"))
        .unwrap_or(false)
    {
        return Err(ZenError::Custom(
            "Voice model must be an .onnx file".to_string(),
        ));
    }
    if !config_src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
    {
        return Err(ZenError::Custom(
            "Voice config must be a .json file".to_string(),
        ));
    }

    let onnx_meta = std::fs::metadata(&onnx_src)
        .map_err(|e| ZenError::Internal(format!("Failed to inspect ONNX file: {e}")))?;
    if !onnx_meta.is_file() || onnx_meta.len() > MAX_VOICE_MODEL_BYTES {
        return Err(ZenError::Custom(
            "ONNX file is invalid or too large".to_string(),
        ));
    }

    let config_meta = std::fs::metadata(&config_src)
        .map_err(|e| ZenError::Internal(format!("Failed to inspect config file: {e}")))?;
    if !config_meta.is_file() || config_meta.len() > MAX_VOICE_CONFIG_BYTES {
        return Err(ZenError::Custom(
            "Config file is invalid or too large".to_string(),
        ));
    }

    let config_text = std::fs::read_to_string(&config_src)
        .map_err(|e| ZenError::Internal(format!("Failed to read config file: {e}")))?;
    serde_json::from_str::<serde_json::Value>(&config_text)
        .map_err(|e| ZenError::Custom(format!("Config file is not valid JSON: {e}")))?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| ZenError::Internal(e.to_string()))?;
    let voices_dir = app_data_dir.join("voices");

    std::fs::create_dir_all(&voices_dir)
        .map_err(|e| ZenError::Internal(format!("Failed to create voices dir: {e}")))?;
    let voices_dir = voices_dir
        .canonicalize()
        .map_err(|e| ZenError::Internal(format!("Failed to resolve voices dir: {e}")))?;

    let onnx_file_name = onnx_src
        .file_name()
        .ok_or_else(|| ZenError::Custom("Invalid ONNX file name".to_string()))?;
    let onnx_dest = voices_dir.join(onnx_file_name);
    if !onnx_dest.starts_with(&voices_dir) {
        return Err(ZenError::Custom(
            "Invalid voice model destination".to_string(),
        ));
    }

    std::fs::copy(&onnx_src, &onnx_dest)
        .map_err(|e| ZenError::Internal(format!("Failed to copy ONNX file: {e}")))?;

    // Copy config file. Piper expects {model}.json (e.g., voice.onnx -> voice.onnx.json)
    let mut config_dest = onnx_dest.clone().into_os_string();
    config_dest.push(".json");
    let config_dest = std::path::PathBuf::from(config_dest);
    if !config_dest.starts_with(&voices_dir) {
        return Err(ZenError::Custom(
            "Invalid voice config destination".to_string(),
        ));
    }

    std::fs::copy(&config_src, &config_dest)
        .map_err(|e| ZenError::Internal(format!("Failed to copy config file: {e}")))?;

    let name = onnx_dest
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    Ok(VoiceModel {
        id: name.clone(),
        name,
        path: onnx_dest.to_string_lossy().to_string(),
        is_default: false,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiperDownloadStatus {
    pub model_name: String,
    pub model_path: String,
    pub config_path: String,
    pub size_bytes: u64,
    pub success: bool,
    pub error: Option<String>,
}

/// Download a Piper voice model from Hugging Face.
///
/// `voice_name` follows the Piper naming convention: `{lang}-{voice}-{quality}`
/// e.g. `en_US-ryan-high`, `en_US-lessac-medium`, `en_US-glados-medium`
///
/// The model `.onnx` and config `.onnx.json` files are saved to `{app_data_dir}/voices/`.
/// After download, the TTS service is automatically set to use the new model.
#[tauri::command]
pub async fn download_piper_model(
    state: State<'_, AppState>,
    app: AppHandle,
    voice_name: String,
) -> Result<PiperDownloadStatus, ZenError> {
    let model_file = format!("{voice_name}.onnx");
    let config_file = format!("{voice_name}.onnx.json");

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| ZenError::Internal(format!("Failed to get app data dir: {e}")))?;
    let voices_dir = app_data_dir.join("voices");
    std::fs::create_dir_all(&voices_dir)
        .map_err(|e| ZenError::Internal(format!("Failed to create voices dir: {e}")))?;

    let model_path = voices_dir.join(&model_file);
    let config_path = voices_dir.join(&config_file);

    // Check if already downloaded and valid
    if model_path.exists() && config_path.exists() {
        let model_meta = std::fs::metadata(&model_path)
            .map_err(|e| ZenError::Internal(format!("Failed to read model file: {e}")))?;
        if model_meta.len() > 1_000_000 {
            info!(path = %model_path.display(), "Piper model already downloaded");
            let tts_lock = state.tts.read().await;
            if let Some(tts) = tts_lock.as_ref() {
                tts.set_model(model_path.clone()).await;
            }
            return Ok(PiperDownloadStatus {
                success: true,
                model_name: voice_name.clone(),
                model_path: model_path.to_string_lossy().to_string(),
                config_path: config_path.to_string_lossy().to_string(),
                size_bytes: model_meta.len(),
                error: None,
            });
        }
    }

    // Construct Hugging Face URL from voice_name.
    // Voice name format: {locale}-{voice}-{quality}
    // e.g. "en_US-glados-medium"
    //
    // HF repo path:   {lang}/{locale}/{voice}/{quality}/{file}
    // e.g.            en/en_US/glados/medium/en_US-glados-medium.onnx
    //
    // The lang ("en") is the first two chars of the locale ("en_US").
    let parts: Vec<&str> = voice_name.splitn(3, '-').collect();
    let (lang_prefix, hf_path) = if parts.len() >= 3 {
        let locale = parts[0]; // "en_US"
        let voice = parts[1]; // "glados"
        let quality = parts[2]; // "medium"
                                // lang is first 2 chars of locale (e.g. "en" from "en_US")
        let lang = &locale[..locale.find('_').unwrap_or(2).min(locale.len())];
        (
            lang.to_string(),
            format!("{locale}/{voice}/{quality}"),
        )
    } else {
        // Fallback: use repo root
        (String::new(), voice_name.replace('-', "/"))
    };
    let base_url = if lang_prefix.is_empty() {
        // fallback: no lang prefix
        format!(
            "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/{hf_path}"
        )
    } else {
        format!(
            "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/{lang_prefix}/{hf_path}"
        )
    };
    let model_url = format!("{base_url}/{model_file}");
    let config_url = format!("{base_url}/{config_file}");

    info!(
        model_url = %model_url,
        config_url = %config_url,
        "Downloading Piper model"
    );

    let client = crate::utils::model_download_http_client();

    // Download model
    let model_response = client
        .get(&model_url)
        .send()
        .await
        .map_err(|e| ZenError::Internal(format!("Failed to download model: {e}")))?;
    if !model_response.status().is_success() {
        return Err(ZenError::Internal(format!(
            "Model download returned HTTP {}",
            model_response.status()
        )));
    }
    let model_bytes = model_response
        .bytes()
        .await
        .map_err(|e| ZenError::Internal(format!("Failed to read model response: {e}")))?;

    // Download config
    let config_response = client
        .get(&config_url)
        .send()
        .await
        .map_err(|e| ZenError::Internal(format!("Failed to download config: {e}")))?;
    if !config_response.status().is_success() {
        return Err(ZenError::Internal(format!(
            "Config download returned HTTP {}",
            config_response.status()
        )));
    }
    let config_bytes = config_response
        .bytes()
        .await
        .map_err(|e| ZenError::Internal(format!("Failed to read config response: {e}")))?;

    // Atomic writes
    let runtime = crate::services::runtime_resource::RuntimeResources::new(
        &app_data_dir,
        &app.path().resource_dir().unwrap_or_default(),
    );
    runtime
        .atomic_write(&model_path, &model_bytes)
        .map_err(|e| ZenError::Internal(format!("Failed to write model file: {e}")))?;
    runtime
        .atomic_write(&config_path, &config_bytes)
        .map_err(|e| ZenError::Internal(format!("Failed to write config file: {e}")))?;

    info!(
        size_mb = model_bytes.len() / (1024 * 1024),
        path = %model_path.display(),
        "Piper model downloaded successfully"
    );

    // Automatically set the downloaded model as active
    let tts_lock = state.tts.read().await;
    if let Some(tts) = tts_lock.as_ref() {
        tts.set_model(model_path.clone()).await;
    }

    Ok(PiperDownloadStatus {
        success: true,
        model_name: voice_name,
        model_path: model_path.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
        size_bytes: model_bytes.len() as u64,
        error: None,
    })
}

#[tauri::command]
pub async fn set_active_voice_model(
    app: AppHandle,
    state: State<'_, AppState>,
    voice_id: String,
) -> Result<(), ZenError> {
    let voices = list_voice_models(app).await?;

    let model = voices
        .into_iter()
        .find(|v| v.id == voice_id)
        .ok_or_else(|| ZenError::Custom(format!("Voice model '{voice_id}' not found")))?;

    let path = std::path::PathBuf::from(&model.path);

    let tts_lock = state.tts.read().await;
    if let Some(tts) = tts_lock.as_ref() {
        tts.set_model(path).await;
        Ok(())
    } else {
        Err(ZenError::Internal("TTS service not initialized".into()))
    }
}
