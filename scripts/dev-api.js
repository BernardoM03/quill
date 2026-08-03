import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const dataWriterDir = path.resolve(import.meta.dirname, '..', 'data-writer');
const python = path.join(dataWriterDir, '.venv', 'Scripts', 'python.exe');

if (!existsSync(python)) {
  console.error(
    `Python venv not found at ${python}. Create it first:\n` +
      '  cd data-writer\n' +
      '  python -m venv .venv\n' +
      '  .venv\\Scripts\\pip install -r requirements.txt',
  );
  process.exit(1);
}

spawn(python, ['quill_data_layer.py'], { cwd: dataWriterDir, stdio: 'inherit' }).on('exit', (code) =>
  process.exit(code ?? 0),
);
