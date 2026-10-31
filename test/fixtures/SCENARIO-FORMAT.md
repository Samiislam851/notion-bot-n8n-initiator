# Scenario format (for `npm run scenarios`)

A suite file exports `export const scenarios = [ ... ]`. Scenarios run **in order** against the live
webhook, so later ones may depend on earlier ones (e.g. a resubmission). Before a full run, execute
`npm run reset:demo`: it archives every cost whose Source Message ID starts with `<demo-`.

```js
{
  id: 'e01',                       // unique across ALL suites (base uses s01..s11)
  title: 'Short description',
  category: 'duplicates',          // free text, for the report
  rationale: 'Why this matters',   // free text
  sameAs: 'e00',                   // optional: reuse another scenario's email + files, then override
  messageId: null,                 // optional: default '<demo-<id>@cost-intake.test>'; null = send no messageId
                                   // keep the '<demo-' prefix if you set one, so reset:demo can clean up
  email: {
    from: 'x@y.com', fromName: 'X', subject: '...', text: '...',
    html: '<p>...</p>',            // optional: used when text is empty
    date: '2026-10-30T09:00:00Z',
  },
  pdf:   { fileName: 'a.pdf', lines: ['#HEADING', 'Invoice No: X-1', ...] },  // optional, '#' = bold
  image: { fileName: 'photo.png' },                                          // optional, generated PNG
  attachments: [                   // optional, any number of extra files, in order
    { fileName: 'b.pdf', pdfLines: ['...'] },
    { fileName: 'c.png', png: true },
    { fileName: 'd.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', text: 'junk' },
    { fileName: 'big.pdf', mimeType: 'application/pdf', bytes: 6000000 },   // junk bytes of a given size
  ],
  expect: { ... }                  // object -> checked against results[0]; array -> results[i] per document
}
```

## Expectation keys

Any of these is compared exactly with the workflow's result line:
`action` ('create'|'update'|'duplicate'), `supplier`, `docRef`, `amount`, `currency`, `status`,
`docDate`, `dueDate`, `project` (project name or null), `needsReview`, `submissions`, `file`.

Special keys:
- `reviewIncludes`: string or string[]; each must be a substring of one of the review reasons
- `reviewExcludes`: string or string[]; none may appear
- `changesIncludes`: string or string[]; substrings of the `changes` list (updates)
- `notify`: boolean; whether a notification email was built (false for duplicates)
- `resultsCount`: number of documents the email produced (object form only)

## Data available (Part 2 workspace)

- Projects (code, name, site address, PM): RIV-001 Riverside Home, 12 Riverside Dr (Mike) ·
  SKY-001 Skyline Development, 88 Skyline Ave (David) · HBR-001 Harbour View Renovation, 4 Harbour Rd (Mike) ·
  LKC-001 Lakeside Café Fit-out, 2 Lakeside Walk (David) · OAK-001 Oak Street Residence, 142 Oak St (Mike) ·
  MPL-001 Maple Court Extension, 17 Maple Ct (David). Stages: Construction/Construction/Closeout/Pre-Construction/Pre-Construction/Warranty.
  (Check the real PM assignment in Notion if a test depends on it.)
- Suppliers (Contacts): Sparks Electrical <sparks.electrical@example.com> (Subcontractor), ReadyMix Concrete
  <readymix.concrete@example.com>, BuildMart Supplies <buildmart.supplies@example.com>,
  CoastHire Equipment <coasthire.equipment@example.com>, Apex Timber & Frames <apex.timber.frames@example.com>.
- Purchase orders: PO-1044, PO-1036 (Skyline?), PO-1041, PO-1032, PO-1018 (Riverside?), PO-1027, PO-1047 – verify in Notion.
- Staff domain: kevinbuild.co (mike@, david@, kevin@, denise@, emma@, sarah@).
- "Today" in the workflow = current date in America/New_York (around 2026-10-31 / 2026-11-01).
- Existing Part 2 costs (do not reuse their refs unless testing that on purpose): INV-77812, CH-INV-9910, R-55102, INV-77950, RM-INV-3301.
- Base suite refs already used: INV-78102, 4471, INV-BM-5520, RM-INV-3388, SE-PC-0207, LS-2026-118, CH-INV-10021.
