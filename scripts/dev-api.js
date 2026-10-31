import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const python = path.join(rootDir, '.venv', 'Scripts', 'python.exe');

if (!existsSync(python)) {
  console.error(
    `Python venv not found at ${python}. Create it first, from the repo root:\n` +
      '  python -m venv .venv\n' +
      '  .venv\\Scripts\\pip install -r requirements.txt',
  );
  process.exit(1);
}

// Runs the server package from the repo root with the venv's Python.
spawn(python, ['-m', 'server'], { cwd: rootDir, stdio: 'inherit' }).on('exit', (code) =>
  process.exit(code ?? 0),
);
