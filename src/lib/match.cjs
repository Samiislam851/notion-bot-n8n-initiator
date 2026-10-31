// Matching an extracted document to a Supplier (Contacts) and a Project.
// Pure functions; inlined into n8n Code nodes and unit-tested.

const GENERIC_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com',
  'aol.com', 'proton.me', 'protonmail.com', 'example.com',
];
const GENERIC_PROJECT_WORDS = [
  'home', 'house', 'residence', 'development', 'renovation', 'extension', 'fit', 'out', 'fitout', 'cafe', 'café',
  'project', 'build', 'new', 'the', 'and', 'street', 'court', 'view', 'job', 'site',
];
const ADDRESS_ABBREVIATIONS = [
  [/\bdrive\b/g, 'dr'], [/\bstreet\b/g, 'st'], [/\bavenue\b/g, 'ave'], [/\broad\b/g, 'rd'], [/\bcourt\b/g, 'ct'],
  [/\bplace\b/g, 'pl'], [/\blane\b/g, 'ln'], [/\bboulevard\b/g, 'blvd'],
];

function normalizeText(s) {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const [rx, short] of ADDRESS_ABBREVIATIONS) t = t.replace(rx, short);
  return t;
}

function containsPhrase(haystackNorm, phrase) {
  const p = normalizeText(phrase);
  if (!p) return -1;
  const idx = (' ' + haystackNorm + ' ').indexOf(' ' + p + ' ');
  return idx;
}

function emailDomain(email) {
  const m = String(email || '').toLowerCase().match(/@([a-z0-9.\-]+)$/);
  return m ? m[1] : null;
}

/**
 * contacts: [{id, name, company, email, type}] (suppliers / subcontractors only)
 * employees: [{id, name, email, role}]
 */
function matchSupplier(input, contacts, employees, cfg) {
  const fromEmail = String(input.fromEmail || '').toLowerCase();
  const domain = emailDomain(fromEmail);
  const internal = !!domain && domain === String(cfg.companyDomain || '').toLowerCase();
  const submittedBy = internal ? employees.find((e) => String(e.email || '').toLowerCase() === fromEmail) || null : null;

  const result = (contact, method) => ({
    contactId: contact ? contact.id : null,
    name: contact ? contact.name : null,
    method,
    internalSender: internal,
    submittedBy: submittedBy ? { id: submittedBy.id, name: submittedBy.name, email: submittedBy.email } : null,
  });

  if (!internal && fromEmail) {
    const exact = contacts.find((c) => String(c.email || '').toLowerCase() === fromEmail);
    if (exact) return result(exact, 'sender email');
    const generic = (cfg.genericDomains || GENERIC_EMAIL_DOMAINS).includes(domain);
    if (domain && !generic) {
      const byDomain = contacts.filter((c) => emailDomain(c.email) === domain);
      if (byDomain.length === 1) return result(byDomain[0], 'sender domain');
    }
  }

  // Look for a known supplier name in the document (document text first, then email).
  const docNorm = normalizeText(input.documentText);
  const restNorm = normalizeText([input.labeledSupplier, input.subject, input.body, internal ? '' : input.fromName].join(' '));
  for (const [hay, method] of [[normalizeText(input.labeledSupplier), 'supplier label'], [docNorm, 'document text'], [restNorm, 'email text']]) {
    if (!hay) continue;
    let best = null;
    for (const c of contacts) {
      for (const n of [c.name, c.company]) {
        if (!n || normalizeText(n).length < 4) continue;
        const idx = containsPhrase(hay, n);
        if (idx >= 0 && (!best || idx < best.idx)) best = { idx, c };
      }
    }
    if (best) return result(best.c, method);
  }

  // Unknown supplier: best-effort name so the record is still useful, flagged for review.
  const unknown = result(null, 'unknown');
  unknown.name =
    input.labeledSupplier ||
    merchantFromText(input.body) ||
    (!internal && input.fromName ? input.fromName : null) ||
    input.firstLine ||
    (!internal && domain ? domain : null) ||
    'Unknown supplier';
  unknown.name = String(unknown.name).slice(0, 80).trim();
  return unknown;
}

// "Picked up fixings at Home Depot for the Skyline job" -> "Home Depot"
function merchantFromText(text) {
  const m = String(text || '').match(/\b(?:at|from)\s+([A-Z][A-Za-z0-9&'.\-]*(?:\s+(?:&\s+)?[A-Z][A-Za-z0-9&'.\-]*){0,3})/);
  if (!m) return null;
  const name = m[1].trim();
  if (/^(Kevin|The|Site|Job|Project)\b/.test(name)) return null;
  return name;
}

function codeRegex(code) {
  const m = String(code || '').toUpperCase().match(/^([A-Z]+)[\s\-]?(\d+)$/);
  if (!m) return new RegExp('\\b' + String(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  return new RegExp('\\b' + m[1] + '[\\s\\-]?0*' + String(+m[2]) + '\\b', 'i');
}

function distinctiveWord(name, allProjects) {
  const words = normalizeText(name).split(' ').filter((w) => w.length >= 4 && !GENERIC_PROJECT_WORDS.includes(w));
  const w = words[0];
  if (!w) return null;
  const clash = allProjects.filter((p) => normalizeText(p.name).split(' ').includes(w));
  return clash.length === 1 ? w : null;
}

/**
 * projects: [{id, name, code, address, stage, pmId}]
 * orders:   [{id, po, projectId}]
 * Returns the strongest match tier; ambiguous if >1 project at that tier.
 */
function matchProject(input, projects, orders) {
  const raw = [input.subject, input.body, input.documentText].join('\n');
  const norm = normalizeText(raw);
  const tiers = [
    ['project code', (p) => p.code && codeRegex(p.code).test(raw)],
    ['purchase order', (p) => input.poNumber && orders.some((o) => o.po && o.po.toUpperCase() === input.poNumber && o.projectId === p.id)],
    ['project name', (p) => containsPhrase(norm, p.name) >= 0],
    ['site address', (p) => p.address && containsPhrase(norm, p.address) >= 0],
    ['project keyword', (p) => { const w = distinctiveWord(p.name, projects); return !!w && containsPhrase(norm, w) >= 0; }],
  ];
  for (const [method, test] of tiers) {
    const hits = projects.filter(test);
    if (hits.length === 1) return { project: hits[0], method, candidates: [] };
    if (hits.length > 1) return { project: null, method: 'ambiguous (' + method + ')', candidates: hits.map((h) => h.name) };
  }
  return { project: null, method: 'none', candidates: [] };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { matchSupplier, matchProject, merchantFromText, normalizeText, emailDomain, codeRegex };
}
