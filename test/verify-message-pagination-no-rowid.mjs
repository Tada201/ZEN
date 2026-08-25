import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(
  new URL('../src-tauri/crates/zen-db/src/queries/artifacts.rs', import.meta.url),
  'utf8',
);

const getMessagesPage = source.slice(
  source.indexOf('pub async fn get_messages_page'),
  source.indexOf('pub async fn complete_message'),
);

assert(getMessagesPage.includes('ORDER BY created_at DESC, id DESC'), 'message pagination should use id as descending tie-breaker');
assert(getMessagesPage.includes('ORDER BY created_at ASC, id ASC'), 'message pagination should use id as ascending tie-breaker');
assert(!getMessagesPage.includes('rowid'), 'message pagination must not order by hidden rowid');

console.log('message pagination no-rowid verifier passed');
