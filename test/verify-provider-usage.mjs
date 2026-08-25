import { readFileSync } from 'node:fs';

const query = readFileSync('src-tauri/crates/zen-db/src/queries/usage.rs', 'utf8');
const command = readFileSync('src-tauri/src/commands/settings.rs', 'utf8');
const api = readFileSync('src/api/providersApi.ts', 'utf8');
const panel = readFileSync('src/components/settings/Tabs/providers/ProviderUsagePanel.tsx', 'utf8');
const models = readFileSync('src/components/settings/Tabs/providers/ModelConfig.tsx', 'utf8');

const required = [
  [query, 'WHERE role = \'assistant\' AND is_complete = 1', 'completed assistant usage filter'],
  [query, 'MAX_HISTORY_ITEMS', 'bounded usage history'],
  [query, 'UsageDay', 'daily usage aggregation type'],
  [query, "GROUP BY day ORDER BY day ASC", 'daily usage aggregation query'],
  [command, 'pub async fn get_provider_usage', 'typed usage command'],
  [api, 'getUsage:', 'typed provider usage API'],
  [panel, 'Recent completed responses', 'usage history UI'],
  [panel, 'Usage trend', 'usage trend UI'],
  [models, 'xl:grid-cols-4', 'four-column model grid'],
];

for (const [source, expected, label] of required) {
  if (!source.includes(expected)) throw new Error(`Missing ${label}`);
}

console.log('Provider usage wiring verified.');
