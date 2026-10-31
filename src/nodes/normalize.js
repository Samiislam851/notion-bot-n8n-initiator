// Turns each incoming email (IMAP trigger or test webhook) into one item per document:
// every PDF/photo attachment becomes its own item; an email without attachments is one item (body only).
const cfg = $('Settings').first().json;
const fromWebhook = $('Test Intake Webhook').isExecuted;
const emails = fromWebhook ? $('Test Intake Webhook').all() : $('Email Trigger (IMAP)').all();

function addressOf(v) {
  if (!v) return { email: '', name: '' };
  if (typeof v === 'string') {
    const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
    return m ? { name: m[1].trim(), email: m[2].trim().toLowerCase() } : { name: '', email: v.trim().toLowerCase() };
  }
  const first = (v.value && v.value[0]) || {};
  return { name: first.name || '', email: String(first.address || '').toLowerCase() };
}
function stripHtml(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
function bytesOf(b) {
  if (!b) return null;
  if (typeof b.bytes === 'number') return b.bytes;
  const m = String(b.fileSize || '').match(/([\d.]+)\s*(B|kB|KB|MB|GB)/);
  if (!m) return b.data && b.data.length > 100 ? Math.floor(b.data.length * 0.75) : null;
  return Math.round(+m[1] * { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9 }[m[2]]);
}
function kindOf(name, mime) {
  if (/pdf/i.test(mime) || /\.pdf$/i.test(name)) return 'pdf';
  if (/^image\//i.test(mime) || /\.(png|jpe?g|heic|webp|gif|tiff?)$/i.test(name)) return 'image';
  return 'other';
}

const out = [];
for (const item of emails) {
  const e = fromWebhook ? item.json.body || {} : item.json;
  const from = addressOf(e.from);
  const email = {
    from: from.email,
    fromName: e.fromName || from.name,
    subject: String(e.subject || '').trim(),
    text: String(e.text || stripHtml(e.html || e.textAsHtml) || '').trim(),
    date: e.date || new Date().toISOString(),
    messageId: e.messageId || e['message-id'] || null,
  };
  // Never process our own notifications or replies/forwards of them (demo or production subjects).
  if (/^((re|fw|fwd|aw|tr)\s*:\s*)*(\[DEMO\]|(needs review - )?cost (recorded|updated):)/i.test(email.subject)) continue;

  const attachments = [];
  if (fromWebhook) {
    for (const a of e.attachments || []) {
      const buffer = Buffer.from(a.base64 || '', 'base64');
      let binary;
      try { binary = await this.helpers.prepareBinaryData(buffer, a.fileName, a.mimeType); }
      catch (err) { binary = { data: a.base64, mimeType: a.mimeType, fileName: a.fileName }; }
      attachments.push({ fileName: a.fileName, mimeType: a.mimeType, sizeBytes: buffer.length, binary });
    }
  } else {
    for (const b of Object.values(item.binary || {})) attachments.push({ fileName: b.fileName, mimeType: b.mimeType, sizeBytes: bytesOf(b), binary: b });
  }
  // Ignore tiny inline images (email signatures / logos).
  const docs = attachments
    .map((a) => ({ ...a, kind: kindOf(a.fileName || '', a.mimeType || '') }))
    .filter((a) => !(a.kind === 'image' && a.sizeBytes !== null && a.sizeBytes < 8000 && /^(image\d+|logo|signature)/i.test(a.fileName || '')));

  const base = { email, docCount: Math.max(docs.length, 1) };
  if (!docs.length) out.push({ json: { ...base, docIndex: 0, attachment: null, hasPdf: false, submissionId: (email.messageId || email.subject) + '#body' } });
  docs.forEach((a, i) => out.push({
    json: { ...base, docIndex: i, hasPdf: a.kind === 'pdf', attachment: { fileName: a.fileName, mimeType: a.mimeType, kind: a.kind, sizeBytes: a.sizeBytes }, submissionId: (email.messageId || email.subject) + '#' + i },
    binary: { document: a.binary },
  }));
}
// Nothing to process (e.g. only our own notifications): still finish the run cleanly.
return out.length ? out : [{ json: { skipped: true, reason: 'no documents to process' } }];
