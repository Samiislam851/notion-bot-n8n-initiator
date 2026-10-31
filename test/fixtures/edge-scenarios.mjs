// Edge-case suite for the cost intake workflow (run with `npm run scenarios -- --suite edge`).
//
// Runs IN ORDER after `npm run reset:demo` (+ optionally the base suite). Chains inside this
// suite (create -> resubmit) are intentional; nothing here depends on base-suite records.
// Every document ref used here is unique to this file.
//
// `expect` states the CORRECT behaviour per the requirements and README / N8N-WORKFLOW.md.
// Where the current rules are believed to deviate, the scenario carries `knownRisk`.

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const SPARKS = { from: 'sparks.electrical@example.com', fromName: 'Sparks Electrical Accounts' };
const READYMIX = { from: 'readymix.concrete@example.com', fromName: 'ReadyMix Concrete' };
const BUILDMART = { from: 'buildmart.supplies@example.com', fromName: 'BuildMart Accounts' };
const COASTHIRE = { from: 'coasthire.equipment@example.com', fromName: 'CoastHire Equipment' };
const APEX = { from: 'apex.timber.frames@example.com', fromName: 'Apex Timber Accounts' };

const SE_3150_LINES = (due, project) => [
  '#SPARKS ELECTRICAL', 'Licence EC 40921', '#TAX INVOICE', 'Invoice No: SE-INV-3150', 'Invoice Date: 2026-10-19',
  'Project: ' + project, 'Description: Level 3 lighting install', 'Labour 64 hrs US$ 6,400.00', 'Materials US$ 2,700.00',
  'Subtotal: US$ 9,100.00', 'Tax (10%): US$ 910.00', 'Grand Total: US$ 10,010.00', 'Due Date: ' + due,
];

const LOWES_RECEIPT = {
  fileName: 'lowes-receipt-1029.pdf',
  lines: [
    "#LOWE'S HOME IMPROVEMENT", 'Store #1874 Charlotte, NC', '10/29/2026 3:42 PM', '2x4x8 KD stud x 24 $95.76',
    'Deck screws 5lb x 3 $107.94', 'Joist hangers x 20 $86.60', 'Sales Tax $22.17', 'TOTAL $312.47', 'VISA ****4410', 'PAID',
  ],
};

export const scenarios = [
  // ---------------------------------------------------------------- email structure
  {
    id: 'e01',
    title: 'One email, two invoice PDFs (same supplier, same month, different jobs)',
    category: 'email structure',
    rationale: 'Suppliers often batch invoices. Each PDF must become its own cost with its own project; the loop must process them one at a time so the shared BuildMart Oct-2026 summary row is not clobbered.',
    email: {
      ...BUILDMART, subject: 'Invoices INV-BM-6101 and INV-BM-6102', date: '2026-10-16T08:30:00Z',
      text: 'Hi team,\n\nTwo invoices attached, one per job.\n\nBuildMart Accounts',
    },
    attachments: [
      { fileName: 'BuildMart-INV-BM-6101.pdf', pdfLines: ['#BUILDMART SUPPLIES', '#INVOICE', 'Invoice Number: INV-BM-6101', 'Date: 10/14/2026', 'Deliver to: SKY-001 Skyline Development', 'Description: Fire-rated plasterboard', 'Total: $640.00', 'Due Date: 12/14/2026'] },
      { fileName: 'BuildMart-INV-BM-6102.pdf', pdfLines: ['#BUILDMART SUPPLIES', '#INVOICE', 'Invoice Number: INV-BM-6102', 'Date: 10/15/2026', 'Deliver to: RIV-001 Riverside Home', 'Description: Insulation batts R2.5', 'Total: $1,215.50', 'Due Date: 12/15/2026'] },
    ],
    expect: [
      { action: 'create', file: 'BuildMart-INV-BM-6101.pdf', docRef: 'INV-BM-6101', amount: 640, project: 'Skyline Development', needsReview: false, notify: true },
      { action: 'create', file: 'BuildMart-INV-BM-6102.pdf', docRef: 'INV-BM-6102', amount: 1215.5, project: 'Riverside Home', needsReview: false, notify: true },
    ],
  },
  {
    id: 'e02',
    title: 'HTML-only email (no plain text) with an inline signature logo',
    category: 'email structure',
    rationale: 'Many accounting systems send HTML-only invoices with an inline logo (image001.png). The body must be read from HTML, and the tiny logo must not become a second "photo receipt" document.',
    email: {
      ...APEX, subject: 'Invoice AT-INV-55120 - Oak Street', date: '2026-10-22T10:15:00Z', text: '',
      html: '<div><p>Hi Kevin Build team,</p><p>Please see invoice details below.</p><table>' +
        '<tr><td>Invoice No:</td><td>AT-INV-55120</td></tr><tr><td>Invoice Date:</td><td>10/22/2026</td></tr>' +
        '<tr><td>Job:</td><td>OAK-001, 142 Oak St</td></tr><tr><td>Description:</td><td>Wall frames &amp; lintels</td></tr>' +
        '<tr><td>Total Due:</td><td>$3,980.00</td></tr><tr><td>Due Date:</td><td>12/06/2026</td></tr></table>' +
        '<p>Regards,<br>Apex Timber &amp; Frames</p><img src="cid:image001.png"></div>',
    },
    attachments: [{ fileName: 'image001.png', png: true, width: 120, height: 40 }],
    expect: {
      resultsCount: 1, file: null, action: 'create', docRef: 'AT-INV-55120', amount: 3980, docDate: '2026-10-22', dueDate: '2026-12-06',
      status: 'Unpaid', project: 'Oak Street Residence', needsReview: false, reviewExcludes: 'Photo/scanned receipt', notify: true,
    },
  },
  {
    id: 'e03',
    title: 'Only attachment is a .docx; invoice details in the body; project code written "oak 1"',
    category: 'email structure / matching',
    rationale: 'Word attachments cannot be parsed or attached as a receipt; the cost should still be recorded from the body and flagged. Also checks the loose project-code form "oak 1".',
    email: {
      ...SPARKS, subject: 'Invoice SE-INV-3090 - oak 1 rough-in', date: '2026-10-21T14:00:00Z',
      text: 'Hi, invoice attached as a Word document.\n\nInvoice No: SE-INV-3090\nInvoice Date: 10/21/2026\nAmount Due: $2,180.00\nDue Date: 12/05/2026\n\nSparks Electrical',
    },
    attachments: [{ fileName: 'SE-INV-3090.docx', mimeType: DOCX, text: 'PK\u0003\u0004 word/document.xml junk' }],
    expect: {
      action: 'create', docRef: 'SE-INV-3090', amount: 2180, docDate: '2026-10-21', project: 'Oak Street Residence',
      needsReview: true, reviewIncludes: 'Unsupported attachment type',
    },
  },
  {
    id: 'e04',
    title: 'Invoice PDF + .xlsx timesheet in one email - the spreadsheet must not corrupt the cost',
    category: 'email structure / duplicates',
    rationale: 'The second attachment produces a body-only document whose ref (from the subject) equals the PDF invoice. It must not double count, and it must not overwrite the invoice date (10/20) with the email received date (10/27).',
    knownRisk: 'Doc 1 has no document date, so prepareSubmission falls back to the email date; decideAction.setIf("docDate") treats that as a real change -> UPDATE that moves Document date to 2026-10-27.',
    email: {
      ...COASTHIRE, subject: 'CH-INV-10388 excavator hire + timesheet', date: '2026-10-27T09:40:00Z',
      text: 'Invoice and the operator timesheet attached.',
    },
    attachments: [
      { fileName: 'CoastHire-CH-INV-10388.pdf', pdfLines: ['#COASTHIRE EQUIPMENT', '#TAX INVOICE', 'Invoice No: CH-INV-10388', 'Invoice Date: 10/20/2026', 'Site: 4 Harbour Rd', 'Description: 5t excavator hire 5 days', 'Amount Due: $2,890.00', 'Due Date: 12/04/2026'] },
      { fileName: 'CH-INV-10388-timesheet.xlsx', mimeType: XLSX, text: 'PK\u0003\u0004 xl/worksheets/sheet1.xml junk' },
    ],
    expect: [
      { action: 'create', file: 'CoastHire-CH-INV-10388.pdf', docRef: 'CH-INV-10388', amount: 2890, docDate: '2026-10-20', project: 'Harbour View Renovation' },
      { file: 'CH-INV-10388-timesheet.xlsx', docRef: 'CH-INV-10388', amount: 2890, docDate: '2026-10-20', dueDate: '2026-12-04', reviewExcludes: 'Amount changed' },
    ],
  },
  {
    id: 'e05',
    title: 'Email with no Message-ID (body-only invoice)',
    category: 'email structure',
    rationale: 'Some forwarders/mobile clients drop Message-ID. The workflow must still create the cost (submissionId falls back to the subject). e06 re-sends it with a demo Message-ID so reset:demo can clean it up.',
    messageId: null,
    email: {
      ...SPARKS, subject: 'Invoice SE-INV-3104 - RIV-001 temp power', date: '2026-10-30T12:00:00Z',
      text: 'Invoice No: SE-INV-3104\nInvoice Date: 10/30/2026\nDescription: Temporary power board hire\nAmount Due: $1,760.00\nDue Date: 12/14/2026\n\nThanks,\nSparks Electrical',
    },
    expect: { action: 'create', docRef: 'SE-INV-3104', amount: 1760, status: 'Unpaid', project: 'Riverside Home', needsReview: false, notify: true },
  },
  {
    id: 'e06',
    title: 'Same body-only invoice forwarded again with a new subject and Message-ID',
    category: 'duplicates / notifications',
    rationale: 'Identical content, new envelope: must be a duplicate (count +1), no email sent.',
    sameAs: 'e05',
    email: { subject: 'FW: Invoice SE-INV-3104 - RIV-001 temp power', date: '2026-10-31T08:05:00Z' },
    expect: { action: 'duplicate', docRef: 'SE-INV-3104', submissions: 2, notify: false },
  },
  {
    id: 'e07',
    title: 'Scanned PDF larger than 5 MB (Notion free-plan limit), details in the body',
    category: 'email structure',
    rationale: 'Large scans are common. The cost must still be recorded from the body, the file must not be uploaded, and the record must be flagged.',
    knownRisk: 'The ~8 MB base64 webhook payload and Extract From File on a 6 MB non-PDF blob may error out instead of continuing; check n8n payload size limit and continue-on-error.',
    email: {
      ...COASTHIRE, subject: 'Invoice CH-INV-10455 (scanned) - HBR-001', date: '2026-10-26T15:20:00Z',
      text: 'Scanned copy attached (large file).\nInvoice No: CH-INV-10455\nInvoice Date: 10/26/2026\nAmount Due: $1,150.00\nDue Date: 12/10/2026',
    },
    attachments: [{ fileName: 'CH-INV-10455-scan.pdf', mimeType: 'application/pdf', bytes: 6000000 }],
    expect: {
      action: 'create', docRef: 'CH-INV-10455', amount: 1150, project: 'Harbour View Renovation',
      needsReview: true, reviewIncludes: 'larger than the Notion free-plan',
    },
  },
  {
    id: 'e08',
    title: 'The workflow\'s own [DEMO] notification arrives back in the inbox',
    category: 'email structure',
    rationale: 'Loop protection: a [DEMO] notification must be ignored completely (0 documents, no cost, no email).',
    knownRisk: 'Normalize returns 0 items, so the loop and "Respond to Webhook" may never run; n8n may answer with an empty body or an error instead of {processed:0, results:[]}.',
    email: {
      from: 'samisiam851@gmail.com', fromName: 'Kevin Build Cost Intake',
      subject: '[DEMO] Cost recorded: Apex Timber & Frames | AT-INV-55120 | USD 3,980.00 | Oak Street Residence',
      date: '2026-10-22T10:16:00Z',
      text: 'This is a demo. Cost recorded\nSupplier Apex Timber & Frames\nDocument Invoice AT-INV-55120\nAmount USD 3,980.00\nStatus Unpaid',
    },
    expect: { resultsCount: 0 },
  },
  {
    id: 'e09',
    title: 'PM replies "Re: [DEMO] ..." to a notification - must not alter the cost',
    category: 'email structure / duplicates',
    rationale: 'Replies to notifications land in the same inbox. At most it is a duplicate of AT-INV-55120 (e02); it must not change the record or notify anyone. (Skipping it entirely would also be acceptable, but then the result line would be missing.)',
    knownRisk: 'Only subjects starting with "[DEMO]" are skipped. The quoted text yields AT-INV-55120 + Apex (named in text) + USD 3,980 but no document date -> the email date (2026-10-31) is used -> UPDATE that moves Document date and notifies.',
    email: {
      from: 'mike@kevinbuild.co', fromName: 'Mike Johnson',
      subject: 'Re: [DEMO] Cost recorded: Apex Timber & Frames | AT-INV-55120 | USD 3,980.00 | Oak Street Residence',
      date: '2026-10-31T13:10:00Z',
      text: 'Checked with site, frames are in. All good.\n\nMike\n\n> Cost recorded\n> Supplier Apex Timber & Frames\n> Document Invoice AT-INV-55120\n> Amount USD 3,980.00',
    },
    expect: { action: 'duplicate', docRef: 'AT-INV-55120', amount: 3980, docDate: '2026-10-22', notify: false },
  },

  // ---------------------------------------------------------------- extraction
  {
    id: 'e10',
    title: 'UK supplier: GBP (£), DMY dates with day > 12, VAT lines, not in Contacts',
    category: 'extraction',
    rationale: '23/10/2026 is unambiguous DMY even with dateOrder MDY. "Net:" and "VAT" lines must not be taken as amount/terms. GBP gets its own summary row and is flagged.',
    email: {
      from: 'accounts@brightlinejoinery.co.uk', fromName: 'Brightline Joinery Accounts',
      subject: 'Invoice BJ-1187 - Lakeside Cafe LKC-001 counters', date: '2026-10-23T11:00:00Z',
      text: 'Please find our invoice enclosed.\n\nKind regards,\nBrightline Joinery Ltd',
    },
    pdf: {
      fileName: 'Brightline-BJ-1187.pdf',
      lines: ['#BRIGHTLINE JOINERY LTD', 'VAT Reg GB 284 1937 22', '#INVOICE', 'Invoice No: BJ-1187', 'Invoice Date: 23/10/2026', 'Description: Bespoke oak bar counters', 'Net: £1,950.00', 'VAT 20%: £390.00', 'Total: £2,340.00', 'Payment due: 22/11/2026'],
    },
    expect: {
      action: 'create', docRef: 'BJ-1187', amount: 2340, currency: 'GBP', docDate: '2026-10-23', dueDate: '2026-11-22',
      project: 'Lakeside Café Fit-out', needsReview: true, reviewIncludes: ['Currency is GBP', 'is not in Contacts'],
    },
  },
  {
    id: 'e11',
    title: 'Italian supplier: European number format "EUR 1.234,64", dates 21.10.2026',
    category: 'extraction (documented limitation)',
    rationale: 'README §9: European amounts are not parsed and such items are "flagged, never silently wrong". Correct outcome: amount left empty + "Amount not found" (EUR flag alone is not enough, since the number would still be wrong).',
    knownRisk: 'AMOUNT_PATTERN matches "EUR 1.23" (dot treated as decimal) -> amount 1.23 stored silently, no amount flag.',
    email: {
      from: 'orders@ferramentarossi.example.it', fromName: 'Ferramenta Rossi',
      subject: 'Fattura FR-2026-0981 - LKC-001', date: '2026-10-21T16:45:00Z',
      text: 'In allegato la fattura. / Invoice attached.',
    },
    pdf: {
      fileName: 'Rossi-FR-2026-0981.pdf',
      lines: ['#FERRAMENTA ROSSI S.R.L.', 'P.IVA IT 01234567890', '#FATTURA / INVOICE', 'Numero fattura / Invoice No: FR-2026-0981', 'Data / Date: 21.10.2026', 'Descrizione / Description: Stainless shelving brackets', 'Imponibile / Subtotal: EUR 1.012,00', 'IVA 22%: EUR 222,64', 'Totale / Total: EUR 1.234,64', 'Scadenza / Due: 20.11.2026'],
    },
    expect: {
      action: 'create', docRef: 'FR-2026-0981', amount: null, currency: 'EUR', docDate: '2026-10-21', dueDate: '2026-11-20',
      project: 'Lakeside Café Fit-out', needsReview: true, reviewIncludes: ['Amount not found', 'Currency is EUR'],
    },
  },
  {
    id: 'e12',
    title: 'PDF only (empty subject + body): "P.O. # 1044", written date "Oct 9th, 2026", due on receipt, "Amount Payable: 4800 USD"',
    category: 'extraction / matching',
    rationale: 'Mobile scanners send blank emails. Everything must come from the PDF: PO written as "P.O. # 1044" must still find Skyline via Materials & Orders; "due on receipt" = doc date, already past -> overdue flag; amount without decimals and with a USD suffix.',
    knownRisk: 'extractPO uses \\b after "P\\.O\\." which never matches before a space, so "P.O. # 1044" is not recognised -> no project -> "No project matched".',
    email: { ...READYMIX, subject: '', text: '', date: '2026-10-10T07:00:00Z' },
    pdf: {
      fileName: 'ReadyMix-RM-INV-3412.pdf',
      lines: ['#READYMIX CONCRETE', '#TAX INVOICE', 'Invoice #: RM-INV-3412', 'Invoice Date: Oct 9th, 2026', 'P.O. # 1044', 'Description: Concrete pump hire - L2 slab', 'Amount Payable: 4800 USD', 'Terms: Due on receipt'],
    },
    expect: {
      action: 'create', docRef: 'RM-INV-3412', amount: 4800, currency: 'USD', status: 'Unpaid', docDate: '2026-10-09', dueDate: '2026-10-09',
      project: 'Skyline Development', needsReview: true, reviewIncludes: 'Unpaid and overdue', reviewExcludes: 'No project matched',
    },
  },
  {
    id: 'e13',
    title: 'ISO dates, "US$" amounts, Subtotal / Tax / Grand Total lines (clean create)',
    category: 'extraction / notifications',
    rationale: 'Grand Total (10,010) must win over Subtotal, Tax and line items; US$ is USD (no currency flag). A clean create notifies the PM. Base for the e14-e16 chain.',
    email: { ...SPARKS, subject: 'Invoice SE-INV-3150 - SKY-001 L3 lighting', date: '2026-10-19T09:00:00Z', text: 'Invoice attached.' },
    pdf: { fileName: 'Sparks-SE-INV-3150.pdf', lines: SE_3150_LINES('2026-12-03', 'SKY-001 Skyline Development') },
    expect: {
      action: 'create', docRef: 'SE-INV-3150', amount: 10010, currency: 'USD', status: 'Unpaid', docDate: '2026-10-19', dueDate: '2026-12-03',
      project: 'Skyline Development', needsReview: false, notify: true,
    },
  },

  // ---------------------------------------------------------------- duplicates / updates
  {
    id: 'e14',
    title: 'Exact same email delivered twice (same Message-ID)',
    category: 'duplicates / notifications',
    rationale: 'IMAP re-read or webhook retry: the same Message-ID must never create a second cost or a second email.',
    sameAs: 'e13',
    messageId: '<demo-e13@cost-intake.test>',
    email: { date: '2026-10-19T09:00:00Z' },
    expect: { action: 'duplicate', docRef: 'SE-INV-3150', amount: 10010, submissions: 2, notify: false },
  },
  {
    id: 'e15',
    title: 'Resubmission that only extends the due date',
    category: 'duplicates / updates',
    rationale: 'Supplier agrees new terms and re-issues. Same record, only Payment Due changes; amount unchanged so no amount flag; PM is told.',
    email: { ...SPARKS, subject: 'Invoice SE-INV-3150 - revised payment terms', date: '2026-10-28T10:00:00Z', text: 'As agreed, revised due date. Invoice attached.' },
    pdf: { fileName: 'Sparks-SE-INV-3150-rev.pdf', lines: SE_3150_LINES('2026-12-31', 'SKY-001 Skyline Development') },
    expect: {
      action: 'update', amount: 10010, dueDate: '2026-12-31', submissions: 3, needsReview: false,
      changesIncludes: 'Payment due', reviewExcludes: 'Amount changed', notify: true,
    },
  },
  {
    id: 'e16',
    title: 'Resubmission that points to a different project (RIV-001 instead of SKY-001)',
    category: 'duplicates / matching',
    rationale: 'A conflicting project on a resubmission must not silently move the cost between jobs: keep Skyline, flag it.',
    email: { ...SPARKS, subject: 'Invoice SE-INV-3150 - RIV-001 (re-issued)', date: '2026-10-30T10:00:00Z', text: 'Re-issued copy attached.' },
    pdf: { fileName: 'Sparks-SE-INV-3150-reissued.pdf', lines: SE_3150_LINES('2026-12-31', 'RIV-001 Riverside Home') },
    expect: { action: 'update', project: 'Skyline Development', amount: 10010, needsReview: true, reviewIncludes: 'different project' },
  },
  {
    id: 'e17',
    title: 'Partially paid invoice: Invoice Total 6,000 / Amount Paid 2,000 / Balance Due 4,000',
    category: 'extraction',
    rationale: 'The cost is the invoice total (6,000), not the balance; status Partially Paid (counted as unpaid in the summary per README §9). Base for e18/e19.',
    email: { ...BUILDMART, subject: 'INV-BM-6240 statement - part payment received', date: '2026-10-20T08:00:00Z', text: 'Thanks for the deposit, remaining balance shown on the attached.' },
    pdf: {
      fileName: 'BuildMart-INV-BM-6240-statement.pdf',
      lines: ['#BUILDMART SUPPLIES', '#TAX INVOICE', 'Invoice Number: INV-BM-6240', 'Invoice Date: 10/16/2026', 'Site: 4 Harbour Rd', 'Description: Timber decking boards', 'Invoice Total: $6,000.00', 'Amount Paid: $2,000.00', 'Balance Due: $4,000.00', 'Due Date: 12/16/2026'],
    },
    expect: { action: 'create', docRef: 'INV-BM-6240', amount: 6000, status: 'Partially Paid', dueDate: '2026-12-16', project: 'Harbour View Renovation', needsReview: false },
  },
  {
    id: 'e18',
    title: 'Same invoice later paid in full (Balance Due $0.00 + PAID)',
    category: 'duplicates / updates',
    rationale: 'Partially Paid -> Paid on the same record; amount stays 6,000 (Balance Due 0 must not become the amount, and must not raise "Amount changed").',
    email: { ...BUILDMART, subject: 'INV-BM-6240 - paid in full, thank you', date: '2026-10-31T09:00:00Z', text: 'Final payment received, paid copy attached.' },
    pdf: {
      fileName: 'BuildMart-INV-BM-6240-PAID.pdf',
      lines: ['#BUILDMART SUPPLIES', '#TAX INVOICE', 'Invoice Number: INV-BM-6240', 'Invoice Date: 10/16/2026', 'Site: 4 Harbour Rd', 'Description: Timber decking boards', 'Invoice Total: $6,000.00', 'Amount Paid: $6,000.00', 'Balance Due: $0.00', 'PAID'],
    },
    expect: {
      action: 'update', status: 'Paid', amount: 6000, changesIncludes: 'Payment status: Partially Paid -> Paid', reviewExcludes: 'Amount changed',
    },
  },
  {
    id: 'e19',
    title: 'Office admin forwards the ORIGINAL unpaid copy after it was paid (status regression)',
    category: 'duplicates / updates',
    rationale: 'Supplier is found from the PDF (sender is staff). An older "Amount Due / outstanding" copy must never undo Paid: keep Paid, flag.',
    email: {
      from: 'denise@kevinbuild.co', fromName: 'Denise', subject: 'Fwd: INV-BM-6240 BuildMart - is this still outstanding?', date: '2026-11-01T14:00:00Z',
      text: 'Found this in the shared inbox - still outstanding?\n\nDenise',
    },
    pdf: {
      fileName: 'BuildMart-INV-BM-6240.pdf',
      lines: ['#BUILDMART SUPPLIES', '#TAX INVOICE', 'Invoice Number: INV-BM-6240', 'Invoice Date: 10/16/2026', 'Site: 4 Harbour Rd', 'Description: Timber decking boards', 'Invoice Total: $6,000.00', 'Amount Due: $6,000.00', 'Due Date: 12/16/2026'],
    },
    expect: { action: 'update', supplier: 'BuildMart Supplies', status: 'Paid', amount: 6000, needsReview: true, reviewIncludes: 'kept "Paid"' },
  },
  {
    id: 'e20',
    title: 'Staff receipt with no receipt number, "Store #1874" line and a PAID stamp',
    category: 'extraction / matching',
    rationale: 'Big-box receipts have no invoice number; dedupe falls back to supplier+date+amount and the item is flagged. Supplier is Lowe\'s (unknown -> flagged), not the store number. Paid via the PAID line.',
    knownRisk: 'extractLabeledSupplier treats "Store #1874 Charlotte, NC" as a "store:" label -> supplier "1874 Charlotte, NC" instead of "Lowe\'s".',
    email: {
      from: 'mike@kevinbuild.co', fromName: 'Mike Johnson', subject: 'Receipt - studs and screws MPL-001', date: '2026-10-29T20:10:00Z',
      text: "Grabbed studs and screws from Lowe's for the Maple Court deck repair. Receipt attached, there is no receipt number on it.\n\nMike",
    },
    pdf: LOWES_RECEIPT,
    expect: {
      action: 'create', supplier: "Lowe's", docRef: null, amount: 312.47, status: 'Paid', docDate: '2026-10-29', project: 'Maple Court Extension',
      needsReview: true, reviewIncludes: ['Invoice/receipt number not found', 'is not in Contacts'], reviewExcludes: 'is marked Completed',
    },
  },
  {
    id: 'e21',
    title: 'Same no-ref receipt forwarded again by the office admin',
    category: 'duplicates / notifications',
    rationale: 'No invoice number: the fallback key (supplier + date + amount) must still catch the duplicate across different senders. No email.',
    email: {
      from: 'denise@kevinbuild.co', fromName: 'Denise', subject: 'Fwd: Receipt - studs and screws MPL-001', date: '2026-10-30T13:30:00Z',
      text: "Forwarding Mike's receipt for the Maple Court file.\n\n---------- Forwarded message ---------\nFrom: Mike Johnson <mike@kevinbuild.co>\nSubject: Receipt - studs and screws MPL-001\n\nGrabbed studs and screws from Lowe's for the Maple Court deck repair.",
    },
    pdf: LOWES_RECEIPT,
    expect: { action: 'duplicate', amount: 312.47, submissions: 2, notify: false },
  },
  {
    id: 'e22',
    title: 'Credit note CN-2290 that references invoice AT-INV-55120',
    category: 'extraction / duplicates',
    rationale: 'A credit note is its own document: separate record CN-2290, negative amount, flagged (README: credit notes are flagged). It must NOT be treated as a resubmission of the invoice it references (e02).',
    knownRisk: 'extractDocRef tries the "invoice" label before "credit note" -> docRef AT-INV-55120 -> UPDATE of the e02 invoice. Also "-$450.00" is parsed as +450 (minus before $ is lost), so the negative-amount flag never fires.',
    email: { ...APEX, subject: 'Credit note CN-2290 against AT-INV-55120 (Oak Street)', date: '2026-10-31T10:30:00Z', text: 'Credit for 3 lintels returned damaged.' },
    pdf: {
      fileName: 'Apex-CN-2290.pdf',
      lines: ['#APEX TIMBER & FRAMES', '#CREDIT NOTE', 'Credit Note No: CN-2290', 'Date: 10/31/2026', 'Applies to Invoice: AT-INV-55120', 'Job: OAK-001', 'Description: Return of damaged lintels', 'Total Credit: -$450.00'],
    },
    expect: { action: 'create', docRef: 'CN-2290', project: 'Oak Street Residence', needsReview: true, reviewIncludes: 'Zero or negative amount' },
  },
  {
    id: 'e23',
    title: 'Zero-dollar warranty call-out invoice on a Warranty-stage project',
    category: 'extraction',
    rationale: '$0.00 is a real amount (not "missing"): store 0 and flag "Zero or negative amount", not "Amount not found". Warranty is not Completed, so no Completed flag. Site address "17 Maple Court" (Court = Ct).',
    email: { ...SPARKS, subject: 'Invoice SE-INV-3188 - warranty callout', date: '2026-10-28T16:00:00Z', text: 'No charge - covered under warranty.' },
    pdf: {
      fileName: 'Sparks-SE-INV-3188.pdf',
      lines: ['#SPARKS ELECTRICAL', '#TAX INVOICE', 'Invoice No: SE-INV-3188', 'Invoice Date: 10/28/2026', 'Site: 17 Maple Court', 'Description: Warranty callout - replace faulty RCD (no charge)', 'Labour: $0.00', 'Parts: $0.00', 'Total: $0.00'],
    },
    expect: {
      action: 'create', docRef: 'SE-INV-3188', amount: 0, project: 'Maple Court Extension', needsReview: true,
      reviewIncludes: 'Zero or negative amount', reviewExcludes: ['Amount not found', 'is marked Completed'],
    },
  },
  {
    id: 'e24',
    title: 'Invoice ref with slashes "CH/2026/0457", project code written "hbr001"',
    category: 'extraction / matching',
    rationale: 'Slash refs are common in accounting packages and must be kept intact (and not mistaken for dates). Base for e25.',
    email: { ...COASTHIRE, subject: 'Tax invoice CH/2026/0457 - hbr001 crane hire', date: '2026-10-31T17:00:00Z', text: 'Invoice attached for the crane day.' },
    pdf: {
      fileName: 'CoastHire-CH-2026-0457.pdf',
      lines: ['#COASTHIRE EQUIPMENT', '#TAX INVOICE', 'Invoice No: CH/2026/0457', 'Invoice Date: 10/31/2026', 'Description: Mobile crane hire 1 day', 'Amount Due: $2,450.00', 'Due Date: 12/15/2026'],
    },
    expect: { action: 'create', docRef: 'CH/2026/0457', amount: 2450, docDate: '2026-10-31', project: 'Harbour View Renovation', needsReview: false },
  },
  {
    id: 'e25',
    title: 'Re-issued CH/2026/0457 with the date moved from 31 Oct to 1 Nov (month change)',
    category: 'duplicates / updates / summary',
    rationale: 'The cost moves from the CoastHire Oct-2026 summary row to Nov-2026: same record updated, and BOTH summary rows must be recalculated (decision.recalc has 2 targets). Asserted via update + changes.',
    email: { ...COASTHIRE, subject: 'Re-issued tax invoice CH/2026/0457 - hbr001 (date corrected)', date: '2026-11-01T09:00:00Z', text: 'Re-issued with the correct date.' },
    pdf: {
      fileName: 'CoastHire-CH-2026-0457-reissued.pdf',
      lines: ['#COASTHIRE EQUIPMENT', '#TAX INVOICE', 'Invoice No: CH/2026/0457', 'Invoice Date: 11/01/2026', 'Description: Mobile crane hire 1 day', 'Amount Due: $2,450.00', 'Due Date: 12/15/2026'],
    },
    expect: {
      action: 'update', docRef: 'CH/2026/0457', docDate: '2026-11-01', amount: 2450, submissions: 2,
      changesIncludes: 'Document date: 2026-10-31 -> 2026-11-01', reviewExcludes: 'Amount changed',
    },
  },

  // ---------------------------------------------------------------- matching
  {
    id: 'e26',
    title: 'Split delivery naming two project codes',
    category: 'matching',
    rationale: 'Two codes at the same tier = ambiguous. Nothing is guessed; flagged for someone to choose.',
    email: { ...BUILDMART, subject: 'INV-BM-6300 - split delivery RIV-001 / SKY-001', date: '2026-10-23T10:00:00Z', text: 'Blocks delivered to both sites, see split on invoice.' },
    pdf: {
      fileName: 'BuildMart-INV-BM-6300.pdf',
      lines: ['#BUILDMART SUPPLIES', '#INVOICE', 'Invoice Number: INV-BM-6300', 'Date: 10/23/2026', 'Deliver to: RIV-001 (40%) and SKY-001 (60%)', 'Description: Concrete blocks split delivery', 'Total: $2,600.00', 'Due Date: 12/22/2026'],
    },
    expect: { action: 'create', docRef: 'INV-BM-6300', amount: 2600, project: null, needsReview: true, reviewIncludes: 'Several projects matched' },
  },
  {
    id: 'e27',
    title: 'Known supplier sending from a generic Gmail address; amount exactly $25,000',
    category: 'matching / extraction',
    rationale: 'Sender email/domain unknown (gmail is generic), but "READYMIX CONCRETE" in the PDF identifies the Contact - no "new supplier" flag. $25,000 is AT the threshold -> High value flag (>=).',
    email: {
      from: 'readymix.accounts.dept@gmail.com', fromName: 'Accounts Dept', subject: 'Invoice RM-INV-3490 - SKY-001 L4 slab pour', date: '2026-10-30T18:00:00Z',
      text: 'Sending from our backup Gmail as our mail server is down. Invoice attached.',
    },
    pdf: {
      fileName: 'ReadyMix-RM-INV-3490.pdf',
      lines: ['#READYMIX CONCRETE', 'ABN 33 102 417 032', '#TAX INVOICE', 'Invoice #: RM-INV-3490', 'Invoice Date: 10/30/2026', 'Description: Concrete 40MPa - L4 slab', 'Total Amount: $25,000.00', 'Due Date: 12/14/2026'],
    },
    expect: {
      action: 'create', supplier: 'ReadyMix Concrete', docRef: 'RM-INV-3490', amount: 25000, project: 'Skyline Development',
      needsReview: true, reviewIncludes: 'High value', reviewExcludes: 'is not in Contacts',
    },
  },
  {
    id: 'e28',
    title: 'Owner forwards two invoices with the SAME number (10057) from two different suppliers; job given only by site address',
    category: 'matching / duplicates / email structure',
    rationale: 'Sender is staff, so each supplier comes from its own PDF. Dedupe key includes the supplier, so these are two separate costs (no update/duplicate). Project only via "12 Riverside Drive" (Drive = Dr).',
    email: {
      from: 'kevin@kevinbuild.co', fromName: 'Kevin Walsh', subject: 'Fwd: two invoices for the Riverside job', date: '2026-10-28T19:30:00Z',
      text: 'Both of these came to my personal inbox - please log them against the job at 12 Riverside Drive.\n\nKevin',
    },
    attachments: [
      { fileName: 'Sparks-10057.pdf', pdfLines: ['#SPARKS ELECTRICAL', '#INVOICE', 'Invoice No: 10057', 'Invoice Date: 10/26/2026', 'Description: Switchboard upgrade', 'Amount Due: $3,100.00', 'Due Date: 12/10/2026'] },
      { fileName: 'ReadyMix-10057.pdf', pdfLines: ['#READYMIX CONCRETE', '#INVOICE', 'Invoice No: 10057', 'Invoice Date: 10/27/2026', 'Description: Footing pour top-up', 'Amount Due: $1,480.00', 'Due Date: 12/11/2026'] },
    ],
    expect: [
      { action: 'create', supplier: 'Sparks Electrical', docRef: '10057', amount: 3100, project: 'Riverside Home', submissions: 1 },
      { action: 'create', supplier: 'ReadyMix Concrete', docRef: '10057', amount: 1480, project: 'Riverside Home', submissions: 1 },
    ],
  },
];
