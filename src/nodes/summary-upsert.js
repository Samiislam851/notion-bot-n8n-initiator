// Create the summary row if it doesn't exist yet, otherwise update it in place (keyed by Summary Key).
function run() {
  const cfg = $('Settings').first().json;
  const computed = $('Compute Monthly Totals').all();
  const found = $input.all();
  const now = new Date().toISOString();
  return computed.map((c, i) => {
    const existing = ((found[i] && found[i].json.results) || [])[0];
    const properties = summaryProperties(c.json.target, c.json.totals, now);
    const request = existing
      ? { method: 'PATCH', url: 'https://api.notion.com/v1/pages/' + existing.id, body: { properties } }
      : { method: 'POST', url: 'https://api.notion.com/v1/pages', body: { parent: { database_id: cfg.db.summary }, properties } };
    return { json: { ...c.json, request } };
  });
}
