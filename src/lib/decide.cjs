// Review rules, duplicate detection and create/update decisions.
// Depends on notion.cjs (COST, richText, readCostPage) - files are concatenated at build time.

const STATUS_RANK = { Unknown: 0, Unpaid: 1, 'Partially Paid': 2, Paid: 3 };

function lowerKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Same shape as the keys already used in Part 2: "apex timber & frames|inv-77812".
function buildDedupeKey(r) {
  if (r.docRef) return lowerKey(r.supplierName) + '|' + lowerKey(r.docRef);
  return lowerKey(r.supplierName) + '|no-ref|' + (r.docDate || 'no-date') + '|' + (r.amount == null ? 'no-amount' : r.amount);
}

function summaryMonthOf(r) {
  return String(r.docDate || r.receivedAt || '').slice(0, 7) || null;
}

function buildSummaryKey(r) {
  const month = summaryMonthOf(r);
  if (!month) return null;
  return lowerKey(r.supplierName) + '|' + month + '|' + String(r.currency || '').toUpperCase();
}

function summaryTarget(r) {
  const key = r.summaryKey || buildSummaryKey(r);
  if (!key) return null;
  return { key, supplierName: r.supplierName, supplierContactId: r.supplierContactId || null, month: summaryMonthOf(r), currency: r.currency };
}

function money(n, cur) {
  if (n == null) return '-';
  return (cur ? cur + ' ' : '') + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Rules that decide whether a (merged) cost record needs a human to look at it. */
function assessReview(r, cfg, today) {
  const reasons = [];
  if (r.amount == null) reasons.push('Amount not found');
  else if (r.amount <= 0) reasons.push('Zero or negative amount (credit note?)');
  if (!r.docRef) reasons.push('Invoice/receipt number not found - duplicate check falls back to supplier + date + amount');
  if (!r.docDate) reasons.push('Document date not found');
  else if (r.docDateSource === 'email') reasons.push('Document date not found - used email received date');
  if (!r.projectId) {
    reasons.push(r.projectCandidates && r.projectCandidates.length
      ? 'Several projects matched (' + r.projectCandidates.join(', ') + ') - pick the right one'
      : 'No project matched - add the project code (e.g. RIV-001) to the email');
  } else if (r.projectStage === 'Completed') reasons.push('Project "' + r.projectName + '" is marked Completed');
  if (r.supplierMethod === 'unknown') reasons.push('Supplier "' + r.supplierName + '" is not in Contacts (new supplier?)');
  if (r.status === 'Unknown') reasons.push('Payment status unclear - counted as unpaid');
  if (r.currency && r.currency !== cfg.baseCurrency) reasons.push('Currency is ' + r.currency + ' (not ' + cfg.baseCurrency + ')');
  if (r.amount != null && r.amount >= cfg.highValueThreshold) reasons.push('High value (>= ' + money(cfg.highValueThreshold, cfg.baseCurrency) + ') - check approval');
  if (r.status !== 'Paid' && r.dueDate && r.dueDate < today) reasons.push('Unpaid and overdue (due ' + r.dueDate + ')');
  if (r.attachmentKind === 'image') reasons.push('Photo/scanned receipt - no OCR, please check the fields manually');
  if (r.attachmentKind === 'other') reasons.push('Unsupported attachment type (' + (r.attachmentName || 'unknown') + ')');
  if (r.pdfUnreadable) reasons.push('PDF has no readable text (scanned?) - fields taken from the email only');
  if (r.attachmentTooLarge) reasons.push('Attachment larger than the Notion free-plan upload limit - not attached');
  return reasons;
}

function logLine(today, text) {
  return today + ' - ' + text;
}

function appendLog(existingLog, line) {
  const all = (existingLog ? existingLog + '\n' : '') + line;
  return all.length > 1900 ? '...' + all.slice(all.length - 1900) : all;
}

function costProperties(r, fields) {
  const P = {};
  const has = (k) => !fields || fields.includes(k);
  if (has('title')) P[COST.title] = { title: richText(r.title) };
  if (has('supplier')) P[COST.supplier] = { rich_text: richText(r.supplierName) };
  if (has('supplierContact')) P[COST.supplierContact] = { relation: r.supplierContactId ? [{ id: r.supplierContactId }] : [] };
  if (has('docRef')) P[COST.docRef] = { rich_text: richText(r.docRef) };
  if (has('docDate')) P[COST.docDate] = { date: r.docDate ? { start: r.docDate } : null };
  if (has('amount')) P[COST.amount] = { number: r.amount == null ? null : r.amount };
  if (has('currency')) P[COST.currency] = { select: r.currency ? { name: r.currency } : null };
  if (has('status')) P[COST.status] = { select: r.status ? { name: r.status } : null };
  if (has('dueDate')) P[COST.due] = { date: r.dueDate ? { start: r.dueDate } : null };
  if (has('project')) P[COST.project] = { relation: r.projectId ? [{ id: r.projectId }] : [] };
  if (has('dedupeKey')) P[COST.dedupeKey] = { rich_text: richText(r.dedupeKey) };
  if (has('summaryKey')) P[COST.summaryKey] = { rich_text: richText(r.summaryKey) };
  if (has('needsReview')) P[COST.needsReview] = { checkbox: !!r.needsReview };
  if (has('reviewReason')) P[COST.reviewReason] = { rich_text: richText(r.reviewReason) };
  if (has('sourceEmail')) P[COST.sourceEmail] = { rich_text: richText(r.sourceEmail) };
  if (has('messageId')) P[COST.messageId] = { rich_text: richText(r.messageId) };
  if (has('receivedAt')) P[COST.receivedAt] = { date: r.receivedAt ? { start: r.receivedAt } : null };
  if (has('submissions')) P[COST.submissions] = { number: r.submissions };
  if (has('updateLog')) P[COST.updateLog] = { rich_text: richText(r.updateLog) };
  return P;
}

/**
 * Decide what to do with a parsed submission.
 * @param parsed   output of the "Parse & Match" step (one document)
 * @param existingPage  Notion page with the same Dedupe Key, or null
 * @returns {{action:'create'|'update'|'duplicate', record, changes:string[], properties, recalc:string[], newReviewReasons:string[]}}
 */
function decideAction(parsed, existingPage, cfg, today) {
  const incoming = Object.assign({}, parsed);
  incoming.dedupeKey = buildDedupeKey(incoming);
  incoming.summaryKey = buildSummaryKey(incoming);

  if (!existingPage) {
    const reasons = assessReview(incoming, cfg, today);
    const record = Object.assign({}, incoming, {
      title: incoming.description || [incoming.docType, incoming.docRef, '-', incoming.supplierName].filter(Boolean).join(' '),
      needsReview: reasons.length > 0,
      reviewReason: reasons.join('; '),
      submissions: 1,
      updateLog: logLine(today, 'Created from email "' + (incoming.subject || '') + '" from ' + (incoming.fromEmail || 'unknown sender')),
    });
    return {
      action: 'create',
      record,
      changes: [],
      newReviewReasons: reasons,
      properties: costProperties(record),
      recalc: [summaryTarget(record)].filter(Boolean),
    };
  }

  const old = readCostPage(existingPage);
  if (!old.summaryKey) old.summaryKey = buildSummaryKey(old);
  const merged = Object.assign({}, old, {
    supplierMethod: parsed.supplierMethod === 'unknown' && old.supplierContactId ? 'existing' : parsed.supplierMethod,
    projectName: parsed.projectName,
    projectStage: parsed.projectStage,
    attachmentKind: parsed.attachmentKind,
    attachmentName: parsed.attachmentName,
    pdfUnreadable: parsed.pdfUnreadable,
    attachmentTooLarge: parsed.attachmentTooLarge,
    docDateSource: old.docDate ? 'document' : parsed.docDateSource,
  });
  const changes = [];
  const updateReasons = [];
  const changed = [];

  const setIf = (field, label, fmt) => {
    const nv = incoming[field];
    if (nv == null || nv === '' || nv === old[field]) return;
    changes.push(label + ': ' + (old[field] == null ? '(empty)' : fmt ? fmt(old[field]) : old[field]) + ' -> ' + (fmt ? fmt(nv) : nv));
    merged[field] = nv;
    changed.push(field);
  };

  if (incoming.amount != null && old.amount != null && incoming.amount !== old.amount) {
    updateReasons.push('Amount changed on resubmission: ' + money(old.amount) + ' -> ' + money(incoming.amount));
  }
  setIf('amount', 'Amount', (v) => money(v));
  if (incoming.currency && old.currency && incoming.currency !== old.currency && incoming.currencyMethod !== 'default') {
    updateReasons.push('Currency changed on resubmission: ' + old.currency + ' -> ' + incoming.currency);
    setIf('currency', 'Currency');
  } else if (!old.currency) setIf('currency', 'Currency');
  // A date that only came from the email (fallback) must never overwrite a recorded one.
  if (incoming.docDateSource === 'document') setIf('docDate', 'Document date');
  setIf('dueDate', 'Payment due');

  if (incoming.status && incoming.status !== 'Unknown' && incoming.status !== old.status) {
    if ((STATUS_RANK[incoming.status] || 0) >= (STATUS_RANK[old.status] || 0)) setIf('status', 'Payment status');
    else updateReasons.push('Newer document says "' + incoming.status + '" but record is "' + old.status + '" - kept "' + old.status + '"');
  }
  if (incoming.projectId && incoming.projectId !== old.projectId) {
    if (!old.projectId) { merged.projectId = incoming.projectId; changes.push('Project linked: ' + incoming.projectName); changed.push('project'); }
    else updateReasons.push('Resubmission points to a different project (' + incoming.projectName + ') - not changed');
  }
  if (!old.supplierContactId && incoming.supplierContactId) { merged.supplierContactId = incoming.supplierContactId; changed.push('supplierContact'); }

  merged.summaryKey = buildSummaryKey(merged);
  merged.submissions = (old.submissions || 1) + 1;
  merged.messageId = incoming.messageId;

  if (!changes.length && !updateReasons.length) {
    merged.updateLog = appendLog(old.updateLog, logLine(today, 'Duplicate submission ignored - no changes (' + (incoming.messageId || 'no message id') + ')'));
    return {
      action: 'duplicate',
      record: merged,
      changes: [],
      newReviewReasons: [],
      properties: costProperties(merged, ['submissions', 'updateLog', 'messageId']),
      recalc: [summaryTarget(merged)].filter(Boolean),
    };
  }

  const ruleReasons = assessReview(merged, cfg, today);
  const reasons = [...new Set([...updateReasons, ...ruleReasons])];
  merged.needsReview = old.needsReview || reasons.length > 0;
  merged.reviewReason = reasons.length
    ? reasons.join('; ')
    : old.needsReview && old.reviewReason
      ? appendLog(old.reviewReason, today + ': resubmission now passes the automatic checks - confirm and untick Needs Review')
      : old.reviewReason;
  merged.updateLog = appendLog(
    old.updateLog,
    logLine(today, 'Resubmission "' + (incoming.subject || '') + '": ' + (changes.length ? changes.join('; ') : 'no field changes') +
      (updateReasons.length ? ' | flagged: ' + updateReasons.join('; ') : ''))
  );
  return {
    action: 'update',
    record: merged,
    changes,
    newReviewReasons: reasons,
    properties: costProperties(merged, [...changed, 'summaryKey', 'needsReview', 'reviewReason', 'submissions', 'updateLog', 'messageId']),
    recalc: [summaryTarget(merged), old.summaryKey !== merged.summaryKey ? summaryTarget(old) : null].filter(Boolean),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decideAction, summaryTarget, summaryMonthOf, assessReview, buildDedupeKey, buildSummaryKey, costProperties, money, STATUS_RANK };
}
