// Rule-based extraction + supplier/project matching (logic in src/lib, appended below).
function run() {
  const cfg = $('Settings').first().json;
  const doc = $('Current Document').first().json;
  const input = $input.first().json;
  const documentText = doc.hasPdf && typeof input.text === 'string' ? input.text : '';
  const ref = toReferenceData({
    projects: flattenQueryResults($('Get Projects').all()),
    contacts: flattenQueryResults($('Get Suppliers').all()),
    employees: flattenQueryResults($('Get Employees').all()),
    orders: flattenQueryResults($('Get Purchase Orders').all()),
  });
  const parsed = prepareSubmission({ email: doc.email, attachment: doc.attachment, documentText }, ref, cfg);
  parsed.dedupeKey = buildDedupeKey(parsed); // looked up by the next Notion query
  return [{ json: { ...doc, documentTextPreview: documentText.slice(0, 1500), parsed } }];
}
