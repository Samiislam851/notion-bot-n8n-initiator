// Rebuilds every Supplier Monthly Summary row from the Project Costs records.
// Used by notion-setup (initial backfill) and reset-demo. The n8n workflow does the
// same thing incrementally, for the supplier/month it just touched.
import { notion, queryAll } from './notion-api.mjs';
import { loadLib } from './lib-bundle.mjs';

const L = loadLib();

export async function syncAllSummaries(ids, { log = console.log } = {}) {
  const costs = await queryAll(ids.costs);
  const groups = new Map();
  for (const page of costs) {
    const c = L.readCostPage(page);
    const key = c.summaryKey || L.buildSummaryKey(c);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { target: L.summaryTarget({ ...c, summaryKey: key }), pages: [] });
    const g = groups.get(key);
    if (!g.target.supplierContactId && c.supplierContactId) g.target.supplierContactId = c.supplierContactId;
    g.pages.push(page);
  }
  const existing = await queryAll(ids.summary);
  const byKey = new Map(existing.map((p) => [L.readProp(p.properties['Summary Key']), p]));
  const now = new Date().toISOString();
  let created = 0, updated = 0, zeroed = 0;
  for (const [key, g] of groups) {
    const props = L.summaryProperties(g.target, L.computeTotals(g.pages), now);
    const row = byKey.get(key);
    if (row) { await notion('PATCH', `/pages/${row.id}`, { properties: props }); updated++; byKey.delete(key); }
    else { await notion('POST', '/pages', { parent: { database_id: ids.summary }, properties: props }); created++; }
  }
  // Rows whose costs no longer exist (e.g. after a demo reset) are archived (moved to Notion's trash).
  for (const [, row] of byKey) {
    await notion('PATCH', `/pages/${row.id}`, { archived: true });
    zeroed++;
  }
  log(`  summaries: ${created} created, ${updated} updated, ${zeroed} archived (no costs left)`);
}
