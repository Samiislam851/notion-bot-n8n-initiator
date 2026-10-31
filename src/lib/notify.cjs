// Builds the notification email. In demo mode every email goes to cfg.demoRecipient,
// with a banner naming who would receive it in production.
// Depends on decide.cjs (money) and summary.cjs (monthLabel).

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param d {{action, record, changes, newReviewReasons, notionUrl, summaries:[{target,totals}]}}
 * @param people {{projectManager, officeAdmin, owner}}  each {name,email} or null
 */
function buildNotification(d, people, cfg) {
  const r = d.record;
  const needsReview = d.newReviewReasons.length > 0;
  if (d.action === 'duplicate') return { send: false, reason: 'duplicate - nothing changed' };

  const intended = [];
  const add = (p, why) => { if (p && p.email && !intended.some((x) => x.email === p.email)) intended.push({ name: p.name, email: p.email, why }); };
  add(people.projectManager, 'project manager');
  if (needsReview) { add(people.officeAdmin, 'office admin - review'); add(people.owner, 'owner - review'); }
  if (!intended.length) { add(people.officeAdmin, 'office admin (no project manager)'); add(people.owner, 'owner'); }

  const what = d.action === 'create' ? 'Cost recorded' : 'Cost updated';
  const subjectCore = [r.supplierName, r.docRef, money(r.amount, r.currency), r.projectName || 'NO PROJECT'].filter(Boolean).join(' | ');
  const subject = (cfg.demoMode ? '[DEMO] ' : '') + (needsReview ? 'Needs review - ' : '') + what + ': ' + subjectCore;

  const row = (k, v) => '<tr><td style="padding:4px 12px 4px 0;color:#555">' + esc(k) + '</td><td style="padding:4px 0"><b>' + esc(v) + '</b></td></tr>';
  const banner = cfg.demoMode
    ? '<div style="background:#fff3cd;border:1px solid #e0b100;padding:10px 14px;margin-bottom:16px;border-radius:6px">' +
      '<b>This is a demo.</b> In production this email would be sent to: ' +
      intended.map((p) => esc(p.name) + ' &lt;' + esc(p.email) + '&gt; (' + esc(p.why) + ')').join(', ') + '</div>'
    : '';
  const review = needsReview
    ? '<div style="background:#fdecea;border:1px solid #d93025;padding:10px 14px;margin:16px 0;border-radius:6px"><b>Needs review:</b><ul style="margin:6px 0 0 18px;padding:0">' +
      d.newReviewReasons.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>'
    : '';
  const changes = d.changes.length ? '<p><b>Changes from the resubmission:</b><br>' + d.changes.map(esc).join('<br>') + '</p>' : '';
  const sums = (d.summaries || []).map((s) =>
    '<li>' + esc(s.target.supplierName) + ', ' + esc(monthLabel(s.target.month)) + ': paid ' + esc(money(s.totals.paid, s.target.currency)) +
    ', unpaid ' + esc(money(s.totals.unpaid, s.target.currency)) + ' (' + s.totals.count + ' costs)</li>').join('');

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:640px">' + banner +
    '<h2 style="margin:0 0 8px">' + esc(what) + (needsReview ? ' - needs review' : '') + '</h2>' +
    '<table style="border-collapse:collapse">' +
    row('Supplier', r.supplierName) + row('Document', [r.docType, r.docRef].filter(Boolean).join(' ') || '-') +
    row('Project', r.projectName || 'Not matched') + row('Amount', money(r.amount, r.currency)) +
    row('Status', r.status) + row('Document date', r.docDate || '-') + row('Payment due', r.dueDate || '-') +
    row('Submitted by', r.fromEmail || '-') + '</table>' + review + changes +
    (sums ? '<p><b>Supplier Monthly Summary (recalculated):</b></p><ul>' + sums + '</ul>' : '') +
    (d.notionUrl ? '<p><a href="' + esc(d.notionUrl) + '">Open the cost record in Notion</a></p>' : '') +
    '<p style="color:#888;font-size:12px">Sent automatically by the Kevin Build Co. cost intake workflow (n8n).</p></div>';

  return {
    send: true,
    to: cfg.demoMode ? cfg.demoRecipient : intended.map((p) => p.email).join(', '),
    intendedRecipients: intended,
    subject,
    html,
    needsReview,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildNotification };
}
