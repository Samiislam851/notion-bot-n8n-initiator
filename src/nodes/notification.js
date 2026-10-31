// Decides who should hear about this cost and builds the email.
function run() {
  const cfg = $('Settings').first().json;
  const ctx = $('Build Notion Payload').first().json;
  const page = $('Upsert Cost Record').first().json;
  const ref = toReferenceData({
    projects: flattenQueryResults($('Get Projects').all()),
    employees: flattenQueryResults($('Get Employees').all()),
  });
  const d = ctx.decision;
  const project = ref.projects.find((p) => p.id === d.record.projectId);
  d.record.projectName = project ? project.name : null;
  d.record.fromEmail = ctx.parsed.fromEmail;
  d.record.docType = ctx.parsed.docType;
  const summaries = $('Compute Monthly Totals').all().map((i) => i.json);
  const notification = buildNotification({ ...d, notionUrl: page.url, summaries }, findPeople(d.record, ref), cfg);
  return [{ json: { ...ctx, decision: d, notionUrl: page.url, pageId: page.id, summaries, notification } }];
}
