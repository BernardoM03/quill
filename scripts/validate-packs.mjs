// Validates every content pack against its JSON Schema.
// Run with: npm run validate
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const SCHEMAS_DIR = 'schemas';
const PACKS_DIR = 'packs';
const MAX_ERRORS_SHOWN = 20;

// Collection name (as listed in pack.json "provides") -> schema file stem.
const SCHEMA_FOR_COLLECTION = {
  pack: 'pack',
  classes: 'class',
  subclasses: 'subclass',
  species: 'species',
  origins: 'origin',
  feats: 'feat',
  skills: 'skill',
  tools: 'tool',
  spells: 'spell',
  equipment: 'equipment',
  languages: 'language',
  creatures: 'creature',
  rules: 'rule',
  'magic-items': 'magic-item',
  conditions: 'conditions',
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const printRow = (collection, status) => console.log(`  ${collection.padEnd(14)} ${status}`);

let failed = false;

// Catch the common typo first and log error.
for (const file of readdirSync(SCHEMAS_DIR)) {
  const lines = readFileSync(`${SCHEMAS_DIR}/${file}`, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('#/defs/')) {
      console.log(`Malformed $ref in ${file}:${i + 1} — '#/defs/' should be '#/$defs/'`);
      failed = true;
    }
  });
}

// allErrors: report every bad entry, not just the first.
// strict: false: schemas use annotation keywords ajv doesn't know about.
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(readJson(`${SCHEMAS_DIR}/common.schema.json`));

// Compile each schema once, on first use.
const validators = new Map();
function validatorFor(stem) {
  if (!validators.has(stem)) {
    validators.set(stem, ajv.compile(readJson(`${SCHEMAS_DIR}/${stem}.schema.json`)));
  }
  return validators.get(stem);
}

const packDirs = readdirSync(PACKS_DIR).filter((dir) => existsSync(`${PACKS_DIR}/${dir}/pack.json`));

for (const dir of packDirs) {
  console.log(dir);
  const manifest = readJson(`${PACKS_DIR}/${dir}/pack.json`);

  // pack.json itself is always checked, then whatever it lists in "provides".
  for (const collection of ['pack', ...manifest.provides]) {
    const stem = SCHEMA_FOR_COLLECTION[collection];
    const dataPath = `${PACKS_DIR}/${dir}/${collection}.json`;

    if (!stem) {
      printRow(collection, 'FAILED (no schema for this collection)');
      failed = true;
      continue;
    }
    if (!existsSync(dataPath)) {
      printRow(collection, `FAILED (in provides, but ${dataPath} is missing)`);
      failed = true;
      continue;
    }

    const validate = validatorFor(stem);
    if (validate(readJson(dataPath))) {
      printRow(collection, 'ok');
      continue;
    }

    failed = true;
    printRow(collection, 'FAILED');
    const paths = [...new Set(validate.errors.map((e) => `${e.instancePath || '/'}: ${e.message}`))].sort();
    for (const path of paths.slice(0, MAX_ERRORS_SHOWN)) console.log(`        ${path}`);
    if (paths.length > MAX_ERRORS_SHOWN) console.log(`        ... and ${paths.length - MAX_ERRORS_SHOWN} more`);
  }
}

console.log(failed ? '\nValidation failed.' : '\nAll packs valid.');
process.exitCode = failed ? 1 : 0;
