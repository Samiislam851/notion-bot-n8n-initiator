// Rule-based field extraction for receipts / invoices.
// Pure functions only: this file is inlined into n8n Code nodes by scripts/build-workflow.mjs
// and unit-tested directly with node:test.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const CURRENCY_CODES = ['USD', 'AUD', 'EUR', 'GBP', 'CAD', 'NZD'];
const CURRENCY_SYMBOLS = [
  ['US$', 'USD'], ['A$', 'AUD'], ['AU$', 'AUD'], ['C$', 'CAD'], ['CA$', 'CAD'], ['NZ$', 'NZD'],
  ['€', 'EUR'], ['£', 'GBP'],
];

const DATE_PATTERN =
  '\\d{4}-\\d{1,2}-\\d{1,2}' +
  '|\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}' +
  '|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{4}' +
  '|[A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}';

// Number formats: European "1.234,56" / "222,64", US "1,234.56" / "245.10" / "4800".
const CUR_SYMBOL = '(?:US\\$|AU\\$|A\\$|CA\\$|C\\$|NZ\\$|[$€£])';
const NUMBER_PATTERN = '\\d{1,3}(?:\\.\\d{3})+,\\d{1,2}(?!\\d)|\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+,\\d{2}(?![\\d,])|\\d+(?:\\.\\d{1,2})?';
const AMOUNT_PATTERN = '(?:[A-Z]{3}\\s*)?\\(?-?\\s*' + CUR_SYMBOL + '?\\s*-?(?:' + NUMBER_PATTERN + ')\\)?(?:\\s*[A-Z]{3})?';

function cleanText(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Some PDF text extractors return a page as one long line. Re-insert breaks before
// the labels we rely on so the line-based rules still work.
function restoreLineBreaks(text) {
  const t = String(text || '');
  if ((t.match(/\n/g) || []).length >= 3 || t.length < 120) return t;
  return t.replace(
    /\s+(?=(?:Tax\s+)?Invoice\s+(?:No|Number|#|Date|Total)|Receipt\s+(?:No|Number|#|Date)|Invoice\s*#|Date\s*:|Due\s+Date|Payment\s+Due|Bill\s+To|Ship\s+To|Job\s*:|Site\s*:|Project\s*:|Purchase\s+Order|PO\s*(?:No|#|:)|Description\s*:|Sub\s*-?total|Tax\s*:|GST\s*:|Total|Amount|Balance\s+Due|Terms|Payment\s+received|Value\s*:)/gi,
    '\n'
  );
}

function escapeRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate(y, m, d) {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// dateOrder: 'MDY' (US) or 'DMY'. Only used when both numbers are <= 12.
function parseDate(str, dateOrder) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return toISODate(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return toISODate(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return toISODate(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = s.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12) return toISODate(y, b, a);
    if (b > 12) return toISODate(y, a, b);
    return dateOrder === 'DMY' ? toISODate(y, b, a) : toISODate(y, a, b);
  }
  return null;
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseAmount(str) {
  const s = String(str || '');
  const m = s.match(new RegExp(NUMBER_PATTERN));
  if (!m) return null;
  const european = /^\d{1,3}(?:\.\d{3})+,\d{1,2}$|^\d+,\d{2}$/.test(m[0]);
  const n = Number(european ? m[0].replace(/\./g, '').replace(',', '.') : m[0].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  // "-$450.00", "$-450", "(450.00)" are negative (credit notes / refunds)
  const before = s.slice(0, m.index);
  const after = s.slice(m.index + m[0].length);
  const negative = new RegExp('-\\s*' + CUR_SYMBOL + '?\\s*$').test(before) ||
    (new RegExp('\\(\\s*' + CUR_SYMBOL + '?\\s*$').test(before) && /^\s*\)/.test(after));
  return Math.round((negative ? -n : n) * 100) / 100;
}

// Detect a currency from a snippet such as "$8,450.00 USD", "€1.200", "AUD 300".
function detectCurrency(snippet) {
  const s = String(snippet || '');
  const code = s.match(new RegExp('\\b(' + CURRENCY_CODES.join('|') + ')\\b'));
  if (code) return code[1];
  for (const [sym, cur] of CURRENCY_SYMBOLS) if (s.includes(sym)) return cur;
  if (s.includes('$')) return null; // plain "$" is ambiguous -> caller applies the base currency
  return null;
}

function lines(text) {
  return cleanText(text).split('\n').map((l) => l.trim()).filter(Boolean);
}

// Find "<label> [:#-] value" on a line (value may also sit on the next line).
// labels are regex sources; returns { value, line } of the first match in priority order.
function findLabeled(text, labels, valuePattern, opts) {
  const ls = lines(text);
  const skipLine = opts && opts.skipLine;
  const sep = opts && opts.requireSep ? '\\s*[:#\\-]\\s*' : '\\s*(?:no\\.?|number|num|#)?\\s*[:#\\-]?\\s*';
  for (const label of labels) {
    const rx = new RegExp('(?:^|[^A-Za-z])(?:' + label + ')' + sep + '(.*)$', 'i');
    for (let i = 0; i < ls.length; i++) {
      if (skipLine && skipLine.test(ls[i])) continue;
      const m = ls[i].match(rx);
      if (!m) continue;
      const vrx = new RegExp(valuePattern, 'i');
      let v = m[1].match(vrx);
      if (!v && i + 1 < ls.length && !m[1].trim()) v = ls[i + 1].match(vrx);
      if (v) return { value: v[0].trim(), line: ls[i], label };
    }
  }
  return null;
}

function looksLikeDate(token) {
  return /^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(token);
}

function extractDocRef(sources) {
  const labels = [
    // 'credit note' first: a credit note usually also mentions the invoice it applies to
    'credit\\s+note', 'tax invoice', 'invoice', 'inv', 'receipt', 'rcpt', 'bill', 'statement', 'document', 'reference', 'ref',
  ];
  const token = '[A-Z0-9][A-Z0-9\\-\\/_.]*\\d[A-Z0-9\\-\\/_]*';
  for (const src of sources) {
    for (const label of labels) {
      const rx = new RegExp('(?:^|[^A-Za-z])(?:' + label + ')\\b\\.?\\s*(?:no\\.?|number|num|#)?\\s*[:#]?\\s*(' + token + ')', 'i');
      const m = String(src || '').match(rx);
      if (m && !looksLikeDate(m[1]) && !/^\d{1,2}$/.test(m[1])) return m[1].replace(/[.,;:]+$/, '').toUpperCase();
    }
  }
  // Unlabelled but obviously a reference, e.g. "INV-78102" or "CH-INV-9910".
  for (const src of sources) {
    const m = String(src || '').match(/\b(?:[A-Z]{1,4}-)?(?:INV|RCT|RCPT|REC|BILL)-?\d{3,}\b/i);
    if (m) return m[0].toUpperCase();
  }
  return null;
}

function extractPO(text) {
  const t = String(text || '');
  const m =
    t.match(/(?:\bPO\b|\bP\.O\.|\bpurchase\s+order\b)\s*(?:no\.?|number|#)?\s*[:#]?\s*((?:PO-)?[A-Z0-9]*\d[A-Z0-9\-]*)/i) ||
    t.match(/\b(PO-?\d{3,})\b/i);
  if (!m) return null;
  const v = m[1].toUpperCase();
  return v.startsWith('PO-') ? v : 'PO-' + v.replace(/^PO/, '');
}

function extractDocType(text) {
  const t = String(text || '').toLowerCase();
  if (/credit note/.test(t)) return 'Credit note';
  if (/\b(tax )?invoice\b/.test(t)) return 'Invoice';
  if (/\breceipt\b/.test(t)) return 'Receipt';
  if (/\bstatement\b/.test(t)) return 'Statement';
  return 'Document';
}

const AMOUNT_LABELS = [
  ['(?:amount|balance|total)\\s+(?:due|owing|payable)', 'due'],
  ['amount\\s+payable', 'due'],
  ['grand\\s+total', 'total'],
  ['invoice\\s+total', 'total'],
  ['total\\s+amount', 'total'],
  ['total\\s+(?:\\(?inc[a-z.]*\\)?\\s*(?:gst|tax|vat)?)', 'total'],
  ['amount\\s+paid|total\\s+paid|paid\\s+amount', 'paid'],
  ['(?<![A-Za-z])total(?!\\s*(?:ex|excl|before))', 'total'],
  ['amount', 'total'],
];

function extractAmounts(text) {
  const out = [];
  const ls = lines(text);
  for (const [label, kind] of AMOUNT_LABELS) {
    const rx = new RegExp('(?<![A-Za-z])(?:sub)?(' + label + ')[^\\n\\d$€£]{0,25}?(' + AMOUNT_PATTERN + ')', 'i');
    for (const line of ls) {
      if (/\bsub\s*-?total\b/i.test(line) && !/grand/i.test(line)) continue;
      const m = line.match(rx);
      if (!m) continue;
      const amount = parseAmount(m[2]);
      if (amount === null) continue;
      out.push({ amount, kind, currency: detectCurrency(m[2]) || detectCurrency(line), line });
    }
  }
  return out;
}

// Fallback for short, unstructured emails: "Home Depot receipt #4471 $245.10".
function extractLooseAmount(text) {
  const rx = /(?:US\$|AU\$|A\$|CA\$|C\$|NZ\$|[$€£])\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|\b(\d{1,3}(?:,\d{3})+(?:\.\d{2})|\d+\.\d{2})\s*(USD|AUD|EUR|GBP|CAD|NZD)\b|\b(USD|AUD|EUR|GBP|CAD|NZD)\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  const found = new Map();
  let m;
  while ((m = rx.exec(String(text || '')))) {
    const amount = parseAmount(m[1] || m[2] || m[5]);
    if (amount === null) continue;
    found.set(amount, detectCurrency(m[0]));
  }
  if (found.size !== 1) return null;
  const [[amount, currency]] = [...found.entries()];
  return { amount, currency, kind: 'loose' };
}

function extractStatus(text, amounts) {
  const t = String(text || '');
  const dueZero = amounts.find((a) => a.kind === 'due' && a.amount === 0);
  const duePositive = amounts.find((a) => a.kind === 'due' && a.amount > 0);
  const paidPositive = amounts.find((a) => a.kind === 'paid' && a.amount > 0);
  if (/\b(unpaid|not\s+paid|overdue|outstanding|awaiting\s+payment)\b/i.test(t) && !dueZero) {
    return paidPositive ? 'Partially Paid' : 'Unpaid';
  }
  if (/\b(partial(ly)?\s+paid|part\s+payment|partial\s+payment|deposit\s+paid)\b/i.test(t)) return 'Partially Paid';
  if (paidPositive && duePositive) return 'Partially Paid';
  if (dueZero) return 'Paid';
  if (/\b(paid\s+in\s+full|payment\s+received|thank\s+you\s+for\s+your\s+payment|status\s*:\s*paid|paid\s+(?:by|on|with|via)\s+(?:the\s+)?(?:company\s+)?(?:card|credit\s+card|cash|cheque|check|eftpos|visa|mastercard|amex|wire|transfer|bank\s+transfer))\b/i.test(t)) return 'Paid';
  if (/(^|\n)\s*\**\s*PAID\s*\**\s*($|\n)/.test(t)) return 'Paid'; // a "PAID" stamp on its own line
  if (paidPositive) return 'Paid';
  if (duePositive || /\b(due\s+date|payment\s+due|please\s+pay|net\s*\d{1,3}|due\s+on\s+receipt|remit\s+to)\b/i.test(t)) return 'Unpaid';
  if (/\breceipt\b/i.test(t) && !/\binvoice\b/i.test(t)) return 'Paid'; // a plain receipt is proof of payment
  return 'Unknown';
}

function extractDates(text, dateOrder) {
  const dueLine = /\b(due|pay\s+by|payable\s+by|expires?)\b/i;
  const docLabel = findLabeled(
    text,
    ['invoice\\s+date', 'receipt\\s+date', 'date\\s+of\\s+issue', 'issue\\s+date', 'issued(?:\\s+on)?', 'tax\\s+date', 'transaction\\s+date', 'date'],
    DATE_PATTERN,
    { skipLine: dueLine }
  );
  let docDate = docLabel ? parseDate(docLabel.value, dateOrder) : null;
  if (!docDate) {
    for (const line of lines(text)) {
      if (dueLine.test(line)) continue;
      const m = line.match(new RegExp(DATE_PATTERN));
      if (m && (docDate = parseDate(m[0], dateOrder))) break;
    }
  }
  const dueLabel = findLabeled(text, ['payment\\s+due(?:\\s+date)?', 'due\\s+date', 'due\\s+by', 'pay\\s+by', 'payable\\s+by', 'due'], DATE_PATTERN);
  let dueDate = dueLabel ? parseDate(dueLabel.value, dateOrder) : null;
  let dueSource = dueDate ? 'document' : null;
  if (!dueDate && docDate) {
    const net = String(text || '').match(/\bnet\s*(\d{1,3})\b/i) || String(text || '').match(/\b(\d{1,3})\s+days?\s+(?:from|after)\s+(?:invoice|date)/i);
    if (net) { dueDate = addDays(docDate, +net[1]); dueSource = 'terms'; }
    else if (/\bdue\s+on\s+receipt\b/i.test(text)) { dueDate = docDate; dueSource = 'terms'; }
  }
  return { docDate, dueDate, dueSource };
}

function extractLabeledSupplier(text) {
  const hit = findLabeled(text, ['supplier', 'vendor', 'merchant', 'sold\\s+by', 'from'], '[A-Za-z0-9&][^\\n]{1,60}', { requireSep: true });
  return hit ? hit.value.replace(/\s{2,}.*/, '').trim() : null;
}

function extractDescription(text) {
  const hit = findLabeled(text, ['description'], '[A-Za-z0-9][^\\n]{2,80}', { requireSep: true });
  return hit ? hit.value.trim() : null;
}

/**
 * Main entry point.
 * @param {{subject:string, body:string, documentText:string}} input
 * @param {{baseCurrency:string, dateOrder:string}} cfg
 */
function extractFields(input, cfg) {
  const subject = cleanText(input.subject);
  const body = cleanText(input.body);
  const doc = cleanText(restoreLineBreaks(input.documentText));
  // Document text is the primary source; the email body/subject fill gaps.
  const primary = doc || body;
  const all = [doc, subject, body].filter(Boolean).join('\n');

  const docRef = extractDocRef([doc, subject, body]);
  let amounts = extractAmounts(primary);
  if (!amounts.length && doc) amounts = extractAmounts(body);
  // Pick the amount: prefer the invoice total; if only "balance due 0" exists, fall back to the paid/total line.
  let chosen =
    amounts.find((a) => a.kind === 'total' && a.amount > 0) ||
    amounts.find((a) => a.kind === 'due' && a.amount > 0) ||
    amounts.find((a) => a.kind === 'paid' && a.amount > 0) ||
    amounts.find((a) => a.kind === 'total' && a.amount < 0) ||
    null;
  let amountMethod = chosen ? 'labelled' : null;
  if (!chosen) {
    chosen = extractLooseAmount(primary) || extractLooseAmount(all);
    if (chosen) amountMethod = 'unlabelled';
  }

  let currency = (chosen && chosen.currency) || null;
  let currencyMethod = currency ? 'amount' : null;
  if (!currency) {
    const c = String(all).match(/\bcurrency\s*[:\-]?\s*([A-Z]{3})\b/i);
    if (c) { currency = c[1].toUpperCase(); currencyMethod = 'label'; }
  }
  if (!currency) {
    const codes = new Set((all.match(new RegExp('\\b(' + CURRENCY_CODES.join('|') + ')\\b', 'g')) || []));
    if (codes.size === 1) { currency = [...codes][0]; currencyMethod = 'text'; }
  }
  if (!currency) { currency = cfg.baseCurrency; currencyMethod = 'default'; }

  const { docDate, dueDate, dueSource } = extractDates(primary, cfg.dateOrder);
  const status = extractStatus(all, amounts);
  const docType = extractDocType(doc || subject + '\n' + body);
  // A credit note reduces what is owed even when printed without a minus sign.
  if (docType === 'Credit note' && chosen && chosen.amount > 0) chosen = Object.assign({}, chosen, { amount: -chosen.amount });

  return {
    docRef,
    docType,
    poNumber: extractPO(all),
    amount: chosen ? chosen.amount : null,
    amountMethod,
    currency,
    currencyMethod,
    status,
    docDate,
    dueDate,
    dueSource,
    labeledSupplier: extractLabeledSupplier(doc || body),
    description: extractDescription(doc) || null,
    firstLine: lines(doc)[0] || null,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractFields, parseDate, parseAmount, detectCurrency, extractDocRef, extractStatus, extractAmounts, extractPO, cleanText, escapeRx, addDays };
}
