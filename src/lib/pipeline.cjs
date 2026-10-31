// One call that turns an email + document text into a cost record ready for the
// duplicate check. Used by the "Parse & Match" Code node and the unit tests.
// Depends on extract.cjs, match.cjs, notion.cjs.

function toReferenceData(raw) {
  const rp = (page, name) => readProp(page.properties[name]);
  return {
    projects: (raw.projects || []).map((p) => ({
      id: p.id, name: rp(p, 'Project'), code: rp(p, 'Project Code'), address: rp(p, 'Site Address'),
      stage: rp(p, 'Stage'), pmId: (rp(p, 'Project Manager') || [])[0] || null,
    })),
    contacts: (raw.contacts || []).map((c) => ({ id: c.id, name: rp(c, 'Name'), company: rp(c, 'Company'), email: rp(c, 'Email'), type: rp(c, 'Type') })),
    employees: (raw.employees || []).map((e) => ({ id: e.id, name: rp(e, 'Name'), email: rp(e, 'Email'), role: rp(e, 'Role') })),
    orders: (raw.orders || []).map((o) => ({ id: o.id, po: rp(o, 'PO Number'), projectId: (rp(o, 'Project') || [])[0] || null })),
  };
}

/**
 * @param sub {{email:{from,fromName,subject,text,date,messageId}, attachment:{fileName,mimeType,kind,sizeBytes}|null, documentText:string}}
 * @param ref output of toReferenceData
 */
function prepareSubmission(sub, ref, cfg) {
  const email = sub.email || {};
  const attachment = sub.attachment || null;
  const documentText = sub.documentText || '';
  const f = extractFields({ subject: email.subject, body: email.text, documentText }, cfg);

  const supplier = matchSupplier(
    { fromEmail: email.from, fromName: email.fromName, subject: email.subject, body: email.text, documentText, labeledSupplier: f.labeledSupplier, firstLine: f.firstLine },
    ref.contacts, ref.employees, cfg
  );
  const pm = matchProject({ subject: email.subject, body: email.text, documentText, poNumber: f.poNumber }, ref.projects, ref.orders);
  const receivedAt = email.date ? new Date(email.date).toISOString() : new Date().toISOString();
  // Fallback document date = the day the email arrived in the company's timezone (not UTC).
  const receivedDay = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone || 'America/New_York' }).format(new Date(receivedAt));

  return {
    // extracted fields
    docRef: f.docRef,
    docType: f.docType,
    description: f.description,
    amount: f.amount,
    amountMethod: f.amountMethod,
    currency: f.currency,
    currencyMethod: f.currencyMethod,
    status: f.status,
    docDate: f.docDate || receivedDay,
    docDateSource: f.docDate ? 'document' : 'email',
    dueDate: f.dueDate,
    dueSource: f.dueSource,
    poNumber: f.poNumber,
    // matching
    supplierName: supplier.name,
    supplierContactId: supplier.contactId,
    supplierMethod: supplier.method,
    submittedBy: supplier.submittedBy,
    projectId: pm.project ? pm.project.id : null,
    projectName: pm.project ? pm.project.name : null,
    projectStage: pm.project ? pm.project.stage : null,
    projectPmId: pm.project ? pm.project.pmId : null,
    projectMethod: pm.method,
    projectCandidates: pm.candidates,
    // source
    fromEmail: email.from || null,
    fromName: email.fromName || null,
    subject: email.subject || '',
    messageId: email.messageId || null,
    receivedAt,
    sourceEmail: 'From: ' + (email.fromName ? email.fromName + ' <' + email.from + '>' : email.from || '?') + ' | Subject: ' + (email.subject || '') +
      ' | Received: ' + receivedAt + (attachment ? ' | File: ' + attachment.fileName : ' | No attachment'),
    attachmentKind: attachment ? attachment.kind : null,
    attachmentName: attachment ? attachment.fileName : null,
    pdfUnreadable: !!(attachment && attachment.kind === 'pdf' && !String(documentText).trim()),
    attachmentTooLarge: !!(attachment && attachment.sizeBytes && attachment.sizeBytes > cfg.maxUploadBytes),
  };
}

function findPeople(record, ref) {
  const project = record.projectId ? ref.projects.find((p) => p.id === record.projectId) : null;
  const pmId = record.projectPmId || (project ? project.pmId : null);
  const pick = (e) => (e ? { name: e.name, email: e.email } : null);
  return {
    projectManager: pick(pmId ? ref.employees.find((e) => e.id === pmId) : null),
    officeAdmin: pick(ref.employees.find((e) => e.role === 'Office Admin')),
    owner: pick(ref.employees.find((e) => e.role === 'Owner')),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toReferenceData, prepareSubmission, findPeople };
}
