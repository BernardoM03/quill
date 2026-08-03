import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const dataWriterDir = path.resolve(import.meta.dirname, '..', 'data-writer');
const isWindows = process.platform === 'win32';
const pythonBin = path.join(
  dataWriterDir,
  '.venv',
  isWindows ? 'Scripts' : 'bin',
  isWindows ? 'python.exe' : 'python',
);

if (!existsSync(pythonBin)) {
  console.error(
    `Python venv not found at ${pythonBin}.\n` +
      'Create it first:\n' +
      '  cd data-writer\n' +
      '  python -m venv .venv\n' +
      (isWindows ? '  .venv\\Scripts\\pip install -r requirements.txt' : '  .venv/bin/pip install -r requirements.txt'),
  );
  process.exit(1);
}

const child = spawn(pythonBin, ['quill_data_layer.py'], {
  cwd: dataWriterDir,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
