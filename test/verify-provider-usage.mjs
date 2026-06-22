import { readFileSync } from 'node:fs';

const query = readFileSync('src-tauri/src/db/queries/usage.rs', 'utf8');
const command = readFileSync('src-tauri/src/commands/settings.rs', 'utf8');
const api = readFileSync('src/api/providersApi.ts', 'utf8');
const panel = readFileSync('src/components/settings/Tabs/providers/ProviderUsagePanel.tsx', 'utf8');
const models = readFileSync('src/components/settings/Tabs/providers/ModelConfig.tsx', 'utf8');

const required = [
  [query, 'WHERE role = \'assistant\' AND is_complete = 1', 'completed assistant usage filter'],
  [query, 'MAX_HISTORY_ITEMS', 'bounded usage history'],
  [command, 'pub async fn get_provider_usage', 'typed usage command'],
  [api, 'getUsage:', 'typed provider usage API'],
  [panel, 'Recent completed responses', 'usage history UI'],
  [models, 'xl:grid-cols-4', 'four-column model grid'],
];

for (const [source, expected, label] of required) {
  if (!source.includes(expected)) throw new Error(`Missing ${label}`);
}

console.log('Provider usage wiring verified.');
