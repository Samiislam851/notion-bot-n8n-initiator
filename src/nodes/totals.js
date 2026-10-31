// Recomputes paid/unpaid totals from ALL cost records for the supplier+month+currency.
// The page we just wrote is taken from the API response (not the query) so a lagging
// Notion search index can't produce stale totals.
function run() {
  const targets = $('Prepare Summary Recalc').all();
  const responses = $input.all();
  const current = $('Upsert Cost Record').first().json;
  const currentKey = readCostPage(current).summaryKey;
  return targets.map((t, i) => {
    const mine = responses.length === targets.length
      ? [responses[i]]
      : responses.filter((r) => [].concat(r.pairedItem || []).some((p) => (p.item || 0) === i));
    const pages = flattenQueryResults(mine).filter((p) => p.id !== current.id);
    if (currentKey === t.json.target.key) pages.push(current);
    return { json: { target: t.json.target, totals: computeTotals(pages) } };
  });
}
