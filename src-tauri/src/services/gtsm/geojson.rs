use crate::error::{ZenError, ZenResult};
use geojson::{GeoJson, Value};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{Cursor, Read};
use std::str::FromStr;

const MAX_KMZ_INPUT_BYTES: usize = 10 * 1024 * 1024;
const MAX_KMZ_KML_BYTES: usize = 10 * 1024 * 1024;
const MAX_KMZ_ENTRIES: usize = 64;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeojsonParsedMetadata {
    pub feature_count: i32,
    pub geometry_types: Vec<String>,
    pub bbox: Option<Vec<f64>>,
}

pub struct GeojsonService;

impl GeojsonService {
    /// Extracts one KML document from a user-selected KMZ archive without
    /// writing archive contents to disk. Limits protect the renderer from
    /// zip bombs before the normal KML-to-GeoJSON conversion runs.
    pub fn extract_kmz_kml(bytes: &[u8]) -> ZenResult<String> {
        if bytes.len() > MAX_KMZ_INPUT_BYTES {
            return Err(ZenError::Custom("KMZ imports are limited to 10 MB".to_string()));
        }
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|error| ZenError::Custom(format!("KMZ archive is invalid: {error}")))?;
        if archive.len() > MAX_KMZ_ENTRIES {
            return Err(ZenError::Custom("KMZ archive contains too many files".to_string()));
        }

        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| ZenError::Custom(format!("KMZ archive entry is invalid: {error}")))?;
            if entry.is_dir() || !entry.name().to_ascii_lowercase().ends_with(".kml") {
                continue;
            }
            if entry.size() > MAX_KMZ_KML_BYTES as u64 {
                return Err(ZenError::Custom("KMZ KML document exceeds the 10 MB limit".to_string()));
            }
            let mut contents = Vec::with_capacity(entry.size() as usize);
            entry
                .by_ref()
                .take(MAX_KMZ_KML_BYTES as u64 + 1)
                .read_to_end(&mut contents)
                .map_err(|error| ZenError::Custom(format!("KMZ KML document could not be read: {error}")))?;
            if contents.len() > MAX_KMZ_KML_BYTES {
                return Err(ZenError::Custom("KMZ KML document exceeds the 10 MB limit".to_string()));
            }
            return String::from_utf8(contents)
                .map_err(|_| ZenError::Custom("KMZ KML document must be UTF-8 text".to_string()));
        }
        Err(ZenError::Custom("KMZ archive does not contain a KML document".to_string()))
    }

    /// Validates raw GeoJSON string, computes bounding box, features count, and geometry types.
    pub fn parse_and_validate(geojson_str: &str) -> ZenResult<GeojsonParsedMetadata> {
        let geojson = GeoJson::from_str(geojson_str)
            .map_err(|e| ZenError::Custom(format!("Invalid GeoJSON: {}", e)))?;

        let mut geometry_types = HashSet::new();
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        let mut has_coords = false;

        let mut update_bbox = |coords: &Vec<f64>| {
            if coords.len() >= 2 {
                has_coords = true;
                let x = coords[0];
                let y = coords[1];
                if x < min_x { min_x = x; }
                if x > max_x { max_x = x; }
                if y < min_y { min_y = y; }
                if y > max_y { max_y = y; }
            }
        };

        let mut process_value = |val: &Value| {
            geometry_types.insert(val.to_string());
            match val {
                Value::Point(c) => update_bbox(c),
                Value::MultiPoint(pts) => {
                    for pt in pts { update_bbox(pt); }
                }
                Value::LineString(line) => {
                    for pt in line { update_bbox(pt); }
                }
                Value::MultiLineString(lines) => {
                    for line in lines {
                        for pt in line { update_bbox(pt); }
                    }
                }
                Value::Polygon(poly) => {
                    for ring in poly {
                        for pt in ring { update_bbox(pt); }
                    }
                }
                Value::MultiPolygon(mpoly) => {
                    for poly in mpoly {
                        for ring in poly {
                            for pt in ring { update_bbox(pt); }
                        }
                    }
                }
                Value::GeometryCollection(_geoms) => {
                    // Handled recursively if needed, but we can register inside types
                }
            }
        };

        let feature_count = match &geojson {
            GeoJson::Feature(feature) => {
                if let Some(geom) = &feature.geometry {
                    process_value(&geom.value);
                }
                1
            }
            GeoJson::FeatureCollection(fc) => {
                for feature in &fc.features {
                    if let Some(geom) = &feature.geometry {
                        process_value(&geom.value);
                    }
                }
                fc.features.len() as i32
            }
            GeoJson::Geometry(geom) => {
                process_value(&geom.value);
                1
            }
        };

        let bbox = if has_coords {
            Some(vec![min_x, min_y, max_x, max_y])
        } else {
            None
        };

        let mut geom_list: Vec<String> = geometry_types.into_iter().collect();
        geom_list.sort();

        Ok(GeojsonParsedMetadata {
            feature_count,
            geometry_types: geom_list,
            bbox,
        })
    }
}
