use super::normalize_board_operation;
use serde_json::json;

#[test]
fn unwraps_provider_envelope_for_clear() {
    let normalized = normalize_board_operation(json!({
        "tool_id": "manage_board",
        "arguments": { "action": "clear" }
    }))
    .expect("wrapped operation should normalize");

    assert_eq!(normalized["action"], "clear");
}

#[test]
fn promotes_single_set_block_and_normalizes_svg() {
    let normalized = normalize_board_operation(json!({
        "action": "set",
        "block": {
            "id": "drawing",
            "content": "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40'/></svg>"
        }
    }))
    .expect("set operation should normalize");

    assert_eq!(normalized["blocks"][0]["kind"], "svg");
    assert!(normalized["blocks"][0]["markup"].is_string());
    assert!(normalized["blocks"][0].get("content").is_none());
}

#[test]
fn extracts_update_id_without_losing_block_fields() {
    let normalized = normalize_board_operation(json!({
        "action": "update",
        "block": {
            "id": "target",
            "kind": "note",
            "title": "Updated"
        }
    }))
    .expect("update operation should normalize");

    assert_eq!(normalized["id"], "target");
    assert_eq!(normalized["block"]["id"], "target");
    assert_eq!(normalized["block"]["body"], "Updated");
}

#[test]
fn extracts_remove_and_focus_ids_from_nested_blocks() {
    for action in ["remove", "focus"] {
        let normalized = normalize_board_operation(json!({
            "action": action,
            "block": { "id": "target" }
        }))
        .expect("targeted operation should normalize");

        assert_eq!(normalized["id"], "target");
    }
}

#[test]
fn preserves_existing_root_id_on_update() {
    let normalized = normalize_board_operation(json!({
        "action": "update",
        "id": "root-target",
        "block": { "id": "nested-target", "title": "Updated" }
    }))
    .expect("update operation should normalize");

    assert_eq!(normalized["id"], "root-target");
}

#[test]
fn rejects_payload_without_action() {
    assert!(normalize_board_operation(json!({
        "block": { "id": "missing-action" }
    }))
    .is_none());
}

#[test]
fn fills_empty_gen_ui_and_html_content() {
    for kind in ["gen_ui", "html"] {
        let normalized = normalize_board_operation(json!({
            "action": "add",
            "block": { "id": kind, "kind": kind, "title": "Demo dashboard" }
        }))
        .expect("empty render block should normalize");

        assert!(!normalized["block"]["content"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .is_empty());
    }
}
