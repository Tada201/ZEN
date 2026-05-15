use serde::{Deserialize, Serialize};
use std::fs;
// use std::path::PathBuf; // Removed unused import
use tauri::Manager;
use tracing::{info, error};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Star {
    pub id: i32,
    pub name: Option<String>,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub mag: f32,
    pub ci: Option<f32>,
}

pub async fn get_stellar_data(app: tauri::AppHandle) -> anyhow::Result<Vec<Star>> {
    let app_data_dir = app.path().app_data_dir()?;
    let catalog_path = app_data_dir.join("hyg_subset.json");

    if !catalog_path.exists() {
        info!("Stellar catalog not found. Downloading subset...");
        download_catalog(&catalog_path).await?;
    }

    let data = fs::read_to_string(catalog_path)?;
    let stars: Vec<Star> = serde_json::from_str(&data)?;
    
    Ok(stars)
}

async fn download_catalog(path: &std::path::Path) -> anyhow::Result<()> {
    // For the sake of a working implementation, we'll use a pre-curated subset URL 
    // or simulate it if the URL is unreliable. 
    // Here we'll try to fetch a processed 10k brightest stars subset.
    let url = "https://raw.githubusercontent.com/StarlightGazer/hyg-json-subset/main/hyg_10k_brightest.json";
    
    let response = reqwest::get(url).await?;
    if !response.status().is_success() {
        error!("Failed to download stellar catalog: {}", response.status());
        return Err(anyhow::anyhow!("Download failed"));
    }

    let bytes = response.bytes().await?;
    fs::write(path, bytes)?;
    info!("Stellar catalog downloaded successfully.");
    Ok(())
}

#[tauri::command]
pub async fn get_stellar_catalog(app: tauri::AppHandle) -> Result<Vec<Star>, String> {
    get_stellar_data(app).await.map_err(|e| e.to_string())
}
