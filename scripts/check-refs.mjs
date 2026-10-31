// Cross-file checks for content packs. The JSON Schemas check the shape of each
// file; this checks what a single file can't see:
//   - every id an entry mentions is defined in some installed pack
//   - every $choice:<id> names a choice on the same entry
//   - every effect type is a core type or declared by a pack's providesEffectTypes
//   - no condition applies itself
//   - no spell list inherits from itself, directly or through another list
// Run with: npm run check-refs [-- kind ...]   e.g. npm run check-refs -- feature equipment
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const PACKS_DIR = 'packs';
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const packs = readdirSync(PACKS_DIR)
  .filter((dir) => existsSync(`${PACKS_DIR}/${dir}/pack.json`))
  .map((dir) => {
    const manifest = readJson(`${PACKS_DIR}/${dir}/pack.json`);
    const files = readdirSync(`${PACKS_DIR}/${dir}`).filter((f) => f.endsWith('.json') && f !== 'pack.json');
    const entities = files.flatMap((f) => readJson(`${PACKS_DIR}/${dir}/${f}`));
    return { manifest, entities };
  });

const entities = packs.flatMap((p) => p.entities);

const common = readJson('schemas/common.schema.json');
const knownEffectTypes = new Set([
  ...common.$defs.coreEffectType.enum,
  ...packs.flatMap((p) => p.manifest.providesEffectTypes ?? []),
]);

// Ids defined anywhere: each entry's own id, plus ids of things nested inside it.
const NESTED_KEYS = ['features', 'traits', 'subFeatures', 'effectGroups'];
const definedIds = new Set();
for (const entity of entities) {
  definedIds.add(entity.id);
  for (const key of NESTED_KEYS) {
    for (const child of entity[key] ?? []) definedIds.add(child.id);
  }
}

// Matches a namespaced id like "srd-5.2:spell/acid-arrow" for any installed pack.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const packIdPattern = packs.map((p) => escapeRegex(p.manifest.id)).join('|');
const ID_REGEX = new RegExp(`(?:${packIdPattern}):[a-z-]+/[a-z0-9-]+`, 'g');
const CHOICE_REF_REGEX = /\$choice:([A-Za-z0-9-]+)/g;


// Every object nested anywhere inside a value, including the value itself.
function allObjects(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) allObjects(item, out);
  } else if (value && typeof value === 'object') {
    out.push(value);
    for (const child of Object.values(value)) allObjects(child, out);
  }
  return out;
}

// A choice is an object with a local (non-namespaced) id, a count, and a pool to pick from.
function isChoice(obj) {
  return typeof obj.id === 'string'
    && !obj.id.includes(':')
    && 'count' in obj
    && ('from' in obj || 'fromTypes' in obj);
}

// The kind part of a namespaced id: "srd-5.2:spell/acid-arrow" -> "spell".
const kindOfId = (id) => id.split(':')[1].split('/')[0];


// key -> { kind, entries: Set of entry names that hit it }
const problems = new Map();
function report(kind, key, entryName) {
  if (!problems.has(key)) problems.set(key, { kind, entries: new Set() });
  problems.get(key).entries.add(entryName);
}


function checkUnknownIds(entity, text) {
  for (const id of new Set(text.match(ID_REGEX) ?? [])) {
    // Catalog ids (":list/") name a whole collection, not an entry.
    if (id.includes(':list/')) continue;
    if (!definedIds.has(id)) report(kindOfId(id), id, entity.name);
  }
}

function checkChoiceRefs(entity, text, objects) {
  const choiceIds = new Set(objects.filter(isChoice).map((c) => c.id));
  for (const [, id] of text.matchAll(CHOICE_REF_REGEX)) {
    if (!choiceIds.has(id)) report('choice', `$choice:${id}`, entity.name);
  }
}

function checkEffects(entity, objects) {
  const isCondition = entity.id?.includes(':condition/');
  for (const obj of objects) {
    if (!Array.isArray(obj.effects)) continue;
    for (const effect of obj.effects) {
      if (typeof effect.type === 'string' && !knownEffectTypes.has(effect.type)) {
        report('effectType', `effectType:${effect.type}`, entity.name);
      }
      if (isCondition && effect.type === 'applyCondition' && effect.target === entity.id) {
        report('selfApply', `selfApply:${entity.id}`, entity.name);
      }
    }
  }
}

function checkSpellListLoops() {
  const parents = new Map();
  for (const entity of entities) {
    const inheritFrom = entity.spellList?.inheritFrom;
    if (inheritFrom) parents.set(entity.id, [inheritFrom].flat());
  }

  for (const start of parents.keys()) {
    const visited = new Set();
    const toVisit = [...parents.get(start)];
    while (toVisit.length) {
      const id = toVisit.pop();
      if (id === start) {
        report('spellListLoop', `spellListLoop:${start}`, start);
        break;
      }
      if (visited.has(id)) continue;
      visited.add(id);
      toVisit.push(...(parents.get(id) ?? []));
    }
  }
}


for (const entity of entities) {
  const text = JSON.stringify(entity);
  const objects = allObjects(entity);
  checkUnknownIds(entity, text);
  checkChoiceRefs(entity, text, objects);
  checkEffects(entity, objects);
}
checkSpellListLoops();

const onlyKinds = process.argv.slice(2);
const rows = [...problems]
  .filter(([, { kind }]) => onlyKinds.length === 0 || onlyKinds.includes(kind))
  .sort(([a], [b]) => a.localeCompare(b));

for (const [key, { entries }] of rows) {
  console.log(`${key} <- ${[...entries].sort().join(', ')}`);
}
console.log(rows.length ? `\n${rows.length} unresolved.` : 'All references resolve.');
process.exitCode = rows.length ? 1 : 0;
