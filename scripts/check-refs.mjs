// Cross-file reference check for content packs. The JSON Schemas check shape;
// this checks that every srd-5.2 id a pack mentions is defined somewhere in the
// pack, and that every $choice: resolves to a choice on the same grantor.
// Run with: npm run check-refs [-- kind ...]   e.g. npm run check-refs -- feature equipment
import { readFileSync, readdirSync } from 'node:fs';

const PACK = 'public/packs/srd-5.2';
const only = process.argv.slice(2);
const files = readdirSync(PACK).filter((f) => f.endsWith('.json') && f !== 'pack.json');
const entities = files.flatMap((f) => JSON.parse(readFileSync(`${PACK}/${f}`, 'utf8')));

const nested = (e) => ['features', 'traits', 'subFeatures', 'effectGroups'].flatMap((k) => e[k] ?? []);
const defined = new Set(entities.flatMap((e) => [e.id, ...nested(e).map((f) => f.id)]));

const missing = new Map();
const note = (ref, who) => missing.set(ref, (missing.get(ref) ?? new Set()).add(who));

for (const e of entities) {
  const text = JSON.stringify(e);
  // Catalog ids (:list/) name a collection, not an entity, so they are skipped.
  for (const ref of new Set(text.match(/srd-5\.2:[a-z]+\/[a-z0-9-]+/g) ?? [])) {
    if (!defined.has(ref) && !ref.includes(':list/')) note(ref, e.name);
  }
  const choices = new Set([...(e.choices ?? []), ...nested(e).flatMap((f) => f.choices ?? [])].map((c) => c.id));
  for (const [, id] of text.matchAll(/\$choice:([A-Za-z0-9-]+)/g)) {
    if (!choices.has(id)) note(`$choice:${id}`, e.name);
  }
}

const kindOf = (ref) => (ref.startsWith('$choice:') ? 'choice' : ref.split(':')[1].split('/')[0]);
const rows = [...missing].filter(([ref]) => !only.length || only.includes(kindOf(ref))).sort();
for (const [ref, who] of rows) console.log(`${ref} <- ${[...who].sort().join(', ')}`);
console.log(rows.length ? `\n${rows.length} unresolved.` : 'All references resolve.');
process.exitCode = rows.length ? 1 : 0;
