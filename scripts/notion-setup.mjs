// Extends the Part 2 Notion workspace for the Part 3 cost-intake automation.
// Safe to re-run: it only adds what is missing and never deletes or renames Part 2 fields.
//
//   npm run setup:notion
//
// Writes the database ids to config/notion-ids.json (used by build-workflow.mjs).
import { writeFileSync, mkdirSync } from 'node:fs';
import { notion, queryAll, findDatabases, pageIdFromUrl } from './notion-api.mjs';
import { syncAllSummaries } from './summary-sync.mjs';
import { loadLib } from './lib-bundle.mjs';

const L = loadLib();
const log = (...a) => console.log(...a);

// Short, human-friendly codes field staff can put in an email subject.
const PROJECT_CODES = {
  'Riverside Home': 'RIV-001',
  'Skyline Development': 'SKY-001',
  'Harbour View Renovation': 'HBR-001',
  'Lakeside Café Fit-out': 'LKC-001',
  'Oak Street Residence': 'OAK-001',
  'Maple Court Extension': 'MPL-001',
};
const OFFICE_ADMIN = { name: 'Denise', email: 'denise@kevinbuild.co', role: 'Office Admin' };

function one(dbs, title) {
  const list = dbs[title] || [];
  if (list.length !== 1) throw new Error(`Expected exactly one database named "${title}", found ${list.length}`);
  return list[0];
}

async function addMissingProperties(db, wanted) {
  const missing = Object.fromEntries(Object.entries(wanted).filter(([name]) => !db.properties[name]));
  if (!Object.keys(missing).length) return db;
  log(`  + ${db.title.map((t) => t.plain_text).join('')}: adding ${Object.keys(missing).join(', ')}`);
  return notion('PATCH', `/databases/${db.id}`, { properties: missing });
}

async function addSelectOption(db, propName, option) {
  const prop = db.properties[propName];
  if (!prop || prop.select.options.some((o) => o.name === option.name)) return db;
  log(`  + ${propName}: adding option "${option.name}"`);
  return notion('PATCH', `/databases/${db.id}`, {
    properties: { [propName]: { select: { options: [...prop.select.options.map(({ id, name, color }) => ({ id, name, color })), option] } } },
  });
}

async function renameSyncedRelation(updatedDb, relationProp, otherDbId, newName) {
  const synced = updatedDb.properties[relationProp]?.relation?.dual_property?.synced_property_name;
  if (synced && synced !== newName) {
    const other = await notion('GET', `/databases/${otherDbId}`);
    if (other.properties[synced] && !other.properties[newName]) {
      await notion('PATCH', `/databases/${otherDbId}`, { properties: { [synced]: { name: newName } } });
      log(`  ~ Contacts: renamed back-relation "${synced}" -> "${newName}"`);
    }
  }
}

async function pageAncestor(parent) {
  let p = parent;
  for (let i = 0; i < 10 && p.type === 'block_id'; i++) p = (await notion('GET', `/blocks/${p.block_id}`)).parent;
  return p.type === 'page_id' ? p.page_id : null;
}

async function main() {
  const rootPageId = pageIdFromUrl(process.env.NOTION_PARENT_PAGE_URL);
  log('Reading Part 2 databases...');
  const dbs = await findDatabases();
  let projects = one(dbs, 'Projects');
  const contacts = one(dbs, 'Contacts');
  let employees = one(dbs, 'Employees');
  let costs = one(dbs, 'Project Costs');
  const orders = one(dbs, 'Materials & Orders');

  // 1. Projects: Project Code
  log('1. Projects');
  projects = await addMissingProperties(projects, { 'Project Code': { rich_text: {} } });
  for (const p of await queryAll(projects.id)) {
    const name = L.readProp(p.properties.Project);
    const code = L.readProp(p.properties['Project Code']);
    if (!code && PROJECT_CODES[name]) {
      await notion('PATCH', `/pages/${p.id}`, { properties: { 'Project Code': { rich_text: L.richText(PROJECT_CODES[name]) } } });
      log(`  ~ ${name} -> ${PROJECT_CODES[name]}`);
    }
  }

  // 2. Employees: office admin (review notifications go to the office admin + Kevin)
  log('2. Employees');
  employees = await addSelectOption(employees, 'Role', { name: 'Office Admin', color: 'pink' });
  const people = await queryAll(employees.id);
  if (!people.some((e) => L.readProp(e.properties.Role) === 'Office Admin')) {
    await notion('POST', '/pages', {
      parent: { database_id: employees.id },
      properties: { Name: { title: L.richText(OFFICE_ADMIN.name) }, Email: { email: OFFICE_ADMIN.email }, Role: { select: { name: OFFICE_ADMIN.role } } },
    });
    log(`  + created ${OFFICE_ADMIN.name} (${OFFICE_ADMIN.role})`);
  }

  // 3. Project Costs: fields the automation needs
  log('3. Project Costs');
  costs = await addSelectOption(costs, 'Payment Status', { name: 'Unknown', color: 'gray' });
  const hadSupplierContact = !!costs.properties['Supplier Contact'];
  costs = await addMissingProperties(costs, {
    'Supplier Contact': { relation: { database_id: contacts.id, type: 'dual_property', dual_property: {} } },
    'Review Reason': { rich_text: {} },
    'Update Log': { rich_text: {} },
    'Submission Count': { number: { format: 'number' } },
    'Source Message ID': { rich_text: {} },
    'Received At': { date: {} },
    'Summary Key': { rich_text: {} },
  });
  if (!hadSupplierContact) await renameSyncedRelation(costs, 'Supplier Contact', contacts.id, 'Cost Records');

  // 4. Supplier Monthly Summary (new database, next to Project Costs)
  log('4. Supplier Monthly Summary');
  let summary = (dbs['Supplier Monthly Summary'] || [])[0];
  if (!summary) {
    const parentPage = (await pageAncestor(costs.parent)) || rootPageId;
    summary = await notion('POST', '/databases', {
      parent: { type: 'page_id', page_id: parentPage },
      icon: { type: 'emoji', emoji: '📊' },
      title: L.richText('Supplier Monthly Summary'),
      description: L.richText('Recalculated by the n8n cost-intake workflow after every cost is recorded or updated. Do not edit totals by hand.'),
      properties: {
        Summary: { title: {} },
        Supplier: { relation: { database_id: contacts.id, type: 'dual_property', dual_property: {} } },
        'Supplier Name': { rich_text: {} },
        Month: { date: {} },
        'Month Key': { rich_text: {} },
        Currency: { select: { options: [{ name: 'USD', color: 'green' }, { name: 'AUD', color: 'yellow' }, { name: 'EUR', color: 'blue' }, { name: 'GBP', color: 'purple' }] } },
        'Total Paid': { number: { format: 'number_with_commas' } },
        'Total Unpaid': { number: { format: 'number_with_commas' } },
        Total: { formula: { expression: 'prop("Total Paid") + prop("Total Unpaid")' } },
        'Cost Count': { number: { format: 'number' } },
        'Summary Key': { rich_text: {} },
        'Last Recalculated': { date: {} },
      },
    });
    log(`  + created database ${summary.id}`);
    await renameSyncedRelation(summary, 'Supplier', contacts.id, 'Monthly Summaries');
  } else log('  = already exists');

  // 5. Backfill the Part 2 cost records so they take part in summaries and duplicate checks
  log('5. Backfill existing cost records');
  const supplierContacts = (await queryAll(contacts.id)).map((c) => ({ id: c.id, name: L.readProp(c.properties.Name), company: L.readProp(c.properties.Company) }));
  for (const page of await queryAll(costs.id)) {
    const c = L.readCostPage(page);
    const props = {};
    if (!c.supplierContactId && c.supplierName) {
      const n = L.normalizeText(c.supplierName);
      const hit = supplierContacts.find((s) => L.normalizeText(s.name) === n || (s.company && L.normalizeText(s.company) === n));
      if (hit) props['Supplier Contact'] = { relation: [{ id: hit.id }] };
    }
    if (!c.summaryKey && L.buildSummaryKey(c)) props['Summary Key'] = { rich_text: L.richText(L.buildSummaryKey(c)) };
    if (!c.dedupeKey && c.supplierName) props['Dedupe Key'] = { rich_text: L.richText(L.buildDedupeKey(c)) };
    if (L.readProp(page.properties['Submission Count']) == null) props['Submission Count'] = { number: 1 };
    if (!c.updateLog) props['Update Log'] = { rich_text: L.richText('Entered manually (Part 2)') };
    if (Object.keys(props).length) {
      await notion('PATCH', `/pages/${page.id}`, { properties: props });
      log(`  ~ ${c.title}: ${Object.keys(props).join(', ')}`);
    }
  }

  const ids = { projects: projects.id, contacts: contacts.id, employees: employees.id, costs: costs.id, summary: summary.id, orders: orders.id };
  mkdirSync(new URL('../config/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../config/notion-ids.json', import.meta.url), JSON.stringify(ids, null, 2) + '\n');
  log('6. Initial Supplier Monthly Summary');
  await syncAllSummaries(ids);
  log('\nDone. Database ids written to config/notion-ids.json');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
