import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const meta = read('src-tauri/crates/zen-llm/src/provider_meta.rs');
const settings = read('src-tauri/src/commands/settings.rs');
const types = read('src/lib/types/provider.ts');
const page = read('src/components/settings/Tabs/ProvidersSettings.tsx');
const aiSlice = read('src/lib/stores/settings/createAISlice.ts');

for (const field of ['display_name', 'description', 'category', 'default_base_url', 'api_key_key']) {
  if (!meta.includes(`pub ${field}:`)) {
    throw new Error(`provider metadata field missing: ${field}`);
  }
}

for (const alias of ['"gemini"', '"kilo"', '"kilo.ai"', '"opencode_free"', '"vx"']) {
  if (!meta.includes(alias)) throw new Error(`provider alias missing from catalog: ${alias}`);
}
if (!meta.includes('!matches!(provider.name') || !meta.includes('"vx"')) {
  throw new Error('compatibility aliases are not excluded from the canonical catalog');
}

for (const field of ['display_name', 'description', 'category', 'requires_key', 'api_key_key', 'base_url_key', 'api_key_present']) {
  if (!settings.includes(`pub ${field}:`)) {
    throw new Error(`runtime provider catalog field missing: ${field}`);
  }
}
if (!settings.includes('custom_models_from_settings')) {
  throw new Error('saved custom model fallback is not part of the backend getter');
}

for (const field of ['displayName?', 'description?', 'category?', 'requiresKey?', 'apiKeyKey?', 'baseUrlKey?']) {
  if (!types.includes(field)) throw new Error(`frontend catalog field missing: ${field}`);
}
if (!page.includes('providerCatalog.map')) {
  throw new Error('provider settings gallery is not driven by the runtime catalog');
}
if (!page.includes('providerCatalog.find(provider => provider.id === selectedProviderId)')) {
  throw new Error('provider settings detail view does not resolve runtime providers');
}
if (!aiSlice.includes('Provider and model are one selection') || !aiSlice.includes('active_model: nextModel')) {
  throw new Error('provider switching can leave a model from the previous provider active');
}

console.log('provider catalog SSOT contract verified');
