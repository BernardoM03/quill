// Generates TypeScript types from schemas/: pack collections into src/packs/generated, and
// stored records (schemas/records: campaign settings, ...) into src/datatypes/generated.
// Run with: npm run gen-types (rerun whenever a schema changes).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compile } from 'json-schema-to-typescript';

const root = resolve(import.meta.dirname, '..');
const schemasDir = join(root, 'schemas');
const outDir = join(root, 'src', 'packs', 'generated');
const SCHEMA_URL = 'https://quill.local/schemas/';

// Drop every `description` so the generated types have no JSDoc; the schemas are
// the place to read them. Only string values are removed, so a property that is
// itself named "description" (an object under `properties`) is kept.
function stripDescriptions(value) {
  if (Array.isArray(value)) value.forEach(stripDescriptions);
  else if (value && typeof value === 'object') {
    if (typeof value.description === 'string') delete value.description;
    Object.values(value).forEach(stripDescriptions);
  }
  return value;
}

const readSchema = path => stripDescriptions(JSON.parse(readFileSync(path, 'utf8')));

const $refOptions = {
  resolve: {
    quill: {
      order: 1,
      canRead: file => file.url.startsWith(SCHEMA_URL),
      read: file => JSON.stringify(readSchema(join(schemasDir, file.url.slice(SCHEMA_URL.length).split('#')[0]))),
    },
  },
};

// "magic-item" -> "MagicItem"
const pascal = stem => stem.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());

// Every *.schema.json in dir (common.schema.json is only referenced) -> one .ts file in out.
async function generate(dir, out, label) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const stems = readdirSync(dir)
    .filter(f => f.endsWith('.schema.json') && f !== 'common.schema.json')
    .map(f => f.replace('.schema.json', ''))
    .sort();
  for (const stem of stems) {
    const schema = readSchema(join(dir, `${stem}.schema.json`));
    delete schema.title;
    delete schema.$id;
    const ts = await compile(schema, `${pascal(stem)}Schema`, {
      $refOptions,
      bannerComment: `/* Generated from ${label}/${stem}.schema.json by scripts/gen-pack-types.mjs. Do not edit. */`,
      additionalProperties: false,
      unreachableDefinitions: false,
      // Arrays of at most this many items become tuples (sharedScores: exactly 6); longer
      // limits (hpRolls: up to 19) stay plain arrays instead of a union of every length.
      maxItems: 6,
      style: { singleQuote: true },
    });
    writeFileSync(join(out, `${stem}.ts`), ts);
    console.log(`  ${stem}.ts`);
  }
}

await generate(schemasDir, outDir, 'schemas');
await generate(join(schemasDir, 'records'), join(root, 'src', 'datatypes', 'generated'), 'schemas/records');
