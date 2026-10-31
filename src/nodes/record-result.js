// One result line per document; collected by the loop and returned to the webhook caller.
const ctx = $('Build Notification').first().json;
const input = $input.first().json;
const r = ctx.decision.record;
const n = ctx.notification;
// A real send returns the SMTP result; a disabled email node just passes our item through.
const delivered = Array.isArray(input.accepted) && input.accepted.length > 0;
const sendError = input.error ? String(input.error.message || input.error) : !delivered && n.send ? 'email node disabled or no SMTP credential' : undefined;
return [{
  json: {
    submissionId: ctx.submissionId,
    file: ctx.attachment ? ctx.attachment.fileName : null,
    action: ctx.decision.action,
    supplier: r.supplierName,
    docRef: r.docRef || null,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    docDate: r.docDate || null,
    dueDate: r.dueDate || null,
    project: r.projectName || null,
    needsReview: !!r.needsReview,
    reviewReasons: ctx.decision.newReviewReasons,
    changes: ctx.decision.changes,
    submissions: r.submissions,
    notionUrl: ctx.notionUrl,
    summaries: ctx.summaries.map((s) => ({ key: s.target.key, paid: s.totals.paid, unpaid: s.totals.unpaid, count: s.totals.count })),
    notification: n.send
      ? { sent: delivered, to: n.to, subject: n.subject, intendedRecipients: n.intendedRecipients.map((p) => p.email), error: sendError }
      : { sent: false, reason: n.reason },
  },
}];
