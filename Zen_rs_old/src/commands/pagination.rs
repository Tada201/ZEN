use serde::Serialize;

pub const DEFAULT_PAGE_LIMIT: i64 = 100;
pub const MAX_PAGE_LIMIT: i64 = 500;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub limit: i64,
    pub offset: i64,
    pub has_more: bool,
}

pub fn normalize_page(limit: Option<i64>, offset: Option<i64>) -> (i64, i64) {
    let limit = limit.unwrap_or(DEFAULT_PAGE_LIMIT).clamp(1, MAX_PAGE_LIMIT);
    let offset = offset.unwrap_or(0).max(0);
    (limit, offset)
}

pub fn page_from_fetch<T>(mut items: Vec<T>, limit: i64, offset: i64) -> Page<T> {
    let has_more = items.len() > limit as usize;
    if has_more {
        items.truncate(limit as usize);
    }

    Page {
        items,
        limit,
        offset,
        has_more,
    }
}
