// Sends test scenarios to the live n8n webhook, one at a time, and checks each
// result against the scenario's expectation.
//
//   npm run scenarios                       # base suite (test/fixtures/scenarios.mjs)
//   npm run scenarios -- s01 s02            # selected ones
//   npm run scenarios -- --suite edge       # edge-case suite (test/fixtures/edge-scenarios.mjs)
//   npm run scenarios -- --suite edge e03   # one edge case
//
// Scenario format (see test/fixtures/SCENARIO-FORMAT.md for the full reference):
//   { id, title, sameAs?, email:{from,fromName,subject,text,html,date}, pdf?, image?, attachments?, expect }
//   expect: an object checked against results[0], or an array checked against results[i].
//
// Writes test/output/<suite>-report.md and the generated files to test/output/files/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { TEST_INBOX } from '../test/fixtures/scenarios.mjs';
import { makePdf, makePng } from '../test/fixtures/make-files.mjs';

const BASE = (process.env.N8N_BASE_URL || 'http://localhost:5678').replace(/\/$/, '');
const URL_ = process.env.INTAKE_WEBHOOK_URL || BASE + '/webhook/cost-intake';
const out = new URL('../test/output/', import.meta.url);
mkdirSync(new URL('files/', out), { recursive: true });

const args = process.argv.slice(2);
const suiteIdx = args.indexOf('--suite');
const suite = suiteIdx >= 0 ? args[suiteIdx + 1] : 'base';
const only = suiteIdx >= 0 ? args.filter((a, i) => i !== suiteIdx && i !== suiteIdx + 1) : args;
const mod = await import(suite === 'base' ? '../test/fixtures/scenarios.mjs' : `../test/fixtures/${suite}-scenarios.mjs`);
const all = mod.scenarios;
const list = only.length ? all.filter((s) => only.includes(s.id)) : all;

const messageIdFor = (s) => (s.messageId !== undefined ? s.messageId : `<demo-${s.id}@cost-intake.test>`);

function resolve(s) {
  const base = s.sameAs ? all.find((x) => x.id === s.sameAs) : null;
  if (s.sameAs && !base) throw new Error(`${s.id}: sameAs "${s.sameAs}" not found`);
  const email = Object.assign({}, base ? base.email : {}, s.email);
  const pdf = s.pdf !== undefined ? s.pdf : base && base.pdf;
  const image = s.image !== undefined ? s.image : base && base.image;
  const attachments = s.attachments !== undefined ? s.attachments : base && base.attachments;
  return { email, pdf, image, attachments: attachments || [] };
}

function fileFor(a) {
  // a: { fileName, mimeType?, pdfLines? | png? | text? | bytes? (size of junk file) }
  let buf, mimeType = a.mimeType;
  if (a.pdfLines) { buf = makePdf(a.pdfLines); mimeType = mimeType || 'application/pdf'; }
  else if (a.png) { buf = makePng(a.width, a.height); mimeType = mimeType || 'image/png'; }
  else if (a.text !== undefined) { buf = Buffer.from(String(a.text)); mimeType = mimeType || 'application/octet-stream'; }
  else if (a.bytes) { buf = Buffer.alloc(a.bytes, 0x41); mimeType = mimeType || 'application/octet-stream'; }
  else throw new Error('attachment needs pdfLines, png, text or bytes: ' + JSON.stringify(a));
  writeFileSync(new URL('files/' + a.fileName.replace(/[\/\\]/g, '_'), out), buf);
  return { fileName: a.fileName, mimeType, base64: buf.toString('base64') };
}

function payloadFor(s) {
  const { email, pdf, image, attachments } = resolve(s);
  const files = [];
  if (pdf) files.push(fileFor({ fileName: pdf.fileName, pdfLines: pdf.lines }));
  if (image) files.push(fileFor({ fileName: image.fileName, png: true }));
  for (const a of attachments) files.push(fileFor(a));
  const payload = { ...email, to: TEST_INBOX, attachments: files };
  const mid = messageIdFor(s);
  if (mid !== null) payload.messageId = mid;
  return payload;
}

const SPECIAL = new Set(['reviewIncludes', 'reviewExcludes', 'changesIncludes', 'notify', 'resultsCount']);
function checkOne(e, r, label) {
  const fails = [];
  if (!r) return [`${label}: no result returned`];
  for (const [k, v] of Object.entries(e)) {
    if (SPECIAL.has(k)) continue;
    if (JSON.stringify(r[k]) !== JSON.stringify(v)) fails.push(`${label}${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(r[k])}`);
  }
  const reasons = r.reviewReasons || [];
  for (const inc of [].concat(e.reviewIncludes || [])) if (!reasons.some((x) => x.includes(inc))) fails.push(`${label}review reasons should include "${inc}" (got: ${reasons.join(' | ') || 'none'})`);
  for (const exc of [].concat(e.reviewExcludes || [])) if (reasons.some((x) => x.includes(exc))) fails.push(`${label}review reasons should NOT include "${exc}"`);
  for (const inc of [].concat(e.changesIncludes || [])) if (!(r.changes || []).some((x) => x.includes(inc))) fails.push(`${label}changes should include "${inc}" (got: ${(r.changes || []).join(' | ') || 'none'})`);
  if ('notify' in e) {
    const intended = !!(r.notification && r.notification.subject);
    if (intended !== e.notify) fails.push(`${label}notify: expected ${e.notify}, got ${intended}`);
  }
  return fails;
}

function check(s, body) {
  const results = body.results || [];
  const e = s.expect || {};
  if (Array.isArray(e)) {
    const fails = [];
    if (results.length !== e.length) fails.push(`expected ${e.length} result(s), got ${results.length}`);
    e.forEach((x, i) => fails.push(...checkOne(x, results[i], `[doc ${i}] `)));
    return fails;
  }
  const fails = [];
  if ('resultsCount' in e && results.length !== e.resultsCount) fails.push(`expected ${e.resultsCount} result(s), got ${results.length}`);
  if (e.resultsCount === 0) return fails;
  return fails.concat(checkOne(e, results[0], ''));
}

const rows = [];
let failed = 0;
for (const s of list) {
  const t0 = Date.now();
  let res, body;
  try {
    res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadFor(s)) });
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  } catch (err) {
    body = { error: String(err) };
  }
  const fails = res && res.ok ? check(s, body) : [`HTTP ${res ? res.status : 'error'}: ${JSON.stringify(body).slice(0, 300)}`];
  if (fails.length) failed++;
  const ms = Date.now() - t0;
  const results = body.results || [];
  console.log(`${fails.length ? 'FAIL' : 'PASS'} ${s.id} ${s.title} (${ms} ms)`);
  for (const r of results) {
    console.log(`     -> ${r.action || '?'} | ${r.supplier || '?'} | ${r.docRef || '-'} | ${r.amount ?? '-'} ${r.currency || ''} | ${r.status || '-'} | doc ${r.docDate || '-'} due ${r.dueDate || '-'} | ${r.project || 'no project'} | subs ${r.submissions ?? '-'} | review: ${r.needsReview ? (r.reviewReasons || []).join('; ') : 'no'}`);
    if (r.changes && r.changes.length) console.log(`        changes: ${r.changes.join('; ')}`);
  }
  if (!results.length) console.log(`     -> no results: ${JSON.stringify(body).slice(0, 200)}`);
  for (const f of fails) console.log('     x ' + f);
  rows.push({ s, results, fails, ms });
}

const md = [
  `# Scenario test report – ${suite} suite`,
  '',
  `Run: ${new Date().toISOString()} against \`${URL_}\``,
  '',
  `**${list.length - failed}/${list.length} scenarios passed.**`,
  '',
  '| # | Scenario | Result | Action | Supplier | Ref | Amount | Status | Project | Needs review | ms |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(({ s, results, fails, ms }) => {
    const r = results[0] || {};
    const cell = (x) => String(x ?? '').replace(/\|/g, '/');
    return `| ${s.id} | ${cell(s.title)} | ${fails.length ? 'FAIL: ' + cell(fails.join('; ')) : 'PASS'} | ${cell(results.map((x) => x.action).join(', '))} | ${cell(r.supplier)} | ${cell(r.docRef)} | ${cell(r.amount)} ${cell(r.currency)} | ${cell(r.status)} | ${cell(r.project)} | ${r.needsReview ? cell((r.reviewReasons || []).join('; ')) : 'no'} | ${ms} |`;
  }),
  '',
];
writeFileSync(new URL(`${suite === 'base' ? 'scenario' : suite}-report.md`, out), md.join('\n'));
console.log(`\n${list.length - failed}/${list.length} passed - report: test/output/${suite === 'base' ? 'scenario' : suite}-report.md`);
process.exit(failed ? 1 : 0);
