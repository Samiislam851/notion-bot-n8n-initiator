// Builds the Notion request (create or update the cost page) and an audit note for the page body.
function run() {
  const cfg = $('Settings').first().json;
  const ctx = $('Decide Action').first().json;
  const input = $input.first().json;
  const d = JSON.parse(JSON.stringify(ctx.decision));
  const props = d.properties;

  if (ctx.uploadDocument) {
    if (input.object === 'file_upload' && input.status === 'uploaded') {
      props[COST.document] = { files: [{ type: 'file_upload', file_upload: { id: input.id }, name: ctx.attachment.fileName }] };
    } else {
      const reason = 'Document could not be uploaded to Notion (' + ((input.error && input.error.message) || input.message || 'unknown error') + ')';
      d.newReviewReasons.push(reason);
      d.record.needsReview = true;
      d.record.reviewReason = [d.record.reviewReason, reason].filter(Boolean).join('; ');
      props[COST.needsReview] = { checkbox: true };
      props[COST.reviewReason] = { rich_text: richText(d.record.reviewReason) };
    }
  }

  const request = d.action === 'create'
    ? { method: 'POST', url: 'https://api.notion.com/v1/pages', body: { parent: { database_id: cfg.db.costs }, properties: props } }
    : { method: 'PATCH', url: 'https://api.notion.com/v1/pages/' + ctx.existingPageId, body: { properties: props } };

  const p = ctx.parsed;
  const icon = d.action === 'create' ? '📥' : d.action === 'update' ? '🔁' : '♻️';
  const lines = [
    icon + ' ' + ctx.today + ' - ' + d.action.toUpperCase() + ' from email "' + p.subject + '" (' + (p.fromEmail || 'unknown') + ')' + (ctx.attachment ? ' - file: ' + ctx.attachment.fileName : ' - no attachment'),
    'Extracted: ' + [p.supplierName + ' [' + p.supplierMethod + ']', p.docRef || 'no ref', money(p.amount, p.currency), p.status, 'doc date ' + (p.docDate || '-'), 'due ' + (p.dueDate || '-'), 'project ' + (p.projectName || 'none') + ' [' + p.projectMethod + ']'].join(' | '),
  ];
  if (d.changes.length) lines.push('Changes: ' + d.changes.join('; '));
  if (d.newReviewReasons.length) lines.push('Needs review: ' + d.newReviewReasons.join('; '));
  const children = [{ object: 'block', type: 'callout', callout: { icon: { type: 'emoji', emoji: d.newReviewReasons.length ? '⚠️' : icon }, rich_text: richText(lines.join('\n')) } }];
  if (d.action === 'create' && p.subject !== undefined) {
    const body = String(ctx.email.text || '').slice(0, 1900);
    if (body) children.push({ object: 'block', type: 'quote', quote: { rich_text: richText(body) } });
  }
  return [{ json: { ...ctx, decision: d, request, audit: { children } } }];
}
