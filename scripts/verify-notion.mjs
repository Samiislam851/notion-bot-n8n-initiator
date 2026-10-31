// Independent consistency check of the Notion data (run after the scenarios):
//  1. no two active cost records share a Dedupe Key   (no double counting)
//  2. every Supplier Monthly Summary row equals the totals recomputed from Project Costs
//
//   npm run verify
import { readFileSync } from 'node:fs';
import { queryAll } from './notion-api.mjs';
import { loadLib } from './lib-bundle.mjs';

const L = loadLib();
const ids = JSON.parse(readFileSync(new URL('../config/notion-ids.json', import.meta.url), 'utf8'));
const costs = await queryAll(ids.costs);
const summaries = await queryAll(ids.summary);
let problems = 0;

const byDedupe = new Map();
for (const p of costs) {
  const k = L.readProp(p.properties['Dedupe Key']);
  if (k) byDedupe.set(k, [...(byDedupe.get(k) || []), p.id]);
}
for (const [k, list] of byDedupe) if (list.length > 1) { problems++; console.log(`DUPLICATE dedupe key ${k}: ${list.length} records`); }
console.log(`Cost records: ${costs.length}, unique dedupe keys: ${byDedupe.size}`);

const groups = new Map();
for (const p of costs) {
  const c = L.readCostPage(p);
  const key = c.summaryKey || L.buildSummaryKey(c);
  groups.set(key, [...(groups.get(key) || []), p]);
}
console.log('\nSupplier Monthly Summary vs recomputed from Project Costs:');
console.log('  ' + ['Summary', 'Paid', 'Unpaid', 'Count', 'Check'].join(' | '));
for (const row of summaries) {
  const key = L.readProp(row.properties['Summary Key']);
  const t = L.computeTotals(groups.get(key) || []);
  const got = { paid: L.readProp(row.properties['Total Paid']), unpaid: L.readProp(row.properties['Total Unpaid']), count: L.readProp(row.properties['Cost Count']) };
  const ok = got.paid === t.paid && got.unpaid === t.unpaid && got.count === t.count;
  if (!ok) problems++;
  console.log(`  ${L.readProp(row.properties.Summary)} | ${got.paid} | ${got.unpaid} | ${got.count} | ${ok ? 'OK' : `MISMATCH (expected ${t.paid}/${t.unpaid}/${t.count})`}`);
  groups.delete(key);
}
for (const [key] of groups) if (key) { problems++; console.log(`  MISSING summary row for ${key}`); }
console.log(problems ? `\n${problems} problem(s) found` : '\nAll consistent: no duplicates, every summary matches its cost records.');
process.exit(problems ? 1 : 0);
