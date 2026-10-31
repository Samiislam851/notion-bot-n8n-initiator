// Snapshot of the Part 2 reference data (shape produced by toReferenceData), with
// short fake ids. Mirrors the real Notion workspace so the unit tests are realistic.
export const ref = {
  projects: [
    { id: 'p-riv', name: 'Riverside Home', code: 'RIV-001', address: '12 Riverside Dr', stage: 'Construction', pmId: 'e-mike' },
    { id: 'p-sky', name: 'Skyline Development', code: 'SKY-001', address: '88 Skyline Ave', stage: 'Construction', pmId: 'e-david' },
    { id: 'p-hbr', name: 'Harbour View Renovation', code: 'HBR-001', address: '4 Harbour Rd', stage: 'Closeout', pmId: 'e-mike' },
    { id: 'p-lkc', name: 'Lakeside Café Fit-out', code: 'LKC-001', address: '2 Lakeside Walk', stage: 'Pre-Construction', pmId: 'e-david' },
    { id: 'p-oak', name: 'Oak Street Residence', code: 'OAK-001', address: '142 Oak St', stage: 'Pre-Construction', pmId: 'e-mike' },
    { id: 'p-mpl', name: 'Maple Court Extension', code: 'MPL-001', address: '17 Maple Ct', stage: 'Warranty', pmId: 'e-david' },
  ],
  contacts: [
    { id: 'c-sparks', name: 'Sparks Electrical', company: 'Sparks Electrical', email: 'sparks.electrical@example.com', type: 'Subcontractor' },
    { id: 'c-readymix', name: 'ReadyMix Concrete', company: 'ReadyMix', email: 'readymix.concrete@example.com', type: 'Supplier' },
    { id: 'c-buildmart', name: 'BuildMart Supplies', company: 'BuildMart', email: 'buildmart.supplies@example.com', type: 'Supplier' },
    { id: 'c-coasthire', name: 'CoastHire Equipment', company: 'CoastHire', email: 'coasthire.equipment@example.com', type: 'Supplier' },
    { id: 'c-apex', name: 'Apex Timber & Frames', company: 'Apex Timber', email: 'apex.timber.frames@example.com', type: 'Supplier' },
  ],
  employees: [
    { id: 'e-mike', name: 'Mike Johnson', email: 'mike@kevinbuild.co', role: 'Project Management' },
    { id: 'e-david', name: 'David Lee', email: 'david@kevinbuild.co', role: 'Project Management' },
    { id: 'e-kevin', name: 'Kevin Walsh', email: 'kevin@kevinbuild.co', role: 'Owner' },
    { id: 'e-denise', name: 'Denise', email: 'denise@kevinbuild.co', role: 'Office Admin' },
  ],
  orders: [
    { id: 'o-1044', po: 'PO-1044', projectId: 'p-sky' },
    { id: 'o-1018', po: 'PO-1018', projectId: 'p-riv' },
  ],
};

export const cfg = {
  companyDomain: 'kevinbuild.co',
  baseCurrency: 'USD',
  dateOrder: 'MDY',
  highValueThreshold: 25000,
  maxUploadBytes: 5 * 1024 * 1024,
  demoMode: true,
  demoRecipient: 'samisiam851@gmail.com',
};
