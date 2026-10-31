// Generates dist/cost-intake-workflow.json (importable into n8n) from src/nodes + src/lib.
//
//   npm run build
//
// Credentials are referenced by name only; scripts/deploy-workflow.mjs fills in the ids.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { libSource } from './lib-bundle.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const idsFile = new URL('config/notion-ids.json', root);
if (!existsSync(idsFile)) throw new Error('config/notion-ids.json missing - run `npm run setup:notion` first');
const IDS = JSON.parse(readFileSync(idsFile, 'utf8'));
export const DEMO_RECIPIENT = process.env.DEMO_RECIPIENT || 'samisiam851@gmail.com';
export const INTAKE_ADDRESS = process.env.INTAKE_ADDRESS || 'samisiam851+costs@gmail.com';
export const CRED = { notion: 'Notion - Kevin Build Co', smtp: 'Gmail SMTP - cost intake', imap: 'Gmail IMAP - cost intake' };

function stripExports(src) {
  return src.replace(/\nif \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*?\n\}\n?/g, '\n');
}
function code(file, libs) {
  let src = read('src/nodes/' + file);
  if (libs) {
    src += '\n\n// ===== Shared helpers below are generated from src/lib/*.cjs - edit there and run `npm run build` =====\n' +
      stripExports(libSource(libs)) + '\nreturn run();\n';
  }
  return src
    .replace('__NOTION_IDS__', JSON.stringify(IDS))
    .replaceAll('__DEMO_RECIPIENT__', DEMO_RECIPIENT)
    .replaceAll('__INTAKE_ADDRESS__', INTAKE_ADDRESS);
}

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const nodes = [];
const add = (node) => { nodes.push({ id: uid(), ...node }); return node.name; };

const codeNode = (name, position, file, libs, extra = {}) =>
  add({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { jsCode: code(file, libs) }, ...extra });

const NOTION_HEADERS = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const notionHttp = (name, position, { method = 'POST', url, jsonBody, paginate = false, executeOnce = false, extra = {}, parameters = {} }) =>
  add({
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1500,
    ...(executeOnce ? { executeOnce: true } : {}),
    ...extra,
    parameters: {
      method,
      url,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'notionApi',
      sendHeaders: true,
      headerParameters: NOTION_HEADERS,
      ...(jsonBody ? { sendBody: true, specifyBody: 'json', jsonBody } : {}),
      options: paginate
        ? {
            pagination: {
              pagination: {
                paginationMode: 'updateAParameterInEachRequest',
                parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
                paginationCompleteWhen: 'other',
                completeExpression: '={{ !$response.body.has_more }}',
                limitPagesFetched: true,
                maxRequests: 20,
              },
            },
          }
        : {},
      ...parameters,
    },
    credentials: { notionApi: { id: '', name: CRED.notion } },
  });

const boolIf = (name, position, expr) =>
  add({
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: uid(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
  });

const dbQueryUrl = (key) => `={{ 'https://api.notion.com/v1/databases/' + $('Settings').first().json.db.${key} + '/query' }}`;
const L = { parse: ['extract.cjs', 'match.cjs', 'notion.cjs', 'pipeline.cjs', 'decide.cjs'], decide: ['notion.cjs', 'decide.cjs'], payload: ['notion.cjs', 'decide.cjs'], totals: ['notion.cjs', 'decide.cjs', 'summary.cjs'], summary: ['notion.cjs', 'decide.cjs', 'summary.cjs'], notify: ['notion.cjs', 'pipeline.cjs', 'decide.cjs', 'summary.cjs', 'notify.cjs'] };

// ---------------- Triggers + reference data ----------------
add({
  name: 'Email Trigger (IMAP)',
  type: 'n8n-nodes-base.emailReadImap',
  typeVersion: 2,
  position: [-1600, 160],
  disabled: true,
  parameters: {
    mailbox: 'INBOX',
    postProcessAction: 'read',
    format: 'resolved',
    options: { customEmailConfig: JSON.stringify(['UNSEEN', ['TO', INTAKE_ADDRESS]]) },
  },
  credentials: { imap: { id: '', name: CRED.imap } },
});
add({
  name: 'Test Intake Webhook',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [-1600, 400],
  webhookId: '6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e5f',
  parameters: { httpMethod: 'POST', path: 'cost-intake', responseMode: 'responseNode', options: {} },
});
codeNode('Settings', [-1360, 280], 'settings.js');
notionHttp('Get Projects', [-1140, 280], { url: dbQueryUrl('projects'), jsonBody: '={{ JSON.stringify({ page_size: 100 }) }}', paginate: true, executeOnce: true });
notionHttp('Get Suppliers', [-920, 280], {
  url: dbQueryUrl('contacts'),
  jsonBody: '={{ JSON.stringify({ page_size: 100, filter: { or: [ { property: "Type", select: { equals: "Supplier" } }, { property: "Type", select: { equals: "Subcontractor" } } ] } }) }}',
  paginate: true, executeOnce: true,
});
notionHttp('Get Employees', [-700, 280], { url: dbQueryUrl('employees'), jsonBody: '={{ JSON.stringify({ page_size: 100 }) }}', paginate: true, executeOnce: true });
notionHttp('Get Purchase Orders', [-480, 280], { url: dbQueryUrl('orders'), jsonBody: '={{ JSON.stringify({ page_size: 100 }) }}', paginate: true, executeOnce: true });
codeNode('Normalize & Split Attachments', [-260, 280], 'normalize.js', null);

boolIf('Any Documents?', [-150, 280], '={{ !$json.skipped }}');

// ---------------- Per-document loop ----------------
add({ name: 'Loop Over Documents', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: [40, 280], parameters: { batchSize: 1, options: {} } });
codeNode('Current Document', [200, 380], 'current-document.js', null);
boolIf('Has PDF?', [420, 380], '={{ $json.hasPdf }}');
add({
  name: 'Extract PDF Text',
  type: 'n8n-nodes-base.extractFromFile',
  typeVersion: 1,
  position: [640, 300],
  onError: 'continueRegularOutput',
  parameters: { operation: 'pdf', binaryPropertyName: 'document', options: {} },
});
codeNode('Parse & Match', [860, 380], 'parse.js', L.parse);
add({ name: 'AI Extraction Slot (optional)', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [1080, 380], parameters: {} });
notionHttp('Find Existing Cost', [1300, 380], {
  url: dbQueryUrl('costs'),
  jsonBody: "={{ JSON.stringify({ page_size: 1, filter: { property: 'Dedupe Key', rich_text: { equals: $json.parsed.dedupeKey } } }) }}",
});
codeNode('Decide Action', [1520, 380], 'decide.js', L.decide);
boolIf('Upload Document?', [1740, 380], '={{ $json.uploadDocument }}');
notionHttp('Create Upload Slot', [1960, 260], {
  url: 'https://api.notion.com/v1/file_uploads',
  jsonBody: "={{ JSON.stringify({ mode: 'single_part', filename: $json.attachment.fileName, content_type: $json.attachment.mimeType || 'application/octet-stream' }) }}",
  extra: { onError: 'continueRegularOutput' },
});
codeNode('Attach File', [2180, 260], 'attach-binary.js', null);
notionHttp('Send File to Notion', [2400, 260], {
  url: "={{ 'https://api.notion.com/v1/file_uploads/' + $json.uploadId + '/send' }}",
  extra: { onError: 'continueRegularOutput' },
  parameters: { sendBody: true, contentType: 'multipart-form-data', bodyParameters: { parameters: [{ parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'document' }] } },
});
codeNode('Build Notion Payload', [2620, 380], 'payload.js', L.payload);
notionHttp('Upsert Cost Record', [2840, 380], { method: '={{ $json.request.method }}', url: '={{ $json.request.url }}', jsonBody: '={{ JSON.stringify($json.request.body) }}' });
notionHttp('Append Audit Note', [3060, 380], {
  method: 'PATCH',
  url: "={{ 'https://api.notion.com/v1/blocks/' + $json.id + '/children' }}",
  jsonBody: "={{ JSON.stringify({ children: $('Build Notion Payload').first().json.audit.children }) }}",
  extra: { onError: 'continueRegularOutput' },
});
codeNode('Prepare Summary Recalc', [3280, 380], 'prepare-summary.js', null);
notionHttp('Query Supplier-Month Costs', [3500, 380], {
  url: dbQueryUrl('costs'),
  jsonBody: "={{ JSON.stringify({ page_size: 100, filter: { property: 'Summary Key', rich_text: { equals: $json.target.key } } }) }}",
  paginate: true,
});
codeNode('Compute Monthly Totals', [3720, 380], 'totals.js', L.totals);
notionHttp('Find Summary Row', [3940, 380], {
  url: dbQueryUrl('summary'),
  jsonBody: "={{ JSON.stringify({ page_size: 1, filter: { property: 'Summary Key', rich_text: { equals: $json.target.key } } }) }}",
});
codeNode('Build Summary Upsert', [4160, 380], 'summary-upsert.js', L.summary);
notionHttp('Upsert Summary Row', [4380, 380], { method: '={{ $json.request.method }}', url: '={{ $json.request.url }}', jsonBody: '={{ JSON.stringify($json.request.body) }}' });
codeNode('Build Notification', [4600, 380], 'notification.js', L.notify, { executeOnce: true });
boolIf('Should Notify?', [4820, 380], '={{ $json.notification.send }}');
add({
  name: 'Send Notification Email',
  type: 'n8n-nodes-base.emailSend',
  typeVersion: 2.1,
  position: [5040, 300],
  onError: 'continueRegularOutput',
  parameters: {
    fromEmail: "={{ $('Settings').first().json.senderEmail }}",
    toEmail: '={{ $json.notification.to }}',
    subject: '={{ $json.notification.subject }}',
    emailFormat: 'html',
    html: '={{ $json.notification.html }}',
    options: { appendAttribution: false },
  },
  credentials: { smtp: { id: '', name: CRED.smtp } },
});
codeNode('Record Result', [5260, 380], 'record-result.js', null);
codeNode('Build Run Report', [200, 120], 'report.js', null);
add({
  name: 'Respond to Webhook',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [420, 120],
  onError: 'continueRegularOutput',
  parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} },
});

// ---------------- Sticky notes (documentation inside the canvas) ----------------
const sticky = (content, position, width, height, color = 7) =>
  add({ name: 'Note ' + (n + 1), type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position, parameters: { content, width, height, color } });
sticky('## 1. Intake\nReal use: **Email Trigger (IMAP)** reads unread emails sent to the intake address (`' + INTAKE_ADDRESS + '`).\nDemo/tests: **Test Intake Webhook** accepts the same email as JSON (`npm run scenarios`).\n\nReference data (projects, suppliers, staff, POs) is loaded once per run.', [-1680, -80], 1380, 200, 5);
sticky('## 2. One document at a time\nEach attachment (or the email body) is processed in its own loop iteration, so two documents for the same supplier/month can never race each other on the summary.', [-120, -80], 700, 200, 4);
sticky('## 3. Extract (rules) + match\nPDF text -> invoice no., date, due date / terms, amount, currency, paid status.\nSupplier: sender email -> domain -> name in document. Project: code (RIV-001) -> PO number -> name -> site address -> keyword.', [600, 560], 640, 200, 6);
sticky('## 🤖 AI extraction slot\nPlaceholder by design. To add an LLM later: replace this node with an AI/HTTP call that runs only when `$json.parsed` is missing fields, and merge its answer into `parsed`. Everything downstream stays the same.', [1000, 120], 340, 230, 3);
sticky('## 4. Duplicates & updates\nDedupe Key = supplier + invoice no.\n- not found -> **create**\n- same data -> **duplicate** (count +1, nothing else)\n- changed -> **update** (status only moves forward; amount change is flagged)', [1260, 560], 560, 220, 6);
sticky('## 5. Supporting document\nPDF/photo uploaded to Notion with the File Upload API (free plan: 5 MB) and attached to the cost record.', [1900, 80], 660, 160, 4);
sticky('## 6. Supplier Monthly Summary\nTotals are **recomputed from the cost records** for the affected supplier + month + currency (never incremented), so re-runs cannot double-count.', [3240, 560], 1360, 160, 6);
sticky('## 7. Notify\nRecorded -> project manager. Needs review -> office admin + Kevin.\nDemo mode: everything goes to `' + DEMO_RECIPIENT + '` with a "This is a demo" banner naming the real recipients.', [4560, 560], 760, 180, 5);

// ---------------- Connections ----------------
const C = {};
const link = (from, to, outIndex = 0) => {
  C[from] = C[from] || { main: [] };
  while (C[from].main.length <= outIndex) C[from].main.push([]);
  C[from].main[outIndex].push({ node: to, type: 'main', index: 0 });
};
link('Email Trigger (IMAP)', 'Settings');
link('Test Intake Webhook', 'Settings');
link('Settings', 'Get Projects');
link('Get Projects', 'Get Suppliers');
link('Get Suppliers', 'Get Employees');
link('Get Employees', 'Get Purchase Orders');
link('Get Purchase Orders', 'Normalize & Split Attachments');
link('Normalize & Split Attachments', 'Any Documents?');
link('Any Documents?', 'Loop Over Documents', 0);
link('Any Documents?', 'Build Run Report', 1);
link('Loop Over Documents', 'Build Run Report', 0); // done
link('Loop Over Documents', 'Current Document', 1); // loop
link('Build Run Report', 'Respond to Webhook');
link('Current Document', 'Has PDF?');
link('Has PDF?', 'Extract PDF Text', 0);
link('Has PDF?', 'Parse & Match', 1);
link('Extract PDF Text', 'Parse & Match');
link('Parse & Match', 'AI Extraction Slot (optional)');
link('AI Extraction Slot (optional)', 'Find Existing Cost');
link('Find Existing Cost', 'Decide Action');
link('Decide Action', 'Upload Document?');
link('Upload Document?', 'Create Upload Slot', 0);
link('Upload Document?', 'Build Notion Payload', 1);
link('Create Upload Slot', 'Attach File');
link('Attach File', 'Send File to Notion');
link('Send File to Notion', 'Build Notion Payload');
link('Build Notion Payload', 'Upsert Cost Record');
link('Upsert Cost Record', 'Append Audit Note');
link('Append Audit Note', 'Prepare Summary Recalc');
link('Prepare Summary Recalc', 'Query Supplier-Month Costs');
link('Query Supplier-Month Costs', 'Compute Monthly Totals');
link('Compute Monthly Totals', 'Find Summary Row');
link('Find Summary Row', 'Build Summary Upsert');
link('Build Summary Upsert', 'Upsert Summary Row');
link('Upsert Summary Row', 'Build Notification');
link('Build Notification', 'Should Notify?');
link('Should Notify?', 'Send Notification Email', 0);
link('Should Notify?', 'Record Result', 1);
link('Send Notification Email', 'Record Result');
link('Record Result', 'Loop Over Documents');

export const workflow = {
  name: 'Kevin Build Co - Cost Intake (email -> Notion)',
  nodes,
  connections: C,
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveManualExecutions: true },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(new URL('dist/', root), { recursive: true });
  writeFileSync(new URL('dist/cost-intake-workflow.json', root), JSON.stringify(workflow, null, 2) + '\n');
  console.log(`Built dist/cost-intake-workflow.json - ${nodes.length} nodes`);
}
