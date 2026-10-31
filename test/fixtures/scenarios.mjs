// Demo/test submissions. Each one is a realistic email (optionally with a PDF or photo).
// Used by the unit tests (document text fed directly) and by scripts/run-scenarios.mjs
// (sent to the live n8n webhook, PDFs generated on the fly).
//
// `expect` documents what the workflow should do; run-scenarios.mjs checks it against
// the live webhook response.

export const TEST_INBOX = 'samisiam851+costs@gmail.com';

export const scenarios = [
  {
    id: 's01',
    title: 'New unpaid invoice (PDF), project code in subject',
    email: {
      from: 'apex.timber.frames@example.com', fromName: 'Apex Timber Accounts',
      subject: 'Invoice INV-78102 - RIV-001 Riverside Home', date: '2026-10-28T09:12:00Z',
      text: 'Hi Kevin Build team,\n\nPlease find attached our invoice INV-78102 for the roof trusses delivered to Riverside.\n\nRegards,\nApex Timber & Frames',
    },
    pdf: {
      fileName: 'Apex-INV-78102.pdf',
      lines: [
        '#APEX TIMBER & FRAMES', 'ABN 51 824 753 556  |  accounts@apextimber.example', '', '#TAX INVOICE',
        'Invoice No: INV-78102', 'Invoice Date: 10/28/2026', 'Bill To: Kevin Build Co.', 'Job: Riverside Home, 12 Riverside Dr',
        'Description: Roof trusses - stage 2', '', 'Roof trusses (12 units)      7,681.82', 'Subtotal: $7,681.82', 'Tax: $768.18',
        'Total Due: $8,450.00 USD', 'Terms: Net 30', 'Please pay by wire transfer to the account below.',
      ],
    },
    expect: { action: 'create', status: 'Unpaid', amount: 8450, currency: 'USD', docRef: 'INV-78102', project: 'Riverside Home', needsReview: false, dueDate: '2026-11-27' },
  },
  {
    id: 's02',
    title: 'Exact duplicate - same invoice emailed again',
    sameAs: 's01',
    email: { subject: 'FW: Invoice INV-78102 - RIV-001 Riverside Home', date: '2026-10-29T14:40:00Z' },
    expect: { action: 'duplicate', status: 'Unpaid', amount: 8450 },
  },
  {
    id: 's03',
    title: 'Same invoice re-sent marked PAID - update, not a new cost',
    email: {
      from: 'apex.timber.frames@example.com', fromName: 'Apex Timber Accounts',
      subject: 'Payment received - INV-78102 (RIV-001)', date: '2026-10-31T10:05:00Z',
      text: 'Thanks for your payment. Paid copy of INV-78102 attached.',
    },
    pdf: {
      fileName: 'Apex-INV-78102-PAID.pdf',
      lines: [
        '#APEX TIMBER & FRAMES', '#TAX INVOICE - PAID', 'Invoice No: INV-78102', 'Invoice Date: 10/28/2026',
        'Job: Riverside Home', 'Description: Roof trusses - stage 2', 'Invoice Total: $8,450.00 USD',
        'Amount Paid: $8,450.00', 'Balance Due: $0.00', 'Payment received 10/30/2026 - thank you.',
      ],
    },
    expect: { action: 'update', status: 'Paid', amount: 8450, needsReview: false },
  },
  {
    id: 's04',
    title: 'Field employee emails a receipt in the body (no attachment), new supplier',
    email: {
      from: 'mike@kevinbuild.co', fromName: 'Mike Johnson',
      subject: 'Receipt - fixings for Skyline', date: '2026-10-30T16:20:00Z',
      text: 'Picked up fixings and anchors at Home Depot for the Skyline job today.\nReceipt #4471, total $245.10, paid on the company card.\n\nMike',
    },
    expect: { action: 'create', status: 'Paid', amount: 245.1, docRef: '4471', project: 'Skyline Development', needsReview: true, reviewIncludes: 'not in Contacts' },
  },
  {
    id: 's05',
    title: 'Invoice with no project reference and already overdue',
    email: {
      from: 'buildmart.supplies@example.com', fromName: 'BuildMart Accounts',
      subject: 'Statement invoice INV-BM-5520', date: '2026-10-29T08:00:00Z',
      text: 'Invoice attached. Please remit by the due date.',
    },
    pdf: {
      fileName: 'BuildMart-INV-BM-5520.pdf',
      lines: [
        '#BUILDMART SUPPLIES', '#INVOICE', 'Invoice Number: INV-BM-5520', 'Date: 10/06/2026', 'Due Date: 10/20/2026',
        'Description: Plasterboard and cornice', 'Total: $1,980.00', 'Please pay within terms.',
      ],
    },
    expect: { action: 'create', status: 'Unpaid', amount: 1980, project: null, needsReview: true, reviewIncludes: 'No project matched' },
  },
  {
    id: 's06',
    title: 'Project found through the PO number (Materials & Orders)',
    email: {
      from: 'readymix.concrete@example.com', fromName: 'ReadyMix Concrete',
      subject: 'RM-INV-3388 for PO-1044', date: '2026-10-30T07:45:00Z',
      text: 'Invoice for the L2 slab pour attached.',
    },
    pdf: {
      fileName: 'ReadyMix-RM-INV-3388.pdf',
      lines: [
        '#READYMIX CONCRETE', '#TAX INVOICE', 'Invoice #: RM-INV-3388', 'Invoice Date: Oct 29, 2026', 'Purchase Order: PO-1044',
        'Description: Concrete 32MPa - L2 slab', 'Total Amount: $12,600.00', 'Terms: Net 14',
      ],
    },
    expect: { action: 'create', status: 'Unpaid', amount: 12600, project: 'Skyline Development', needsReview: false, dueDate: '2026-11-12' },
  },
  {
    id: 's07',
    title: 'Progress claim with no amount - flagged',
    email: {
      from: 'sparks.electrical@example.com', fromName: 'Sparks Electrical',
      subject: 'Progress claim SE-PC-0207 - OAK-001', date: '2026-10-31T11:00:00Z',
      text: 'Attached is our progress claim for rough-in at Oak Street. Final value to be confirmed after inspection.',
    },
    pdf: {
      fileName: 'Sparks-SE-PC-0207.pdf',
      lines: ['#SPARKS ELECTRICAL', '#PROGRESS CLAIM', 'Invoice No: SE-PC-0207', 'Date: 10/31/2026', 'Site: 142 Oak St', 'Description: Electrical rough-in', 'Value: to be confirmed after inspection'],
    },
    expect: { action: 'create', amount: null, project: 'Oak Street Residence', needsReview: true, reviewIncludes: 'Amount not found' },
  },
  {
    id: 's08',
    title: 'Overseas supplier in EUR - separate currency, flagged',
    email: {
      from: 'orders@lussostone.example.it', fromName: 'Lusso Stone Imports',
      subject: 'Fattura / Invoice LS-2026-118 - Lakeside Cafe LKC-001', date: '2026-10-27T13:30:00Z',
      text: 'Invoice for the marble bar top. Payment by wire within 30 days.',
    },
    pdf: {
      fileName: 'LussoStone-LS-2026-118.pdf',
      lines: ['#LUSSO STONE IMPORTS', '#INVOICE', 'Invoice No: LS-2026-118', 'Invoice Date: 27 Oct 2026', 'Description: Carrara marble bar top', 'Total: EUR 4,200.00', 'Payment due: 26 Nov 2026'],
    },
    expect: { action: 'create', status: 'Unpaid', amount: 4200, currency: 'EUR', project: 'Lakeside Café Fit-out', needsReview: true, reviewIncludes: 'Currency is EUR' },
  },
  {
    id: 's09',
    title: 'Equipment hire invoice (clean)',
    email: {
      from: 'coasthire.equipment@example.com', fromName: 'CoastHire Equipment',
      subject: 'CH-INV-10021 scissor lift hire - Harbour View', date: '2026-10-29T09:00:00Z',
      text: 'Invoice attached for the scissor lift hire at 4 Harbour Rd.',
    },
    pdf: {
      fileName: 'CoastHire-CH-INV-10021.pdf',
      lines: ['#COASTHIRE EQUIPMENT', '#TAX INVOICE', 'Invoice No: CH-INV-10021', 'Invoice Date: 10/29/2026', 'Site: 4 Harbour Rd', 'Description: Scissor lift hire 7 days', 'Amount Due: $3,200.00', 'Due Date: 11/28/2026'],
    },
    expect: { action: 'create', status: 'Unpaid', amount: 3200, project: 'Harbour View Renovation', needsReview: false },
  },
  {
    id: 's10',
    title: 'Corrected invoice - same number, different amount: update + flag',
    email: {
      from: 'coasthire.equipment@example.com', fromName: 'CoastHire Equipment',
      subject: 'CORRECTED CH-INV-10021 - Harbour View', date: '2026-10-31T15:10:00Z',
      text: 'Apologies, the previous invoice missed the delivery fee. Corrected invoice attached.',
    },
    pdf: {
      fileName: 'CoastHire-CH-INV-10021-corrected.pdf',
      lines: ['#COASTHIRE EQUIPMENT', '#TAX INVOICE (CORRECTED)', 'Invoice No: CH-INV-10021', 'Invoice Date: 10/29/2026', 'Site: 4 Harbour Rd', 'Description: Scissor lift hire 7 days + delivery', 'Amount Due: $3,450.00', 'Due Date: 11/28/2026'],
    },
    expect: { action: 'update', amount: 3450, needsReview: true, reviewIncludes: 'Amount changed' },
  },
  {
    id: 's11',
    title: 'Photo of a paper receipt - cannot be read without OCR, flagged',
    email: {
      from: 'david@kevinbuild.co', fromName: 'David Lee',
      subject: 'Fuel receipt - Maple Court MPL-001', date: '2026-10-31T17:45:00Z',
      text: 'Photo of fuel receipt attached.',
    },
    image: { fileName: 'receipt-photo.png' },
    expect: { action: 'create', project: 'Maple Court Extension', needsReview: true, reviewIncludes: 'Photo/scanned receipt' },
  },
];

export function messageIdFor(s) {
  return `<demo-${s.id}@cost-intake.test>`;
}

export function resolveEmail(s) {
  const base = s.sameAs ? scenarios.find((x) => x.id === s.sameAs) : null;
  const email = Object.assign({}, base ? base.email : {}, s.email);
  return { email, pdf: s.pdf || (base && base.pdf) || null, image: s.image || null };
}

export function pdfText(pdf) {
  return pdf ? pdf.lines.map((l) => l.replace(/^#/, '')).join('\n') : '';
}
