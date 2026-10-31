// Central configuration for the whole workflow. Change values here only.
return [{
  json: {
    db: __NOTION_IDS__,                         // Notion database ids (written by scripts/notion-setup.mjs)
    notionVersion: '2022-06-28',
    companyDomain: 'kevinbuild.co',             // emails from this domain are staff, not suppliers
    baseCurrency: 'USD',
    dateOrder: 'MDY',                           // how to read 03/04/2026 when both parts are <= 12
    timezone: 'America/New_York',
    highValueThreshold: 25000,                  // costs at/above this are flagged for approval
    maxUploadBytes: 5 * 1024 * 1024,            // Notion free plan file upload limit
    demoMode: true,                             // true: every email goes to demoRecipient with a "This is a demo" banner
    demoRecipient: '__DEMO_RECIPIENT__',
    senderEmail: '__DEMO_RECIPIENT__',
    intakeAddress: '__INTAKE_ADDRESS__',
  },
}];
