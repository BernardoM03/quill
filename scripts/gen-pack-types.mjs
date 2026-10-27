// Generates TypeScript types for pack collections from public/schemas.
// Run with: npm run gen-types (rerun whenever a schema changes).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compile } from 'json-schema-to-typescript';

const root = resolve(import.meta.dirname, '..');
const schemasDir = join(root, 'public', 'schemas');
const outDir = join(root, 'src', 'packs', 'generated');
const SCHEMA_URL = 'https://quill.local/schemas/';

const $refOptions = {
  resolve: {
    quill: {
      order: 1,
      canRead: file => file.url.startsWith(SCHEMA_URL),
      read: file => readFileSync(join(schemasDir, file.url.slice(SCHEMA_URL.length).split('#')[0]), 'utf8'),
    },
  },
};

// "magic-item" -> "MagicItem"
const pascal = stem => stem.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const stems = readdirSync(schemasDir)
  .filter(f => f.endsWith('.schema.json') && f !== 'common.schema.json')
  .map(f => f.replace('.schema.json', ''))
  .sort();

for (const stem of stems) {
  const schema = JSON.parse(readFileSync(join(schemasDir, `${stem}.schema.json`), 'utf8'));
  delete schema.title;
  delete schema.$id;
  const ts = await compile(schema, `${pascal(stem)}Schema`, {
    $refOptions,
    bannerComment: `/* Generated from public/schemas/${stem}.schema.json by scripts/gen-pack-types.mjs. Do not edit. */`,
    additionalProperties: false,
    unreachableDefinitions: false,
    style: { singleQuote: true },
  });
  writeFileSync(join(outDir, `${stem}.ts`), ts);
  console.log(`  ${stem}.ts`);
}
