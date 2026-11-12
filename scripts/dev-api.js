import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
// Windows puts the interpreter in Scripts\, macOS and Linux in bin/.
const python =
  process.platform === 'win32'
    ? path.join(rootDir, '.venv', 'Scripts', 'python.exe')
    : path.join(rootDir, '.venv', 'bin', 'python');

if (!existsSync(python)) {
  const [py, pip] =
    process.platform === 'win32' ? ['python', '.venv\\Scripts\\pip'] : ['python3', '.venv/bin/pip'];
  console.error(
    `Python venv not found at ${python}. Create it first (Python 3.11 or newer), from the repo root:\n` +
      `  ${py} -m venv .venv\n` +
      `  ${pip} install -r requirements.txt`,
  );
  process.exit(1);
}

// Runs the server package from the repo root with the venv's Python.
spawn(python, ['-m', 'server'], { cwd: rootDir, stdio: 'inherit' }).on('exit', (code) =>
  process.exit(code ?? 0),
);
