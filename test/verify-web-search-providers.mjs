import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync("src-tauri/src/search/tool.rs", "utf8");
const settings = readFileSync("src/components/settings/Tabs/IntelligenceSettings.tsx", "utf8");
const card = readFileSync("src/atlas/components/chat/ToolCallCard.tsx", "utf8");

assert.match(backend, /https:\/\/api\.tavily\.com\/search/);
assert.match(backend, /https:\/\/api\.exa\.ai\/search/);
assert.match(backend, /\.bearer_auth\(api_key\)/);
assert.match(backend, /\.header\("x-api-key", api_key\)/);
assert.match(backend, /vec!\["tavily", "exa", "duckduckgo"\]/);
assert.match(backend, /token\.is_cancelled\(\)/);
assert.match(backend, /"provider": candidate/);

assert.match(settings, /web_search_provider/);
assert.match(settings, /tavily_api_key/);
assert.match(settings, /exa_api_key/);
assert.match(settings, /tavily_search_depth/);
assert.match(settings, /web_search_max_results/);
assert.match(settings, /SECRET_PRESENT_VALUE/);

assert.match(card, /safeExternalUrl/);
assert.match(card, /rel="noreferrer noopener"/);

console.log("web search provider wiring verified");
