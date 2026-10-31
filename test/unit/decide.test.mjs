import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from '../../scripts/lib-bundle.mjs';
import { scenarios, resolveEmail, pdfText, messageIdFor } from '../fixtures/scenarios.mjs';
import { ref, cfg } from '../fixtures/reference-data.mjs';

const L = loadLib();
const TODAY = '2026-11-01';

function parse(id) {
  const s = scenarios.find((x) => x.id === id);
  const { email, pdf, image } = resolveEmail(s);
  const attachment = pdf ? { fileName: pdf.fileName, kind: 'pdf', sizeBytes: 2000 } : image ? { fileName: image.fileName, kind: 'image' } : null;
  return L.prepareSubmission({ email: { ...email, messageId: messageIdFor(s) }, attachment, documentText: pdfText(pdf) }, ref, cfg);
}

// Turn the properties we would write into what Notion returns when read back.
function asPage(id, props) {
  const P = {};
  for (const [k, v] of Object.entries(props)) {
    if (v.title) P[k] = { type: 'title', title: v.title.map((t) => ({ plain_text: t.text.content })) };
    else if (v.rich_text) P[k] = { type: 'rich_text', rich_text: v.rich_text.map((t) => ({ plain_text: t.text.content })) };
    else if ('number' in v) P[k] = { type: 'number', number: v.number };
    else if ('select' in v) P[k] = { type: 'select', select: v.select };
    else if ('date' in v) P[k] = { type: 'date', date: v.date };
    else if ('checkbox' in v) P[k] = { type: 'checkbox', checkbox: v.checkbox };
    else if (v.relation) P[k] = { type: 'relation', relation: v.relation };
  }
  return { id, url: 'https://notion.so/' + id, properties: P };
}
function applyUpdate(page, props) {
  const next = asPage(page.id, props);
  return { ...page, properties: { ...page.properties, ...next.properties } };
}

test('new invoice -> create, clean record is not flagged', () => {
  const d = L.decideAction(parse('s01'), null, cfg, TODAY);
  assert.equal(d.action, 'create');
  assert.equal(d.record.dedupeKey, 'apex timber & frames|inv-78102');
  assert.equal(d.record.needsReview, false);
  assert.deepEqual(d.recalc.map((t) => t.key), ['apex timber & frames|2026-10|USD']);
});

test('same invoice again -> duplicate, only submission count/log change', () => {
  const created = L.decideAction(parse('s01'), null, cfg, TODAY);
  const page = asPage('pg1', created.properties);
  const d = L.decideAction(parse('s02'), page, cfg, TODAY);
  assert.equal(d.action, 'duplicate');
  assert.deepEqual(Object.keys(d.properties).sort(), ['Source Message ID', 'Submission Count', 'Update Log']);
  assert.equal(d.record.submissions, 2);
});

test('paid copy -> update Unpaid to Paid on the SAME record (no double count)', () => {
  const page = asPage('pg1', L.decideAction(parse('s01'), null, cfg, TODAY).properties);
  const d = L.decideAction(parse('s03'), page, cfg, TODAY);
  assert.equal(d.action, 'update');
  assert.equal(d.record.status, 'Paid');
  assert.equal(d.record.needsReview, false);
  assert.ok(d.changes.some((c) => c.startsWith('Payment status: Unpaid -> Paid')));

  // Monthly totals move from unpaid to paid; the cost still counts once.
  const updated = applyUpdate(page, d.properties);
  const before = L.computeTotals([page]);
  const after = L.computeTotals([updated]);
  assert.deepEqual([before.paid, before.unpaid, before.count], [0, 8450, 1]);
  assert.deepEqual([after.paid, after.unpaid, after.count], [8450, 0, 1]);
});

test('an older "unpaid" copy never downgrades a Paid record', () => {
  let page = asPage('pg1', L.decideAction(parse('s01'), null, cfg, TODAY).properties);
  page = applyUpdate(page, L.decideAction(parse('s03'), page, cfg, TODAY).properties);
  const d = L.decideAction(parse('s02'), page, cfg, TODAY);
  assert.equal(d.record.status, 'Paid');
  assert.equal(d.action, 'update');
  assert.ok(d.newReviewReasons.some((r) => r.includes('kept "Paid"')));
});

test('corrected invoice with a new amount -> update + flagged', () => {
  const page = asPage('pg9', L.decideAction(parse('s09'), null, cfg, TODAY).properties);
  const d = L.decideAction(parse('s10'), page, cfg, TODAY);
  assert.equal(d.action, 'update');
  assert.equal(d.record.amount, 3450);
  assert.equal(d.record.needsReview, true);
  assert.match(d.record.reviewReason, /Amount changed on resubmission: 3,200.00 -> 3,450.00/);
});

for (const s of scenarios.filter((x) => x.expect && x.expect.reviewIncludes && x.expect.action === 'create')) {
  test(`scenario ${s.id} is flagged: ${s.expect.reviewIncludes}`, () => {
    const d = L.decideAction(parse(s.id), null, cfg, TODAY);
    assert.equal(d.record.needsReview, true);
    assert.ok(d.newReviewReasons.some((r) => r.includes(s.expect.reviewIncludes)), d.newReviewReasons.join(' | '));
  });
}

test('summary totals: Paid vs Unpaid/Partially Paid/Unknown, per currency key', () => {
  const pages = [
    asPage('a', L.costProperties({ amount: 100, status: 'Paid' })),
    asPage('b', L.costProperties({ amount: 50.5, status: 'Unpaid' })),
    asPage('c', L.costProperties({ amount: 20, status: 'Partially Paid' })),
    asPage('d', L.costProperties({ amount: null, status: 'Unknown' })),
    asPage('a', L.costProperties({ amount: 100, status: 'Paid' })), // same page twice (pagination overlap) is counted once
  ];
  assert.deepEqual(L.computeTotals(pages), { paid: 100, unpaid: 70.5, total: 170.5, count: 4, unpaidCount: 2 });
});

test('notification: demo banner names the real recipients; review goes to admin + owner', () => {
  const r = parse('s05');
  const d = L.decideAction(r, null, cfg, TODAY);
  const n = L.buildNotification({ ...d, summaries: [] }, L.findPeople(d.record, ref), cfg);
  assert.equal(n.to, 'samisiam851@gmail.com');
  assert.match(n.subject, /^\[DEMO\] Needs review - /);
  assert.match(n.html, /This is a demo\./);
  assert.deepEqual(n.intendedRecipients.map((p) => p.email), ['denise@kevinbuild.co', 'kevin@kevinbuild.co']);

  const clean = L.decideAction(parse('s01'), null, cfg, TODAY);
  const n2 = L.buildNotification({ ...clean, summaries: [] }, L.findPeople(clean.record, ref), cfg);
  assert.deepEqual(n2.intendedRecipients.map((p) => p.email), ['mike@kevinbuild.co']);
  assert.equal(L.buildNotification({ action: 'duplicate', record: {}, newReviewReasons: [] }, {}, cfg).send, false);
});
