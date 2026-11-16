import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = '8787';
const healthUrl = `http://127.0.0.1:${port}/api/health`;
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(viteBin)) {
  console.error('[GeoGus] Dependências não encontradas. Execute "npm ci" antes de "npm run dev".');
  process.exit(1);
}

let api;
let vite;
let stopping = false;

function stopChild(child) {
  if (child && child.exitCode === null && !child.killed) {
    try { child.kill('SIGTERM'); } catch { /* processo já encerrado */ }
  }
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  stopChild(vite);
  stopChild(api);
  setTimeout(() => process.exit(code), 150).unref();
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

console.log('[GeoGus] Iniciando API local na porta 8787...');
api = spawn(process.execPath, [join(root, 'server', 'server.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: 'inherit',
  windowsHide: false,
});

api.on('error', (error) => {
  console.error(`[GeoGus] Não foi possível iniciar a API: ${error.message}`);
  shutdown(1);
});
api.on('exit', (code, signal) => {
  if (!stopping) {
    console.error(`[GeoGus] A API local encerrou inesperadamente (código ${code ?? 'n/a'}, sinal ${signal ?? 'n/a'}).`);
    shutdown(code && code !== 0 ? code : 1);
  }
});

let apiReady = false;
const deadline = Date.now() + 15_000;
while (!stopping && Date.now() < deadline && api.exitCode === null) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
    if (response.ok) {
      const payload = await response.json();
      apiReady = payload?.ok === true;
      if (apiReady) break;
    }
  } catch {
    // A API ainda está inicializando; tenta novamente sem gerar ruído.
  }
  await delay(300);
}

if (stopping) process.exit(1);
if (!apiReady) {
  console.error('[GeoGus] A API não respondeu ao healthcheck em 15 segundos. Verifique se a porta 8787 já está em uso.');
  shutdown(1);
} else {
  console.log('[GeoGus] API pronta. Iniciando Vite...');
  vite = spawn(process.execPath, [viteBin], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });
  vite.on('error', (error) => {
    console.error(`[GeoGus] Não foi possível iniciar o Vite: ${error.message}`);
    shutdown(1);
  });
  vite.on('exit', (code) => shutdown(code ?? 0));
}
