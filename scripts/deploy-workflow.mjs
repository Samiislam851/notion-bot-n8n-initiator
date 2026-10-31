// Creates/updates the workflow in n8n through the public API and activates it.
//
//   npm run deploy
//
// Needs N8N_BASE_URL + N8N_API_KEY + NOTION_TOKEN in .env.
// Optional GMAIL_APP_PASSWORD (+ GMAIL_ADDRESS) creates the Gmail SMTP/IMAP credentials.
// Without them, the email nodes stay disabled and everything else still runs.
import { workflow, CRED, DEMO_RECIPIENT } from './build-workflow.mjs';

const BASE = (process.env.N8N_BASE_URL || 'http://localhost:5678').replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;
if (!KEY) throw new Error('N8N_API_KEY missing in .env');

async function api(method, path, body) {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`n8n ${method} ${path} -> ${res.status}: ${json.message || text}`);
  return json;
}

async function listAll(path) {
  const out = [];
  let cursor;
  do {
    const r = await api('GET', path + (path.includes('?') ? '&' : '?') + 'limit=100' + (cursor ? '&cursor=' + cursor : ''));
    out.push(...r.data);
    cursor = r.nextCursor;
  } while (cursor);
  return out;
}

async function ensureCredential(existing, name, type, data) {
  const found = existing.find((c) => c.name === name && c.type === type);
  if (found) return found;
  if (!data) return null;
  const created = await api('POST', '/credentials', { name, type, data });
  console.log(`  + created credential "${name}"`);
  return created;
}

async function main() {
  console.log('Credentials');
  const creds = await listAll('/credentials');
  const gmailUser = process.env.GMAIL_ADDRESS || DEMO_RECIPIENT;
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const ids = {
    notionApi: await ensureCredential(creds, CRED.notion, 'notionApi', { apiKey: process.env.NOTION_TOKEN }),
    smtp: await ensureCredential(creds, CRED.smtp, 'smtp', gmailPass ? { user: gmailUser, password: gmailPass, host: 'smtp.gmail.com', port: 465, secure: true } : null),
    imap: await ensureCredential(creds, CRED.imap, 'imap', gmailPass ? { user: gmailUser, password: gmailPass, host: 'imap.gmail.com', port: 993, secure: true } : null),
  };
  for (const [type, c] of Object.entries(ids)) console.log(`  ${type}: ${c ? 'ok (' + c.name + ')' : 'not configured'}`);

  const wf = JSON.parse(JSON.stringify(workflow));
  for (const node of wf.nodes) {
    if (!node.credentials) continue;
    for (const type of Object.keys(node.credentials)) {
      if (ids[type]) node.credentials[type] = { id: ids[type].id, name: ids[type].name };
      else {
        delete node.credentials[type];
        node.disabled = true;
        console.log(`  ! "${node.name}" disabled until the ${type} credential exists`);
      }
    }
    if (!Object.keys(node.credentials).length) delete node.credentials;
    else if (node.type === 'n8n-nodes-base.emailReadImap' || node.type === 'n8n-nodes-base.emailSend') node.disabled = false;
  }

  console.log('Workflow');
  const existing = (await listAll('/workflows')).find((w) => w.name === wf.name);
  let id;
  if (existing) {
    id = existing.id;
    if (existing.active) await api('POST', `/workflows/${id}/deactivate`);
    await api('PUT', `/workflows/${id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });
    console.log(`  ~ updated ${id}`);
  } else {
    id = (await api('POST', '/workflows', { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings })).id;
    console.log(`  + created ${id}`);
  }
  await api('POST', `/workflows/${id}/activate`);
  console.log(`  active. Editor: ${BASE}/workflow/${id}`);
  console.log(`  Test webhook: POST ${BASE}/webhook/cost-intake`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
