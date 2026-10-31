// Duplicate check result -> create / update / duplicate decision, review flags, Notion properties.
function run() {
  const cfg = $('Settings').first().json;
  const ctx = $('Parse & Match').first().json;
  const existing = ($input.first().json.results || [])[0] || null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone }).format(new Date());
  const decision = decideAction(ctx.parsed, existing, cfg, today);
  const a = ctx.attachment;
  const uploadDocument = decision.action !== 'duplicate' && !!a && (a.kind === 'pdf' || a.kind === 'image') && !ctx.parsed.attachmentTooLarge;
  return [{ json: { ...ctx, today, decision, existingPageId: existing ? existing.id : null, uploadDocument } }];
}
