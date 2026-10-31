// Small helpers for reading/writing Notion page properties (API version 2022-06-28).

const COST = {
  title: 'Description',
  supplier: 'Supplier',
  supplierContact: 'Supplier Contact',
  docRef: 'Document Ref',
  docDate: 'Document Date',
  amount: 'Amount',
  currency: 'Currency',
  status: 'Payment Status',
  due: 'Payment Due',
  project: 'Project',
  document: 'Document',
  dedupeKey: 'Dedupe Key',
  summaryKey: 'Summary Key',
  needsReview: 'Needs Review',
  reviewReason: 'Review Reason',
  sourceEmail: 'Source Email',
  messageId: 'Source Message ID',
  receivedAt: 'Received At',
  submissions: 'Submission Count',
  updateLog: 'Update Log',
};

function richText(text) {
  const s = String(text == null ? '' : text);
  if (!s) return [];
  const chunks = [];
  for (let i = 0; i < s.length && chunks.length < 50; i += 2000) chunks.push({ type: 'text', text: { content: s.slice(i, i + 2000) } });
  return chunks;
}

function readProp(p) {
  if (!p) return null;
  switch (p.type) {
    case 'title':
    case 'rich_text':
      return p[p.type].map((t) => t.plain_text).join('') || null;
    case 'select':
    case 'status':
      return p[p.type] ? p[p.type].name : null;
    case 'number':
      return p.number;
    case 'email':
      return p.email;
    case 'phone_number':
      return p.phone_number;
    case 'checkbox':
      return p.checkbox;
    case 'date':
      return p.date ? p.date.start : null;
    case 'relation':
      return p.relation.map((r) => r.id);
    case 'files':
      return p.files.map((f) => f.name);
    case 'formula':
      return p.formula[p.formula.type];
    default:
      return null;
  }
}

function readCostPage(page) {
  const P = page.properties || {};
  const g = (k) => readProp(P[COST[k]]);
  return {
    id: page.id,
    url: page.url,
    title: g('title'),
    supplierName: g('supplier'),
    supplierContactId: (g('supplierContact') || [])[0] || null,
    docRef: g('docRef'),
    docDate: g('docDate'),
    amount: g('amount'),
    currency: g('currency'),
    status: g('status'),
    dueDate: g('due'),
    projectId: (g('project') || [])[0] || null,
    dedupeKey: g('dedupeKey'),
    summaryKey: g('summaryKey'),
    needsReview: !!g('needsReview'),
    reviewReason: g('reviewReason'),
    updateLog: g('updateLog'),
    submissions: g('submissions') || 1,
    receivedAt: g('receivedAt'),
  };
}

function flattenQueryResults(items) {
  const out = [];
  for (const it of items) {
    const j = it && it.json ? it.json : it;
    if (j && Array.isArray(j.results)) out.push(...j.results);
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COST, richText, readProp, readCostPage, flattenQueryResults };
}
