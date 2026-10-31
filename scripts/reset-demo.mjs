// Removes the records created by the test scenarios (Source Message ID "<demo-...>")
// and recalculates the Supplier Monthly Summary, so the demo can be run again.
// Part 2 data and real submissions are not touched (pages are archived, i.e. moved to Notion's trash).
//
//   npm run reset:demo
import { readFileSync } from 'node:fs';
import { notion, queryAll } from './notion-api.mjs';
import { syncAllSummaries } from './summary-sync.mjs';

const ids = JSON.parse(readFileSync(new URL('../config/notion-ids.json', import.meta.url), 'utf8'));
const demo = await queryAll(ids.costs, { filter: { property: 'Source Message ID', rich_text: { starts_with: '<demo-' } } });
for (const p of demo) await notion('PATCH', `/pages/${p.id}`, { archived: true });
console.log(`Archived ${demo.length} demo cost record(s)`);
await syncAllSummaries(ids);
