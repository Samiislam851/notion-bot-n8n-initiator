// Minimal Notion REST client with retry on rate limits / transient errors.
const BASE = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2022-06-28';

export async function notion(method, path, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN missing - add it to .env');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = Number(res.headers.get('retry-after') || 0) * 1000 || 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`Notion ${method} ${path} -> ${res.status} ${json.code || ''}: ${json.message || JSON.stringify(json)}`);
  }
}

export async function queryAll(databaseId, body = {}) {
  const out = [];
  let cursor;
  do {
    const r = await notion('POST', `/databases/${databaseId}/query`, { page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

export async function findDatabases() {
  const found = {};
  let cursor;
  do {
    const r = await notion('POST', '/search', { filter: { property: 'object', value: 'database' }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    for (const db of r.results) {
      const title = db.title.map((t) => t.plain_text).join('').trim();
      if (title && !db.archived && !db.in_trash) (found[title] = found[title] || []).push(db);
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return found;
}

export function pageIdFromUrl(url) {
  const m = String(url || '').replace(/-/g, '').match(/[0-9a-f]{32}/gi);
  if (!m) throw new Error('Could not find a page id in NOTION_PARENT_PAGE_URL');
  const h = m[m.length - 1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
