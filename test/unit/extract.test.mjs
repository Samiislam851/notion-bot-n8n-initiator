import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from '../../scripts/lib-bundle.mjs';
import { scenarios, resolveEmail, pdfText, messageIdFor } from '../fixtures/scenarios.mjs';
import { ref, cfg } from '../fixtures/reference-data.mjs';

const L = loadLib();

function parse(s) {
  const { email, pdf, image } = resolveEmail(s);
  const attachment = pdf ? { fileName: pdf.fileName, kind: 'pdf', sizeBytes: 2000 } : image ? { fileName: image.fileName, kind: 'image', sizeBytes: 30000 } : null;
  return L.prepareSubmission({ email: { ...email, messageId: messageIdFor(s) }, attachment, documentText: pdfText(pdf) }, ref, cfg);
}
const projectName = (id) => (ref.projects.find((p) => p.id === id) || {}).name || null;

test('date parsing handles US, ISO and written formats', () => {
  assert.equal(L.parseDate('10/28/2026', 'MDY'), '2026-10-28');
  assert.equal(L.parseDate('28/10/2026', 'MDY'), '2026-10-28'); // day > 12 disambiguates
  assert.equal(L.parseDate('03/04/2026', 'DMY'), '2026-04-03');
  assert.equal(L.parseDate('2026-11-02'), '2026-11-02');
  assert.equal(L.parseDate('Oct 29, 2026'), '2026-10-29');
  assert.equal(L.parseDate('27 Oct 2026'), '2026-10-27');
  assert.equal(L.parseDate('31/02/2026', 'DMY'), null);
});

test('amounts and currencies', () => {
  assert.equal(L.parseAmount('$8,450.00'), 8450);
  assert.equal(L.parseAmount('EUR 4,200.00'), 4200);
  assert.equal(L.detectCurrency('€1,200'), 'EUR');
  assert.equal(L.detectCurrency('A$300'), 'AUD');
  assert.equal(L.detectCurrency('$300'), null); // plain $ -> base currency decided by caller
});

test('subtotal is never taken as the invoice amount', () => {
  const f = L.extractFields({ documentText: 'Subtotal: $100.00\nTax: $10.00\nTotal: $110.00' }, cfg);
  assert.equal(f.amount, 110);
});

test('PDF text that arrives as one long line is still parsed', () => {
  const flat = 'APEX TIMBER & FRAMES TAX INVOICE Invoice No: INV-1 Invoice Date: 10/28/2026 Job: Riverside Home Subtotal: $10.00 Total Due: $11.00 USD Terms: Net 30';
  const f = L.extractFields({ documentText: flat }, cfg);
  assert.equal(f.docRef, 'INV-1');
  assert.equal(f.amount, 11);
  assert.equal(f.docDate, '2026-10-28');
  assert.equal(f.dueDate, '2026-11-27');
});

test('payment status rules', () => {
  const st = (t) => L.extractFields({ documentText: t }, cfg).status;
  assert.equal(st('Invoice No: A1\nTotal: $50.00\nDue Date: 11/30/2026'), 'Unpaid');
  assert.equal(st('Invoice No: A1\nInvoice Total: $50.00\nAmount Paid: $50.00\nBalance Due: $0.00'), 'Paid');
  assert.equal(st('Invoice No: A1\nInvoice Total: $50.00\nAmount Paid: $20.00\nBalance Due: $30.00'), 'Partially Paid');
  assert.equal(st('Receipt #77\nTotal $12.00'), 'Paid');
  assert.equal(st('UNPAID\nInvoice No: A1\nTotal: $50.00'), 'Unpaid');
  assert.equal(st('Quote Q-1 value 50'), 'Unknown');
});

test('project codes tolerate missing dash / leading zeros', () => {
  const rx = L.codeRegex('RIV-001');
  assert.ok(rx.test('job riv001'));
  assert.ok(rx.test('RIV 1 - roof'));
  assert.ok(!rx.test('RIV-0012'));
});

for (const s of scenarios) {
  if (!s.expect) continue;
  test(`scenario ${s.id}: ${s.title} - extraction & matching`, () => {
    const r = parse(s);
    const e = s.expect;
    if ('amount' in e) assert.equal(r.amount, e.amount, 'amount');
    if (e.currency) assert.equal(r.currency, e.currency, 'currency');
    if (e.docRef) assert.equal(r.docRef, e.docRef, 'docRef');
    if (e.status && e.action === 'create') assert.equal(r.status, e.status, 'status');
    if (e.dueDate) assert.equal(r.dueDate, e.dueDate, 'dueDate');
    if ('project' in e && e.action === 'create') assert.equal(projectName(r.projectId), e.project, 'project (' + r.projectMethod + ')');
  });
}

test('supplier matching: sender email, field employee, unknown sender', () => {
  const byId = Object.fromEntries(scenarios.map((s) => [s.id, parse(s)]));
  assert.equal(byId.s01.supplierContactId, 'c-apex');
  assert.equal(byId.s01.supplierMethod, 'sender email');
  assert.equal(byId.s04.supplierName, 'Home Depot');
  assert.equal(byId.s04.supplierMethod, 'unknown');
  assert.equal(byId.s04.submittedBy.name, 'Mike Johnson');
  assert.equal(byId.s08.supplierName, 'Lusso Stone Imports');
  assert.equal(byId.s06.projectMethod, 'purchase order');
});

// Regressions found by the edge-case suite (test/output/test-run-report.md)
test('regression e11: European number format is parsed, never silently truncated', () => {
  assert.equal(L.parseAmount('EUR 1.234,64'), 1234.64);
  assert.equal(L.parseAmount('222,64'), 222.64);
  assert.equal(L.parseAmount('1,234'), 1234);
  const f = L.extractFields({ documentText: 'Imponibile / Subtotal: EUR 1.012,00\nTotale / Total: EUR 1.234,64' }, cfg);
  assert.equal(f.amount, 1234.64);
  assert.equal(f.currency, 'EUR');
});

test('regression e22: credit note keeps its own number and is negative', () => {
  assert.equal(L.parseAmount('-$450.00'), -450);
  assert.equal(L.parseAmount('($1,200.50)'), -1200.5);
  const f = L.extractFields({ documentText: 'CREDIT NOTE\nCredit Note No: CN-2290\nApplies to Invoice: AT-INV-55120\nTotal Credit: $450.00' }, cfg);
  assert.equal(f.docRef, 'CN-2290');
  assert.equal(f.amount, -450);
});

test('regression e12: "P.O. # 1044" is a purchase order', () => {
  assert.equal(L.extractPO('P.O. # 1044'), 'PO-1044');
  assert.equal(L.extractPO('Purchase Order: PO-1036'), 'PO-1036');
});

test('regression e20: "Store #1874" is not taken as the supplier name', () => {
  const r = L.prepareSubmission({
    email: { from: 'mike@kevinbuild.co', fromName: 'Mike Johnson', subject: 'Receipt MPL-001', text: "Grabbed studs from Lowe's for the deck.", date: '2026-10-29T20:10:00Z' },
    attachment: { fileName: 'r.pdf', kind: 'pdf' },
    documentText: "LOWE'S HOME IMPROVEMENT\nStore #1874 Charlotte, NC\nTOTAL $312.47\nPAID",
  }, ref, cfg);
  assert.equal(r.supplierName, "Lowe's");
});

test('regression e34: fallback date uses the company timezone, not UTC', () => {
  const r = L.prepareSubmission({ email: { from: 'x@y.com', subject: 'Invoice X-1', text: 'Amount Due: $640.00', date: '2026-11-01T02:30:00Z' }, documentText: '' }, ref, { ...cfg, timezone: 'America/New_York' });
  assert.equal(r.docDate, '2026-10-31');
  assert.equal(r.docDateSource, 'email');
});
