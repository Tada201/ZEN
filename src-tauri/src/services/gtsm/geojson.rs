use crate::error::{ZenError, ZenResult};
use geojson::{GeoJson, Value};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::str::FromStr;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeojsonParsedMetadata {
    pub feature_count: i32,
    pub geometry_types: Vec<String>,
    pub bbox: Option<Vec<f64>>,
}

pub struct GeojsonService;

impl GeojsonService {
    /// Validates raw GeoJSON string, computes bounding box, features count, and geometry types.
    pub fn parse_and_validate(geojson_str: &str) -> ZenResult<GeojsonParsedMetadata> {
        let geojson = GeoJson::from_str(geojson_str)
            .map_err(|e| ZenError::Custom(format!("Invalid GeoJSON: {}", e)))?;

        let mut feature_count = 0;
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
                Value::GeometryCollection(geoms) => {
                    // Handled recursively if needed, but we can register inside types
                }
            }
        };

        match geojson {
            GeoJson::Feature(feature) => {
                feature_count = 1;
                if let Some(geom) = feature.geometry {
                    process_value(&geom.value);
                }
            }
            GeoJson::FeatureCollection(fc) => {
                feature_count = fc.features.len() as i32;
                for feature in fc.features {
                    if let Some(geom) = feature.geometry {
                        process_value(&geom.value);
                    }
                }
            }
            GeoJson::Geometry(geom) => {
                feature_count = 1;
                process_value(&geom.value);
            }
        }

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
