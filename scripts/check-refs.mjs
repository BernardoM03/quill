// Cross-file checks for content packs. The JSON Schemas check shape; this checks
// what a single file can't see:
//   - every srd-5.2 id a pack mentions is defined somewhere in the pack
//   - every $choice: resolves to a choice on the same grantor (on a feature, an
//     option, or a proficiency pick)
//   - every effect type outside the core list is declared by a pack's providesEffectTypes
//   - no condition applies itself
//   - no spell list inherits from itself, directly or through another list
// Run with: npm run check-refs [-- kind ...]   e.g. npm run check-refs -- feature equipment
import { readFileSync, readdirSync } from 'node:fs';

const PACK = 'public/packs/srd-5.2';
const only = process.argv.slice(2);
const files = readdirSync(PACK).filter((f) => f.endsWith('.json') && f !== 'pack.json');
const entities = files.flatMap((f) => JSON.parse(readFileSync(`${PACK}/${f}`, 'utf8')));
const pack = JSON.parse(readFileSync(`${PACK}/pack.json`, 'utf8'));
const common = JSON.parse(readFileSync('public/schemas/common.schema.json', 'utf8'));
const coreTypes = new Set(common.$defs.coreEffectType.enum);
const declaredTypes = new Set(pack.providesEffectTypes ?? []);

const nested = (e) => ['features', 'traits', 'subFeatures', 'effectGroups'].flatMap((k) => e[k] ?? []);
const defined = new Set(entities.flatMap((e) => [e.id, ...nested(e).map((f) => f.id)]));

// Visit every object inside a value, depth first.
function* objects(value) {
  if (Array.isArray(value)) for (const v of value) yield* objects(v);
  else if (value && typeof value === 'object') {
    yield value;
    for (const v of Object.values(value)) yield* objects(v);
  }
}
// A choice is any object with a local id, a count, and something to pick from.
const isChoice = (o) => typeof o.id === 'string' && !o.id.includes(':') && 'count' in o && ('from' in o || 'fromTypes' in o);

const missing = new Map();
const note = (ref, who) => missing.set(ref, (missing.get(ref) ?? new Set()).add(who));

for (const e of entities) {
  const text = JSON.stringify(e);
  // Catalog ids (:list/) name a collection, not an entity, so they are skipped.
  for (const ref of new Set(text.match(/srd-5\.2:[a-z-]+\/[a-z0-9-]+/g) ?? [])) {
    if (!defined.has(ref) && !ref.includes(':list/')) note(ref, e.name);
  }
  const all = [...objects(e)];
  const choices = new Set(all.filter(isChoice).map((c) => c.id));
  for (const [, id] of text.matchAll(/\$choice:([A-Za-z0-9-]+)/g)) {
    if (!choices.has(id)) note(`$choice:${id}`, e.name);
  }
  for (const list of all.filter((o) => Array.isArray(o.effects)).map((o) => o.effects)) {
    for (const fx of list) {
      if (typeof fx.type === 'string' && !coreTypes.has(fx.type) && !declaredTypes.has(fx.type)) note(`effectType:${fx.type}`, e.name);
      if (fx.type === 'applyCondition' && e.id?.includes(':condition/') && fx.target === e.id) note(`selfApply:${e.id}`, e.name);
    }
  }
}

// Spell lists: follow inheritFrom and report any cycle.
const inherits = new Map(entities.filter((e) => e.spellList?.inheritFrom).map((e) => [e.id, [e.spellList.inheritFrom].flat()]));
const reaches = (from, target, seen = new Set()) =>
  (inherits.get(from) ?? []).some((id) => id === target || (!seen.has(id) && seen.add(id) && reaches(id, target, seen)));
for (const id of inherits.keys()) if (reaches(id, id)) note(`spellListLoop:${id}`, id);

const kindOf = (ref) => (ref.startsWith('$choice:') ? 'choice' : ref.includes(':') && !ref.startsWith('srd-5.2:') ? ref.split(':')[0] : ref.split(':')[1].split('/')[0]);
const rows = [...missing].filter(([ref]) => !only.length || only.includes(kindOf(ref))).sort();
for (const [ref, who] of rows) console.log(`${ref} <- ${[...who].sort().join(', ')}`);
console.log(rows.length ? `\n${rows.length} unresolved.` : 'All references resolve.');
process.exitCode = rows.length ? 1 : 0;
