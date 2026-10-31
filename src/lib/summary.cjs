// Supplier Monthly Summary: totals are always recomputed from the cost records
// (never incremented), so re-running the workflow can't double-count.
// Depends on notion.cjs (richText, readCostPage).

const SUMMARY = {
  title: 'Summary',
  supplier: 'Supplier',
  supplierName: 'Supplier Name',
  month: 'Month',
  monthKey: 'Month Key',
  currency: 'Currency',
  paid: 'Total Paid',
  unpaid: 'Total Unpaid',
  count: 'Cost Count',
  key: 'Summary Key',
  updated: 'Last Recalculated',
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** pages: Notion cost pages sharing one Summary Key. Paid counts as paid; Unpaid, Partially Paid and Unknown count as unpaid. */
function computeTotals(pages) {
  let paid = 0, unpaid = 0, count = 0, unpaidCount = 0;
  const seen = new Set();
  for (const page of pages) {
    if (!page || seen.has(page.id) || page.archived || page.in_trash) continue;
    seen.add(page.id);
    const c = readCostPage(page);
    if (c.amount == null) { count++; continue; }
    count++;
    if (c.status === 'Paid') paid += c.amount;
    else { unpaid += c.amount; unpaidCount++; }
  }
  return { paid: round2(paid), unpaid: round2(unpaid), total: round2(paid + unpaid), count, unpaidCount };
}

function monthLabel(month) {
  const [y, m] = String(month).split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[m - 1] + ' ' + y;
}

function summaryProperties(target, totals, nowIso) {
  const P = {};
  P[SUMMARY.title] = { title: richText(target.supplierName + ' - ' + monthLabel(target.month) + ' (' + target.currency + ')') };
  P[SUMMARY.supplier] = { relation: target.supplierContactId ? [{ id: target.supplierContactId }] : [] };
  P[SUMMARY.supplierName] = { rich_text: richText(target.supplierName) };
  P[SUMMARY.month] = { date: { start: target.month + '-01' } };
  P[SUMMARY.monthKey] = { rich_text: richText(target.month) };
  P[SUMMARY.currency] = { select: { name: target.currency } };
  P[SUMMARY.paid] = { number: totals.paid };
  P[SUMMARY.unpaid] = { number: totals.unpaid };
  P[SUMMARY.count] = { number: totals.count };
  P[SUMMARY.key] = { rich_text: richText(target.key) };
  P[SUMMARY.updated] = { date: { start: nowIso } };
  return P;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SUMMARY, computeTotals, summaryProperties, monthLabel };
}
